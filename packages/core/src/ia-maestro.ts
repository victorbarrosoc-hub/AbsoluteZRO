/**
 * A Z lendo o Maestro (autorizado pelo titular em 28/10/2026, só leitura): o "dia da produtora" da pessoa, pelo mesmo
 * pedido servidor a servidor do Drive (ia-drive.ts): JWT curto `zro-pedido+jwt` assinado com a chave do login único
 * (`assinarPedidoDeApp`, 60 s, `jti` de uso único), `aud` = o cliente do Maestro, ação na lista abaixo. O Maestro
 * confere em products/maestro/src/lib/zro/pedido.ts. Contrato: docs/integration-contracts/maestro-z.md.
 *
 * Antes de chamar, a autorização do HUB (`authorize` com o produto `maestro`): o gate de lançamento (hoje só a lista
 * de acesso) e o Maestro no plano da organização. Fechado ou fora do plano: nada sai daqui. Toda leitura fica em
 * `zro.audit_logs` (quem, a ação, o resultado), sem o conteúdo lido.
 *
 * O resultado volta como texto para o modelo (dados, não instruções), com a fonte ("Maestro") e a hora; dinheiro só
 * quando o Maestro manda (ele só manda para administração e gestão). Escrever no Maestro (pedido, despesa) não existe.
 */
