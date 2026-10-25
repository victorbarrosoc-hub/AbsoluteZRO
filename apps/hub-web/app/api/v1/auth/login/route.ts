import { SESSION_COOKIE, sessionCookieOptions, signIn } from '@zro/auth'
import { hashIp } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'
import { isProduction } from '@/lib/env'

export const POST = route(
  async ({ db, req }) => {
    const body = (await readJson(req, 10_000)) as { email?: string; password?: string }
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null
    const r = await signIn(
      db,
      { email: String(body.email ?? ''), password: String(body.password ?? '') },
      { ipHash: hashIp(ip), userAgent: req.headers.get('user-agent') },
    )
    const res = json({ ok: true, expires_at: r.expiresAt })
    const o = sessionCookieOptions(isProduction)
    res.headers.append('Set-Cookie', `${SESSION_COOKIE}=${r.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${o.maxAge}${o.secure ? '; Secure' : ''}`)
    return res
  },
  { mutation: true },
)
