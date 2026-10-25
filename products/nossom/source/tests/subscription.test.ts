import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { GET, POST } from '../app/api/subscription/route';
import { POST as webhook } from '../app/api/subscription/webhook/route';
import { eventSubscription, verifyStripeSignature } from '../lib/server/subscription';
import { authEnvironment, testCookie, testUser } from './helpers/auth';
const secret = 'whsec_test_placeholder';
function signed(payload: string, time = Math.floor(Date.now() / 1000), key = secret) {
  return `t=${time},v1=${createHmac('sha256', key).update(`${time}.${payload}`).digest('hex')}`;
}
function environment() {
  const restore = authEnvironment(),
    keys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'],
    old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-placeholder';
  return () => {
    restore();
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  };
}
test('Stripe signatures must match the secret and be recent; events name only a subscription id', () => {
  const body = '{"id":"evt_1"}';
  assert.equal(verifyStripeSignature(body, signed(body), secret), true);
  assert.equal(verifyStripeSignature(body + ' ', signed(body), secret), false);
  assert.equal(verifyStripeSignature(body, signed(body, undefined, 'whsec_other'), secret), false);
  assert.equal(
    verifyStripeSignature(body, signed(body, Math.floor(Date.now() / 1000) - 600), secret),
    false,
  );
  assert.equal(verifyStripeSignature(body, null, secret), false);
  assert.equal(
    eventSubscription({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }),
    'sub_1',
  );
  assert.equal(
    eventSubscription({
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_2' } },
    }),
    'sub_2',
  );
  assert.equal(
    eventSubscription({
      type: 'invoice.paid',
      data: { object: { parent: { subscription_details: { subscription: 'sub_3' } } } },
    }),
    'sub_3',
  );
  assert.equal(
    eventSubscription({ type: 'charge.succeeded', data: { object: { id: 'ch_1' } } }),
    null,
  );
  assert.equal(
    eventSubscription({ type: 'customer.subscription.updated', data: { object: { id: '../x' } } }),
    null,
  );
});
test('checkout uses the catalog price, one customer per account, and only signed events change the plan', async () => {
  const restore = environment(),
    before = globalThis.fetch;
  const calls: { url: string; body: string; key?: string }[] = [];
  let stored: Record<string, unknown> | null = null,
    applied: Record<string, string> = {},
    subscriptionStatus = 'active';
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = String(init?.body ?? '');
    calls.push({ url, body, key: (init?.headers as Record<string, string>)?.['Idempotency-Key'] });
    if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
    if (url.endsWith('/rpc/nossom_plan_catalog'))
      return Response.json([
        { id: 'free', name: 'Grátis', monthly_seconds: 300, price_cents: 0 },
        { id: 'essential', name: 'Essencial', monthly_seconds: 7200, price_cents: 3900 },
        { id: 'studio', name: 'Studio', monthly_seconds: 21600, price_cents: 9900 },
      ]);
    if (url.endsWith('/rpc/nossom_subscription')) {
      const { p_action, p_user, p_data } = JSON.parse(body);
      assert.equal(p_user, testUser.id);
      if (p_action === 'customer')
        stored = {
          customer_id: p_data.customerId,
          subscription_id: null,
          cancel_at_period_end: false,
        };
      if (p_action === 'apply') {
        applied = p_data;
        stored = {
          ...stored,
          subscription_id: p_data.subscriptionId,
          plan_id: p_data.planId,
          status: p_data.status,
          period_end: p_data.periodEnd,
        };
      }
      return Response.json({ subscription: stored });
    }
    if (url.endsWith('/v1/customers')) return Response.json({ id: 'cus_1' });
    if (url.endsWith('/v1/products/nossom_essential')) return Response.json({}, { status: 404 });
    if (url.endsWith('/v1/products')) return Response.json({ id: 'nossom_essential' });
    if (url.endsWith('/v1/checkout/sessions'))
      return Response.json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (url.endsWith('/v1/billing_portal/sessions'))
      return Response.json({ url: 'https://billing.stripe.com/p/session/test_1' });
    if (url.endsWith('/v1/subscriptions/sub_1'))
      return Response.json({
        id: 'sub_1',
        customer: 'cus_1',
        status: subscriptionStatus,
        metadata: { user_id: testUser.id, plan: 'studio' },
        items: {
          data: [
            { id: 'si_1', current_period_end: 1764547200, price: { product: 'nossom_essential' } },
          ],
        },
      });
    throw new Error('Unexpected request ' + url);
  };
  const request = (body: unknown, origin = 'http://localhost') =>
    new Request('http://localhost/api/subscription', {
      method: 'POST',
      headers: { cookie: testCookie(), origin },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await POST(request({ action: 'checkout', plan: 'essential' }, 'https://evil.test'))).status,
      403,
    );
    assert.equal((await POST(request({ action: 'checkout', plan: 'admin' }))).status, 400);
    const checkout = await POST(request({ action: 'checkout', plan: 'essential', price: 1 }));
    assert.equal(checkout.status, 200);
    assert.equal((await checkout.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_1');
    const session = new URLSearchParams(
      calls.find((c) => c.url.endsWith('/v1/checkout/sessions'))!.body,
    );
    assert.equal(session.get('mode'), 'subscription');
    assert.equal(session.get('customer'), 'cus_1');
    assert.equal(session.get('line_items[0][price_data][unit_amount]'), '3900');
    assert.equal(session.get('line_items[0][price_data][currency]'), 'brl');
    assert.equal(session.get('line_items[0][price_data][recurring][interval]'), 'month');
    assert.equal(session.get('subscription_data[metadata][user_id]'), testUser.id);
    assert.match(calls.find((c) => c.url.endsWith('/v1/checkout/sessions'))!.key!, /^checkout:/);
    // An unsigned or forged event changes nothing.
    const event = JSON.stringify({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active' } },
    });
    const hook = (signature: string) =>
      webhook(
        new Request('http://localhost/api/subscription/webhook', {
          method: 'POST',
          headers: { 'stripe-signature': signature },
          body: event,
        }),
      );
    assert.equal((await hook('t=1,v1=00')).status, 400);
    assert.deepEqual(applied, {});
    // A signed event applies the state read back from Stripe: the billed product, not the metadata.
    assert.equal((await hook(signed(event))).status, 200);
    assert.equal(applied.planId, 'essential');
    assert.equal(applied.customerId, 'cus_1');
    assert.equal(applied.periodEnd, '2025-12-01T00:00:00.000Z');
    // The same plan again is refused; the portal opens for the existing customer only.
    assert.equal((await POST(request({ action: 'checkout', plan: 'essential' }))).status, 409);
    const portal = await POST(request({ action: 'portal' }));
    assert.equal((await portal.json()).url, 'https://billing.stripe.com/p/session/test_1');
    assert.equal(calls.filter((c) => c.url.endsWith('/v1/customers')).length, 1);
    const status = await GET(
      new Request('http://localhost/api/subscription', { headers: { cookie: testCookie() } }),
    );
    const view = await status.json();
    assert.equal(view.enabled, true);
    assert.equal(view.subscription.planId, 'essential');
    assert.equal(view.subscription.customer_id, undefined);
    subscriptionStatus = 'canceled';
    assert.equal((await hook(signed(event))).status, 200);
    assert.equal(applied.status, 'canceled');
  } finally {
    globalThis.fetch = before;
    restore();
  }
});
test('without Stripe configured, paid plans stay on manual activation and the webhook refuses events', async () => {
  const restore = authEnvironment();
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const status = await GET(new Request('http://localhost/api/subscription'));
    assert.deepEqual(await status.json(), { enabled: false, subscription: null });
    const hook = await webhook(
      new Request('http://localhost/api/subscription/webhook', { method: 'POST', body: '{}' }),
    );
    assert.equal(hook.status, 503);
  } finally {
    restore();
  }
});