import { assinarPedidoDeApp } from '@zro/auth'
import type { Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { authorize, type Actor } from './authz'
import { horaDoRelato } from './ia-drive'

export const MAESTRO_PRODUTO = 'maestro'
export const MAESTRO_URL_PADRAO = 'https://maestro.absolutezro.com'
export const MAESTRO_CLIENT_PADRAO = 'maestro-web'
/** As únicas leituras que a Z pede ao Maestro. Escrita (criar pedido, despesa) fica de fora até nova decisão. */
export const MAESTRO_LEITURAS = { resumo: { acao: 'maestro.resumo', caminho: '/api/zro/maestro/resumo' } } as const
export type MaestroLeitura = keyof typeof MAESTRO_LEITURAS
export const IA_ACAO_MAESTRO = 'ia.maestro.leitura'

export type MaestroConfig = { base: string; clientId: string; fetch?: typeof fetch; timeoutMs?: number }

export function maestroConfigDoAmbiente(env: Record<string, string | undefined> = process.env): MaestroConfig {
  return {
    base: (env.ZRO_MAESTRO_URL?.trim() || MAESTRO_URL_PADRAO).replace(/\/$/, ''),
    clientId: env.ZRO_MAESTRO_CLIENT_ID?.trim() || MAESTRO_CLIENT_PADRAO,
  }
}

/** `codigo` e `dinheiro` só servem à auditoria e aos testes (ao modelo vai só o texto). */
export type MaestroResposta = { texto: string; erro: boolean; codigo?: string | null; dinheiro?: boolean }

/** Falha (do HUB ou do Maestro) → frase para a Z explicar. Nenhuma vira número inventado. */
export function falhaDoMaestroParaIa(codigo: string | null, base: string): string {
  switch (codigo) {
    case 'product_closed':
      return 'O Maestro ainda não está liberado para esta conta (está em teste fechado). Diga isso, sem descrever o que ele faz nem prometer data.'
    case 'entitlement_required':
    case 'product_unavailable':
    case 'feature_not_included':
      return 'O Maestro não está no plano desta organização, então você não lê os dados dele. Diga isso e que a pessoa vê os planos em absolutezro.com/ferramentas.'
    case 'sem_vinculo':
      return `Esta conta ainda não entrou no Maestro (ou está sem acesso lá), e é do último login nele que vem a produtora. Diga para entrar em ${base} com a conta Absolute ZRO e pedir de novo.`
    case 'devagar':
      return 'Foram muitas leituras do Maestro em pouco tempo. Diga para esperar uns minutos e pedir de novo.'
    default:
      return `O Maestro não respondeu agora. Diga que não conseguiu olhar o Maestro neste momento e para conferir em ${base}/app/hoje. Não invente pedido, card, número nem valor.`
  }
}

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const emReais = (c: unknown) => (typeof c === 'number' && Number.isFinite(c) ? reais.format(c / 100) : null)
const lista = <T>(v: unknown, max: number) => (Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object').slice(0, max) : [])
const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Só o link da tela Hoje no Maestro configurado (ou no oficial); qualquer outro some. */
export function linkDoMaestro(v: unknown, base: string): string | undefined {
  if (typeof v !== 'string') return undefined
  try {
    const u = new URL(v)
    const ok = u.origin === new URL(base).origin || u.origin === MAESTRO_URL_PADRAO
    return ok && u.pathname === '/app/hoje' && !u.search && !u.hash ? u.href : undefined
  } catch {
    return undefined
  }
}

/** A resposta do Maestro → texto para a Z: campos conhecidos, fonte e hora prontas para citar, dinheiro só se veio. */
export function resumoDoMaestroParaIa(j: Record<string, unknown>, base: string, agora = Date.now()): string {
  const hora = horaDoRelato(j.gerado_em, agora)
  const c = (j.contagens ?? {}) as Record<string, unknown>
  const d = j.dinheiro && typeof j.dinheiro === 'object' ? (j.dinheiro as Record<string, unknown>) : null
  const link = linkDoMaestro(j.link, base)
  return JSON.stringify({
    fonte: 'Maestro',
    citar_como: hora ? `segundo o Maestro, às ${hora}` : 'segundo o Maestro (sem hora da leitura)',
    gerado_em: texto(j.gerado_em, 40),
    organizacao: texto(j.organizacao, 120),
    hoje: texto(j.hoje, 10),
    ...(link ? { abrir_no_maestro: link } : {}),
    retornar_hoje: lista<Record<string, unknown>>(j.retornar_hoje, 20).map((r) => ({
      nome: texto(r.nome, 120),
      tipo: r.tipo === 'cliente' ? 'cliente' : 'pedido',
      data: texto(r.data, 10),
      nota: texto(r.nota, 300),
    })),
    vencendo: lista<Record<string, unknown>>(j.vencendo, 20).map((k) => ({
      card: texto(k.card, 160),
      cliente: texto(k.cliente, 120),
      prazo: texto(k.prazo, 40),
    })),
    com_o_cliente: lista<Record<string, unknown>>(j.com_o_cliente, 20).map((k) => ({
      card: texto(k.card, 160),
      cliente: texto(k.cliente, 120),
      desde: texto(k.desde, 40),
    })),
    contagens: {
      pedidos_novos: numero(c.pedidos_novos),
      orcamentos_aguardando: numero(c.orcamentos_aguardando),
      agenda_hoje: numero(c.agenda_hoje),
      cards_atrasados: numero(c.cards_atrasados),
    },
    ...(d
      ? {
          dinheiro: {
            meta_do_mes: emReais(d.meta_do_mes),
            faturado_no_mes: emReais(d.faturado_no_mes),
            caixa: emReais(d.caixa),
            a_receber_semana_e_atrasado: emReais(d.receber_semana),
            a_pagar_semana_e_atrasado: emReais(d.pagar_semana),
          },
        }
      : { dinheiro: null, sem_dinheiro: 'O Maestro não mostra valores para o papel desta pessoa. Não fale de dinheiro nem estime valores.' }),
    dica: 'Cite a fonte e a hora como em citar_como. Só o que veio aqui; o que não veio, diga que não está aparecendo e aponte o Abrir no Maestro.',
  })
}

/**
 * `ver_maestro`: confere no HUB se a pessoa pode ler o Maestro (gate de lançamento + plano), pede ao Maestro em nome
 * dela e audita. Fechado ou fora do plano: não chama e registra a recusa.
 */
export async function maestroParaIa(
  db: Database,
  turno: { actor: Pick<Actor, 'auth' | 'userId' | 'orgId'> },
  leitura: MaestroLeitura = 'resumo',
  cfg: MaestroConfig = maestroConfigDoAmbiente(),
  signal?: AbortSignal,
): Promise<MaestroResposta> {
  const { actor } = turno
  const { acao, caminho } = MAESTRO_LEITURAS[leitura]
  const registrar = (resultado: string, extra: { erro?: string | null; dinheiro?: boolean } = {}) =>
    db
      .asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) =>
        audit(tx, {
          orgId: actor.orgId,
          actorUserId: actor.userId,
          action: IA_ACAO_MAESTRO,
          targetType: 'maestro_leitura',
          targetId: null,
          metadata: { produto: MAESTRO_PRODUTO, acao, resultado, erro: extra.erro ?? null, dinheiro: extra.dinheiro ?? false },
        }),
      )
      .catch(() => {}) // auditoria que falha não muda a resposta

  try {
    await authorize(db, actor.auth, { product: { id: MAESTRO_PRODUTO } })
  } catch (e) {
    const codigo = e instanceof DomainError ? e.code : 'nao_autorizado'
    await registrar('recusado', { erro: codigo })
    return { texto: falhaDoMaestroParaIa(codigo, cfg.base), erro: true, codigo }
  }

  let res: Response
  try {
    const token = await assinarPedidoDeApp(db, { sub: actor.userId, aud: cfg.clientId, acao })
    const tempo = AbortSignal.timeout(cfg.timeoutMs ?? 15_000)
    res = await (cfg.fetch ?? fetch)(`${cfg.base}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: signal ? AbortSignal.any([signal, tempo]) : tempo,
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    await registrar('falhou', { erro: 'fora_do_ar' })
    return { texto: falhaDoMaestroParaIa(null, cfg.base), erro: true, codigo: 'fora_do_ar' }
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !json || json.fonte !== 'Maestro') {
    const codigo = typeof json?.erro === 'string' ? json.erro : `http_${res.status}`
    await registrar('falhou', { erro: codigo })
    return { texto: falhaDoMaestroParaIa(codigo, cfg.base), erro: true, codigo }
  }
  const dinheiro = !!json.dinheiro && typeof json.dinheiro === 'object'
  await registrar('lido', { dinheiro })
  return { texto: resumoDoMaestroParaIa(json, cfg.base), erro: false, dinheiro }
}
