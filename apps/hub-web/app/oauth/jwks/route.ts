import { jwks } from '@zro/auth'
import { getDatabase } from '@zro/db'
import { oauthErrorResponse, oauthJson, preflight } from '@/lib/oidc'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return oauthJson(await jwks(getDatabase()), 200, { 'Cache-Control': 'public, max-age=300' })
  } catch (err) {
    return oauthErrorResponse(err)
  }
}
export const OPTIONS = preflight
