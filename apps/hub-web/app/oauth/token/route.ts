import { exchangeToken, parseTokenRequest } from '@zro/auth'
import { getDatabase } from '@zro/db'
import { loadOidcClaims, oauthErrorResponse, oauthJson, preflight, readForm } from '@/lib/oidc'

export const dynamic = 'force-dynamic'

/** Troca de código e refresh token. Autenticação do app pelo segredo (Basic ou corpo) ou PKCE para apps públicos. */
export async function POST(req: Request) {
  try {
    const t = parseTokenRequest(await readForm(req), req.headers.get('authorization'))
    return oauthJson(await exchangeToken(getDatabase(), t, loadOidcClaims))
  } catch (err) {
    return oauthErrorResponse(err)
  }
}
export const OPTIONS = preflight
