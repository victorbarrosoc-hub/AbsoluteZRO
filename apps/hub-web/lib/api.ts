import 'server-only'
import { authenticate, authenticateAccessToken, originAllowed, SESSION_COOKIE, setIssuer, type Authenticated } from '@zro/auth'
import { getDatabase, type Database } from '@zro/db'
import { createLogger, DomainError, isDomainError } from '@zro/observability'
import { allowedOrigins, appOrigin } from './env'

const log = createLogger('api')
// O emissor que confere o token Bearer tem de ser o mesmo que o assina em /oauth/token (lib/oidc.ts). Sem isto, as rotas
// da API usavam ZRO_APP_ORIGIN (vazio em produção, que vive do domínio da Vercel) e recusavam todo token de app.
setIssuer(appOrigin)

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
 * `bearer`: a rota também aceita o access token de um app da família com este escopo. Token não é credencial que o
 * navegador manda sozinho, então pedido com Bearer não passa pela checagem de origem; token inválido é 401, sem
 * cair para o cookie.
 */
export function route<P = Record<string, string>>(
  handler: (ctx: ApiContext, params: P) => Promise<Response | unknown>,
  opts: { mutation?: boolean; bearer?: string } = {},
) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const authorization = req.headers.get('authorization')
      const viaToken = !!opts.bearer && !!authorization?.startsWith('Bearer ')
      if (opts.mutation && !viaToken && !originAllowed(req.headers, req.url, allowedOrigins)) {
        throw new DomainError('origin_rejected', 'Pedido de outra origem recusado.')
      }
      const db = getDatabase()
      const auth = viaToken ? await authenticateAccessToken(db, authorization, opts.bearer!) : await authenticate(db, readCookie(req, SESSION_COOKIE))
      if (viaToken && !auth) throw new DomainError('unauthenticated', 'Token inválido, vencido ou sem permissão para esta ação.')
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
