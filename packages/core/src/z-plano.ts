/**
 * A Z por plano (ADR 0040, migração 0056): qual modelo responde a cada cliente, quanto a Z pode gastar por dia e o
 * gasto real do chat de clientes para o console. Este é o ÚNICO lugar com os ids de modelo e o mapa nível → modelo.
 *
 * - Modelo: nível Zero → Haiku 5.5; Órbita e Absoluto → Sonnet 5.5; nível não resolvido → Sonnet (a resposta nunca quebra).
 *   Contas administradoras da plataforma seguem podendo usar a versão publicada no Laboratório (modelo e tamanho).
 * - Nível da Z (ADR 0039, `zro.niveis_efetivos`): a Z do HUB vale o MAIOR nível da pessoa entre os apps; a Z chamada de
 *   dentro de um app vale o nível dela naquele app (produto de origem da conversa). Se houver mais de um nível possível
 *   (app sem linha de nível, vários apps no HUB), vale o maior. Legado = Absoluto, teste de 15 dias = Absoluto,
 *   concessão do console = o nível concedido, admin = Absoluto. Detalhe em docs/decisions/0040-z-custo-e-modelo-por-plano.md.
 * - Teto diário em dólar (fuso de Fortaleza, o mesmo dos Custos), por pessoa e global, só para o chat de clientes.
 *   Padrão conservador no código; `Z_TETO_USUARIO_DIA_USD` e `Z_TETO_GLOBAL_DIA_USD` trocam; valor ausente ou inválido
 *   usa o padrão (nunca "sem teto"); 0 bloqueia. O teto do Laboratório (z_lab_config) é outro e não conta o chat.
 */
import { niveisEfetivos, type Nivel, type NivelDoApp, type OrigemNivel } from '@zro/billing'
import type { Database, Queryable } from '@zro/db'
import { createLogger, DomainError } from '@zro/observability'

const log = createLogger('z-plano')

// ───────────── modelos ─────────────

/** Os ids dos modelos do Claude que a Absolute ZRO usa. Trocar de versão é mudar aqui (e a tabela de preços em ia.ts). */
export const IA_MODELOS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const

/** O mapa nível → modelo da Z dos clientes (decisão do titular, 02/11/2026). */
export const Z_MODELO_POR_NIVEL: Record<Nivel, string> = {
  zero: IA_MODELOS.haiku,
  orbita: IA_MODELOS.sonnet,
  absoluto: IA_MODELOS.sonnet,
}
/** Sem nível resolvido (erro ao ler, conta sem vínculo): Sonnet, o meio-termo. A resposta não quebra por isso. */
export const Z_MODELO_SEM_NIVEL: string = IA_MODELOS.sonnet

export function modeloDoNivel(nivel: string | null | undefined): string {
  return nivel && Object.hasOwn(Z_MODELO_POR_NIVEL, nivel) ? Z_MODELO_POR_NIVEL[nivel as Nivel] : Z_MODELO_SEM_NIVEL
}

// ───────────── nível da Z ─────────────

const PESO: Record<Nivel, number> = { zero: 1, orbita: 2, absoluto: 3 }

/** O nível que vale para uma conversa. `nivel` nulo = não resolvido (cai no modelo do Sonnet). */
export type ZPlano = { nivel: Nivel | null; origem: OrigemNivel | null; produto: string | null }

const maior = (l: readonly NivelDoApp[]): NivelDoApp | null => l.reduce<NivelDoApp | null>((m, n) => (!m || PESO[n.nivel] > PESO[m.nivel] ? n : m), null)

/**
 * Regra do nível da Z: dentro de um app (`produto`), o nível dela naquele app; no HUB (`produto` nulo), ou se o app não
 * tem linha de nível, o maior entre todos os apps da pessoa. Sem nenhum nível, não resolvido.
 */
export function nivelDaZ(niveis: readonly NivelDoApp[], produto: string | null): ZPlano {
  const doApp = produto ? maior(niveis.filter((n) => n.productId === produto)) : null
  const n = doApp ?? maior(niveis)
  return { nivel: n?.nivel ?? null, origem: n?.origem ?? null, produto }
}

/** Lê os níveis da pessoa na organização e aplica a regra. Qualquer falha vira "não resolvido": a Z responde mesmo assim. */
export async function planoDaZ(db: Database, userId: string, orgId: string, produto: string | null): Promise<ZPlano> {
  try {
    const niveis = await db.asSystem('ia: nível da Z', (tx) => niveisEfetivos(tx, userId, orgId))
    return nivelDaZ(niveis, produto)
  } catch (err) {
    log.error('z.nivel_indisponivel', { error: err })
    return { nivel: null, origem: null, produto }
  }
}

// ───────────── teto diário do chat de clientes ─────────────

