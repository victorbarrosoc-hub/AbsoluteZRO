/**
 * Adaptador Stripe (decisão do titular em 26/10/2026). Fala com a API por fetch, sem SDK.
 * - Checkout: o preço vem do plano versionado no banco (price_data), então não há produto a cadastrar no Stripe.
 *   A organização e o plano vão nos metadados da assinatura; nunca do navegador.
 * - Webhook: confere a assinatura `Stripe-Signature` e traduz customer.subscription.* para o contrato neutro de
 *   webhooks.ts. O acesso só muda por esse caminho.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { DomainError } from '@zro/observability'
import type { BillingEvent } from './webhooks'

export const STRIPE_SIGNATURE_HEADER = 'stripe-signature'
const API = 'https://api.stripe.com/v1'
const TOLERANCE_S = 300

export type StripeConfig = { secretKey: string; fetch?: typeof fetch }

/** Corpo application/x-www-form-urlencoded no formato do Stripe (a[b][0][c]=…). */
export function stripeForm(params: Record<string, unknown>): string {
  const out = new URLSearchParams()
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x))
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(prefix ? `${prefix}[${k}]` : k, x)
    else out.append(prefix, String(v))
  }
  walk('', params)
  return out.toString()
}

async function call<T>(cfg: StripeConfig, path: string, params: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const res = await (cfg.fetch ?? fetch)(`${API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: stripeForm(params),
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new DomainError('upstream_unavailable', 'O pagamento não respondeu agora. Tente de novo em instantes.', { status: res.status })
  return body
}

export type CheckoutInput = {
  orgId: string
  userId: string
  email: string
  customerId: string | null
  plan: { code: string; version: number; name: string; price_cents: number; currency: string; billing_interval: 'month' | 'year' }
  successUrl: string
  cancelUrl: string
}

export async function createCheckoutSession(cfg: StripeConfig, input: CheckoutInput): Promise<{ id: string; url: string }> {
  const meta = { org_id: input.orgId, plan_code: input.plan.code, plan_version: String(input.plan.version), user_id: input.userId }
  return call(cfg, '/checkout/sessions', {
    mode: 'subscription',
    client_reference_id: input.orgId,
    ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.plan.currency.toLowerCase(),
          unit_amount: input.plan.price_cents,
          recurring: { interval: input.plan.billing_interval },
          product_data: { name: `${input.plan.name} (${input.plan.billing_interval === 'year' ? 'anual' : 'mensal'})` },
        },
      },
    ],
    subscription_data: { metadata: meta },
    metadata: meta,
    locale: 'pt-BR',
    allow_promotion_codes: true,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  })
}

export async function createPortalSession(cfg: StripeConfig, input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
  return call(cfg, '/billing_portal/sessions', { customer: input.customerId, return_url: input.returnUrl, locale: 'pt-BR' })
}

/** `Stripe-Signature: t=<unix>,v1=<hex>[,v1=…]`: HMAC-SHA256 de `${t}.${corpo}` com o segredo do endpoint. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false
  let t = NaN
  const sigs: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=', 2)
    if (k === 't') t = Number(v)
    else if (k === 'v1' && v && /^[0-9a-f]{64}$/.test(v)) sigs.push(v)
  }
  if (!Number.isInteger(t) || Math.abs(now - t) > TOLERANCE_S || !sigs.length) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'), 'hex')
  return sigs.some((s) => timingSafeEqual(expected, Buffer.from(s, 'hex')))
}

const STATUS: Record<string, BillingEvent['data']['status']> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'expired',
  paused: 'expired',
}

type StripeSubscription = {
  id: string
  customer: string | { id: string }
  status: string
  cancel_at_period_end?: boolean
  canceled_at?: number | null
  current_period_start?: number
  current_period_end?: number
  items?: { data?: { current_period_start?: number; current_period_end?: number }[] }
  metadata?: Record<string, string>
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null)

/**
 * Evento do Stripe → contrato neutro. Devolve null para o que não muda acesso (o webhook responde "ignorado").
 * Assinatura sem os metadados do HUB (criada à mão no painel do Stripe) também fica de fora.
 */
export function stripeEventToBillingEvent(event: { id: string; type: string; created: number; data: { object: unknown } }): BillingEvent | null {
  if (!['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) return null
  const sub = event.data.object as StripeSubscription
  const m = sub.metadata ?? {}
  const version = Number(m.plan_version)
  if (!m.org_id || !m.plan_code || !Number.isInteger(version)) return null
  const item = sub.items?.data?.[0]
  return {
    id: event.id,
    type: event.type === 'customer.subscription.deleted' ? 'subscription.deleted' : 'subscription.updated',
    occurred_at: new Date(event.created * 1000).toISOString(),
    data: {
      org_id: m.org_id,
      subscription_id: sub.id,
      customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      plan_code: m.plan_code,
      plan_version: version,
      status: STATUS[sub.status] ?? 'incomplete',
      // Versões novas da API levam o período para o item da assinatura.
      current_period_start: iso(item?.current_period_start ?? sub.current_period_start),
      current_period_end: iso(item?.current_period_end ?? sub.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      canceled_at: iso(sub.canceled_at),
    },
  }
}
