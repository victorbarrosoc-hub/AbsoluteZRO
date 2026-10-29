/**
 * Custos do ecossistema (console /admin/custos, ADR 0028). Quanto custa manter tudo no ar, por mês e por ano.
 *
 * - Conta do mês: item mensal entra pelo valor, anual entra dividido por 12, "por uso" fica à parte ("+ uso").
 * - Moeda: cada item tem a sua (US$ ou R$). A cotação do dólar vem sozinha do Banco Central (PTAX, `dolar.ts`), com
 *   data; o titular pode usar um valor manual. Sem cotação, o que precisa de conversão fica "sem cotação" em vez de
 *   virar número inventado.
 * - Ponto de equilíbrio: preços dos planos publicados (zro.plans) e receita das assinaturas pagas ativas, do banco.
 * - Recomendações: regras fixas sobre os próprios dados. Nada de IA, nada de uso estimado.
 *
 * Quem chama já passou por requirePlatformAdmin(admin) e roda como sistema; toda mudança fica em audit_logs.
 */
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { lerEstadoDolar } from './dolar'

export const CUSTO_CATEGORIAS = {
  ia: 'IA',
  hospedagem: 'Hospedagem',
  banco: 'Banco de dados',
  pagamentos: 'Pagamentos',
  gpu: 'GPU',
  email: 'E-mail',
  lojas: 'Lojas e contas de desenvolvedor',
  seguranca: 'Segurança e auditoria',
  dominio: 'Domínio',
  outros: 'Outros',
} as const
export const CUSTO_ESTADOS = { ativo: 'Ativo', previsto: 'Previsto', futuro: 'Futuro', pausado: 'Pausado' } as const
export const CUSTO_PERIODICIDADES = { mensal: 'Mensal', anual: 'Anual', por_uso: 'Por uso' } as const

export type CustoCategoria = keyof typeof CUSTO_CATEGORIAS
export type CustoEstado = keyof typeof CUSTO_ESTADOS
export type CustoPeriodicidade = keyof typeof CUSTO_PERIODICIDADES
export type Moeda = 'USD' | 'BRL'

export type CustoDados = {
  fornecedor: string
  item: string
  categoria: CustoCategoria
  plano: string | null
  valor: number
  moeda: Moeda
  periodicidade: CustoPeriodicidade
  estado: CustoEstado
  gatilho: string | null
  /** YYYY-MM-DD. Para previsto e futuro, o mês estimado. */
  comecaEm: string | null
  terminaEm: string | null
  link: string | null
  observacao: string | null
  conferidoEm: string | null
  aConferir: boolean
  produtos: string[]
  cobraUso: boolean
  tetoMensal: number | null
  valorAnual: number | null
}
export type Custo = CustoDados & { id: string; atualizadoEm: string }

/** De onde veio a cotação que vale agora. */
export type FonteCotacao = 'bcb' | 'manual'

export type CustosConfig = {
  /** A cotação que vale nas contas (ver `cotacaoQueVale`). */
  cotacao: number | null
  cotacaoEm: string | null
  cotacaoFonte: FonteCotacao | null
  /** 'auto' = Banco Central (migração 0030); 'manual' = a digitada no console. */
  cotacaoModo: 'auto' | 'manual'
  cotacaoManual: number | null
  cotacaoManualEm: string | null
  cotacaoAuto: number | null
  cotacaoAutoEm: string | null
  /** Quando o HUB buscou no Banco Central (ISO). */
  cotacaoAutoBuscadaEm: string | null
  /** Última falha da busca, se veio depois do último sucesso. */
  cotacaoAutoErro: string | null
  cotacaoAutoErroEm: string | null
  metaReceitaMensal: number | null
  metaAssinantes: number | null
  dataAlvo: string | null
}

export type MetasCustos = Pick<CustosConfig, 'metaReceitaMensal' | 'metaAssinantes' | 'dataAlvo'>

/**
 * Qual cotação vale: no manual, a digitada; no automático, a do Banco Central e, enquanto ele nunca respondeu, a
 * digitada (se houver). Sem nenhuma, null: o que precisa de conversão fica "sem cotação".
 */
export function cotacaoQueVale(c: Pick<CustosConfig, 'cotacaoModo' | 'cotacaoManual' | 'cotacaoManualEm' | 'cotacaoAuto' | 'cotacaoAutoEm'>): {
  cotacao: number | null
  cotacaoEm: string | null
  cotacaoFonte: FonteCotacao | null
} {
  if (c.cotacaoModo === 'auto' && c.cotacaoAuto) return { cotacao: c.cotacaoAuto, cotacaoEm: c.cotacaoAutoEm, cotacaoFonte: 'bcb' }
  if (c.cotacaoManual) return { cotacao: c.cotacaoManual, cotacaoEm: c.cotacaoManualEm, cotacaoFonte: 'manual' }
  return { cotacao: null, cotacaoEm: null, cotacaoFonte: null }
}

/** Valor nas duas moedas; null = precisa da cotação para saber. */
export type Dinheiro = { usd: number | null; brl: number | null }

// ───────────── conta ─────────────

const centavos = (n: number) => Math.round(n * 100) / 100

