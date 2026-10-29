/**
 * Dólar automático dos Custos (/admin/custos; migração 0030, adendo ao ADR 0028).
 *
 * Fonte: Banco Central do Brasil, PTAX (serviço Olinda, OData público e sem chave), cotação de VENDA do dia. A PTAX do
 * dia sai por volta das 13 h; antes disso, em fim de semana e em feriado, o dia vem vazio e voltamos um dia de cada vez
 * até achar o último dia útil (no máximo 10 dias). Uma falha nunca apaga o último valor bom: só fica anotada.
 *
 * Quem atualiza: o agendamento diário (GET /api/cron/dolar, Vercel Cron com CRON_SECRET) e a página dos Custos, depois
 * de responder (`after`), quando a última busca passou de 24 h. Tudo como sistema; ninguém de fora escreve aqui.
 */
import type { Database, Queryable } from '@zro/db'
import { createLogger } from '@zro/observability'

export const PTAX_URL = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'
/** Quantos dias voltamos atrás de um dia útil com cotação. */
export const PTAX_DIAS = 10
const DIA_MS = 86_400_000
/** Busca velha: passou disto, a página pede de novo. */
export const DOLAR_VELHO_MS = 24 * 60 * 60 * 1000
/** Depois de uma falha, a página espera isto antes de tentar de novo (o agendamento tenta sempre). */
export const DOLAR_ESPERA_FALHA_MS = 60 * 60 * 1000

export type CotacaoPtax = {
  /** R$ por US$ 1 (venda), com até 4 casas. */
  venda: number
  /** Dia da cotação (YYYY-MM-DD). */
  data: string
  /** "2026-10-28 13:05:31.600" como o Banco Central manda. */
  dataHora: string
  fonte: 'bcb-ptax'
}

const log = createLogger('dolar')

/** "2026-10-28" → "10-28-2026" (o formato que o Olinda pede). */
export const dataPtax = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`

export function urlPtaxDoDia(dia: string, base = PTAX_URL): string {
  return `${base.replace(/\/$/, '')}/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataPtax(dia)}'&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`
}

/** A resposta do Olinda para um dia → a cotação de venda, ou null (dia sem PTAX). Formato estranho = erro. */
export function lerRespostaPtax(dados: unknown, dia: string): CotacaoPtax | null {
  const valor = (dados as { value?: unknown })?.value
  if (!Array.isArray(valor)) throw new Error('resposta do Banco Central fora do formato')
  if (!valor.length) return null
  // Se vierem vários boletins, o último do dia é a PTAX de fechamento.
  const ultimo = valor[valor.length - 1] as { cotacaoVenda?: unknown; dataHoraCotacao?: unknown }
  const venda = Number(ultimo?.cotacaoVenda)
  if (!Number.isFinite(venda) || venda <= 0 || venda >= 100) throw new Error('cotação de venda inválida')
  const dataHora = typeof ultimo.dataHoraCotacao === 'string' ? ultimo.dataHoraCotacao : ''
  const data = /^\d{4}-\d{2}-\d{2}/.test(dataHora) ? dataHora.slice(0, 10) : dia
  return { venda: Math.round(venda * 10_000) / 10_000, data, dataHora, fonte: 'bcb-ptax' }
}

const diaAntes = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * DIA_MS).toISOString().slice(0, 10)

export type OpcoesPtax = { hoje: string; base?: string; fetch?: typeof fetch; timeoutMs?: number; dias?: number }

/**
 * A PTAX de venda de `hoje` ou do último dia útil antes dele. Erro de rede, HTTP ou formato interrompe (não seguimos
 * voltando no escuro); dez dias seguidos sem cotação também é erro.
 */
export async function buscarPtax(o: OpcoesPtax): Promise<CotacaoPtax> {
  const buscar = o.fetch ?? fetch
  const dias = o.dias ?? PTAX_DIAS
  for (let i = 0; i < dias; i++) {
    const dia = diaAntes(o.hoje, i)
    const r = await buscar(urlPtaxDoDia(dia, o.base), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
      cache: 'no-store',
    })
    if (!r.ok) throw new Error(`Banco Central respondeu ${r.status}`)
    const c = lerRespostaPtax(await r.json(), dia)
    if (c) return c
  }
  throw new Error(`sem cotação nos últimos ${dias} dias`)
}

// ───────────── banco ─────────────

