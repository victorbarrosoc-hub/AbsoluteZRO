import { parseTokenRequest, revokeToken } from '@zro/auth'
import { getDatabase } from '@zro/db'
import { oauthErrorResponse, preflight, readForm, OAUTH_HEADERS } from '@/lib/oidc'

export const dynamic = 'force-dynamic'

/** RFC 7009: responde 200 mesmo para token desconhecido. */
export async function POST(req: Request) {
  try {
    const form = await readForm(req)
    await revokeToken(getDatabase(), { ...parseTokenRequest(form, req.headers.get('authorization')), token: form.get('token') })
    return new Response(null, { status: 200, headers: OAUTH_HEADERS })
  } catch (err) {
    return oauthErrorResponse(err)
  }
}
export const OPTIONS = preflight
