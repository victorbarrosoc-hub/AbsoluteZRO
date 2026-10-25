import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { googleFinish, signInWithGoogle } from '@zro/auth'
import { createLogger, DomainError } from '@zro/observability'
import { GOOGLE_COOKIE, googleConfig, readPending } from '@/lib/google'
import { db, requestMeta, setSessionCookie } from '@/lib/session'

export const dynamic = 'force-dynamic'
const log = createLogger('google')

/** GET /entrar/google/retorno — o Google volta aqui; a pessoa entra na conta Absolute ZRO ligada a ele. */
export async function GET(req: Request) {
  const jar = await cookies()
  const pending = readPending(jar.get(GOOGLE_COOKIE)?.value)
  jar.delete({ name: GOOGLE_COOKIE, path: '/entrar/google' })
  const cfg = googleConfig()
  const sp = new URL(req.url).searchParams
  let to: string
  try {
    if (!cfg || !pending) throw new DomainError('unauthenticated', 'O pedido expirou.', { reason: 'google' })
    const who = await googleFinish(cfg, pending, { code: sp.get('code'), state: sp.get('state'), error: sp.get('error') })
    const r = await signInWithGoogle(db(), who, await requestMeta())
    await setSessionCookie(r.token)
    const next = pending.next
    to = r.created ? (next ? `/boas-vindas?next=${encodeURIComponent(next)}` : '/boas-vindas') : (next ?? '/inicio')
  } catch (e) {
    if (!(e instanceof DomainError)) log.error('google.callback', { error: e })
    const reason = e instanceof DomainError && typeof e.details?.reason === 'string' ? e.details.reason : 'google'
    const back = new URLSearchParams({ erro: reason })
    if (pending?.next) back.set('next', pending.next)
    to = `/entrar?${back.toString()}`
  }
  redirect(to)
}
