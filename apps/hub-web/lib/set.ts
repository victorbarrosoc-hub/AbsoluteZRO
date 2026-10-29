import 'server-only'
/**
 * Set (ADR 0031) do lado do HUB: o formato que a API devolve (foto com endereço inteiro, para o widget mostrar em
 * qualquer app sem cookie do HUB) e a leitura do corpo dos pedidos.
 */
import { createHash } from 'node:crypto'
import { DomainError } from '@zro/observability'
import { readJson } from './api'
import { appOrigin } from './env'

/** Troca todo `foto: "/api/v1/foto/…"` pelo endereço inteiro. */
export function paraApi<T>(v: T): T {
  if (Array.isArray(v)) return v.map(paraApi) as T
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = k === 'foto' && typeof x === 'string' && x.startsWith('/api/') ? `${appOrigin}${x}` : paraApi(x)
    return out as T
  }
  return v
}

/**
 * Resposta de leitura com ETag: o widget pergunta de tempos em tempos (o poll do Set) mandando `If-None-Match` com a
 * última que recebeu; sem mudança, 304 sem corpo. A resposta é da pessoa (no-store: nada de cache compartilhado).
 */
export function comEtag(req: Request, dados: unknown): Response {
  const corpo = JSON.stringify(paraApi(dados))
  const etag = `W/"${createHash('sha256').update(corpo).digest('base64url').slice(0, 27)}"`
  const headers = { 'Cache-Control': 'no-store', ETag: etag, Vary: 'Cookie, Authorization' }
  const pedida = req.headers.get('if-none-match')
  if (pedida && pedida.split(',').some((t) => t.trim() === etag)) return new Response(null, { status: 304, headers })
  return new Response(corpo, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } })
}

/** O corpo JSON do pedido (pequeno: até 20 kB). */
export async function corpo(req: Request): Promise<Record<string, unknown>> {
  const b = await readJson(req, 20_000)
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new DomainError('invalid_input', 'Mande um objeto JSON.')
  return b as Record<string, unknown>
}

export const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
