import 'server-only'
import { authenticate, originAllowed, SESSION_COOKIE, type Authenticated } from '@zro/auth'
import { getDatabase, type Database } from '@zro/db'
import { createLogger, DomainError, isDomainError } from '@zro/observability'
import { allowedOrigins } from './env'

const log = createLogger('api')

export type ApiContext = { db: Database; auth: Authenticated | null; req: Request }

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function errorResponse(err: unknown) {
  if (isDomainError(err)) return json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }, err.status)
  log.error('api.unhandled', { error: err })
  return json({ error: 'internal', message: 'Algo deu errado do nosso lado. Tente de novo.' }, 500)
}

/**
 * Envolve uma rota da API: sessão pelo cookie, checagem de origem em mutações (CSRF) e erros de domínio com o
 * status certo. A autorização de verdade fica nos serviços (authorize), nunca aqui.
 */
export function route<P = Record<string, string>>(handler: (ctx: ApiContext, params: P) => Promise<Response | unknown>, opts: { mutation?: boolean } = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      if (opts.mutation && !originAllowed(req.headers, req.url, allowedOrigins)) {
        throw new DomainError('origin_rejected', 'Pedido de outra origem recusado.')
      }
      const db = getDatabase()
      const auth = await authenticate(db, readCookie(req, SESSION_COOKIE))
      const out = await handler({ db, auth, req }, await context.params)
      return out instanceof Response ? out : json(out)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export async function readJson(req: Request, maxBytes = 25_000_000): Promise<unknown> {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > maxBytes) throw new DomainError('invalid_input', 'Corpo grande demais.')
  const text = await req.text()
  if (text.length > maxBytes) throw new DomainError('invalid_input', 'Corpo grande demais.')
  try {
    return JSON.parse(text)
  } catch {
    throw new DomainError('invalid_input', 'JSON inválido.')
  }
}
