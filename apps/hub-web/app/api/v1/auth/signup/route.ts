import { defaultSender, SESSION_COOKIE, sessionCookieOptions, signUp } from '@zro/auth'
import { hashIp } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'
import { appOrigin, isProduction } from '@/lib/env'

const mail = defaultSender()

export const POST = route(
  async ({ db, req }) => {
    const body = (await readJson(req, 10_000)) as { email?: string; password?: string; name?: string }
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null
    const r = await signUp(
      db,
      { email: String(body.email ?? ''), password: String(body.password ?? ''), displayName: String(body.name ?? '') },
      { ipHash: hashIp(ip), userAgent: req.headers.get('user-agent') },
    )
    await mail.send({
      to: String(body.email),
      subject: 'Confirme seu e-mail na Absolute ZRO',
      text: `Para confirmar, abra: ${appOrigin}/confirmar-email?token=${r.verifyToken}`,
    })
    const res = json({ ok: true, user_id: r.userId }, 201)
    const o = sessionCookieOptions(isProduction)
    res.headers.append('Set-Cookie', `${SESSION_COOKIE}=${r.session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${o.maxAge}${o.secure ? '; Secure' : ''}`)
    return res
  },
  { mutation: true },
)
