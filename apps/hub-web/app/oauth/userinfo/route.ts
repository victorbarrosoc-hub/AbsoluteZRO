import { userInfo } from '@zro/auth'
import { getDatabase } from '@zro/db'
import { loadOidcClaims, oauthErrorResponse, oauthJson, preflight } from '@/lib/oidc'

export const dynamic = 'force-dynamic'

async function handle(req: Request) {
  try {
    return oauthJson(await userInfo(getDatabase(), req.headers.get('authorization'), loadOidcClaims))
  } catch (err) {
    return oauthErrorResponse(err)
  }
}
export const GET = handle
export const POST = handle
export const OPTIONS = preflight
