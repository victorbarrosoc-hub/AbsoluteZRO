import { timingSafeEqual } from 'node:crypto'
import { atualizarDolar } from '@zro/core'
import { getDatabase } from '@zro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const sem = { 'Cache-Control': 'no-store' }

/**
 * GET /api/cron/dolar: o agendamento da Vercel (vercel.json, uma vez por dia, depois da PTAX das 13 h) busca o dólar
 * do Banco Central para os Custos (migração 0030). Só com `Authorization: Bearer <CRON_SECRET>`; sem o segredo
 * configurado, 503 (nunca aberto). Falha do Banco Central = 502, e o último valor bom continua valendo.
 * CRON_SECRET em produção no projeto absolutezro desde 29/10/2026, sem espaço nem quebra de linha (com eles a Vercel
 * recusa o build inteiro: INVALID_CRON_SECRET).
 */
export async function GET(req: Request): Promise<Response> {
  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo) return Response.json({ ok: false, error: 'sem_config' }, { status: 503, headers: sem })
  const veio = Buffer.from(req.headers.get('authorization') ?? '')
  const esperado = Buffer.from(`Bearer ${segredo}`)
  if (veio.length !== esperado.length || !timingSafeEqual(veio, esperado))
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: sem })
  const r = await atualizarDolar(getDatabase(), { forcar: true })
  if (!r.ok) return Response.json({ ok: false, error: 'fonte_indisponivel', detalhe: r.erro }, { status: 502, headers: sem })
  return Response.json('cotacao' in r ? { ok: true, venda: r.cotacao.venda, data: r.cotacao.data, fonte: r.cotacao.fonte } : { ok: true }, { headers: sem })
}
