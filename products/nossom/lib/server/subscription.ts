import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabase, supabaseConfig } from './supabase';
import type { Plan } from '../plans';
// Monthly card subscriptions through Stripe's REST API. Card data never touches NOSSOM:
// Stripe Checkout collects it, and the plan follows the subscription Stripe reports back.
export type PaidPlan = 'essential' | 'studio';
export type Subscription = {
  customer_id: string;
  subscription_id: string | null;
  plan_id: PaidPlan | null;
  status: string | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
};
export class SubscriptionError extends Error {}
export function subscriptionsConfigured() {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_WEBHOOK_SECRET &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!supabaseConfig()
  );
}
export const paidPlan = (value: unknown): value is PaidPlan =>
  value === 'essential' || value === 'studio';
/** Statuses that keep the paid plan: Stripe is still collecting or the period is paid. */
export const liveStatus = (status: string | null | undefined) =>
  status === 'active' || status === 'trialing' || status === 'past_due';
function form(data: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(data).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) return [];
    if (Array.isArray(value))
      return value.flatMap((item, i) =>
        typeof item === 'object'
          ? form(item as Record<string, unknown>, `${name}[${i}]`)
          : [`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`],
      );
    if (typeof value === 'object') return form(value as Record<string, unknown>, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`];
  });
}
export async function stripe<T>(
  path: string,
  data?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new SubscriptionError('As assinaturas ainda não estão disponíveis.');
  const base = (process.env.STRIPE_API_URL || 'https://api.stripe.com').replace(/\/$/, '');
  const response = await fetch(base + path, {
    method: data ? 'POST' : 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(data ? { body: form(data).join('&') } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new SubscriptionError('Não foi possível falar com o pagamento agora.');
    (error as SubscriptionError & { code?: string }).code = body?.error?.code;
    throw error;
  }
  return body as T;
}
async function rpc(action: string, user: string, data: Record<string, unknown> = {}) {
  const config = supabaseConfig(),
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new SubscriptionError('As assinaturas ainda não estão disponíveis.');
  const response = await fetch(config.url + '/rest/v1/rpc/nossom_subscription', {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_action: action, p_user: user, p_data: data }),
  });
  if (!response.ok) throw new SubscriptionError('Não foi possível consultar sua assinatura.');
  return ((await response.json()) as { subscription: Subscription | null }).subscription;
}
export const readSubscription = (user: string) => rpc('get', user);
/** One Stripe customer per account, created once and remembered in the database. */
export async function customerFor(account: { id: string; email: string; name: string }) {
  const existing = await rpc('get', account.id);
  if (existing) return existing;
  const customer = await stripe<{ id: string }>(
    '/v1/customers',
    { email: account.email, name: account.name, metadata: { user_id: account.id } },
    'customer:' + account.id,
  );
  return (await rpc('customer', account.id, { customerId: customer.id }))!;
}
/** The plan price comes from the NOSSOM catalog the ADM edits, never from the browser. */
export async function catalogPlan(id: PaidPlan) {
  const plans = await supabase<Plan[]>('/rest/v1/rpc/nossom_plan_catalog', {
    method: 'POST',
    body: {},
  });
  const plan = plans.find((p) => p.id === id);
  if (!plan || plan.price_cents < 100)
    throw new SubscriptionError('Este plano não está disponível.');
  return plan;
}
/** A fixed product per plan, so Checkout and plan changes share it. */
export async function productFor(plan: Plan) {
  const id = 'nossom_' + plan.id;
  try {
    await stripe(`/v1/products/${id}`);
  } catch {
    await stripe(
      '/v1/products',
      { id, name: 'Quasar ' + plan.name, metadata: { plan: plan.id } },
      'product:' + id,
    );
  }
  return id;
}
export const monthlyPrice = (plan: Plan, product: string) => ({
  currency: 'brl',
  product,
  unit_amount: plan.price_cents,
  recurring: { interval: 'month' },
});
type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  pending_update?: unknown;
  items?: {
    data: { id: string; current_period_end?: number; price?: { product?: string } }[];
  };
};
export const getStripeSubscription = (id: string) =>
  stripe<StripeSubscription>('/v1/subscriptions/' + encodeURIComponent(id));
/** Mirrors the subscription as Stripe reports it now, whatever order the events arrived in. */
export async function applySubscription(id: string) {
  const sub = await getStripeSubscription(id);
  const item = sub.items?.data?.[0];
  // The plan is the product actually billed, so a plan change counts only once it is paid.
  const user = sub.metadata?.user_id,
    plan = item?.price?.product?.replace(/^nossom_/, '') ?? sub.metadata?.plan;
  // Newer API versions report the period on the item; older ones on the subscription.
  const end = item?.current_period_end ?? sub.current_period_end;
  if (!user || !paidPlan(plan) || !end) return null;
  return rpc('apply', user, {
    customerId: sub.customer,
    subscriptionId: sub.id,
    planId: plan,
    status: sub.status,
    periodEnd: new Date(end * 1000).toISOString(),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
}
/** Stripe-Signature check: HMAC-SHA256 over "timestamp.payload", within five minutes. */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || header.length > 2000) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const time = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(time) || Math.abs(now / 1000 - time) > 300) return false;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${time}.${payload}`).digest('hex'),
  );
  return parts.some(([k, v]) => {
    if (k !== 'v1' || !v) return false;
    const actual = Buffer.from(v);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
/** The subscription an event is about, wherever this event type and API version keep it. */
export function eventSubscription(event: {
  type?: string;
  data?: { object?: Record<string, any> };
}): string | null {
  const object = event.data?.object;
  if (!object || typeof event.type !== 'string') return null;
  let id: unknown = null;
  if (event.type.startsWith('customer.subscription.')) id = object.id;
  else if (event.type === 'checkout.session.completed') id = object.subscription;
  else if (event.type.startsWith('invoice.'))
    id = object.subscription ?? object.parent?.subscription_details?.subscription;
  return typeof id === 'string' && /^sub_[A-Za-z0-9]{1,200}$/.test(id) ? id : null;
}
