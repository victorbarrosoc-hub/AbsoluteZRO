/**
 * Adaptador Stripe (ADR 0019; oferta nova na ADR 0040). Fala com a API por fetch, sem SDK.
 * - Checkout de assinatura (Órbita, Absoluto, Avulso; mensal ou anual): o preço vem do plano versionado no banco
 *   (price_data), então não há produto a cadastrar no Stripe. Organização e plano vão nos metadados da assinatura;
 *   nunca do navegador.
 * - Checkout de pagamento único (recargas da Z): preço do pacote no banco, metadados `tipo: recarga_z`.
 * - Webhook: confere a assinatura `Stripe-Signature` e traduz customer.subscription.* e o checkout pago da recarga
 *   (checkout.session.completed / async_payment_succeeded) para o contrato neutro de webhooks.ts. O acesso e a
 *   recarga só mudam por esse caminho.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { DomainError } from '@zro/observability'
import type { BillingEvent, RecargaBillingEvent, SubscriptionBillingEvent } from './webhooks'

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

/** Metadado que marca o checkout de uma recarga da Z (e o distingue de qualquer outro pagamento único da conta). */
export const RECARGA_TIPO = 'recarga_z'

export type RecargaCheckoutInput = {
  orgId: string
  userId: string
  email: string
  customerId: string | null
  pacote: { code: string; mensagens: number; centavos: number; moeda: string; validade_meses: number }
  successUrl: string
  cancelUrl: string
}

/**
 * Pagamento único de uma recarga. Sem cupom: o webhook confere que o valor pago é o preço do pacote. A chave de
 * idempotência evita duas sessões para o mesmo clique repetido.
 */
export async function createRecargaCheckoutSession(
  cfg: StripeConfig,
  input: RecargaCheckoutInput,
  idempotencyKey?: string,
): Promise<{ id: string; url: string }> {
  const meta = { tipo: RECARGA_TIPO, org_id: input.orgId, pacote: input.pacote.code, user_id: input.userId }
  return call(
    cfg,
    '/checkout/sessions',
    {
      mode: 'payment',
      client_reference_id: input.orgId,
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.pacote.moeda.toLowerCase(),
            unit_amount: input.pacote.centavos,
            product_data: {
              name: `Z: +${input.pacote.mensagens.toLocaleString('pt-BR')} mensagens`,
              description: `Valem ${input.pacote.validade_meses} meses. Usadas depois da franquia do mês.`,
            },
          },
        },
      ],
      payment_intent_data: { metadata: meta },
      metadata: meta,
      locale: 'pt-BR',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    idempotencyKey,
  )
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

const STATUS: Record<string, SubscriptionBillingEvent['data']['status']> = {
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

type StripeCheckoutSession = {
  id: string
  mode?: string
  payment_status?: string
  amount_total?: number | null
  currency?: string | null
  metadata?: Record<string, string> | null
}

type StripeEvent = { id: string; type: string; created: number; data: { object: unknown } }

const SUBSCRIPTION_EVENTS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']
/** Checkout pago: na hora (cartão) ou depois (boleto: completed chega "unpaid" e o pagamento vem no async). */
const RECARGA_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']

/** Os eventos que o endpoint do Stripe precisa assinar (o titular marca no painel; docs/runbooks e ADR 0040). */
export const STRIPE_WEBHOOK_EVENTS = [...SUBSCRIPTION_EVENTS, ...RECARGA_EVENTS] as const

/**
 * Evento do Stripe → contrato neutro. Devolve null para o que não muda acesso nem recarga (o webhook responde
 * "ignorado"): outro tipo, assinatura sem os metadados do HUB (criada à mão no painel), checkout de assinatura (quem
 * muda o acesso é customer.subscription.*), checkout ainda não pago.
 */
export function stripeEventToBillingEvent(event: StripeEvent): BillingEvent | null {
  if (SUBSCRIPTION_EVENTS.includes(event.type)) return subscriptionEvent(event)
  if (RECARGA_EVENTS.includes(event.type)) return recargaEvent(event)
  return null
}

function recargaEvent(event: StripeEvent): RecargaBillingEvent | null {
  const s = event.data.object as StripeCheckoutSession
  const m = s.metadata ?? {}
  if (s.mode !== 'payment' || m.tipo !== RECARGA_TIPO || !m.org_id || !m.pacote) return null
  if (s.payment_status !== 'paid' || s.amount_total == null || !s.currency) return null
  return {
    id: event.id,
    type: 'recarga.paga',
    occurred_at: new Date(event.created * 1000).toISOString(),
    data: {
      org_id: m.org_id,
      pacote: m.pacote,
      payment_ref: s.id,
      amount_cents: s.amount_total,
      currency: s.currency.toUpperCase(),
      user_id: m.user_id || null,
    },
  }
}

function subscriptionEvent(event: StripeEvent): SubscriptionBillingEvent | null {
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
