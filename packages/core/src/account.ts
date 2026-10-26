/**
 * Central da conta (pedido do titular, 26/10/2026): nome, foto, pedidos de plano e o resumo de acessos em todas as
 * organizações. Tudo em nome da própria pessoa (zro_app + RLS); só o console atende pedidos de plano.
 */
import { validateDisplayName, type Authenticated } from '@zro/auth'
import { productAccessFor } from '@zro/billing'
import { pgErrorCode, PG, type Database, type Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { authorize, requireUser, type OrgRole, type UserActor } from './authz'

export const BILLING_ROLES: OrgRole[] = ['owner', 'admin', 'billing']
export const AVATAR_MAX_BYTES = 300_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function updateDisplayName(db: Database, auth: Authenticated | null, name: string): Promise<void> {
  const { userId } = requireUser(auth)
  const problem = validateDisplayName(name)
  if (problem) throw new DomainError('invalid_input', problem)
  await db.asUser({ userId, orgId: auth!.session.activeOrgId }, async (tx) => {
    await tx`update zro.users set display_name = ${name.trim()} where id = ${userId}`
    await audit(tx, { actorUserId: userId, action: 'account.name_changed', targetType: 'user', targetId: userId })
  })
}

/** Tipo real da imagem pelos primeiros bytes; o tipo declarado pelo navegador não vale. */
export function sniffImage(data: Uint8Array): 'image/webp' | 'image/jpeg' | 'image/png' | null {
  const b = (i: number) => data[i]
  if (
    data.length > 12 &&
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return 'image/webp'
  if (data.length > 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (data.length > 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png'
  return null
}

export async function setAvatar(db: Database, auth: Authenticated | null, data: Uint8Array): Promise<void> {
  const { userId } = requireUser(auth)
  if (!data.length) throw new DomainError('invalid_input', 'Escolha uma imagem.')
  if (data.length > AVATAR_MAX_BYTES) throw new DomainError('invalid_input', 'Imagem grande demais. Use uma foto de até 300 KB.')
  const type = sniffImage(data)
  if (!type) throw new DomainError('invalid_input', 'Use uma foto em JPG, PNG ou WebP.')
  await db.asUser({ userId, orgId: auth!.session.activeOrgId }, async (tx) => {
    await tx`
      insert into zro.user_avatars (user_id, content_type, data) values (${userId}, ${type}, ${Buffer.from(data)})
      on conflict (user_id) do update set content_type = excluded.content_type, data = excluded.data, updated_at = now()`
    await audit(tx, { actorUserId: userId, action: 'account.avatar_changed', targetType: 'user', targetId: userId })
  })
}

export async function removeAvatar(db: Database, auth: Authenticated | null): Promise<void> {
  const { userId } = requireUser(auth)
  await db.asUser({ userId, orgId: auth!.session.activeOrgId }, async (tx) => {
    await tx`delete from zro.user_avatars where user_id = ${userId}`
    await audit(tx, { actorUserId: userId, action: 'account.avatar_removed', targetType: 'user', targetId: userId })
  })
}

/** Foto de alguém que a pessoa pode ver (ela mesma ou quem está na organização ativa). null = sem foto. */
export async function readAvatar(db: Database, auth: Authenticated | null, userId: string): Promise<{ type: string; data: Buffer; updatedAt: Date } | null> {
  const me = requireUser(auth)
  if (!UUID.test(userId)) return null
  const [r] = await db.asUser(
    { userId: me.userId, orgId: auth!.session.activeOrgId },
    (tx) => tx`select content_type, data, updated_at from zro.user_avatars where user_id = ${userId}`,
  )
  return r ? { type: r.content_type as string, data: r.data as Buffer, updatedAt: r.updated_at as Date } : null
}

/** Versão da foto (para o endereço mudar quando ela muda). null = sem foto. */
export async function avatarVersion(db: Database, auth: Authenticated | null): Promise<number | null> {
  const { userId } = requireUser(auth)
  const [r] = await db.asUser({ userId, orgId: auth!.session.activeOrgId }, (tx) => tx`select updated_at from zro.user_avatars where user_id = ${userId}`)
  return r ? (r.updated_at as Date).getTime() : null
}

export type PlanRequestKind = 'renew' | 'upgrade'

/**
 * Pedido de renovação ou upgrade. Sem provedor de pagamento, isto só avisa a equipe: nenhum acesso muda aqui.
 * Só quem cuida da cobrança pede; um pedido aberto por tipo e plano.
 */
export async function requestPlanChange(db: Database, auth: Authenticated | null, input: { kind: PlanRequestKind; planId?: string | null }): Promise<string> {
  const actor = await authorize(db, auth, { roles: BILLING_ROLES, verifiedEmail: true })
  if (input.kind !== 'renew' && input.kind !== 'upgrade') throw new DomainError('invalid_input', 'Pedido inválido.')
  const planId = input.kind === 'upgrade' ? (input.planId ?? '') : null
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    if (planId !== null) {
      if (!UUID.test(planId)) throw new DomainError('invalid_input', 'Escolha um plano.')
      const [p] = await tx`select kind from zro.plans where id = ${planId} and status = 'active'`
      if (!p || p.kind === 'free') throw new DomainError('invalid_input', 'Escolha um plano disponível.')
    } else {
      const [s] =
        await tx`select 1 from zro.subscriptions where org_id = ${actor.orgId} and provider <> 'free' and status in ('active', 'trialing', 'past_due', 'expired', 'canceled')`
      if (!s) throw new DomainError('invalid_input', 'A organização ainda não tem plano pago para renovar. Peça um upgrade.')
    }
    let id: string
    try {
      const [r] = await tx.savepoint(
        (sp) =>
          sp`insert into zro.plan_requests (org_id, requested_by, kind, plan_id) values (${actor.orgId}, ${actor.userId}, ${input.kind}, ${planId}) returning id`,
      )
      id = r!.id as string
    } catch (e) {
      if (pgErrorCode(e) === PG.uniqueViolation) throw new DomainError('conflict', 'Esse pedido já está com a equipe.')
      throw e
    }
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: 'billing.plan_requested',
      targetType: 'plan_request',
      targetId: id,
      metadata: { kind: input.kind },
    })
    return id
  })
}

