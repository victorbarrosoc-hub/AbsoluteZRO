/**
 * Entregas entre apps pelo HUB (Criação F8, 30/10/2026): o roteiro do Maestro direto no TPeasy, sem copiar e colar.
 * Contrato em docs/integration-contracts/maestro-tpeasy.md; tabela e funções na migração 0040.
 *
 * O TPeasy guarda os roteiros só no aparelho (sem banco), então o HUB é a caixa de entrada:
 * - **Mandar** (`enviarEntrega`): o app de origem (o produto do cliente OAuth do token, hoje só o Maestro) manda a versão
 *   salva com o access token da pessoa. `authorize()` na ordem do PRD §5.2: papel de quem edita, gate do app de origem,
 *   **o TPeasy no plano da organização** (sem ele: 403 `entitlement_required`) e o gate do TPeasy para quem recebe. A
 *   linha nasce pela função `zro.app_entrega_enviar` (asUser, RLS) com a chave de idempotência por destinatário: a mesma
 *   versão de novo vira "reenviada" e nada duplica. Na mesma transação, o evento `script.version.sent`
 *   (`idempotency_key = app.entrega:<id>`, sem rota: o HUB não processa roteiro).
 * - **Receber** (`entregasRecebidas`/`marcarRecebidas`): só o app de destino, com o token da pessoa (`tpeasy.roteiros`),
 *   lê o que chegou para ela nos últimos 30 dias e conta o que gravou no aparelho.
 * - **Estado** (`entregasEnviadas`) e **para quem** (`destinatariosDeEntrega`): o app de origem mostra "Enviado · v3 ·
 *   Recebido" e a lista de quem da organização usa o TPeasy (nome e foto; nunca e-mail).
 */
import { createHash } from 'node:crypto'
import { registerAttempt, withinLimit, type Authenticated, type Rule } from '@zro/auth'
import { releaseAllows } from '@zro/billing'
import { authorize, EDIT_ROLES, publishEvent, type Actor } from '@zro/core'
import { pgErrorCode, PG, type Database, type Tx } from '@zro/db'
import {
  AppEntregaEntradaSchema,
  AppEntregaRecebidasEntradaSchema,
  chaveDaEntrega,
  ENTREGAS_ENTRE_APPS,
  itemNoTpeasy,
  type AppEntregaEstado,
  type AppEntregaRecebida,
} from '@zro/media-contracts'
import { DomainError } from '@zro/observability'
import { ROUTES } from './handlers'

/** O escopo que o token do app de origem precisa para mandar (o da API dele no HUB). */
export const ESCOPO_ENVIAR_ENTREGA: Record<string, string> = { maestro: 'maestro.projects' }
/** O escopo que o token do app de destino precisa para ler a própria caixa de entrada (migração 0040). */
export const ESCOPO_RECEBER_ENTREGA: Record<string, string> = { tpeasy: 'tpeasy.roteiros' }
export const LIMITE_ENTREGAS: Rule = { max: 60, windowMs: 10 * 60_000 }
export const DIAS_NA_CAIXA = 30
export const ENTREGA_ACAO = 'app.entrega.enviada'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const appDe = (auth: Authenticated | null) => auth?.session.app?.productId ?? null
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString())
const ctx = (a: Actor) => ({ userId: a.userId, orgId: a.orgId })

function soApp(auth: Authenticated | null): string {
  const app = appDe(auth)
  if (!auth || !app) throw new DomainError('action_not_allowed', 'Só um app da família usa as entregas.', { erro: 'so_app' })
  return app
}

function rota(app: string, destino: unknown, tipo: unknown): { destino: 'tpeasy'; tipo: 'roteiro' } {
  const tipos = (ENTREGAS_ENTRE_APPS as Record<string, Record<string, readonly string[]>>)[app]?.[String(destino)]
  if (!tipos?.includes(String(tipo)))
    throw new DomainError('action_not_allowed', 'Esta entrega não está liberada para este app.', { erro: 'acao_nao_permitida' })
  return { destino: destino as 'tpeasy', tipo: tipo as 'roteiro' }
}

