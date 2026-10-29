import 'server-only'
import type { GoogleConfig, GooglePending } from '@zro/auth'
import { appOrigin, isProduction } from './env'

/**
 * Botão do Google só aparece com GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados: o cliente "Absolute ZRO – central"
 * do projeto Google do ecossistema (ADR 0025), o mesmo que vai servir às Conexões (Google Agenda).
 */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri: `${appOrigin.replace(/\/$/, '')}/entrar/google/retorno` }
}

/** Mensagens do `?erro=` que a volta do Google (e a conta suspensa) deixa nas telas de entrar. */
const GOOGLE_ERROS: Record<string, string> = {
  google: 'Não deu para entrar com o Google. Tente de novo.',
  google_cancelado: 'Entrada com o Google cancelada.',
  google_email: 'Seu e-mail no Google ainda não está confirmado.',
  suspensa: 'Esta conta está suspensa. Fale com o suporte.',
}
export const googleErro = (codigo: string | undefined): string | undefined => (codigo ? (GOOGLE_ERROS[codigo] ?? GOOGLE_ERROS.google) : undefined)

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
