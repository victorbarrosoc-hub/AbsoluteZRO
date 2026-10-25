import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { googleStart } from '@zro/auth'
import { safeNext } from '@/lib/actions/helpers'
import { GOOGLE_COOKIE, googleConfig, googleCookieOptions, writePending } from '@/lib/google'

export const dynamic = 'force-dynamic'

/** GET /entrar/google?next=… — começa o "Entrar com o Google" e guarda state, nonce e PKCE num cookie curto. */
export async function GET(req: Request) {
  const cfg = googleConfig()
  const next = safeNext(new URL(req.url).searchParams.get('next'))
  if (!cfg) redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : '/entrar')
  const { url, pending } = googleStart(cfg, next)
  ;(await cookies()).set(GOOGLE_COOKIE, writePending(pending), googleCookieOptions)
  redirect(url)
}
