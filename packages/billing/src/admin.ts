/**
 * Operações do console de administração (PRD §4.1, §9.1). Quem chama já conferiu o papel de plataforma;
 * tudo roda como sistema e fica na auditoria com actor_kind = 'admin'.
 */
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { recomputeEntitlements } from './entitlements'

type Actor = { userId: string; reason: string }

/** Concessão manual de um plano (venda fora do provedor, parceria, cortesia). Fica como provider "manual". */
export async function assignPlan(tx: Queryable, actor: Actor, input: { orgId: string; planId: string; periodEnd: Date | null }): Promise<string> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo da concessão.')
  const [plan] = await tx`select id, code, version, status from zro.plans where id = ${input.planId}`
  if (!plan || plan.status !== 'active') throw new DomainError('invalid_input', 'Só planos ativos podem ser concedidos.')
  const [sub] = await tx`
    insert into zro.subscriptions (org_id, plan_id, status, current_period_start, current_period_end, provider, provider_subscription_id, provider_updated_at)
    values (${input.orgId}, ${input.planId}, 'active', now(), ${input.periodEnd}, 'manual', ${'manual-' + crypto.randomUUID()}, now())
    returning id`
  await recomputeEntitlements(tx, input.orgId)
  await audit(tx, {
    orgId: input.orgId,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.plan_assigned',
    targetType: 'subscription',
    targetId: sub!.id as string,
    metadata: { plan: `${plan.code}@${plan.version}`, until: input.periodEnd?.toISOString() ?? null, reason: actor.reason },
  })
  return sub!.id as string
}

/** Encerra uma assinatura manual agora ou no fim do período. Assinaturas de provedor mudam pelo webhook. */
export async function cancelManualSubscription(tx: Queryable, actor: Actor, input: { subscriptionId: string; atPeriodEnd: boolean }): Promise<void> {
  const [sub] = await tx`select id, org_id, provider from zro.subscriptions where id = ${input.subscriptionId} for update`
  if (!sub) throw new DomainError('not_found', 'Assinatura não encontrada.')
  if (sub.provider !== 'manual') throw new DomainError('conflict', 'Assinaturas de provedor mudam pelo provedor (webhook).')
  if (input.atPeriodEnd) {
    await tx`update zro.subscriptions set status = 'canceled', cancel_at_period_end = true, canceled_at = now() where id = ${sub.id as string}`
  } else {
    await tx`update zro.subscriptions set status = 'canceled', cancel_at_period_end = false, canceled_at = now(), current_period_end = least(coalesce(current_period_end, now()), now()) where id = ${sub.id as string}`
  }
  await recomputeEntitlements(tx, sub.org_id as string)
  await audit(tx, {
    orgId: sub.org_id as string,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.subscription_canceled',
    targetType: 'subscription',
    targetId: sub.id as string,
    metadata: { atPeriodEnd: input.atPeriodEnd, reason: actor.reason },
  })
}

export async function grantEntitlement(
  tx: Queryable,
  actor: Actor,
  input: { orgId: string; productId: string; features: string[] | null; limits: Record<string, number>; endsAt: Date | null },
): Promise<string> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo da concessão.')
  for (const [k, v] of Object.entries(input.limits)) {
    if (!/^[a-z0-9-]+\.[a-z0-9_]+$/.test(k) || !Number.isSafeInteger(v) || v < 0) throw new DomainError('invalid_input', `Limite inválido: ${k}`)
  }
  const [row] = await tx`
    insert into zro.entitlements (org_id, product_id, features, limits, source, ends_at, reason, created_by)
    values (${input.orgId}, ${input.productId}, ${input.features}, ${tx.json(input.limits)}, 'admin_grant', ${input.endsAt}, ${actor.reason}, ${actor.userId})
    returning id`
  await audit(tx, {
    orgId: input.orgId,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.entitlement_granted',
    targetType: 'entitlement',
    targetId: row!.id as string,
    metadata: { product: input.productId, limits: input.limits, until: input.endsAt?.toISOString() ?? null, reason: actor.reason },
  })
  return row!.id as string
}

export async function revokeEntitlement(tx: Queryable, actor: Actor, entitlementId: string): Promise<void> {
  const [row] =
    await tx`update zro.entitlements set status = 'revoked', reason = ${actor.reason} where id = ${entitlementId} and source = 'admin_grant' and status = 'active' returning org_id`
  if (!row) throw new DomainError('not_found', 'Concessão ativa não encontrada (assinaturas são revogadas pela assinatura).')
  await audit(tx, {
    orgId: row.org_id as string,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.entitlement_revoked',
    targetType: 'entitlement',
    targetId: entitlementId,
    metadata: { reason: actor.reason },
  })
}

/**
 * Nova versão de plano (rascunho). Plano publicado nunca muda: limites e produtos novos = versão nova.
 * Assinaturas existentes continuam na versão que contrataram.
 */
