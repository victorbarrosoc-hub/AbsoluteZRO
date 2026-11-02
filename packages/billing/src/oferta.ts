/**
 * A oferta à venda (ADR 0039, adendo de 02/11/2026 em 0040): Zero grátis; Órbita e Absoluto em todos os apps
 * lançados; Avulso = Absoluto num app só; recargas da Z. Mensal ou anual.
 * - Tudo sai do banco (planos versionados, `zro.plans`): o preço anual é um plano próprio (`<código>-anual`), então
 *   mudar o anual (hoje 10× o mensal) é publicar uma versão nova desse plano, sem mexer em código.
 * - Só entram planos ativos, fora do legado, com nível; e só apps abertos ao público (gate 0049).
 * - O checkout escolhe o plano por { plano, ciclo, app }: o navegador nunca manda id, preço nem organização.
 */
import type { Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'
import { NIVEL_NOME, type Nivel } from './niveis'

export const PLANOS_VENDA = ['orbita', 'absoluto', 'avulso'] as const
export type PlanoVenda = (typeof PLANOS_VENDA)[number]
export const CICLOS = ['mes', 'ano'] as const
export type Ciclo = (typeof CICLOS)[number]

const APP_ID = /^[a-z0-9-]{1,40}$/

/** Pedido de assinatura como chega do formulário. */
export type PedidoAssinatura = { plano: string; ciclo: string; app?: string | null }

/** Código do plano no banco: `orbita`, `absoluto-anual`, `avulso-maestro`... */
export function codigoDoPlano(pedido: PedidoAssinatura): string {
  const plano = pedido.plano as PlanoVenda
  if (!(PLANOS_VENDA as readonly string[]).includes(plano)) throw new DomainError('invalid_input', 'Escolha um plano.')
  if (!(CICLOS as readonly string[]).includes(pedido.ciclo)) throw new DomainError('invalid_input', 'Escolha mensal ou anual.')
  let base: string = plano
  if (plano === 'avulso') {
    const app = pedido.app ?? ''
    if (!APP_ID.test(app)) throw new DomainError('invalid_input', 'Escolha o app do avulso.')
    base = `avulso-${app}`
  }
  return pedido.ciclo === 'ano' ? `${base}-anual` : base
}

export type PlanoDeVenda = {
  id: string
  code: string
  version: number
  name: string
  description: string
  kind: 'bundle' | 'individual'
  nivel: Nivel
  price_cents: number
  currency: string
  billing_interval: 'month' | 'year'
  /** apps que o plano libera (só os abertos ao público) */
  products: string[]
}

/** Planos à venda agora: versão ativa mais nova de cada código, com preço e com algum app aberto ao público. */
async function planosDeVenda(tx: Queryable, code?: string): Promise<PlanoDeVenda[]> {
  const rows = await tx`
    select distinct on (p.code) p.id, p.code, p.version, p.name, p.description, p.kind, p.nivel, p.price_cents, p.currency, p.billing_interval,
           coalesce(array_agg(pp.product_id order by pr.step_order) filter (where pp.product_id is not null), '{}') as products
    from zro.plans p
    join zro.plan_products pp on pp.plan_id = p.id and (pp.features is null or cardinality(pp.features) > 0)
    join zro.products pr on pr.id = pp.product_id and pr.stage in ('active', 'beta') and zro.release_visible(pr.id, null)
    where p.status = 'active' and not p.legado and p.nivel is not null and p.kind in ('bundle', 'individual')
      and p.price_cents is not null and p.currency is not null and p.billing_interval in ('month', 'year')
      and (${code ?? null}::text is null or p.code = ${code ?? null})
    group by p.id
    order by p.code, p.version desc`
  return rows.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    version: Number(r.version),
    name: r.name as string,
    description: (r.description as string) ?? '',
    kind: r.kind as PlanoDeVenda['kind'],
    nivel: r.nivel as Nivel,
    price_cents: Number(r.price_cents),
    currency: r.currency as string,
    billing_interval: r.billing_interval as PlanoDeVenda['billing_interval'],
    products: r.products as string[],
  }))
}