/** Link de volta: https sempre; http só para localhost (desenvolvimento). */
function linkConfere(link: string | null): string | null {
  if (!link) return null
  try {
    const u = new URL(link)
    const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    if ((u.protocol === 'https:' || local) && !u.username && !u.password) return u.toString()
  } catch {
    /* cai no erro */
  }
  throw new DomainError('invalid_input', 'O link de volta precisa ser https.')
}

/** Texto do TPeasy: quebras de linha normalizadas, sem caracteres de controle (menos a quebra e o tab). */
export function limparCorpo(t: string): string {
  return (
    t
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
      .trim()
  )
}

function traduzir(e: unknown): never {
  const code = pgErrorCode(e)
  if (code === 'P0002') throw new DomainError('not_found', 'Essa pessoa não está na sua organização.', { erro: 'destinatario' })
  if (code === PG.insufficientPrivilege) throw new DomainError('forbidden_role', 'Seu papel nesta organização não permite mandar.')
  if (code === PG.uniqueViolation) throw new DomainError('conflict', 'Essa entrega já existe em outro lugar.')
  if (code === PG.checkViolation) throw new DomainError('invalid_input', 'Entrega fora do formato.')
  throw e
}

type Destinatario = { id: string; nome: string; foto: string | null; eu: boolean }

async function destinatarios(tx: Tx, destino: string): Promise<Destinatario[]> {
  const rows = await tx`select user_id, nome, foto, eu from zro.app_destinatarios(${destino})`
  return rows.map((r) => ({
    id: r.user_id as string,
    nome: (r.nome as string) || 'Pessoa',
    foto: r.foto ? `/api/v1/foto/${r.foto as string}` : null,
    eu: !!r.eu,
  }))
}

/** Para quem dá para mandar (a própria pessoa primeiro), com o TPeasy no plano. */
export async function destinatariosDeEntrega(db: Database, auth: Authenticated | null, destino: unknown): Promise<{ destinatarios: Destinatario[] }> {
  const app = soApp(auth)
  const r = rota(app, destino, 'roteiro')
  const actor = await authorize(db, auth, { roles: EDIT_ROLES, release: { productId: app }, product: { id: r.destino } })
  return { destinatarios: await db.asUser(ctx(actor), (tx) => destinatarios(tx, r.destino)) }
}

