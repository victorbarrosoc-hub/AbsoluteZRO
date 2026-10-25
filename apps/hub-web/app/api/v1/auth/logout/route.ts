import { revokeSessionByToken, SESSION_COOKIE } from '@zro/auth'
import { json, route } from '@/lib/api'

export const POST = route(
  async ({ db, req }) => {
    const token = (req.headers.get('cookie') ?? '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1)
    if (token) await revokeSessionByToken(db, decodeURIComponent(token))
    const res = json({ ok: true })
    res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return res
  },
  { mutation: true },
)