/** Quanto o item pesa num mês, na moeda dele (anual ÷ 12; por uso = 0, fica à parte). */
export function mensalDoItem(c: Pick<CustoDados, 'valor' | 'periodicidade'>): number {
  if (c.periodicidade === 'mensal') return c.valor
  if (c.periodicidade === 'anual') return c.valor / 12
  return 0
}

/** Quanto o item pesa num ano, na moeda dele. */
export function anualDoItem(c: Pick<CustoDados, 'valor' | 'periodicidade'>): number {
  if (c.periodicidade === 'mensal') return c.valor * 12
  if (c.periodicidade === 'anual') return c.valor
  return 0
}

/** Converte entre US$ e R$. Zero não precisa de cotação; o resto sem cotação volta null. */
export function converterMoeda(valor: number, de: Moeda, para: Moeda, cotacao: number | null): number | null {
  if (de === para || valor === 0) return valor
  if (!cotacao || cotacao <= 0) return null
  return de === 'USD' ? valor * cotacao : valor / cotacao
}

/** Soma valores de moedas diferentes nas duas moedas. Uma parcela sem conversão deixa aquela moeda null. */
export function somarDinheiro(parcelas: { valor: number; moeda: Moeda }[], cotacao: number | null): Dinheiro {
  let usd: number | null = 0
  let brl: number | null = 0
  for (const p of parcelas) {
    const u = converterMoeda(p.valor, p.moeda, 'USD', cotacao)
    const b = converterMoeda(p.valor, p.moeda, 'BRL', cotacao)
    usd = usd == null || u == null ? null : usd + u
    brl = brl == null || b == null ? null : brl + b
  }
  return { usd: usd == null ? null : centavos(usd), brl: brl == null ? null : centavos(brl) }
}

/** Vale hoje: ativo e dentro do período (sem início = desde sempre; sem fim = sem fim). */
export function custoVigente(c: Pick<CustoDados, 'estado' | 'comecaEm' | 'terminaEm'>, hoje: string): boolean {
  return c.estado === 'ativo' && (!c.comecaEm || c.comecaEm <= hoje) && (!c.terminaEm || c.terminaEm >= hoje)
}

const temUso = (c: Pick<CustoDados, 'periodicidade' | 'cobraUso'>) => c.periodicidade === 'por_uso' || c.cobraUso

/** Primeiro dia de cada um dos 12 meses a partir do mês de `hoje`, e o último. */
export function meses12(hoje: string): { mes: string; inicio: string; fim: string }[] {
  const [y, m] = hoje.split('-').map(Number) as [number, number]
  const out = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    const iso = (x: Date) => x.toISOString().slice(0, 10)
    out.push({ mes: iso(d).slice(0, 7), inicio: iso(d), fim: iso(fim) })
  }
  return out
}

export type ResumoCustos = {
  /** Moeda dos gráficos: R$ com cotação, US$ sem. */
  base: Moeda
  mensal: Dinheiro
  anual: Dinheiro
  /** Itens vigentes com cobrança por uso (por uso puro ou mensal + uso). */
  uso: { id: string; nome: string }[]
  aConferir: number
  /** Itens que precisam de cotação e ficaram fora dos gráficos. */
  semCotacao: number
  categorias: { categoria: CustoCategoria; valor: number }[]
  fornecedores: { fornecedor: string; valor: number }[]
  projecao: { mes: string; ativo: number; previsto: number; futuro: number }[]
  /** Previstos e futuros com valor fixo e sem mês estimado (fora da projeção). */
  semData: { id: string; nome: string; gatilho: string | null }[]
}

export const nomeDoCusto = (c: Pick<CustoDados, 'fornecedor' | 'item'>) =>
  c.item.toLowerCase().startsWith(c.fornecedor.toLowerCase()) ? c.item : `${c.fornecedor} · ${c.item}`

export function resumoCustos(custos: Custo[], config: Pick<CustosConfig, 'cotacao'>, hoje: string): ResumoCustos {
  const cotacao = config.cotacao
  const base: Moeda = cotacao ? 'BRL' : 'USD'
  const vivos = custos.filter((c) => custoVigente(c, hoje))
  const fixos = vivos.filter((c) => c.periodicidade !== 'por_uso')
  const naBase = (c: Custo, v: number) => converterMoeda(v, c.moeda, base, cotacao)
  let semCotacao = 0
  const categorias = new Map<CustoCategoria, number>()
  const fornecedores = new Map<string, number>()
  for (const c of fixos) {
    const v = naBase(c, mensalDoItem(c))
    if (v == null) {
      semCotacao++
      continue
    }
    if (v <= 0) continue
    categorias.set(c.categoria, (categorias.get(c.categoria) ?? 0) + v)
    fornecedores.set(c.fornecedor, (fornecedores.get(c.fornecedor) ?? 0) + v)
  }
  const projecao = meses12(hoje).map((m) => {
    const p = { mes: m.mes, ativo: 0, previsto: 0, futuro: 0 }
    for (const c of custos) {
      if (c.estado === 'pausado' || c.periodicidade === 'por_uso') continue
      if (!c.comecaEm && c.estado !== 'ativo') continue
      if (c.comecaEm && c.comecaEm > m.fim) continue
      if (c.terminaEm && c.terminaEm < m.inicio) continue
      const v = naBase(c, mensalDoItem(c))
      if (v == null || v <= 0) continue
      p[c.estado as 'ativo' | 'previsto' | 'futuro'] += v
    }
    return { mes: p.mes, ativo: centavos(p.ativo), previsto: centavos(p.previsto), futuro: centavos(p.futuro) }
  })
  const ordenar = <K>(m: Map<K, number>) => [...m.entries()].map(([k, v]) => [k, centavos(v)] as const).sort((a, b) => b[1] - a[1])
  return {
    base,
    mensal: somarDinheiro(
      fixos.map((c) => ({ valor: mensalDoItem(c), moeda: c.moeda })),
      cotacao,
    ),
    anual: somarDinheiro(
      fixos.map((c) => ({ valor: anualDoItem(c), moeda: c.moeda })),
      cotacao,
    ),
    uso: vivos.filter(temUso).map((c) => ({ id: c.id, nome: nomeDoCusto(c) })),
    aConferir: custos.filter((c) => c.aConferir).length,
    semCotacao,
    categorias: ordenar(categorias).map(([categoria, valor]) => ({ categoria, valor })),
    fornecedores: ordenar(fornecedores).map(([fornecedor, valor]) => ({ fornecedor, valor })),
    projecao,
    semData: custos
      .filter((c) => (c.estado === 'previsto' || c.estado === 'futuro') && !c.comecaEm && c.periodicidade !== 'por_uso' && c.valor > 0)
      .map((c) => ({ id: c.id, nome: nomeDoCusto(c), gatilho: c.gatilho })),
  }
}