/** O plano do pedido, se está à venda. O ciclo tem de bater com o intervalo do plano. */
export async function planoParaVenda(tx: Queryable, pedido: PedidoAssinatura): Promise<PlanoDeVenda> {
  const code = codigoDoPlano(pedido)
  const [p] = await planosDeVenda(tx, code)
  const intervalo = pedido.ciclo === 'ano' ? 'year' : 'month'
  if (!p || p.billing_interval !== intervalo) throw new DomainError('invalid_input', 'Este plano não está à venda.')
  return p
}

/** O que a organização já paga pelo provedor (Stripe), para não vender duas vezes a mesma coisa. */
export type AssinaturaPaga = { code: string; kind: string; nivel: Nivel | null; products: string[] }

const RANK: Record<Nivel, number> = { zero: 1, orbita: 2, absoluto: 3 }
const base = (code: string) => code.replace(/-anual$/, '')

/**
 * null = pode assinar; senão, o motivo (curto, para a tela). Trocar de mensal para anual, ou de plano, é assinatura
 * nova (ADR 0019): a antiga se cancela no portal. Não vende o que já está coberto: o mesmo plano em outro ciclo, um
 * pacote igual ou menor que o que já paga, nem avulso de app que um Absoluto pago já inclui.
 */
export function motivoParaNaoAssinar(atuais: AssinaturaPaga[], alvo: Pick<PlanoDeVenda, 'code' | 'kind' | 'nivel' | 'products'>): string | null {
  if (atuais.some((s) => base(s.code) === base(alvo.code)))
    return 'Esta organização já assina este plano. Para trocar o ciclo, cancele o atual em Gerenciar assinatura.'
  const pacotes = atuais.filter((s) => s.kind === 'bundle' && s.nivel)
  const topo = pacotes.reduce<Nivel | null>((m, s) => (!m || RANK[s.nivel!] > RANK[m] ? s.nivel : m), null)
  if (alvo.kind === 'bundle' && topo && RANK[topo] >= RANK[alvo.nivel]) return `Esta organização já assina o ${NIVEL_NOME[topo]}.`
  if (alvo.kind === 'individual' && topo === 'absoluto') return 'O Absoluto que você assina já inclui este app.'
  return null
}

export type Preco = { id: string; code: string; version: number; centavos: number; moeda: string }
export type OfertaPacote = {
  plano: 'orbita' | 'absoluto'
  nome: string
  descricao: string
  mes: Preco | null
  ano: Preco | null
  z: number | null
  apps: string[]
}
export type OfertaAvulso = { app: string; nome: string; mes: Preco | null; ano: Preco | null; z: number | null }
export type OfertaRecarga = { code: string; mensagens: number; centavos: number; moeda: string; validade_meses: number }
export type Oferta = {
  zero: { nome: string; descricao: string; z: number | null; apps: string[] } | null
  pacotes: OfertaPacote[]
  avulsos: OfertaAvulso[]
  recargas: OfertaRecarga[]
  /** meses pagos no anual (o maior entre os planos; hoje 10) — só para a dica "2 meses grátis" */
  anual_em_meses: number | null
}

const preco = (p: PlanoDeVenda | undefined): Preco | null =>
  p ? { id: p.id, code: p.code, version: p.version, centavos: p.price_cents, moeda: p.currency } : null

/**
 * A oferta inteira para as telas (/planos, Sua conta › Plano) e para os apps (GET /api/v1/planos). Sem dado de pessoa.
 */