export type EstadoDolar = {
  modo: 'auto' | 'manual'
  auto: number | null
  autoEm: string | null
  buscadaEm: string | null
  erro: string | null
  erroEm: string | null
}

export async function lerEstadoDolar(tx: Queryable): Promise<EstadoDolar> {
  const [r] = await tx`
    select cotacao_modo, cotacao_auto::text as auto, to_char(cotacao_auto_em, 'YYYY-MM-DD') as auto_em,
      cotacao_auto_buscada_em, cotacao_auto_erro, cotacao_auto_erro_em
    from zro.custos_config where id`
  const ts = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v))
  return {
    modo: r?.cotacao_modo === 'manual' ? 'manual' : 'auto',
    auto: r?.auto == null ? null : Number(r.auto),
    autoEm: (r?.auto_em as string | null) ?? null,
    buscadaEm: ts(r?.cotacao_auto_buscada_em),
    erro: (r?.cotacao_auto_erro as string | null) ?? null,
    erroEm: ts(r?.cotacao_auto_erro_em),
  }
}

/** A busca está velha (mais de 24 h, ou nunca houve) e não falhou há pouco. */
export function dolarPrecisaAtualizar(e: Pick<EstadoDolar, 'buscadaEm' | 'erroEm'>, agora = new Date()): boolean {
  const t = agora.getTime()
  const velha = !e.buscadaEm || t - Date.parse(e.buscadaEm) > DOLAR_VELHO_MS
  const falhouAgora = !!e.erroEm && t - Date.parse(e.erroEm) < DOLAR_ESPERA_FALHA_MS && (!e.buscadaEm || Date.parse(e.erroEm) > Date.parse(e.buscadaEm))
  return velha && !falhouAgora
}

export async function gravarDolarAutomatico(tx: Queryable, c: CotacaoPtax): Promise<void> {
  await tx`
    insert into zro.custos_config (id, cotacao_auto, cotacao_auto_em, cotacao_auto_fonte, cotacao_auto_buscada_em, cotacao_auto_erro, cotacao_auto_erro_em)
    values (true, ${c.venda}, ${c.data}::date, ${c.fonte}, now(), null, null)
    on conflict (id) do update set cotacao_auto = excluded.cotacao_auto, cotacao_auto_em = excluded.cotacao_auto_em,
      cotacao_auto_fonte = excluded.cotacao_auto_fonte, cotacao_auto_buscada_em = now(), cotacao_auto_erro = null, cotacao_auto_erro_em = null`
}

export async function anotarFalhaDoDolar(tx: Queryable, erro: string): Promise<void> {
  await tx`
    insert into zro.custos_config (id, cotacao_auto_erro, cotacao_auto_erro_em) values (true, ${erro.slice(0, 300)}, now())
    on conflict (id) do update set cotacao_auto_erro = excluded.cotacao_auto_erro, cotacao_auto_erro_em = now()`
}

export type ResultadoDolar = { ok: true; cotacao: CotacaoPtax } | { ok: false; erro: string } | { ok: true; pulado: true }

/**
 * Busca a PTAX e grava. Sem `forcar`, só quando a última busca está velha (a página). Nunca lança: a falha vira
 * `cotacao_auto_erro` e o último valor bom continua.
 */
export async function atualizarDolar(
  db: Pick<Database, 'asSystem'>,
  o: { forcar?: boolean; agora?: Date; base?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ResultadoDolar> {
  const agora = o.agora ?? new Date()
  try {
    if (!o.forcar) {
      const estado = await db.asSystem('custos: dólar', (tx) => lerEstadoDolar(tx))
      if (!dolarPrecisaAtualizar(estado, agora)) return { ok: true, pulado: true }
    }
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
    const cotacao = await buscarPtax({ hoje, base: o.base ?? (process.env.ZRO_PTAX_URL || PTAX_URL), fetch: o.fetch, timeoutMs: o.timeoutMs })
    await db.asSystem('custos: dólar', (tx) => gravarDolarAutomatico(tx, cotacao))
    log.info('dolar.atualizado', { venda: cotacao.venda, data: cotacao.data })
    return { ok: true, cotacao }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    log.warn('dolar.falhou', { erro })
    await db.asSystem('custos: dólar', (tx) => anotarFalhaDoDolar(tx, erro)).catch(() => {})
    return { ok: false, erro }
  }
}