// ───────────── ponto de equilíbrio ─────────────

export type PlanoAVenda = { nome: string; tipo: string; precoMensal: number }
export type PlanoLinha = { name: string; kind: string; price_cents: number | null; currency: string | null; billing_interval: string | null }

/**
 * Planos publicados com preço em reais, um por nome (avulsos viram "Avulso (1 app)" quando custam igual).
 * Mensal tem prioridade; plano só anual entra pelo preço anual ÷ 12.
 */
export function planosAVenda(rows: PlanoLinha[]): PlanoAVenda[] {
  const porNome = new Map<string, PlanoAVenda & { mensal: boolean }>()
  for (const r of rows) {
    if (r.kind === 'free' || r.price_cents == null || r.price_cents <= 0 || (r.currency ?? 'BRL') !== 'BRL') continue
    if (r.billing_interval !== 'month' && r.billing_interval !== 'year') continue
    const mensal = r.billing_interval === 'month'
    const precoMensal = centavos(mensal ? r.price_cents / 100 : r.price_cents / 100 / 12)
    const nome = r.kind === 'individual' ? 'Avulso (1 app)' : r.name
    const atual = porNome.get(nome)
    if (atual && (atual.mensal || !mensal) && !(atual.mensal === mensal && precoMensal < atual.precoMensal)) continue
    porNome.set(nome, { nome, tipo: r.kind, precoMensal, mensal })
  }
  return [...porNome.values()].sort((a, b) => a.precoMensal - b.precoMensal).map(({ nome, tipo, precoMensal }) => ({ nome, tipo, precoMensal }))
}

/** Quantos assinantes de cada plano pagam o custo do mês (em reais). Sem custo, zero; sem cotação, null. */
export function pontoDeEquilibrio(custoMensalBRL: number | null, planos: PlanoAVenda[]): (PlanoAVenda & { assinantes: number | null })[] {
  return planos.map((p) => ({
    ...p,
    assinantes: custoMensalBRL == null ? null : custoMensalBRL <= 0 ? 0 : Math.ceil(custoMensalBRL / p.precoMensal - 1e-9),
  }))
}

// ───────────── recomendações ─────────────

export type Recomendacao = { id: string; tom: 'economia' | 'atencao' | 'info'; titulo: string; detalhe?: string }

const MOEDA_SIMBOLO: Record<Moeda, string> = { USD: 'US$', BRL: 'R$' }