export async function ofertaAtual(tx: Queryable): Promise<Oferta> {
  const venda = await planosDeVenda(tx)
  const z = await tx`
    select p.code, max((pp.limits ->> 'zro.ai_credits')::int) as z from zro.plans p join zro.plan_products pp on pp.plan_id = p.id
    where p.status = 'active' and not p.legado and p.nivel is not null and pp.limits ? 'zro.ai_credits' group by p.code`
  const zDe = (code: string) => {
    const r = z.find((x) => x.code === code)
    return r?.z == null ? null : Number(r.z)
  }
  const nomes = Object.fromEntries((await tx`select id, name from zro.products`).map((r) => [r.id as string, r.name as string]))
  const por = (code: string) => venda.find((p) => p.code === code)

  const [zeroRow] = await tx`
    select p.code, p.name, p.description,
           coalesce(array_agg(pp.product_id order by pr.step_order) filter (where pr.id is not null), '{}') as products
    from zro.plans p
    left join zro.plan_products pp on pp.plan_id = p.id
    left join zro.products pr on pr.id = pp.product_id and pr.stage in ('active', 'beta') and zro.release_visible(pr.id, null)
    where p.code = 'zero' and p.status = 'active' group by p.id order by p.version desc limit 1`

  const pacotes: OfertaPacote[] = (['orbita', 'absoluto'] as const).flatMap((plano) => {
    const mes = por(plano)
    const ano = por(`${plano}-anual`)
    const ref = mes ?? ano
    if (!ref) return []
    return [{ plano, nome: ref.name, descricao: (mes ?? ref).description, mes: preco(mes), ano: preco(ano), z: zDe(ref.code), apps: ref.products }]
  })

  const avulsos: OfertaAvulso[] = venda
    .filter((p) => p.kind === 'individual' && p.billing_interval === 'month' && p.code.startsWith('avulso-'))
    .map((mes) => {
      const app = mes.code.slice('avulso-'.length)
      return { app, nome: nomes[app] ?? mes.name, mes: preco(mes), ano: preco(por(`${mes.code}-anual`)), z: zDe(mes.code), libera: mes.products }
    })
    // O avulso libera o próprio app (e só ele); se o app fechou ao público, sai da oferta.
    .filter((a) => a.libera.length === 1 && a.libera[0] === a.app)
    .map(({ libera: _, ...a }) => a)
  // Na ordem do Ciclo do O (a mesma dos pacotes).
  const ordem = pacotes[0]?.apps ?? []
  avulsos.sort((a, b) => (ordem.indexOf(a.app) + 1 || 99) - (ordem.indexOf(b.app) + 1 || 99))

  const recargas = (
    await tx`select code, mensagens, price_cents, currency, validade_meses from zro.z_recarga_pacotes where status = 'active' order by mensagens`
  ).map((r) => ({
    code: r.code as string,
    mensagens: Number(r.mensagens),
    centavos: Number(r.price_cents),
    moeda: r.currency as string,
    validade_meses: Number(r.validade_meses),
  }))

  const razoes = [...pacotes.map((p) => [p.mes, p.ano]), ...avulsos.map((a) => [a.mes, a.ano])]
    .filter(([m, a]) => m && a)
    .map(([m, a]) => Math.round(a!.centavos / m!.centavos))
  return {
    zero: zeroRow ? { nome: zeroRow.name as string, descricao: zeroRow.description as string, z: zDe('zero'), apps: zeroRow.products as string[] } : null,
    pacotes,
    avulsos,
    recargas,
    anual_em_meses: razoes.length ? Math.max(...razoes) : null,
  }
}

/** Pacote de recarga à venda. */
export async function recargaParaVenda(tx: Queryable, code: string): Promise<OfertaRecarga> {
  if (!/^[a-z0-9-]{1,40}$/.test(code)) throw new DomainError('invalid_input', 'Escolha uma recarga.')
  const [r] = await tx`select code, mensagens, price_cents, currency, validade_meses from zro.z_recarga_pacotes where code = ${code} and status = 'active'`
  if (!r || Number(r.price_cents) <= 0) throw new DomainError('invalid_input', 'Esta recarga não está à venda.')
  return {
    code: r.code as string,
    mensagens: Number(r.mensagens),
    centavos: Number(r.price_cents),
    moeda: r.currency as string,
    validade_meses: Number(r.validade_meses),
  }
}