export async function cancelPlanRequest(db: Database, auth: Authenticated | null, requestId: string): Promise<void> {
  const actor = await authorize(db, auth, { roles: BILLING_ROLES })
  if (!UUID.test(requestId)) throw new DomainError('not_found', 'Pedido não encontrado.')
  await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [r] = await tx`update zro.plan_requests set status = 'canceled' where id = ${requestId} and status = 'open' returning id`
    if (!r) throw new DomainError('not_found', 'Pedido não encontrado.')
    await audit(tx, { orgId: actor.orgId, actorUserId: actor.userId, action: 'billing.plan_request_canceled', targetType: 'plan_request', targetId: requestId })
  })
}

/** Console: marca o pedido como atendido (o plano em si muda pelas ações de assinatura do console). */
export async function resolvePlanRequest(tx: Queryable, actor: Pick<UserActor, 'userId'> & { reason: string }, requestId: string): Promise<void> {
  if (!UUID.test(requestId)) throw new DomainError('not_found', 'Pedido não encontrado.')
  const [r] = await tx`
    update zro.plan_requests set status = 'done', resolved_at = now(), resolved_by = ${actor.userId}
    where id = ${requestId} and status = 'open' returning org_id`
  if (!r) throw new DomainError('not_found', 'Pedido não encontrado ou já atendido.')
  await audit(tx, {
    orgId: r.org_id as string,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.plan_request_done',
    targetType: 'plan_request',
    targetId: requestId,
    metadata: { reason: actor.reason },
  })
}

export type OrgAccess = {
  id: string
  name: string
  role: OrgRole
  active: boolean
  /** null = o papel não vê a cobrança desta organização. */
  plans: { name: string; status: string; until: Date | null; provider: string }[] | null
  products: { id: string; name: string; access: string }[]
}

/** Em quais organizações a pessoa está, com que papel, quais planos e quais ferramentas cada uma libera. */
export async function accessOverview(db: Database, auth: Authenticated | null): Promise<OrgAccess[]> {
  const { userId } = requireUser(auth)
  const orgs = await db.asUser(
    { userId, orgId: auth!.session.activeOrgId },
    (tx) => tx`
    select o.id, o.name, m.role from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.user_id = ${userId} and m.status = 'active' and o.status = 'active' order by o.name`,
  )
  const out: OrgAccess[] = []
  for (const o of orgs) {
    const orgId = o.id as string
    const role = o.role as OrgRole
    out.push(
      await db.asUser({ userId, orgId }, async (tx) => {
        const plans = BILLING_ROLES.includes(role)
          ? (
              await tx`
              select p.name, s.status, s.current_period_end, s.provider from zro.subscriptions s join zro.plans p on p.id = s.plan_id
              where s.org_id = ${orgId} and s.status in ('active', 'trialing', 'past_due') order by s.created_at desc`
            ).map((s) => ({
              name: s.name as string,
              status: s.status as string,
              until: (s.current_period_end as Date) ?? null,
              provider: s.provider as string,
            }))
          : null
        const access = await productAccessFor(tx, orgId)
        return {
          id: orgId,
          name: o.name as string,
          role,
          active: orgId === auth!.session.activeOrgId,
          plans,
          products: access.map((a) => ({ id: a.productId, name: a.name, access: a.access })),
        }
      }),
    )
  }
  return out
}
