import 'server-only'
import type { GoogleConfig, GooglePending } from '@zro/auth'
import { appOrigin, isProduction } from './env'

/** Botão do Google só aparece com GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados (cliente próprio do HUB). */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri: `${appOrigin.replace(/\/$/, '')}/entrar/google/retorno` }
}

export const GOOGLE_COOKIE = 'zro_google'
export const googleCookieOptions = { httpOnly: true, secure: isProduction, sameSite: 'lax' as const, path: '/entrar/google', maxAge: 600 }

export function readPending(raw: string | undefined): GooglePending | null {
  if (!raw) return null
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as GooglePending
    return typeof p.state === 'string' && typeof p.nonce === 'string' && typeof p.verifier === 'string' ? p : null
  } catch {
    return null
  }
}

export const writePending = (p: GooglePending) => Buffer.from(JSON.stringify(p), 'utf8').toString('base64url')