/** "US$ 1.234,50" (sem casas quando é inteiro). */
export function fmtMoeda(v: number, moeda: Moeda): string {
  const inteiro = Math.abs(v - Math.round(v)) < 0.005
  return `${MOEDA_SIMBOLO[moeda]} ${v.toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: inteiro ? 0 : 2 })}`
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export type DadosFinanceiros = {
  planos: PlanoAVenda[]
  /** Assinaturas pagas ativas (Stripe ou outro provedor de cobrança; não conta grátis nem concessão manual). */
  receita: { assinantes: number; mensalBRL: number }
  contasAtivas: number
}

export function recomendacoes(input: { custos: Custo[]; resumo: ResumoCustos; config: CustosConfig; dados: DadosFinanceiros; hoje: string }): Recomendacao[] {
  const { custos, resumo, config, dados, hoje } = input
  const out: Recomendacao[] = []
  const vivos = custos.filter((c) => c.estado !== 'pausado')

  // Anual mais barato que 12 mensalidades.
  for (const c of vivos) {
    if (c.periodicidade !== 'mensal' || c.valorAnual == null) continue
    const economia = c.valor * 12 - c.valorAnual
    if (economia >= 0.01)
      out.push({
        id: `anual-${c.id}`,
        tom: 'economia',
        titulo: `${nomeDoCusto(c)}: no anual, economiza ${fmtMoeda(economia, c.moeda)} por ano`,
        detalhe: `${fmtMoeda(c.valorAnual, c.moeda)} por ano contra ${fmtMoeda(c.valor * 12, c.moeda)} em 12 meses.`,
      })
  }

  // Cobrança por uso sem teto configurado.
  const semTeto = custos.filter((c) => custoVigente(c, hoje) && temUso(c) && c.tetoMensal == null)
  if (semTeto.length)
    out.push({
      id: 'sem-teto',
      tom: 'atencao',
      titulo: `${plural(semTeto.length, 'item cobra', 'itens cobram')} por uso sem teto`,
      detalhe: `${semTeto.map(nomeDoCusto).join(', ')}. Defina um limite de gasto no fornecedor e anote aqui.`,
    })

  if (resumo.aConferir)
    out.push({
      id: 'a-conferir',
      tom: 'atencao',
      titulo: `${plural(resumo.aConferir, 'item', 'itens')} a conferir`,
      detalhe: 'Confirme o valor na página do fornecedor e desmarque "a conferir".',
    })

  // Conferência com mais de 6 meses.
  const velhos = custos.filter((c) => c.estado !== 'pausado' && !c.aConferir && c.conferidoEm && diasEntre(c.conferidoEm, hoje) > 180)
  if (velhos.length)
    out.push({
      id: 'conferencia-antiga',
      tom: 'info',
      titulo: `${plural(velhos.length, 'item conferido', 'itens conferidos')} há mais de 6 meses`,
      detalhe: velhos.map(nomeDoCusto).join(', '),
    })

  // Custo por conta ativa (contas de verdade no banco).
  const mensalBase = resumo.base === 'BRL' ? resumo.mensal.brl : resumo.mensal.usd
  if (mensalBase != null && mensalBase > 0 && dados.contasAtivas > 0)
    out.push({
      id: 'por-conta',
      tom: 'info',
      titulo: `${fmtMoeda(mensalBase / dados.contasAtivas, resumo.base)} por conta ativa por mês`,
      detalhe: `${fmtMoeda(mensalBase, resumo.base)} ÷ ${plural(dados.contasAtivas, 'conta ativa', 'contas ativas')}.`,
    })

  // Receita: honesta, mesmo quando é zero.
  const equilibrio = pontoDeEquilibrio(resumo.mensal.brl, dados.planos)
  const maisVendido = equilibrio.find((p) => p.tipo === 'bundle') ?? equilibrio[0]
  if (dados.receita.assinantes === 0)
    out.push({
      id: 'sem-receita',
      tom: 'info',
      titulo: 'Nenhuma assinatura paga ainda',
      detalhe:
        maisVendido && maisVendido.assinantes != null && maisVendido.assinantes > 0
          ? `O custo sai do caixa. ${plural(maisVendido.assinantes, 'assinante', 'assinantes')} do ${maisVendido.nome} ${maisVendido.assinantes === 1 ? 'cobre' : 'cobrem'} o mês.`
          : 'O custo sai do caixa.',
    })
  else if (resumo.mensal.brl != null && dados.receita.mensalBRL < resumo.mensal.brl)
    out.push({
      id: 'abaixo-do-custo',
      tom: 'atencao',
      titulo: `Receita cobre ${Math.floor((dados.receita.mensalBRL / resumo.mensal.brl) * 100)}% do custo`,
      detalhe: `Faltam ${fmtMoeda(resumo.mensal.brl - dados.receita.mensalBRL, 'BRL')} por mês.`,
    })

  // Próximos gatilhos: futuros e previstos, os com data primeiro.
  const proximos = custos
    .filter((c) => (c.estado === 'futuro' || c.estado === 'previsto') && (c.gatilho || c.comecaEm))
    .sort((a, b) => (a.comecaEm ?? '9999').localeCompare(b.comecaEm ?? '9999'))
  for (const c of proximos.slice(0, 3)) {
    const custo = c.periodicidade === 'por_uso' ? 'por uso' : `${fmtMoeda(c.valor, c.moeda)}${c.periodicidade === 'anual' ? '/ano' : '/mês'}`
    const quando = c.comecaEm ? `a partir de ${fmtMesCurto(c.comecaEm)}` : (c.gatilho ?? '').replace(/^\p{Lu}/u, (l) => l.toLowerCase())
    out.push({ id: `gatilho-${c.id}`, tom: 'info', titulo: `${nomeDoCusto(c)} · ${custo}`, detalhe: `Entra ${quando}.` })
  }

  if (resumo.semCotacao)
    out.push({
      id: 'cotacao',
      tom: 'atencao',
      titulo: 'Sem cotação do dólar',
      detalhe: 'O Banco Central ainda não respondeu. Dá para usar um valor manual enquanto isso.',
    })
  else if (config.cotacaoFonte === 'bcb' && config.cotacaoEm && diasEntre(config.cotacaoEm, hoje) > 5)
    out.push({ id: 'cotacao-velha', tom: 'info', titulo: 'Dólar do Banco Central sem atualizar', detalhe: `Última cotação de ${fmtDiaBR(config.cotacaoEm)}.` })
  else if (config.cotacaoFonte === 'manual' && config.cotacaoEm && diasEntre(config.cotacaoEm, hoje) > 30)
    out.push({ id: 'cotacao-velha', tom: 'info', titulo: 'Cotação manual com mais de 30 dias', detalhe: `Informada em ${fmtDiaBR(config.cotacaoEm)}.` })

  return out
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** "nov/26" */
export const fmtMesCurto = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`
/** "29/10/2026" */
export const fmtDiaBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Hoje no fuso do titular (YYYY-MM-DD). */
export function hojeNoFuso(agora = new Date(), tz = 'America/Fortaleza'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** Progresso em direção às metas (0 a 1), só do que foi configurado. */
export function progressoDasMetas(config: CustosConfig, dados: DadosFinanceiros, hoje: string) {
  return {
    receita:
      config.metaReceitaMensal && config.metaReceitaMensal > 0
        ? { atual: dados.receita.mensalBRL, meta: config.metaReceitaMensal, fracao: Math.min(1, dados.receita.mensalBRL / config.metaReceitaMensal) }
        : null,
    assinantes:
      config.metaAssinantes && config.metaAssinantes > 0
        ? { atual: dados.receita.assinantes, meta: config.metaAssinantes, fracao: Math.min(1, dados.receita.assinantes / config.metaAssinantes) }
        : null,
    diasAteAlvo: config.dataAlvo ? diasEntre(hoje, config.dataAlvo) : null,
  }
}

// ───────────── formulário ─────────────

type Campos = Record<string, string | undefined>
const texto = (v: string | undefined, max: number, campo: string): string | null => {
  const s = (v ?? '').trim()
  if (!s) return null
  if (s.length > max) throw new DomainError('invalid_input', `${campo}: no máximo ${max} caracteres.`)
  return s
}
const dataOuNull = (v: string | undefined, campo: string): string | null => {
  const s = (v ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new DomainError('invalid_input', `${campo}: data inválida.`)
  return s
}
/** Aceita "1.234,56", "1234.56" e "1234,5". */
export function lerNumero(v: string | undefined, campo: string, { opcional = false, max = 9_999_999, casas = 2 } = {}): number | null {
  const s = (v ?? '').trim().replace(/\s|R\$|US\$/g, '')
  if (!s) {
    if (opcional) return null
    throw new DomainError('invalid_input', `${campo}: informe um número.`)
  }
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(norm)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new DomainError('invalid_input', `${campo}: número inválido.`)
  return Math.round(n * 10 ** casas) / 10 ** casas
}
const escolha = <T extends string>(v: string | undefined, opcoes: readonly T[], campo: string): T => {
  if (v && (opcoes as readonly string[]).includes(v)) return v as T
  throw new DomainError('invalid_input', `${campo}: escolha uma opção.`)
}

/** Lê e valida o formulário do console. `produtosValidos` vem de zro.products. */
export function lerFormularioCusto(f: Campos, produtosValidos: string[] = []): CustoDados {
  const fornecedor = texto(f.fornecedor, 80, 'Fornecedor')
  const item = texto(f.item, 120, 'Item')
  if (!fornecedor) throw new DomainError('invalid_input', 'Informe o fornecedor.')
  if (!item) throw new DomainError('invalid_input', 'Informe o item.')
  const link = texto(f.link, 500, 'Link')
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw new DomainError('invalid_input', 'Link: comece com https://')
  const comecaEm = dataOuNull(f.comecaEm, 'Começa em')
  const terminaEm = dataOuNull(f.terminaEm, 'Termina em')
  if (comecaEm && terminaEm && terminaEm < comecaEm) throw new DomainError('invalid_input', 'Termina antes de começar.')
  const produtos = (f.produtos ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const desconhecido = produtos.find((p) => !produtosValidos.includes(p))
  if (desconhecido) throw new DomainError('invalid_input', `App desconhecido: ${desconhecido}.`)
  const periodicidade = escolha(f.periodicidade, Object.keys(CUSTO_PERIODICIDADES) as CustoPeriodicidade[], 'Periodicidade')
  return {
    fornecedor,
    item,
    categoria: escolha(f.categoria, Object.keys(CUSTO_CATEGORIAS) as CustoCategoria[], 'Categoria'),
    plano: texto(f.plano, 80, 'Plano'),
    valor: lerNumero(f.valor || '0', 'Valor')!,
    moeda: escolha(f.moeda, ['USD', 'BRL'] as const, 'Moeda'),
    periodicidade,
    estado: escolha(f.estado, Object.keys(CUSTO_ESTADOS) as CustoEstado[], 'Estado'),
    gatilho: texto(f.gatilho, 200, 'Gatilho'),
    comecaEm,
    terminaEm,
    link,
    observacao: texto(f.observacao, 1000, 'Observação'),
    conferidoEm: dataOuNull(f.conferidoEm, 'Conferido em'),
    aConferir: f.aConferir === 'on' || f.aConferir === 'true',
    produtos: [...new Set(produtos)],
    cobraUso: periodicidade === 'mensal' && (f.cobraUso === 'on' || f.cobraUso === 'true'),
    tetoMensal: lerNumero(f.tetoMensal, 'Teto por mês', { opcional: true }),
    valorAnual: periodicidade === 'mensal' ? lerNumero(f.valorAnual, 'Preço no anual', { opcional: true }) : null,
  }
}

/** Metas (a cotação tem formulário próprio: `lerFormularioCotacao`). */
export function lerFormularioConfig(f: Campos): MetasCustos {
  const metaAssinantes = lerNumero(f.metaAssinantes, 'Meta de assinantes', { opcional: true, max: 10_000_000 })
  if (metaAssinantes != null && !Number.isInteger(metaAssinantes)) throw new DomainError('invalid_input', 'Meta de assinantes: um número inteiro.')
  return {
    metaReceitaMensal: lerNumero(f.metaReceitaMensal, 'Meta de receita', { opcional: true }),
    metaAssinantes,
    dataAlvo: dataOuNull(f.dataAlvo, 'Data-alvo'),
  }
}

/** O valor manual do dólar: obrigatório, maior que zero, com a data (sem data = hoje de quem chama). */
export function lerFormularioCotacao(f: Campos, hoje: string): { valor: number; em: string } {
  const valor = lerNumero(f.cotacao, 'Cotação', { max: 99, casas: 4 })
  if (!valor) throw new DomainError('invalid_input', 'Cotação: maior que zero.')
  const em = dataOuNull(f.cotacaoEm, 'Data da cotação') ?? hoje
  if (em > hoje) throw new DomainError('invalid_input', 'Data da cotação: não pode ser no futuro.')
  return { valor, em }
}

// ───────────── banco ─────────────

const iso = (d: unknown): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
const num = (v: unknown): number | null => (v == null ? null : Number(v))

function deLinha(r: Record<string, unknown>): Custo {
  return {
    id: r.id as string,
    fornecedor: r.fornecedor as string,
    item: r.item as string,
    categoria: r.categoria as CustoCategoria,
    plano: (r.plano as string | null) ?? null,
    valor: Number(r.valor),
    moeda: r.moeda as Moeda,
    periodicidade: r.periodicidade as CustoPeriodicidade,
    estado: r.estado as CustoEstado,
    gatilho: (r.gatilho as string | null) ?? null,
    comecaEm: iso(r.comeca_em),
    terminaEm: iso(r.termina_em),
    link: (r.link as string | null) ?? null,
    observacao: (r.observacao as string | null) ?? null,
    conferidoEm: iso(r.conferido_em),
    aConferir: Boolean(r.a_conferir),
    produtos: (r.produtos as string[]) ?? [],
    cobraUso: Boolean(r.cobra_uso),
    tetoMensal: num(r.teto_mensal),
    valorAnual: num(r.valor_anual),
    atualizadoEm: (r.atualizado_em as Date).toISOString(),
  }
}

// Datas vão como texto e o banco converte (::date): o driver não serializa string em parâmetro date sozinho.
export async function listarCustos(tx: Queryable): Promise<Custo[]> {
  const rows = await tx`
    select id, fornecedor, item, categoria, plano, valor::text as valor, moeda, periodicidade, estado, gatilho,
      to_char(comeca_em, 'YYYY-MM-DD') as comeca_em, to_char(termina_em, 'YYYY-MM-DD') as termina_em, link, observacao,
      to_char(conferido_em, 'YYYY-MM-DD') as conferido_em, a_conferir, produtos, cobra_uso,
      teto_mensal::text as teto_mensal, valor_anual::text as valor_anual, atualizado_em
    from zro.custos
    order by array_position(array['ativo', 'previsto', 'futuro', 'pausado'], estado), lower(fornecedor), lower(item)`
  return rows.map(deLinha)
}

export async function lerConfigCustos(tx: Queryable): Promise<CustosConfig> {
  const [r] = await tx`
    select cotacao_usd_brl::text as cotacao, to_char(cotacao_em, 'YYYY-MM-DD') as cotacao_em, meta_receita_mensal::text as meta,
      meta_assinantes, to_char(data_alvo, 'YYYY-MM-DD') as data_alvo, cotacao_modo
    from zro.custos_config where id`
  const auto = await lerEstadoDolar(tx)
  // Falha antiga (antes do último sucesso) não conta.
  const falhaValendo = auto.erroEm && (!auto.buscadaEm || auto.erroEm > auto.buscadaEm)
  const base = {
    cotacaoModo: auto.modo,
    cotacaoManual: num(r?.cotacao),
    cotacaoManualEm: (r?.cotacao_em as string | null) ?? null,
    cotacaoAuto: auto.auto,
    cotacaoAutoEm: auto.autoEm,
    cotacaoAutoBuscadaEm: auto.buscadaEm,
    cotacaoAutoErro: falhaValendo ? auto.erro : null,
    cotacaoAutoErroEm: falhaValendo ? auto.erroEm : null,
  }
  return {
    ...cotacaoQueVale(base),
    ...base,
    metaReceitaMensal: num(r?.meta),
    metaAssinantes: (r?.meta_assinantes as number | null) ?? null,
    dataAlvo: (r?.data_alvo as string | null) ?? null,
  }
}

/** Planos à venda, receita das assinaturas pagas ativas e contas ativas. */
export async function dadosFinanceiros(tx: Queryable): Promise<DadosFinanceiros> {
  const planos = await tx`
    select name, kind, price_cents, currency, billing_interval from zro.plans where status = 'active'`
  const [r] = await tx`
    select count(*)::int as n,
      coalesce(sum(case p.billing_interval when 'year' then p.price_cents / 12.0 else p.price_cents end), 0)::float8 / 100 as mensal
    from zro.subscriptions s join zro.plans p on p.id = s.plan_id
    where s.status = 'active' and s.provider not in ('free', 'manual') and p.price_cents > 0 and coalesce(p.currency, 'BRL') = 'BRL'`
  const [u] = await tx`select count(*)::int as n from zro.users where status = 'active'`
  return {
    planos: planosAVenda(planos as unknown as PlanoLinha[]),
    receita: { assinantes: (r?.n as number) ?? 0, mensalBRL: centavos(Number(r?.mensal ?? 0)) },
    contasAtivas: (u?.n as number) ?? 0,
  }
}

const COLUNAS: Record<keyof CustoDados, string> = {
  fornecedor: 'fornecedor',
  item: 'item',
  categoria: 'categoria',
  plano: 'plano',
  valor: 'valor',
  moeda: 'moeda',
  periodicidade: 'periodicidade',
  estado: 'estado',
  gatilho: 'gatilho',
  comecaEm: 'comeca_em',
  terminaEm: 'termina_em',
  link: 'link',
  observacao: 'observacao',
  conferidoEm: 'conferido_em',
  aConferir: 'a_conferir',
  produtos: 'produtos',
  cobraUso: 'cobra_uso',
  tetoMensal: 'teto_mensal',
  valorAnual: 'valor_anual',
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function duplicado(e: unknown): never {
  if ((e as { code?: string })?.code === '23505') throw new DomainError('conflict', 'Já existe um item com esse fornecedor e esse nome.')
  throw e
}

export type AtorAdmin = { userId: string }

/** Cria (sem id) ou altera um item. Auditoria guarda quem, qual item e quais campos mudaram (sem valores de link). */
export async function salvarCusto(tx: Queryable, ator: AtorAdmin, dados: CustoDados, id?: string | null): Promise<{ id: string; criado: boolean }> {
  const d = dados
  if (!id) {
    const [r] = await tx`
      insert into zro.custos (fornecedor, item, categoria, plano, valor, moeda, periodicidade, estado, gatilho, comeca_em, termina_em,
        link, observacao, conferido_em, a_conferir, produtos, cobra_uso, teto_mensal, valor_anual)
      values (${d.fornecedor}, ${d.item}, ${d.categoria}, ${d.plano}, ${d.valor}, ${d.moeda}, ${d.periodicidade}, ${d.estado}, ${d.gatilho},
        ${d.comecaEm}::date, ${d.terminaEm}::date, ${d.link}, ${d.observacao}, ${d.conferidoEm}::date, ${d.aConferir}, ${d.produtos},
        ${d.cobraUso}, ${d.tetoMensal}, ${d.valorAnual})
      returning id`.catch(duplicado)
    await audit(tx, {
      actorUserId: ator.userId,
      actorKind: 'admin',
      action: 'admin.custo_criado',
      targetType: 'custo',
      targetId: r!.id as string,
      metadata: { fornecedor: d.fornecedor, item: d.item, estado: d.estado, valor: d.valor, moeda: d.moeda, periodicidade: d.periodicidade },
    })
    return { id: r!.id as string, criado: true }
  }
  const antes = (await listarCustos(tx)).find((c) => c.id === id)
  if (!antes) throw new DomainError('not_found', 'Item não encontrado.')
  const campos = (Object.keys(COLUNAS) as (keyof CustoDados)[]).filter((k) => !igual(antes[k], d[k]))
  if (!campos.length) return { id, criado: false }
  await tx`
    update zro.custos set fornecedor = ${d.fornecedor}, item = ${d.item}, categoria = ${d.categoria}, plano = ${d.plano}, valor = ${d.valor},
      moeda = ${d.moeda}, periodicidade = ${d.periodicidade}, estado = ${d.estado}, gatilho = ${d.gatilho}, comeca_em = ${d.comecaEm}::date,
      termina_em = ${d.terminaEm}::date, link = ${d.link}, observacao = ${d.observacao}, conferido_em = ${d.conferidoEm}::date,
      a_conferir = ${d.aConferir}, produtos = ${d.produtos}, cobra_uso = ${d.cobraUso}, teto_mensal = ${d.tetoMensal},
      valor_anual = ${d.valorAnual}, atualizado_em = now()
    where id = ${id}`.catch(duplicado)
  // Valor antes e depois só dos números (o histórico do custo); textos livres ficam só como "mudou".
  const numeros = (['valor', 'moeda', 'periodicidade', 'estado'] as const).filter((k) => campos.includes(k))
  await audit(tx, {
    actorUserId: ator.userId,
    actorKind: 'admin',
    action: 'admin.custo_alterado',
    targetType: 'custo',
    targetId: id,
    metadata: {
      fornecedor: d.fornecedor,
      item: d.item,
      campos: campos.map((k) => COLUNAS[k]),
      ...Object.fromEntries(numeros.map((k) => [k, { de: antes[k], para: d[k] }])),
    },
  })
  return { id, criado: false }
}

export async function apagarCusto(tx: Queryable, ator: AtorAdmin, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('invalid_input', 'Item inválido.')
  const [r] = await tx`delete from zro.custos where id = ${id} returning fornecedor, item, valor::text as valor, moeda, periodicidade, estado`
  if (!r) throw new DomainError('not_found', 'Item não encontrado.')
  await audit(tx, {
    actorUserId: ator.userId,
    actorKind: 'admin',
    action: 'admin.custo_apagado',
    targetType: 'custo',
    targetId: id,
    metadata: { fornecedor: r.fornecedor, item: r.item, valor: Number(r.valor), moeda: r.moeda, periodicidade: r.periodicidade, estado: r.estado },
  })
}

/** Metas. A cotação não passa por aqui (`salvarCotacaoManual` e `usarCotacaoAutomatica`). */
export async function salvarConfig(tx: Queryable, ator: AtorAdmin, c: MetasCustos): Promise<void> {
  const antes = await lerConfigCustos(tx)
  const campos = (['metaReceitaMensal', 'metaAssinantes', 'dataAlvo'] as const).filter((k) => !igual(antes[k], c[k]))
  if (!campos.length) return
  await tx`
    insert into zro.custos_config (id, meta_receita_mensal, meta_assinantes, data_alvo, atualizado_em, atualizado_por)
    values (true, ${c.metaReceitaMensal}, ${c.metaAssinantes}, ${c.dataAlvo}::date, now(), ${ator.userId})
    on conflict (id) do update set meta_receita_mensal = excluded.meta_receita_mensal, meta_assinantes = excluded.meta_assinantes,
      data_alvo = excluded.data_alvo, atualizado_em = now(), atualizado_por = excluded.atualizado_por`
  await audit(tx, {
    actorUserId: ator.userId,
    actorKind: 'admin',
    action: 'admin.custos_config_alterada',
    targetType: 'custos_config',
    metadata: Object.fromEntries(campos.map((k) => [k, { de: antes[k], para: c[k] }])),
  })
}

/** "Usar valor manual": grava o valor digitado e passa a valer ele (o automático segue sendo buscado, sem valer). */
export async function salvarCotacaoManual(tx: Queryable, ator: AtorAdmin, v: { valor: number; em: string }): Promise<void> {
  const antes = await lerConfigCustos(tx)
  if (antes.cotacaoModo === 'manual' && antes.cotacaoManual === v.valor && antes.cotacaoManualEm === v.em) return
  await tx`
    update zro.custos_config set cotacao_usd_brl = ${v.valor}, cotacao_em = ${v.em}::date, cotacao_modo = 'manual',
      atualizado_em = now(), atualizado_por = ${ator.userId}
    where id`
  await audit(tx, {
    actorUserId: ator.userId,
    actorKind: 'admin',
    action: 'admin.custos_cotacao_manual',
    targetType: 'custos_config',
    metadata: {
      de: { modo: antes.cotacaoModo, cotacao: antes.cotacao, em: antes.cotacaoEm, fonte: antes.cotacaoFonte },
      para: { modo: 'manual', cotacao: v.valor, em: v.em, fonte: 'manual' },
    },
  })
}

/** "Voltar ao automático": vale de novo o Banco Central. O valor manual fica guardado para a próxima vez. */
export async function usarCotacaoAutomatica(tx: Queryable, ator: AtorAdmin): Promise<void> {
  const antes = await lerConfigCustos(tx)
  if (antes.cotacaoModo === 'auto') return
  await tx`update zro.custos_config set cotacao_modo = 'auto', atualizado_em = now(), atualizado_por = ${ator.userId} where id`
  await audit(tx, {
    actorUserId: ator.userId,
    actorKind: 'admin',
    action: 'admin.custos_cotacao_automatica',
    targetType: 'custos_config',
    metadata: {
      de: { modo: 'manual', cotacao: antes.cotacao, em: antes.cotacaoEm },
      para: { modo: 'auto', cotacao: antes.cotacaoAuto, em: antes.cotacaoAutoEm },
    },
  })
}

// ───────────── planilha ─────────────

const celula = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // Sem fórmula de planilha: célula que começa com = + - @ ganha um apóstrofo.
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",;\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export function custosCsv(custos: Custo[], config: Pick<CustosConfig, 'cotacao'>): string {
  const cab = [
    'Fornecedor',
    'Item',
    'Categoria',
    'Plano',
    'Valor',
    'Moeda',
    'Periodicidade',
    'Por mês (moeda do item)',
    'Por mês (R$)',
    'Estado',
    'Gatilho',
    'Começa em',
    'Termina em',
    'Cobra uso',
    'Teto por mês',
    'Preço no anual',
    'Apps',
    'Conferido em',
    'A conferir',
    'Link',
    'Observação',
  ]
  const linhas = custos.map((c) => {
    const mes = mensalDoItem(c)
    const brl = converterMoeda(mes, c.moeda, 'BRL', config.cotacao)
    return [
      c.fornecedor,
      c.item,
      CUSTO_CATEGORIAS[c.categoria],
      c.plano,
      c.valor.toFixed(2),
      c.moeda,
      CUSTO_PERIODICIDADES[c.periodicidade],
      c.periodicidade === 'por_uso' ? '' : mes.toFixed(2),
      c.periodicidade === 'por_uso' || brl == null ? '' : brl.toFixed(2),
      CUSTO_ESTADOS[c.estado],
      c.gatilho,
      c.comecaEm,
      c.terminaEm,
      temUso(c) ? 'sim' : 'não',
      c.tetoMensal?.toFixed(2),
      c.valorAnual?.toFixed(2),
      c.produtos.join(' '),
      c.conferidoEm,
      c.aConferir ? 'sim' : 'não',
      c.link,
      c.observacao,
    ]
      .map(celula)
      .join(',')
  })
  return `${String.fromCharCode(0xfeff)}${[cab.map(celula).join(','), ...linhas].join('\r\n')}\r\n`
}