/** Manda (ou reenvia) uma versão salva para a caixa de entrada do app de destino. */
export async function enviarEntrega(db: Database, auth: Authenticated | null, entrada: unknown): Promise<AppEntregaEstado> {
  const app = soApp(auth)
  const bruto = (entrada ?? {}) as Record<string, unknown>
  const r = rota(app, bruto.destino, bruto.tipo)
  const p = AppEntregaEntradaSchema.safeParse(entrada)
  if (!p.success) throw new DomainError('invalid_input', 'Entrega fora do formato.', { campos: p.error.issues.map((i) => i.path.join('.')).slice(0, 10) })
  const e = p.data
  const corpo = limparCorpo(e.corpo)
  const titulo = e.titulo.replace(/\s+/g, ' ').trim()
  if (!corpo || !titulo) throw new DomainError('invalid_input', 'Nada para mandar: o texto está vazio.')
  const link = linkConfere(e.link)
  // 1–6: pessoa, organização, papel de quem edita, gate do app de origem, o TPeasy no plano da organização.
  const actor = await authorize(db, auth, { roles: EDIT_ROLES, release: { productId: app }, product: { id: r.destino } })
  const para = e.para ?? actor.userId
  // O gate do app de destino vale para quem recebe (produto fechado não recebe nada).
  const aberto = await db.asSystem('entregas: gate de quem recebe', (tx) => releaseAllows(tx, r.destino, para, 'api'))
  if (!aberto) throw new DomainError('product_closed', 'O TPeasy ainda não está aberto para essa pessoa.', { product: r.destino, closed: true, upgrade: false })
  const chave = `entregas:${app}:${actor.userId}`
  const ok = await db.asSystem('entregas: limite', async (tx) => {
    if (!(await withinLimit(tx, chave, LIMITE_ENTREGAS))) return false
    await registerAttempt(tx, chave)
    return true
  })
  if (!ok) throw new DomainError('rate_limited', 'Muitos envios seguidos. Espere alguns minutos e tente de novo.')
  const sha256 = createHash('sha256').update(corpo, 'utf8').digest('hex')
  try {
    return await db.asUser(ctx(actor), async (tx) => {
      const lista = await destinatarios(tx, r.destino)
      const quem = lista.find((d) => d.id === para)
      // Outra pessoa só se ela já usa o app de destino (o próprio dono recebe mesmo antes de abrir o TPeasy).
      if (!quem) throw new DomainError('not_found', 'Essa pessoa não usa o TPeasy na sua organização.', { erro: 'destinatario' })
      const [row] = await tx`
        select id, situacao, criada_em, atualizada_em, recebida_em from zro.app_entrega_enviar(
          ${para}, ${app}, ${r.destino}, ${r.tipo}, ${chaveDaEntrega(e.roteiro)}, ${itemNoTpeasy(e.roteiro)}, ${e.roteiro.versao},
          ${titulo.slice(0, 300)}, ${corpo}, ${sha256}, ${link}, ${e.alvo_seg})`
      const id = row!.id as string
      await publishEvent(
        tx,
        {
          orgId: actor.orgId,
          projectId: null,
          type: 'script.version.sent',
          producer: app,
          payload: {
            origem: 'maestro',
            roteiro_id: e.roteiro.id,
            versao: e.roteiro.versao,
            sha256: e.roteiro.sha256,
            titulo: titulo.slice(0, 200),
            destino: 'tpeasy',
            entrega_id: id,
          },
          idempotencyKey: `app.entrega:${id}`,
          createdBy: actor.userId,
        },
        ROUTES,
      )
      return {
        id,
        situacao: row!.situacao as 'nova' | 'reenviada',
        item: itemNoTpeasy(e.roteiro),
        versao: e.roteiro.versao,
        para: { id: quem.id, nome: quem.nome.slice(0, 120), eu: quem.eu },
        criada_em: iso(row!.criada_em),
        atualizada_em: iso(row!.atualizada_em),
        recebida_em: row!.recebida_em ? iso(row!.recebida_em) : null,
      }
    })
  } catch (err) {
    if (err instanceof DomainError) throw err
    traduzir(err)
  }
}

/** O que a pessoa mandou de um roteiro (as 10 mais novas): "Enviado ao TPeasy · v3 · Recebido". */
export async function entregasEnviadas(
  db: Database,
  auth: Authenticated | null,
  q: { roteiro?: unknown },
): Promise<{ entregas: Omit<AppEntregaEstado, 'situacao'>[] }> {
  const app = soApp(auth)
  if (!ESCOPO_ENVIAR_ENTREGA[app]) throw new DomainError('action_not_allowed', 'Este app não manda entregas.', { erro: 'acao_nao_permitida' })
  const roteiro = typeof q.roteiro === 'string' && UUID.test(q.roteiro) ? q.roteiro.toLowerCase() : null
  if (!roteiro) throw new DomainError('invalid_input', 'Diga o roteiro.')
  const actor = await authorize(db, auth, { release: { productId: app } })
  const rows = await db.asUser(
    ctx(actor),
    (tx) => tx`
      select e.id, e.item, e.versao, e.destinatario_id, coalesce(u.display_name, '') as nome, e.criada_em, e.atualizada_em, e.recebida_em
        from zro.app_entregas e left join zro.users u on u.id = e.destinatario_id
       where e.remetente_id = ${actor.userId} and e.origem = ${app} and e.org_id = ${actor.orgId}
         and starts_with(e.item, ${`${app}-${roteiro}-`})
       order by e.atualizada_em desc limit 10`,
  )
  return {
    entregas: rows.map((x) => ({
      id: x.id as string,
      item: x.item as string,
      versao: x.versao as number,
      para: { id: x.destinatario_id as string, nome: ((x.nome as string) || 'Pessoa').slice(0, 120), eu: x.destinatario_id === actor.userId },
      criada_em: iso(x.criada_em),
      atualizada_em: iso(x.atualizada_em),
      recebida_em: x.recebida_em ? iso(x.recebida_em) : null,
    })),
  }
}

