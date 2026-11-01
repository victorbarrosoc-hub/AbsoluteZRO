/**
 * IA do ecossistema (0016): uma IA só para todas as plataformas. Aqui fica o que é dado: conversas, mensagens, o
 * retrato da conta que a IA lê e o consumo de créditos. Quem chama o modelo é o HUB (apps/hub-web/lib/ia).
 * - Conversa é pessoal (RLS por user_id) e nasce numa plataforma (product_id; nulo = HUB).
 * - O retrato só traz o que a pessoa já pode ver no HUB (db.asUser, mesma autorização das telas).
 * - Cada resposta gasta 1 crédito de `zro.ai_credits`, com chave de idempotência; sem crédito, a IA nem é chamada.
 */
import type { Authenticated } from '@zro/auth'
import { consumeQuota, FEATURE_FLAGS, productAccessFor, quotaPeriod } from '@zro/billing'
import type { Database, Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'
import { z } from 'zod'
import { authorize, channelOf, type Actor, type Need } from './authz'

export const IA_METRICA = 'zro.ai_credits'
export const IA_CREDITOS_POR_RESPOSTA = 1
export const IA_TEXTO_MAX = 8000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type IaConversa = { id: string; titulo: string; produto: string | null; produtoNome: string | null; atualizada: Date; criada: Date }
export type IaMensagem = { id: string; papel: 'user' | 'assistant'; texto: string; criada: Date }

const rowToConversa = (r: Record<string, unknown>): IaConversa => ({
  id: r.id as string,
  titulo: r.titulo as string,
  produto: (r.product_id as string) ?? null,
  produtoNome: (r.produto_nome as string) ?? null,
  atualizada: r.updated_at as Date,
  criada: r.created_at as Date,
})

/** A plataforma da conversa: a do app que chamou com o token; pela sessão do HUB, o HUB (nulo). Nunca do corpo. */
export function produtoDaChamada(auth: Authenticated | null): string | null {
  return auth?.session.app?.productId ?? null
}

/**
 * Chamada vinda de um app da família passa pelo gate de lançamento do produto dele (ADR 0023): app fechado para a
 * pessoa → 403 product_closed, mesmo com token válido. Pela sessão do HUB não há produto: a Z do HUB segue aberta.
 */
function gateDoApp(auth: Authenticated | null): Pick<Need, 'release'> {
  const produto = produtoDaChamada(auth)
  return produto ? { release: { productId: produto, channel: 'api' } } : {}
}

/** Conversas da pessoa. `produto`: undefined = todas; null = só as do HUB; texto = só as daquela plataforma. */
export async function listarConversas(db: Database, auth: Authenticated | null, filtro: { produto?: string | null } = {}) {
  const actor = await authorize(db, auth, gateDoApp(auth))
  const todas = filtro.produto === undefined
  const p = filtro.produto ?? null
  const rows = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
      select c.id, c.titulo, c.product_id, c.created_at, c.updated_at, pr.name as produto_nome
      from zro.ia_conversas c left join zro.products pr on pr.id = c.product_id
      where c.org_id = ${actor.orgId}
        and (${todas}::boolean or c.product_id is not distinct from ${p}::text)
      order by c.updated_at desc limit 300`,
  )
  return rows.map(rowToConversa)
}

export async function abrirConversa(db: Database, auth: Authenticated | null, id: string) {
  if (!UUID.test(id)) throw new DomainError('not_found', 'Conversa não encontrada.')
  const actor = await authorize(db, auth, gateDoApp(auth))
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [c] = await tx`
      select c.id, c.titulo, c.product_id, c.created_at, c.updated_at, pr.name as produto_nome
      from zro.ia_conversas c left join zro.products pr on pr.id = c.product_id where c.id = ${id}`
    if (!c) throw new DomainError('not_found', 'Conversa não encontrada.')
    const msgs = await tx`select id, papel, texto, created_at from zro.ia_mensagens where conversa_id = ${id} order by created_at, id`
    return {
      conversa: rowToConversa(c),
      mensagens: msgs.map((m) => ({ id: m.id as string, papel: m.papel as IaMensagem['papel'], texto: m.texto as string, criada: m.created_at as Date })),
    }
  })
}

export async function apagarConversa(db: Database, auth: Authenticated | null, id: string): Promise<void> {
  if (!UUID.test(id)) throw new DomainError('not_found', 'Conversa não encontrada.')
  const actor = await authorize(db, auth, gateDoApp(auth))
  const r = await db.asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => tx`delete from zro.ia_conversas where id = ${id} returning id`)
  if (!r.length) throw new DomainError('not_found', 'Conversa não encontrada.')
}

const PerguntaSchema = z.object({
  conversa: z.string().regex(UUID).nullish(),
  texto: z.string().trim().min(1, 'Escreva alguma coisa.').max(IA_TEXTO_MAX, 'Mensagem longa demais.'),
})

export type Turno = {
  actor: Actor
  conversa: IaConversa
  /** Histórico (até as 40 últimas mensagens), já com a pergunta nova no fim. */
  historico: IaMensagem[]
  perguntaId: string
}

/**
 * Começa um turno: confere o crédito (antes de gastar com o modelo), cria a conversa se for a primeira mensagem e
 * guarda a pergunta. O crédito só é gasto em `concluirTurno`, quando há resposta.
 */
export async function iniciarTurno(db: Database, auth: Authenticated | null, raw: unknown): Promise<Turno> {
  const parsed = PerguntaSchema.safeParse(raw)
  if (!parsed.success) throw new DomainError('invalid_input', parsed.error.issues[0]?.message ?? 'Pedido inválido.')
  const { texto } = parsed.data
  const actor = await authorize(db, auth, { ...gateDoApp(auth), quota: { metric: IA_METRICA, amount: IA_CREDITOS_POR_RESPOSTA } })
  const produto = produtoDaChamada(auth)
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    let c: Record<string, unknown> | undefined
    if (parsed.data.conversa) {
      ;[c] = await tx`
        select c.id, c.titulo, c.product_id, c.created_at, c.updated_at, pr.name as produto_nome
        from zro.ia_conversas c left join zro.products pr on pr.id = c.product_id
        where c.id = ${parsed.data.conversa} and c.org_id = ${actor.orgId}`
      if (!c) throw new DomainError('not_found', 'Conversa não encontrada.')
    } else {
      ;[c] = await tx`
        insert into zro.ia_conversas (org_id, user_id, product_id, titulo)
        values (${actor.orgId}, ${actor.userId}, ${produto}, ${tituloDe(texto)})
        returning id, titulo, product_id, created_at, updated_at, (select name from zro.products where id = ${produto}::text) as produto_nome`
    }
    const [m] = await tx`
      insert into zro.ia_mensagens (conversa_id, user_id, papel, texto) values (${c!.id as string}, ${actor.userId}, 'user', ${texto}) returning id`
    await tx`update zro.ia_conversas set updated_at = now() where id = ${c!.id as string}`
    const hist = await tx`
      select id, papel, texto, created_at from (
        select id, papel, texto, created_at from zro.ia_mensagens where conversa_id = ${c!.id as string} order by created_at desc, id desc limit 40
      ) h order by created_at, id`
    return {
      actor,
      conversa: rowToConversa(c!),
      historico: hist.map((h) => ({ id: h.id as string, papel: h.papel as IaMensagem['papel'], texto: h.texto as string, criada: h.created_at as Date })),
      perguntaId: m!.id as string,
    }
  })
}

/** Guarda a resposta e gasta o crédito (idempotente pela pergunta: a mesma pergunta nunca conta duas vezes). */
export type IaUso = { modelo: string; entrada: number; saida: number; cache: number }

export async function concluirTurno(db: Database, turno: Turno, resposta: string, uso: IaUso | null = null): Promise<{ mensagemId: string; creditos: number }> {
  const texto = resposta.trim().slice(0, 40000)
  if (!texto) throw new DomainError('upstream_unavailable', 'A IA não respondeu. Tente de novo.')
  const { actor } = turno
  const q = await db.asSystem('ia: crédito da resposta', (tx) =>
    consumeQuota(tx, {
      orgId: actor.orgId,
      metric: IA_METRICA,
      amount: IA_CREDITOS_POR_RESPOSTA,
      idempotencyKey: `ia:${turno.perguntaId}`,
      userId: actor.userId,
    }),
  )
  // Corrida rara (dois turnos ao mesmo tempo no último crédito): a resposta já foi gerada; fica guardada sem gastar.
  const creditos = q.ok && !q.duplicate ? IA_CREDITOS_POR_RESPOSTA : 0
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [m] = await tx`
      insert into zro.ia_mensagens (conversa_id, user_id, papel, texto, creditos, modelo, tokens_entrada, tokens_saida, tokens_cache)
      values (${turno.conversa.id}, ${actor.userId}, 'assistant', ${texto}, ${creditos}, ${uso?.modelo ?? null},
              ${uso?.entrada ?? 0}, ${uso?.saida ?? 0}, ${uso?.cache ?? 0}) returning id`
    await tx`update zro.ia_conversas set updated_at = now() where id = ${turno.conversa.id}`
    return { mensagemId: m!.id as string, creditos }
  })
}

function tituloDe(texto: string): string {
  const linha = texto.replace(/\s+/g, ' ').trim()
  return linha.length > 60 ? `${linha.slice(0, 57).trimEnd()}…` : linha || 'Nova conversa'
}

/**
 * O retrato da conta que a IA lê a cada turno: quem é, onde está, o que tem liberado, os projetos, o que pede atenção,
 * as execuções recentes e o consumo do mês. Tudo pelo papel zro_app (RLS): nada que a pessoa não veria no HUB.
 */
export async function retratoDoEcossistema(db: Database, actor: Actor, produto: string | null) {
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [org] = await tx`select name from zro.organizations where id = ${actor.orgId}`
    // Gate de lançamento pelo canal da chamada (dentro de um app = api): o que está fechado para a pessoa vem como "closed";
    // o que não existe para ela (não lançado, migração 0049) nem vem.
    const ferramentas = (await productAccessFor(tx, actor.orgId, { channel: channelOf(actor.auth) })).map((a) => ({
      id: a.productId,
      nome: a.name,
      papel: a.roleInFlow,
      acesso: a.access,
    }))
    const projetos = await tx`
      select p.id, p.title as titulo, p.status, p.type as tipo, p.updated_at as atualizado,
        (select count(*)::int from zro.project_steps s where s.project_id = p.id and s.state = 'done') as etapas_feitas,
        (select count(*)::int from zro.project_steps s where s.project_id = p.id and s.state in ('needs_review', 'failed')) as etapas_com_atencao
      from zro.projects p where p.org_id = ${actor.orgId} and p.status <> 'archived' order by p.updated_at desc limit 25`
    const atencao = await tx`
      select p.title as projeto, pr.name as ferramenta, s.state as estado, s.updated_at as quando
      from zro.project_steps s join zro.projects p on p.id = s.project_id join zro.products pr on pr.id = s.step_key
      where s.org_id = ${actor.orgId} and s.state in ('needs_review', 'failed') and zro.release_visible(s.step_key, zro.current_user_id())
      order by s.updated_at desc limit 10`
    const execucoes = await tx`
      select r.handler as tarefa, r.status, r.updated_at as quando, p.title as projeto, r.last_error as erro
      from zro.workflow_runs r left join zro.projects p on p.id = r.project_id
      where r.org_id = ${actor.orgId} order by r.updated_at desc limit 8`
    const { start, end } = quotaPeriod()
    // Toda métrica com limite no plano (mesmo sem uso ainda) e o que já foi usado no mês.
    const consumo = await tx`
      with limites as (
        select l.key as metrica, max(l.value::bigint) as limite
        from zro.entitlements e, jsonb_each_text(e.limits) l
        where e.org_id = ${actor.orgId} and e.status = 'active' and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
          and l.key <> all(${[...FEATURE_FLAGS]}::text[])
        group by l.key
      )
      select coalesce(l.metrica, q.metric) as metrica, coalesce(q.used, 0)::bigint as usado, coalesce(l.limite, q.limit_value) as limite
      from limites l full join (select metric, used, limit_value from zro.quotas where org_id = ${actor.orgId} and period_start = ${start}) q
        on q.metric = l.metrica`
    const nomeProduto = produto ? (ferramentas.find((f) => f.id === produto)?.nome ?? produto) : 'HUB Absolute ZRO'
    return {
      pessoa: { nome: actor.auth.user.displayName, papel_na_organizacao: actor.role },
      organizacao: (org?.name as string) ?? null,
      plataforma_atual: nomeProduto,
      ferramentas,
      projetos,
      pedem_atencao: atencao,
      execucoes_recentes: execucoes,
      consumo_do_mes: { renova_em: end.toISOString(), metricas: consumo },
    }
  })
}

/** Leitura sob demanda (ferramenta da IA): um projeto da organização, resumido. */
export async function projetoParaIa(tx: Queryable, orgId: string, busca: string) {
  const termo = busca.trim().slice(0, 120)
  const [p] = UUID.test(termo)
    ? await tx`select id, title, status, type, client_reference, created_at, updated_at from zro.projects where org_id = ${orgId} and id = ${termo}`
    : await tx`select id, title, status, type, client_reference, created_at, updated_at from zro.projects
               where org_id = ${orgId} and title ilike ${'%' + termo + '%'} order by updated_at desc limit 1`
  if (!p) return null
  const etapas = await tx`
    select pr.name as ferramenta, s.state as estado, s.updated_at as quando from zro.project_steps s join zro.products pr on pr.id = s.step_key
    where s.project_id = ${p.id as string} and zro.release_visible(s.step_key, zro.current_user_id()) order by pr.step_order`
  const documentos = await tx`
    select distinct on (kind) kind as tipo, version as versao, title as titulo, left(body, 1500) as trecho, created_at as quando
    from zro.project_documents where project_id = ${p.id as string} order by kind, version desc`
  const execucoes = await tx`
    select handler as tarefa, status, last_error as erro, updated_at as quando from zro.workflow_runs
    where project_id = ${p.id as string} order by updated_at desc limit 10`
  const equipe = await tx`
    select u.display_name as nome, pm.role as papel, pm.function as funcao from zro.project_members pm join zro.users u on u.id = pm.user_id
    where pm.project_id = ${p.id as string}`
  const arquivos = await tx`
    select m.source_app as origem, m.status, (select count(*)::int from zro.project_assets a where a.manifest_row_id = m.id) as arquivos, m.created_at as quando
    from zro.media_manifests m where m.project_id = ${p.id as string} order by m.created_at desc limit 5`
  return { projeto: p, etapas, documentos, execucoes, equipe, entregas: arquivos }
}

/**
 * Preço público por milhão de tokens (US$), para o console estimar o gasto da IA. A conta oficial é a fatura do
 * provedor; aqui é a soma dos tokens que ele informou em cada resposta. Modelo fora da tabela usa o preço do Opus.
 */
export const IA_PRECOS: Record<string, { entrada: number; saida: number; cache: number }> = {
  'claude-opus-5-5': { entrada: 4, saida: 20, cache: 0.2 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cache: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5, cache: 0.01 },
}

export function custoIaUsd(modelo: string | null, t: { entrada: number; saida: number; cache: number }): number {
  const p = (modelo && IA_PRECOS[modelo]) || IA_PRECOS['claude-opus-5-5']!
  return (t.entrada * p.entrada + t.saida * p.saida + t.cache * p.cache) / 1_000_000
}
