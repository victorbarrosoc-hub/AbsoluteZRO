import { discovery } from '@zro/auth'
import { issuer, oauthJson, preflight } from '@/lib/oidc'

export const dynamic = 'force-dynamic'

export function GET() {
  return oauthJson(discovery(issuer), 200, { 'Cache-Control': 'public, max-age=300' })
}
export const OPTIONS = preflight
