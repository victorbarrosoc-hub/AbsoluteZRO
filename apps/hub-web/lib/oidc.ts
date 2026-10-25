import 'server-only'
import { OAuthError, setIssuer } from '@zro/auth'
import { createLogger } from '@zro/observability'
import { appOrigin } from './env'

export { loadOidcClaims } from '@zro/core'

setIssuer(appOrigin)
export const issuer = appOrigin.replace(/\/$/, '')
const log = createLogger('oidc')

/** Endpoints chamados por servidores e apps (sem cookie): CORS aberto, nunca em cache. */
export const OAUTH_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const oauthJson = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...OAUTH_HEADERS, ...extra } })

export function oauthErrorResponse(err: unknown) {
  if (err instanceof OAuthError) {
    const extra: Record<string, string> = err.status === 401 ? { 'WWW-Authenticate': `Bearer error="${err.error}"` } : {}
    return oauthJson({ error: err.error, error_description: err.description }, err.status, extra)
  }
  log.error('oidc.unhandled', { error: err })
  return oauthJson({ error: 'server_error', error_description: 'Algo deu errado do nosso lado.' }, 500)
}

export const preflight = () => new Response(null, { status: 204, headers: OAUTH_HEADERS })

/** Corpo application/x-www-form-urlencoded (RFC 6749), com limite de tamanho. */
export async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get('content-type') ?? ''
  if (!type.startsWith('application/x-www-form-urlencoded')) throw new OAuthError('invalid_request', 'Use application/x-www-form-urlencoded.')
  const text = await req.text()
  if (text.length > 16_000) throw new OAuthError('invalid_request', 'Corpo grande demais.')
  return new URLSearchParams(text)
}
