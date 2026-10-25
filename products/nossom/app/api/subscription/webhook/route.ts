import {
  applySubscription,
  eventSubscription,
  subscriptionsConfigured,
  verifyStripeSignature,
} from '@/lib/server/subscription';
export const runtime = 'nodejs';
/**
 * Stripe events about subscriptions. Only signed events are read, and only for the subscription
 * id they name: the state applied is fetched back from Stripe's API, never taken from the body.
 * A failure answers 500 so Stripe retries; applying the same state again is harmless.
 */
export async function POST(request: Request) {
  if (!subscriptionsConfigured()) return new Response(null, { status: 503 });
  const payload = await request.text();
  if (payload.length > 500000) return new Response(null, { status: 413 });
  if (
    !verifyStripeSignature(
      payload,
      request.headers.get('stripe-signature'),
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  )
    return new Response(null, { status: 400 });
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = eventSubscription(event);
  if (!id) return Response.json({ received: true });
  try {
    await applySubscription(id);
    return Response.json({ received: true });
  } catch {
    return new Response(null, { status: 500 });
  }
}
