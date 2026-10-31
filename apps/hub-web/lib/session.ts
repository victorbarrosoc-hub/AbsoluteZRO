import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { authenticate, revokeSessionByToken, SESSION_COOKIE, sessionCookieOptions, type Authenticated } from '@zro/auth'
import { getDatabase } from '@zro/db'
import { hashIp } from '@zro/observability'
import { isProduction } from './env'

export const db = () => getDatabase()

/** Sessão do pedido atual (uma consulta por renderização). */
export const getAuth = cache(async (): Promise<Authenticated | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return authenticate(db(), token)
})

export async function requirePageAuth(): Promise<Authenticated> {
  const a = await getAuth()
  if (!a) redirect('/entrar')
  return a
}

/** Páginas da área logada que precisam de organização ativa. */
export async function requireOrgPage(): Promise<Authenticated> {
  const a = await requirePageAuth()
  if (!a.session.activeOrgId) redirect('/boas-vindas')
  return a
}

export async function requestMeta() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || null
  return { ipHash: hashIp(ip), userAgent: h.get('user-agent') }
}

/**
 * Sessão nova neste navegador (entrar, criar conta, Google). Se havia outra (prompt=login: "Usar outra conta" num app),
 * ela é encerrada: o cookie dela some daqui e a sessão não fica órfã no Perfil.
 */
export async function setSessionCookie(token: string) {
  const jar = await cookies()
  const anterior = jar.get(SESSION_COOKIE)?.value
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(isProduction))
  if (anterior && anterior !== token) await revokeSessionByToken(db(), anterior).catch(() => {})
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}
