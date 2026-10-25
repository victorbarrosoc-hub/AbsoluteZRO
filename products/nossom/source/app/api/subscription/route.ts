import { currentAccount } from '@/lib/server/account';
import {
  allowRequest,
  privateHeaders,
  publicError,
  requestOrigin,
  sameOrigin,
} from '@/lib/server/ai-access';
import {
  applySubscription,
  catalogPlan,
  customerFor,
  getStripeSubscription,
  liveStatus,
  monthlyPrice,
  paidPlan,
  productFor,
  readSubscription,
  stripe,
  subscriptionsConfigured,
  type Subscription,
} from '@/lib/server/subscription';
export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
const view = (s: Subscription | null) =>
  s?.subscription_id
    ? {
        planId: s.plan_id,
        status: s.status,
        periodEnd: s.period_end,
        cancelAtPeriodEnd: s.cancel_at_period_end,
      }
    : null;
/** Whether paid plans can be bought here, and the person's current subscription. */
export async function GET(request: Request) {
  const enabled = subscriptionsConfigured(),
    account = await currentAccount(request);
  if (!enabled || !account) return reply({ enabled, subscription: null });
  try {
    return reply({ enabled, subscription: view(await readSubscription(account.id)) });
  } catch {
    return reply({ enabled, subscription: null, unavailable: true });
  }
}
/**
 * checkout: a Stripe Checkout page for a new monthly subscription.
 * change: moves an active subscription to the other plan; the difference is charged now and the
 *   change only takes effect if that payment succeeds.
 * portal: Stripe's own page to cancel, update the card or download invoices.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Origem não autorizada.' }, 403);
  const account = await currentAccount(request);
  if (!account) return reply({ error: 'Entre na sua conta.' }, 401);
  if (!subscriptionsConfigured())
    return reply({ error: 'As assinaturas ainda não estão disponíveis.' }, 503);
  if (!allowRequest('subscription:' + account.id, 10, 600000))
    return reply({ error: 'Aguarde alguns minutos e tente de novo.' }, 429);
  const raw = await request.text();
  if (raw.length > 500) return reply({ error: 'Pedido inválido.' }, 413);
  let body: { action?: unknown; plan?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: 'Pedido inválido.' }, 400);
  }
  const origin = requestOrigin(request);
  try {
    const current = await customerFor(account);
    const live = !!current.subscription_id && liveStatus(current.status);
    if (body.action === 'portal') {
      const portal = await stripe<{ url: string }>('/v1/billing_portal/sessions', {
        customer: current.customer_id,
        return_url: origin + '/studio/planos',
        locale: 'pt-BR',
      });
      return reply({ url: portal.url });
    }
    if (!paidPlan(body.plan) || (body.action !== 'checkout' && body.action !== 'change'))
      return reply({ error: 'Pedido inválido.' }, 400);
    if (live && current.plan_id === body.plan)
      return reply({ error: 'Você já assina este plano.' }, 409);
    const plan = await catalogPlan(body.plan),
      product = await productFor(plan);
    if (live) {
      if (body.action !== 'change')
        return reply({ error: 'Você já tem uma assinatura. Confirme a troca de plano.' }, 409);
      const sub = await getStripeSubscription(current.subscription_id!);
      const item = sub.items?.data?.[0];
      if (!item) return reply({ error: 'Não foi possível trocar o plano agora.' }, 503);
      const updated = await stripe<{ pending_update?: unknown }>(
        '/v1/subscriptions/' + encodeURIComponent(sub.id),
        {
          items: [{ id: item.id, price_data: monthlyPrice(plan, product) }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'pending_if_incomplete',
        },
        `change:${sub.id}:${plan.id}:${Math.floor(Date.now() / 60000)}`,
      );
      if (updated.pending_update)
        return reply(
          { error: 'O cartão não aprovou a diferença. Seu plano continua o mesmo.' },
          402,
        );
      return reply({ subscription: view(await applySubscription(sub.id)) });
    }
    if (body.action !== 'checkout') return reply({ error: 'Pedido inválido.' }, 400);
    const session = await stripe<{ url: string }>(
      '/v1/checkout/sessions',
      {
        mode: 'subscription',
        customer: current.customer_id,
        client_reference_id: account.id,
        line_items: [{ price_data: monthlyPrice(plan, product), quantity: 1 }],
        subscription_data: { metadata: { user_id: account.id, plan: plan.id } },
        success_url: origin + '/studio/planos?assinatura=ok',
        cancel_url: origin + '/studio/planos?assinatura=cancelada',
        locale: 'pt-BR',
      },
      // A double click within the same minute reuses the same Checkout page.
      `checkout:${account.id}:${plan.id}:${Math.floor(Date.now() / 60000)}`,
    );
    return reply({ url: session.url });
  } catch (error) {
    return reply({ error: publicError(error, 'Não foi possível abrir o pagamento agora.') }, 503);
  }
}
