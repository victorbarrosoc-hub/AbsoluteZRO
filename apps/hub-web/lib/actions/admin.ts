'use server'
import { revalidatePath } from 'next/cache'
import { assignPlan, cancelManualSubscription, createPlanVersion, grantEntitlement, publishPlanVersion, revokeEntitlement } from '@zro/billing'
import { requirePlatformAdmin } from '@zro/core'
import { DomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

async function adminActor(fd: FormData) {
  const u = requirePlatformAdmin(await getAuth())
  const reason = str(fd, 'reason')
  if (!reason) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  return { userId: u.userId, reason }
}

function parseLimits(raw: string): Record<string, number> {
  if (!raw.trim()) return {}
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    throw new DomainError('invalid_input', 'Limites precisam ser JSON, ex.: {"synquei.organization_plans": 50}')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new DomainError('invalid_input', 'Limites precisam ser um objeto JSON.')
  return v as Record<string, number>
}

const date = (s: string) => {
  if (!s) return null
  const d = new Date(`${s}T23:59:59-03:00`)
  if (Number.isNaN(d.getTime())) throw new DomainError('invalid_input', 'Data inválida.')
  return d
}

export async function assignPlanAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    await db().asSystem('admin: conceder plano', (tx) =>
      assignPlan(tx, actor, { orgId: str(fd, 'orgId'), planId: str(fd, 'planId'), periodEnd: date(str(fd, 'until')) }),
    )
    revalidatePath('/admin')
    return { ok: 'Plano concedido e acessos recalculados.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function cancelSubscriptionAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    await db().asSystem('admin: cancelar assinatura', (tx) =>
      cancelManualSubscription(tx, actor, { subscriptionId: str(fd, 'subscriptionId'), atPeriodEnd: str(fd, 'when') === 'end' }),
    )
    revalidatePath('/admin')
    return { ok: 'Assinatura cancelada.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function grantAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const features = str(fd, 'features')
    await db().asSystem('admin: concessão', (tx) =>
      grantEntitlement(tx, actor, {
        orgId: str(fd, 'orgId'),
        productId: str(fd, 'productId'),
        features: features
          ? features
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        limits: parseLimits(String(fd.get('limits') ?? '')),
        endsAt: date(str(fd, 'until')),
      }),
    )
    revalidatePath('/admin')
    return { ok: 'Concessão criada.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function revokeGrantAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    await db().asSystem('admin: revogar concessão', (tx) => revokeEntitlement(tx, actor, str(fd, 'entitlementId')))
    revalidatePath('/admin')
    return { ok: 'Concessão revogada.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function createPlanVersionAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const products = JSON.parse(String(fd.get('products') ?? '[]')) as { productId: string; features: string[] | null; limits: Record<string, number> }[]
    if (!Array.isArray(products)) throw new DomainError('invalid_input', 'Produtos precisam ser uma lista JSON.')
    const price = str(fd, 'priceCents')
    const kind = str(fd, 'kind') as 'free' | 'individual' | 'bundle' | 'team'
    const r = await db().asSystem('admin: nova versão de plano', (tx) =>
      createPlanVersion(tx, actor, {
        code: str(fd, 'code'),
        name: str(fd, 'name'),
        kind,
        description: str(fd, 'description'),
        priceCents: price ? Number(price) : null,
        currency: str(fd, 'currency') || null,
        billingInterval: (str(fd, 'interval') || null) as 'month' | 'year' | null,
        trialDays: str(fd, 'trialDays') ? Number(str(fd, 'trialDays')) : null,
        graceDays: Number(str(fd, 'graceDays') || 0),
        products,
      }),
    )
    revalidatePath('/admin')
    return { ok: `Rascunho criado: versão ${r.version}. Publique para valer em novas vendas.` }
  } catch (e) {
    if (e instanceof SyntaxError) return { error: 'Produtos precisam ser JSON válido.' }
    return toFormError(e)
  }
}

export async function publishPlanAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    await db().asSystem('admin: publicar plano', (tx) => publishPlanVersion(tx, actor, str(fd, 'planId')))
    revalidatePath('/admin')
    return { ok: 'Versão publicada. As anteriores ficam só para quem já assinou.' }
  } catch (e) {
    return toFormError(e)
  }
}