/** A caixa de entrada do app de destino (só ele, com o token da pessoa): o que chegou nos últimos 30 dias. */
export async function entregasRecebidas(
  db: Database,
  auth: Authenticated | null,
  q: { destino?: unknown; desde?: unknown },
): Promise<{ entregas: AppEntregaRecebida[]; agora: string }> {
  const app = soApp(auth)
  if (q.destino !== undefined && q.destino !== app) throw new DomainError('action_not_allowed', 'Cada app lê só a própria caixa.', { erro: 'outra_caixa' })
  if (!ESCOPO_RECEBER_ENTREGA[app]) throw new DomainError('action_not_allowed', 'Este app não recebe entregas.', { erro: 'acao_nao_permitida' })
  const desde = typeof q.desde === 'string' && q.desde && !Number.isNaN(Date.parse(q.desde)) ? new Date(q.desde) : null
  const actor = await authorize(db, auth, { release: { productId: app } })
  return db.asUser(ctx(actor), async (tx) => {
    const [{ agora }] = (await tx`select now() as agora`) as unknown as [{ agora: Date }]
    const rows = await tx`
      select e.id, e.origem, e.tipo, e.item, e.versao, e.titulo, e.corpo, e.sha256, e.link, e.alvo_seg, e.atualizada_em,
             coalesce(u.display_name, '') as de
        from zro.app_entregas e left join zro.users u on u.id = e.remetente_id
       where e.destinatario_id = ${actor.userId} and e.destino = ${app}
         and e.atualizada_em > now() - make_interval(days => ${DIAS_NA_CAIXA})
         and (${desde}::timestamptz is null or e.atualizada_em > ${desde}::timestamptz)
       order by e.atualizada_em asc limit 50`
    return {
      agora: iso(agora),
      entregas: rows.map((x) => ({
        id: x.id as string,
        origem: 'maestro' as const,
        tipo: 'roteiro' as const,
        item: x.item as string,
        versao: x.versao as number,
        titulo: x.titulo as string,
        corpo: x.corpo as string,
        sha256: x.sha256 as string,
        link: (x.link as string | null) ?? null,
        alvo_seg: x.alvo_seg as number,
        de: ((x.de as string) || 'Absolute ZRO').slice(0, 120),
        atualizada_em: iso(x.atualizada_em),
      })),
    }
  })
}

/** O aparelho conta o que gravou: quem mandou vê "Recebido". */
export async function marcarRecebidas(db: Database, auth: Authenticated | null, entrada: unknown): Promise<{ marcadas: number }> {
  const app = soApp(auth)
  if (!ESCOPO_RECEBER_ENTREGA[app]) throw new DomainError('action_not_allowed', 'Este app não recebe entregas.', { erro: 'acao_nao_permitida' })
  const p = AppEntregaRecebidasEntradaSchema.safeParse(entrada)
  if (!p.success) throw new DomainError('invalid_input', 'Mande de 1 a 100 ids.')
  const actor = await authorize(db, auth, { release: { productId: app } })
  const [r] = await db.asUser(ctx(actor), (tx) => tx`select zro.app_entregas_recebidas(${p.data.ids}::uuid[]) as n`)
  return { marcadas: Number(r?.n ?? 0) }
}
