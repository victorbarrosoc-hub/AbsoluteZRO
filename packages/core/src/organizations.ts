/** Organizações, vínculos e convites (PRD §4.1 Equipe, §5.1). */
import { randomBytes } from 'node:crypto'
import { hashToken, newToken, normalizeEmail, setActiveOrganization, TOKEN_FORMAT, validateEmail, type Authenticated } from '@zro/auth'
import { pgErrorCode, PG, type Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { ADMIN_ROLES, authorize, requireUser, type OrgRole } from './authz'

const INVITE_TTL_MS = 7 * 24 * 3_600_000

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`
}

export async function createOrganization(
  db: Database,
  auth: Authenticated | null,
  input: { name: string; kind?: 'person' | 'team' | 'company' },
): Promise<{ id: string; slug: string }> {
  const { userId } = requireUser(auth)
  const name = input.name.trim()
  if (!name || name.length > 120) throw new DomainError('invalid_input', 'Dê um nome à organização (até 120 caracteres).')
  const slug = slugify(name)
  const [r] = await db.asUser({ userId, orgId: null }, (tx) => tx`select zro.create_organization(${name}, ${slug}, ${input.kind ?? 'team'}) as id`)
  const id = r!.id as string
  await setActiveOrganization(db, auth!, id)
  auth!.session.activeOrgId = id
  return { id, slug }
}

export type OrganizationSummary = { id: string; name: string; slug: string; role: OrgRole; active: boolean }

export async function listMyOrganizations(db: Database, auth: Authenticated | null): Promise<OrganizationSummary[]> {
  const { userId } = requireUser(auth)
  const rows = await db.asUser(
    { userId, orgId: auth!.session.activeOrgId },
    (tx) => tx`
    select o.id, o.name, o.slug, m.role from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.user_id = ${userId} and m.status = 'active' and o.status = 'active' order by o.name`,
  )
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    role: r.role as OrgRole,
    active: r.id === auth!.session.activeOrgId,
  }))
}

export async function switchOrganization(db: Database, auth: Authenticated | null, orgId: string): Promise<void> {
  requireUser(auth)
  await setActiveOrganization(db, auth!, orgId)
  auth!.session.activeOrgId = orgId
}

export async function listMembers(db: Database, auth: Authenticated | null) {
  const actor = await authorize(db, auth)
  const members = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select u.id, u.email, u.display_name, m.role, m.created_at from zro.memberships m join zro.users u on u.id = m.user_id
    where m.org_id = ${actor.orgId} and m.status = 'active' order by m.created_at`,
  )
  const invitations = ADMIN_ROLES.includes(actor.role)
    ? await db.asUser(
        { userId: actor.userId, orgId: actor.orgId },
        (tx) => tx`
        select id, email, role, expires_at, created_at from zro.invitations
        where org_id = ${actor.orgId} and accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`,
      )
    : []
  return { actor, members, invitations }
}

export async function inviteMember(
  db: Database,
  auth: Authenticated | null,
  input: { email: string; role: Exclude<OrgRole, 'owner'> },
): Promise<{ token: string; invitationId: string; email: string }> {
  const actor = await authorize(db, auth, { roles: ADMIN_ROLES, verifiedEmail: true })
  const email = normalizeEmail(input.email)
  const bad = validateEmail(email)
  if (bad) throw new DomainError('invalid_input', bad)
  if (!['admin', 'manager', 'editor', 'viewer', 'billing'].includes(input.role)) throw new DomainError('invalid_input', 'Papel inválido.')
  if (input.role === 'admin' && actor.role !== 'owner') throw new DomainError('forbidden_role', 'Só o dono convida administradores.')
  const token = newToken('zi')
  const id = await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [inv] = await tx`
      insert into zro.invitations (org_id, email, role, token_hash, invited_by, expires_at)
      values (${actor.orgId}, ${email}, ${input.role}, ${hashToken(token)}, ${actor.userId}, ${new Date(Date.now() + INVITE_TTL_MS)})
      returning id`
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: 'member.invited',
      targetType: 'invitation',
      targetId: inv!.id as string,
      metadata: { role: input.role },
    })
    return inv!.id as string
  })
  return { token, invitationId: id, email }
}

