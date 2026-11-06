import { LIMIT_MESSAGE, redeemDesktopLoginCode, registerAttempt, RULES, withinLimit } from '@zro/auth'
import { DomainError } from '@zro/observability'
import { errorResponse, json } from '@/lib/api'
import { db, requestMeta, setSessionCookie } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * POST /entrar/app/trocar — o app de computador troca o código de uso único (do deep link) por uma sessão do HUB.
 * Corpo JSON: { app, code, state, verifier }. A resposta traz o cookie de sessão (guardado no jar do próprio app) e
 * o caminho do HUB para onde o app volta. Sem checagem de Origin: quem prova é o `verifier` PKCE, não um cookie.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const s = (k: string) => (typeof body?.[k] === 'string' ? (body[k] as string) : '')
    const meta = await requestMeta()
    const key = `desktop-login:${meta.ipHash ?? 'sem-ip'}`
    const ok = await db().asSystem('auth: limite da entrada pelo app', async (tx) => {
      if (!(await withinLimit(tx, key, RULES.desktopLogin))) return false
      await registerAttempt(tx, key)
      return true
    })
    if (!ok) throw new DomainError('rate_limited', LIMIT_MESSAGE)
    const r = await redeemDesktopLoginCode(db(), { code: s('code'), verifier: s('verifier'), state: s('state'), app: s('app') }, meta)
    await setSessionCookie(r.token)
    return json({ ok: true, next: r.next })
  } catch (err) {
    return errorResponse(err)
  }
}