/** Padrão conservador: US$ 1 por pessoa por dia (~80 respostas do Sonnet) e US$ 20 por dia no total (~1.600). */
export const Z_TETO_PADRAO = { usuarioDiaUsd: 1, globalDiaUsd: 20 } as const

export type ZTetosDosClientes = { usuarioDiaUsd: number; globalDiaUsd: number }

const numeroOuPadrao = (v: string | undefined, padrao: number) => {
  if (v == null || v.trim() === '') return padrao
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? n : padrao
}

export function tetosDosClientes(env: Record<string, string | undefined> = process.env): ZTetosDosClientes {
  return {
    usuarioDiaUsd: numeroOuPadrao(env.Z_TETO_USUARIO_DIA_USD, Z_TETO_PADRAO.usuarioDiaUsd),
    globalDiaUsd: numeroOuPadrao(env.Z_TETO_GLOBAL_DIA_USD, Z_TETO_PADRAO.globalDiaUsd),
  }
}

export const Z_TETO_MSG_USUARIO = 'Você conversou bastante com a Z hoje. Ela volta amanhã.'
export const Z_TETO_MSG_GLOBAL = 'A Z está com muita procura hoje. Tente de novo amanhã.'

/** Bloqueia (`>=`, como o teto do laboratório) quando o gasto do dia chegou ao teto. Antes de qualquer gasto com o modelo. */
export async function conferirTetoDosClientes(db: Database, userId: string, tetos: ZTetosDosClientes = tetosDosClientes()): Promise<void> {
  const [r] = await db.asSystem(
    'ia: teto do dia',
    (tx) => tx`
      select coalesce(sum(custo_usd), 0)::float8 as global,
             coalesce(sum(custo_usd) filter (where user_id = ${userId}), 0)::float8 as usuario
      from zro.z_lab_uso where origem = 'chat' and dia = (now() at time zone 'America/Fortaleza')::date`,
  )
  const usuario = Number(r?.usuario ?? 0)
  const global = Number(r?.global ?? 0)
  // Folga de 1e-9 para o arredondamento (mesma conta de chegouAoTeto no laboratório).
  if (usuario >= tetos.usuarioDiaUsd - 1e-9) throw new DomainError('quota_exceeded', Z_TETO_MSG_USUARIO, { teto: 'usuario' })
  if (global >= tetos.globalDiaUsd - 1e-9) throw new DomainError('quota_exceeded', Z_TETO_MSG_GLOBAL, { teto: 'global' })
}

// ───────────── gasto real do chat de clientes (console) ─────────────

export type GastoDosClientes = {
  hoje: number
  mes: number
  respostasMes: number
  tetos: ZTetosDosClientes
  porModelo: { modelo: string; respostas: number; custo: number }[]
  /** `nivel` nulo = não resolvido. */
  porNivel: { nivel: Nivel | null; respostas: number; custo: number }[]
}

/** Para os Custos do console (quem chama já passou por requirePlatformAdmin e lê como sistema). */
export async function lerGastoDosClientes(tx: Queryable, tetos: ZTetosDosClientes = tetosDosClientes()): Promise<GastoDosClientes> {
  const rows = await tx`
    select coalesce(modelo, 'desconhecido') as modelo, nivel,
      count(*)::int as respostas,
      coalesce(sum(custo_usd), 0)::float8 as mes,
      coalesce(sum(custo_usd) filter (where dia = (now() at time zone 'America/Fortaleza')::date), 0)::float8 as hoje
    from zro.z_lab_uso
    where origem = 'chat' and dia >= date_trunc('month', now() at time zone 'America/Fortaleza')::date
    group by 1, 2`
  const modelos = new Map<string, { respostas: number; custo: number }>()
  const niveis = new Map<Nivel | null, { respostas: number; custo: number }>()
  let hoje = 0
  let mes = 0
  let respostasMes = 0
  const soma = <K>(m: Map<K, { respostas: number; custo: number }>, k: K, respostas: number, custo: number) => {
    const a = m.get(k) ?? { respostas: 0, custo: 0 }
    m.set(k, { respostas: a.respostas + respostas, custo: a.custo + custo })
  }
  for (const r of rows) {
    const respostas = Number(r.respostas)
    const custo = Number(r.mes)
    hoje += Number(r.hoje)
    mes += custo
    respostasMes += respostas
    soma(modelos, r.modelo as string, respostas, custo)
    soma(niveis, (r.nivel as Nivel | null) ?? null, respostas, custo)
  }
  return {
    hoje,
    mes,
    respostasMes,
    tetos,
    porModelo: [...modelos].map(([modelo, v]) => ({ modelo, ...v })).sort((a, b) => b.custo - a.custo),
    porNivel: [...niveis].map(([nivel, v]) => ({ nivel, ...v })).sort((a, b) => b.custo - a.custo),
  }
}
