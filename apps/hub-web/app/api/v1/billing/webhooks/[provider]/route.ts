import { applyBillingEvent, SIGNATURE_HEADER, STRIPE_SIGNATURE_HEADER, stripeEventToBillingEvent, verifySignature, verifyStripeSignature } from '@zro/billing'
import { getDatabase } from '@zro/db'
import { createLogger } from '@zro/observability'
import { errorResponse, json } from '@/lib/api'
import { stripeWebhookSecret } from '@/lib/stripe'

const log = createLogger('billing-webhook')

/**
 * Webhook de cobrança. Sem sessão e sem checagem de origem: a prova é a assinatura do provedor.
 * - stripe: assinatura `Stripe-Signature` com STRIPE_WEBHOOK_SECRET; o evento é traduzido para o contrato neutro.
 * - outros (ex.: manual): habilitados em ZRO_BILLING_PROVIDERS, HMAC com ZRO_BILLING_WEBHOOK_SECRET_<PROVEDOR>.
 * Sem segredo configurado, o endpoint não existe (404).
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (provider === 'stripe') return stripe(req)
  const allowed = (process.env.ZRO_BILLING_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const secret = process.env[`ZRO_BILLING_WEBHOOK_SECRET_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] || ''
  if (!allowed.includes(provider) || !secret) return json({ error: 'not_found' }, 404)
  const raw = await req.text()
  if (raw.length > 1_000_000) return json({ error: 'invalid_input' }, 413)
  if (!verifySignature(raw, req.headers.get(SIGNATURE_HEADER), secret)) {
    log.warn('webhook.bad_signature', { provider })
    return json({ error: 'invalid_signature' }, 400)
  }
  try {
    const r = await applyBillingEvent(getDatabase(), provider, JSON.parse(raw))
    // 200 também para duplicado e ignorado: o provedor não precisa reenviar. Falha fica registrada para reconciliação.
    return json(r, 200)
  } catch (err) {
    return errorResponse(err)
  }
}

async function stripe(req: Request) {
  const secret = stripeWebhookSecret()
  if (!secret) return json({ error: 'not_found' }, 404)
  const raw = await req.text()
  if (raw.length > 1_000_000) return json({ error: 'invalid_input' }, 413)
  if (!verifyStripeSignature(raw, req.headers.get(STRIPE_SIGNATURE_HEADER), secret)) {
    log.warn('webhook.bad_signature', { provider: 'stripe' })
    return json({ error: 'invalid_signature' }, 400)
  }
  try {
    const ev = stripeEventToBillingEvent(JSON.parse(raw))
    if (!ev) return json({ result: 'ignored' }, 200)
    return json(await applyBillingEvent(getDatabase(), 'stripe', ev), 200)
  } catch (err) {
    return errorResponse(err)
  }
}
