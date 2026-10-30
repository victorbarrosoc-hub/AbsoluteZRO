'use server'
import { revalidatePath } from 'next/cache'
import { assignPlan, cancelManualSubscription, createPlanVersion, grantEntitlement, launchSales, publishPlanVersion, revokeEntitlement } from '@zro/billing'
import { OAuthError, registerClient } from '@zro/auth'
import { requirePlatformAdmin, resolvePlanRequest, resolverDenunciaSet } from '@zro/core'
import { pgErrorCode, PG } from '@zro/db'
import { DomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { stripeConfig } from '../stripe'
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

/** Campo simples "créditos de IA por mês" do console: vira o limite zro.ai_credits (vazio = não mexe). */
function withAiCredits(limits: Record<string, number>, raw: string): Record<string, number> {
  if (!raw.trim()) return limits
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new DomainError('invalid_input', 'Créditos de IA: um número inteiro de 0 a 1.000.000.')
  return { ...limits, 'zro.ai_credits': n }
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
    revalidatePath('/admin', 'layout')
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
    revalidatePath('/admin', 'layout')
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
        limits: withAiCredits(parseLimits(String(fd.get('limits') ?? '')), str(fd, 'aiCredits')),
        endsAt: date(str(fd, 'until')),
      }),
    )
    revalidatePath('/admin', 'layout')
    return { ok: 'Concessão criada.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function revokeGrantAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    await db().asSystem('admin: revogar concessão', (tx) => revokeEntitlement(tx, actor, str(fd, 'entitlementId')))
    revalidatePath('/admin', 'layout')
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
    revalidatePath('/admin', 'layout')
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
    revalidatePath('/admin', 'layout')
    return { ok: 'Versão publicada. As anteriores ficam só para quem já assinou.' }
  } catch (e) {
    return toFormError(e)
  }
}

/** Login único: cadastra um app como cliente. O segredo aparece uma vez, aqui. */
export async function registerOAuthClientAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const kind = str(fd, 'kind') === 'public' ? 'public' : 'confidential'
    const r = await db().asSystem('admin: cadastrar app no login único', async (tx) => {
      const out = await registerClient(tx, {
        id: str(fd, 'clientId'),
        name: str(fd, 'name'),
        productId: str(fd, 'productId') || null,
        kind,
        redirectUris: str(fd, 'redirectUris').split(/\s+/),
        allowLoopback: fd.get('allowLoopback') === 'on',
        trusted: fd.get('trusted') === 'on',
        createdBy: actor.userId,
      })
      await tx`insert into zro.audit_logs (actor_user_id, actor_kind, action, target_type, target_id, metadata)
               values (${actor.userId}, 'admin', 'oauth_client.created', 'oauth_client', ${out.clientId}, ${tx.json({ reason: actor.reason, kind })})`
      return out
    })
    revalidatePath('/admin', 'layout')
    return {
      ok: r.clientSecret
        ? `App cadastrado. client_id: ${r.clientId} · client_secret (copie agora, não aparece de novo): ${r.clientSecret}`
        : `App cadastrado. client_id: ${r.clientId} (app público: sem segredo, usa PKCE).`,
    }
  } catch (e) {
    if (e instanceof OAuthError) return { error: e.description }
    if (pgErrorCode(e) === PG.uniqueViolation) return { error: 'Já existe um app com esse identificador.' }
    return toFormError(e)
  }
}

export async function setOAuthClientStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const status = str(fd, 'status') === 'active' ? 'active' : 'disabled'
    const id = str(fd, 'clientId')
    await db().asSystem('admin: status de app no login único', async (tx) => {
      await tx`update zro.oauth_clients set status = ${status} where id = ${id}`
      if (status === 'disabled') await tx`update zro.oauth_refresh_tokens set revoked_at = now() where client_id = ${id} and revoked_at is null`
      await tx`insert into zro.audit_logs (actor_user_id, actor_kind, action, target_type, target_id, metadata)
               values (${actor.userId}, 'admin', ${`oauth_client.${status}`}, 'oauth_client', ${id}, ${tx.json({ reason: actor.reason })})`
    })
    revalidatePath('/admin', 'layout')
    return { ok: status === 'active' ? 'App reativado.' : 'App desativado e sessões dele encerradas.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function resolvePlanRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    await db().asSystem('admin: atender pedido de plano', (tx) => resolvePlanRequest(tx, actor, str(fd, 'requestId')))
    revalidatePath('/admin', 'layout')
    return { ok: 'Pedido marcado como atendido.' }
  } catch (e) {
    return toFormError(e)
  }
}

/** Ligar as vendas: teste do Completo para conta nova e data de corte do grátis antigo (só admin, com motivo). */
export async function launchSalesAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    if (!stripeConfig()) throw new DomainError('conflict', 'Coloque STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET na Vercel antes.')
    const cutoff = new Date(`${str(fd, 'cutoff')}T23:59:59-03:00`)
    if (Number.isNaN(cutoff.getTime())) throw new DomainError('invalid_input', 'Escolha a data de corte.')
    const trialDays = Number(str(fd, 'trialDays') || '7')
    const r = await db().asSystem('admin: ligar vendas', (tx) => launchSales(tx, actor, { cutoff, trialDays }))
    revalidatePath('/admin', 'layout')
    return { ok: `Vendas ligadas. ${r.grandfathered} organizações seguem liberadas até a data de corte.` }
  } catch (e) {
    return toFormError(e)
  }
}

/** Denúncia do Set resolvida (ADR 0032): admin ou suporte; a auditoria guarda quem resolveu. */
export async function resolverDenunciaSetAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const u = requirePlatformAdmin(await getAuth(), ['admin', 'support'])
    await db().asSystem('admin: resolver denúncia do Set', (tx) => resolverDenunciaSet(tx, u.userId, str(fd, 'id')))
    revalidatePath('/admin/denuncias')
    return { ok: 'Denúncia resolvida.' }
  } catch (e) {
    return toFormError(e)
  }
}
