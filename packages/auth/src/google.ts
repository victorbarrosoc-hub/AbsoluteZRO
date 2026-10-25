/**
 * "Entrar com o Google": o Google é só uma porta para a conta Absolute ZRO (pedido do titular, 25/10/2026).
 * Authorization code + PKCE + nonce. O id_token chega direto do endpoint de token do Google por TLS, com o
 * client_secret (OIDC Core §3.1.3.7): conferimos iss, aud, exp, nonce e e-mail confirmado. Nenhum token do
 * Google é guardado; só o vínculo (sub) em zro.external_identities.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { normalizeEmail, validateEmail } from './rules'
import { createSession, revokeOtherSessions } from './sessions'
import type { RequestMeta } from './accounts'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string }

/** Pedido em andamento: vai num cookie httpOnly curto e volta conferido no retorno. */
export type GooglePending = { state: string; nonce: string; verifier: string; next: string | null }

export function googleStart(cfg: GoogleConfig, next: string | null): { url: string; pending: GooglePending } {
  const pending: GooglePending = {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    next,
  }
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return { url: `${AUTH_URL}?${q.toString()}`, pending }
}

export type GoogleProfile = { subject: string; email: string; name: string }

/** Motivo curto que a tela de entrar traduz (nunca texto livre na URL). */
export type GoogleFailure = 'google' | 'google_cancelado' | 'google_email' | 'suspensa'
const fail = (reason: GoogleFailure = 'google', msg = 'Não deu para entrar com o Google. Tente de novo.') => new DomainError('unauthenticated', msg, { reason })

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1]
  if (!part) throw fail()
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    throw fail()
  }
}

/** Troca o código e devolve quem é a pessoa. Só aceita e-mail confirmado pelo Google. */
export async function googleFinish(
  cfg: GoogleConfig,
  pending: GooglePending,
  returned: { code: string | null; state: string | null; error: string | null },
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<GoogleProfile> {
  if (returned.error === 'access_denied') throw fail('google_cancelado', 'Entrada com o Google cancelada.')
  if (!returned.code || !returned.state || returned.state !== pending.state) throw fail()
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: returned.code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: pending.verifier,
    }),
  })
  if (!res.ok) throw fail()
  const body = (await res.json()) as { id_token?: unknown }
  if (typeof body.id_token !== 'string') throw fail()
  const c = decodeJwtPayload(body.id_token)
  const audOk = c.aud === cfg.clientId || (Array.isArray(c.aud) && c.aud.includes(cfg.clientId))
  if (!ISSUERS.includes(c.iss as string) || !audOk || typeof c.exp !== 'number' || c.exp * 1000 < now - 60_000 || c.nonce !== pending.nonce) {
    throw fail()
  }
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) throw fail()
  const email = typeof c.email === 'string' ? normalizeEmail(c.email) : ''
  if (c.email_verified !== true || validateEmail(email)) throw fail('google_email', 'Seu e-mail no Google ainda não está confirmado.')
  const name = typeof c.name === 'string' ? c.name.trim().slice(0, 120) : ''
  return { subject: c.sub, email, name }
}

/**
 * Entra na conta Absolute ZRO ligada a esse Google. Sem vínculo: mesmo e-mail = mesma conta (mescla); sem conta:
 * cria uma, já com e-mail confirmado e sem senha. Se a conta existente nunca confirmou o e-mail, quem criou pode não
 * ser o dono: a senha dela cai e as sessões abertas são encerradas antes de ligar o Google.
 */
export async function signInWithGoogle(
  db: Database,
  p: GoogleProfile,
  meta: RequestMeta = {},
): Promise<{ userId: string; token: string; expiresAt: Date; created: boolean; linked: boolean }> {
  return db.asSystem('auth: entrar com o Google', async (tx) => {
    let created = false
    let linked = false
    const [link] = await tx`select user_id from zro.external_identities where provider = 'google' and subject = ${p.subject}`
    let userId = (link?.user_id as string) ?? null
    if (!userId) {
      const [u] = await tx`select id, email_verified_at from zro.users where email = ${p.email} for update`
      if (u) {
        userId = u.id as string
        if (!u.email_verified_at) {
          await tx`delete from zro.auth_credentials where user_id = ${userId}`
          await revokeOtherSessions(tx, userId, null)
          await tx`update zro.users set email_verified_at = now() where id = ${userId}`
        }
      } else {
        const [n] = await tx`
          insert into zro.users (email, display_name, email_verified_at) values (${p.email}, ${p.name || p.email.split('@')[0]!.slice(0, 120)}, now())
          returning id`
        userId = n!.id as string
        created = true
        await audit(tx, {
          actorUserId: userId,
          action: 'account.created',
          targetType: 'user',
          targetId: userId,
          ipHash: meta.ipHash,
          metadata: { via: 'google' },
        })
      }
      await tx`
        insert into zro.external_identities (provider, subject, user_id, email) values ('google', ${p.subject}, ${userId}, ${p.email})
        on conflict (provider, subject) do nothing`
      linked = true
      await audit(tx, { actorUserId: userId, action: 'account.google_linked', targetType: 'user', targetId: userId, ipHash: meta.ipHash })
    } else {
      await tx`update zro.external_identities set last_login_at = now(), email = ${p.email} where provider = 'google' and subject = ${p.subject}`
    }
    const [active] = await tx`select status from zro.users where id = ${userId}`
    if (active?.status !== 'active') throw fail('suspensa', 'Esta conta está suspensa. Fale com o suporte.')
    const s = await createSession(tx, userId, meta)
    await audit(tx, { actorUserId: userId, action: 'session.created', targetType: 'session', targetId: s.id, ipHash: meta.ipHash, metadata: { via: 'google' } })
    return { userId, token: s.token, expiresAt: s.expiresAt, created, linked }
  })
}
