import 'server-only'
/**
 * Set (ADR 0031) do lado do HUB: o formato que a API devolve (foto com endereço inteiro, para o widget mostrar em
 * qualquer app sem cookie do HUB) e a leitura do corpo dos pedidos.
 */
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

/** O corpo JSON do pedido (pequeno: até 20 kB). */
export async function corpo(req: Request): Promise<Record<string, unknown>> {
  const b = await readJson(req, 20_000)
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new DomainError('invalid_input', 'Mande um objeto JSON.')
  return b as Record<string, unknown>
}

export const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