export async function revokeInvitation(db: Database, auth: Authenticated | null, invitationId: string): Promise<void> {
  const actor = await authorize(db, auth, { roles: ADMIN_ROLES })
  await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const r = await tx`update zro.invitations set revoked_at = now() where id = ${invitationId} and accepted_at is null and revoked_at is null returning id`
    if (!r.length) throw new DomainError('not_found', 'Convite não encontrado.')
    await audit(tx, { orgId: actor.orgId, actorUserId: actor.userId, action: 'member.invitation_revoked', targetType: 'invitation', targetId: invitationId })
  })
}

/** Aceitar convite: e-mail confirmado e igual ao convidado. */
export async function acceptInvitation(db: Database, auth: Authenticated | null, token: string): Promise<{ orgId: string }> {
  const { userId } = requireUser(auth, { verifiedEmail: true })
  if (!TOKEN_FORMAT.invite.test(token)) throw new DomainError('not_found', 'Convite inválido ou vencido.')
  const orgId = await db.asSystem('org: aceitar convite', async (tx) => {
    const [inv] = await tx`
      select i.id, i.org_id, i.email, i.role from zro.invitations i join zro.organizations o on o.id = i.org_id
      where i.token_hash = ${hashToken(token)} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and o.status = 'active'
      for update of i`
    if (!inv) throw new DomainError('not_found', 'Convite inválido ou vencido.')
    if (inv.email !== auth!.user.email) throw new DomainError('forbidden_role', 'Este convite foi enviado para outro e-mail.')
    await tx`
      insert into zro.memberships (org_id, user_id, role) values (${inv.org_id as string}, ${userId}, ${inv.role as string})
      on conflict (org_id, user_id) do update set status = 'active',
        role = case when zro.memberships.role = 'owner' then 'owner' else excluded.role end`
    await tx`update zro.invitations set accepted_at = now(), accepted_by = ${userId} where id = ${inv.id as string}`
    await audit(tx, {
      orgId: inv.org_id as string,
      actorUserId: userId,
      action: 'member.joined',
      targetType: 'invitation',
      targetId: inv.id as string,
      metadata: { role: inv.role },
    })
    return inv.org_id as string
  })
  await setActiveOrganization(db, auth!, orgId)
  auth!.session.activeOrgId = orgId
  return { orgId }
}

export async function changeMemberRole(db: Database, auth: Authenticated | null, memberUserId: string, role: OrgRole): Promise<void> {
  const actor = await authorize(db, auth, { roles: ADMIN_ROLES })
  if (role === 'owner' && actor.role !== 'owner') throw new DomainError('forbidden_role', 'Só o dono transfere a posse.')
  try {
    await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
      const r =
        await tx`update zro.memberships set role = ${role} where org_id = ${actor.orgId} and user_id = ${memberUserId} and status = 'active' returning user_id`
      if (!r.length) throw new DomainError('forbidden_role', 'Você não pode mudar o papel desta pessoa.')
      await audit(tx, {
        orgId: actor.orgId,
        actorUserId: actor.userId,
        action: 'member.role_changed',
        targetType: 'user',
        targetId: memberUserId,
        metadata: { role },
      })
    })
  } catch (e) {
    if (pgErrorCode(e) === PG.checkViolation) throw new DomainError('conflict', 'A organização precisa de pelo menos um dono.')
    throw e
  }
}

export async function removeMember(db: Database, auth: Authenticated | null, memberUserId: string): Promise<void> {
  const actor = await authorize(db, auth, { roles: ADMIN_ROLES })
  try {
    await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
      const r =
        await tx`update zro.memberships set status = 'removed' where org_id = ${actor.orgId} and user_id = ${memberUserId} and status = 'active' returning user_id`
      if (!r.length) throw new DomainError('forbidden_role', 'Você não pode remover esta pessoa.')
      await audit(tx, { orgId: actor.orgId, actorUserId: actor.userId, action: 'member.removed', targetType: 'user', targetId: memberUserId })
    })
  } catch (e) {
    if (pgErrorCode(e) === PG.checkViolation) throw new DomainError('conflict', 'A organização precisa de pelo menos um dono.')
    throw e
  }
}
