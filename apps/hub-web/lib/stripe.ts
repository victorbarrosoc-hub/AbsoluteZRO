import 'server-only'
import type { StripeConfig } from '@zro/billing'

/** Chaves do Stripe só no ambiente da Vercel (nunca no repositório). Sem as duas, a venda online fica fechada. */
export function stripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  return secretKey && stripeWebhookSecret() ? { secretKey } : null
}

export function stripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || ''
}