export async function createPlanVersion(
  tx: Queryable,
  actor: Actor,
  input: {
    code: string
    name: string
    kind: 'free' | 'individual' | 'bundle' | 'team'
    description?: string
    priceCents: number | null
    currency: string | null
    billingInterval: 'month' | 'year' | null
    trialDays: number | null
    graceDays: number
    products: { productId: string; features: string[] | null; limits: Record<string, number> }[]
  },
): Promise<{ id: string; version: number }> {
  const [last] = await tx`select coalesce(max(version), 0)::int as v from zro.plans where code = ${input.code}`
  const version = (last!.v as number) + 1
  const [plan] = await tx`
    insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description)
    values (${input.code}, ${version}, ${input.name}, ${input.kind}, 'draft', ${input.priceCents}, ${input.currency}, ${input.billingInterval}, ${input.trialDays}, ${input.graceDays}, ${input.description ?? ''})
    returning id`
  for (const p of input.products) {
    await tx`insert into zro.plan_products (plan_id, product_id, features, limits) values (${plan!.id as string}, ${p.productId}, ${p.features}, ${tx.json(p.limits)})`
  }
  await audit(tx, {
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'catalog.plan_version_created',
    targetType: 'plan',
    targetId: plan!.id as string,
    metadata: { code: input.code, version, reason: actor.reason },
  })
  return { id: plan!.id as string, version }
}

/** Publica um rascunho e aposenta as versões anteriores para novas vendas. */
export async function publishPlanVersion(tx: Queryable, actor: Actor, planId: string): Promise<void> {
  const [plan] = await tx`update zro.plans set status = 'active' where id = ${planId} and status = 'draft' returning code, version`
  if (!plan) throw new DomainError('conflict', 'Só rascunhos podem ser publicados.')
  await tx`update zro.plans set status = 'retired' where code = ${plan.code as string} and version < ${plan.version as number} and status = 'active'`
  await audit(tx, {
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'catalog.plan_published',
    targetType: 'plan',
    targetId: planId,
    metadata: { code: plan.code, version: plan.version, reason: actor.reason },
  })
}

/** Assinaturas que o console troca à mão: as manuais e a do plano grátis automático. O resto é de provedor. */
export const HAND_MANAGED_PROVIDERS = ['manual', 'free'] as const

/** Nome do provedor para a interface ("stripe" → "Stripe"). */
export function providerLabel(provider: string): string {
  if (provider === 'free') return 'Grátis'
  if (provider === 'manual') return 'Manual'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Troca o plano de uma organização pelo painel de pessoas: encerra agora as assinaturas manuais e grátis ativas e
 * concede o plano escolhido como assinatura manual (assignPlan). Organização paga por provedor externo (Stripe)
 * não muda aqui: a troca é feita no provedor e chega pelo webhook.
 */
export async function changeOrgPlan(
  tx: Queryable,
  actor: Actor,
  input: { orgId: string; planId: string; periodEnd?: Date | null },
): Promise<{ subscriptionId: string; canceled: number }> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo da troca.')
  // Uma troca por vez em cada organização.
  const [org] = await tx`select id from zro.organizations where id = ${input.orgId} for update`
  if (!org) throw new DomainError('not_found', 'Organização não encontrada.')
  const [plan] = await tx`select id, code, version, status from zro.plans where id = ${input.planId}`
  if (!plan || plan.status !== 'active') throw new DomainError('invalid_input', 'Só planos ativos podem ser escolhidos.')
  const current = await tx`
    select s.id, s.provider, s.plan_id, p.code, p.version from zro.subscriptions s join zro.plans p on p.id = s.plan_id
    where s.org_id = ${input.orgId} and s.status in ('active', 'trialing', 'past_due')
    for update of s`
  const external = current.find((s) => !(HAND_MANAGED_PROVIDERS as readonly string[]).includes(s.provider as string))
  if (external) {
    throw new DomainError('conflict', `Pago pelo ${providerLabel(external.provider as string)}: a troca é feita lá.`)
  }
  if (current.length === 1 && current[0]!.plan_id === input.planId) throw new DomainError('conflict', 'A organização já está nesse plano.')
  for (const s of current) {
    await tx`update zro.subscriptions set status = 'canceled', cancel_at_period_end = false, canceled_at = now(),
               current_period_end = least(coalesce(current_period_end, now()), now())
             where id = ${s.id as string}`
    await audit(tx, {
      orgId: input.orgId,
      actorUserId: actor.userId,
      actorKind: 'admin',
      action: 'billing.subscription_canceled',
      targetType: 'subscription',
      targetId: s.id as string,
      metadata: { atPeriodEnd: false, provider: s.provider, plan: `${s.code}@${s.version}`, reason: actor.reason },
    })
  }
  const subscriptionId = await assignPlan(tx, actor, { orgId: input.orgId, planId: input.planId, periodEnd: input.periodEnd ?? null })
  await audit(tx, {
    orgId: input.orgId,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.plan_changed',
    targetType: 'organization',
    targetId: input.orgId,
    metadata: { from: current.map((s) => `${s.code}@${s.version}`), to: `${plan.code}@${plan.version}`, reason: actor.reason },
  })
  return { subscriptionId, canceled: current.length }
}
