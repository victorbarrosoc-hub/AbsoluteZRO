/**
 * Sessões do HUB. O token vai só para o cookie httpOnly; o banco guarda o sha256.
 * Duração curta e deslizante (PRD §5.2): expira após ZRO_SESSION_IDLE_HOURS sem uso e nunca passa de
 * ZRO_SESSION_MAX_DAYS desde o login. Revogar é imediato.
 */
import type { Database, Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'
import { hashToken, newToken, TOKEN_FORMAT } from './tokens'

const HOUR = 3_600_000
export const SESSION_IDLE_MS = Number(process.env.ZRO_SESSION_IDLE_HOURS || 72) * HOUR
export const SESSION_MAX_MS = Number(process.env.ZRO_SESSION_MAX_DAYS || 14) * 24 * HOUR
/** Só regrava o uso se passou disso (evita uma escrita por pedido). */
const SLIDE_EVERY_MS = 10 * 60_000

export const SESSION_COOKIE = 'zro_session'

export type SessionUser = {
  id: string
  email: string
  displayName: string
  emailVerified: boolean
  /** Papel no console da plataforma (ADR 0034): admin, suporte ou financeiro. */
  platformRole: 'support' | 'admin' | 'financeiro' | null
}

export type CurrentSession = {
  id: string
  activeOrgId: string | null
  expiresAt: Date
  /** Hora do login (auth_time do login único). */
  createdAt: Date
  /** Só no pedido com o token de um app da família: qual app (e de qual produto) chamou. */
  app?: { clientId: string; productId: string | null }
}

export type Authenticated = { user: SessionUser; session: CurrentSession }

export async function createSession(
  tx: Queryable,
  userId: string,
  meta: { userAgent?: string | null; ipHash?: string | null; activeOrgId?: string | null } = {},
): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = newToken('zs')
  const expiresAt = new Date(Date.now() + Math.min(SESSION_IDLE_MS, SESSION_MAX_MS))
  let activeOrgId = meta.activeOrgId ?? null
  if (!activeOrgId) {
    const [m] = await tx`
      select m.org_id from zro.memberships m join zro.organizations o on o.id = m.org_id
      where m.user_id = ${userId} and m.status = 'active' and o.status = 'active'
      order by m.updated_at desc limit 1`
    activeOrgId = (m?.org_id as string) ?? null
  }
  const [row] = await tx`
    insert into zro.sessions (user_id, token_hash, active_org_id, user_agent, ip_hash, expires_at)
    values (${userId}, ${hashToken(token)}, ${activeOrgId}, ${meta.userAgent?.slice(0, 300) ?? null}, ${meta.ipHash ?? null}, ${expiresAt})
    returning id`
  return { token, id: row!.id as string, expiresAt }
}

/** Quem está pedindo, a partir do token do cookie. null = sem sessão válida. */
export async function authenticate(db: Database, token: string | null | undefined): Promise<Authenticated | null> {
  if (!token || !TOKEN_FORMAT.session.test(token)) return null
  return db.asSystem('auth: resolver sessão', async (tx) => {
    const [r] = await tx`
      select s.id, s.active_org_id, s.expires_at, s.created_at, s.last_used_at,
             u.id as user_id, u.email, u.display_name, u.email_verified_at, u.platform_role,
             (select true from zro.memberships m join zro.organizations o on o.id = m.org_id
               where m.org_id = s.active_org_id and m.user_id = u.id and m.status = 'active' and o.status = 'active') as org_ok
      from zro.sessions s join zro.users u on u.id = s.user_id
      where s.token_hash = ${hashToken(token)} and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`
    if (!r) return null
    const now = Date.now()
    let expiresAt = r.expires_at as Date
    const activeOrgId = r.org_ok ? (r.active_org_id as string) : null
    if (now - (r.last_used_at as Date).getTime() > SLIDE_EVERY_MS || (r.active_org_id && !r.org_ok)) {
      expiresAt = new Date(Math.min(now + SESSION_IDLE_MS, (r.created_at as Date).getTime() + SESSION_MAX_MS))
      await tx`update zro.sessions set last_used_at = now(), expires_at = ${expiresAt}, active_org_id = ${activeOrgId} where id = ${r.id as string}`
    }
    return {
      user: {
        id: r.user_id as string,
        email: r.email as string,
        displayName: r.display_name as string,
        emailVerified: !!r.email_verified_at,
        platformRole: (r.platform_role as SessionUser['platformRole']) ?? null,
      },
      session: { id: r.id as string, activeOrgId, expiresAt, createdAt: r.created_at as Date },
    }
  })
}

/** Troca a organização ativa da sessão. O vínculo é conferido aqui; o cliente só sugere o id. */
export async function setActiveOrganization(db: Database, auth: Authenticated, orgId: string): Promise<void> {
  await db.asSystem('auth: trocar organização ativa', async (tx) => {
    const [ok] = await tx`
      select 1 from zro.memberships m join zro.organizations o on o.id = m.org_id
      where m.org_id = ${orgId} and m.user_id = ${auth.user.id} and m.status = 'active' and o.status = 'active'`
    if (!ok) throw new DomainError('forbidden_role', 'Você não faz parte dessa organização.')
    await tx`update zro.sessions set active_org_id = ${orgId} where id = ${auth.session.id} and user_id = ${auth.user.id}`
  })
}

export async function revokeSessionByToken(db: Database, token: string): Promise<void> {
  if (!TOKEN_FORMAT.session.test(token)) return
  await db.asSystem('auth: sair', (tx) => tx`update zro.sessions set revoked_at = now() where token_hash = ${hashToken(token)} and revoked_at is null`)
}

/** A pessoa encerra uma das próprias sessões (Perfil e segurança). */
export async function revokeOwnSession(db: Database, userId: string, sessionId: string): Promise<boolean> {
  const rows = await db.asSystem(
    'auth: encerrar sessão',
    (tx) => tx`update zro.sessions set revoked_at = now() where id = ${sessionId} and user_id = ${userId} and revoked_at is null returning id`,
  )
  return rows.length > 0
}

export async function revokeOtherSessions(tx: Queryable, userId: string, keepSessionId: string | null): Promise<void> {
  await tx`update zro.sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null and (${keepSessionId}::uuid is null or id <> ${keepSessionId})`
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: Math.floor(SESSION_MAX_MS / 1000) }
}
