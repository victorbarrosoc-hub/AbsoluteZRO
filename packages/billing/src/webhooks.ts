/**
 * Webhooks de cobrança (PRD §9.3): assinados, idempotentes, reconciliáveis e auditados.
 * O provedor de pagamento ainda não foi escolhido. Este é o contrato neutro que qualquer adaptador de provedor
 * (Stripe, Pagar.me, Asaas…) converte antes de chegar aqui; o adaptador "manual" assina com HMAC e serve ao
 * console interno e aos testes. Acesso nunca nasce do retorno da página de checkout: só daqui ou do console.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { z } from 'zod'
import { recomputeEntitlements } from './entitlements'

export const SIGNATURE_HEADER = 'zro-signature'
const TOLERANCE_S = 300

/** Cabeçalho `t=<unix>,v1=<hex>` com HMAC-SHA256 de `${t}.${corpo}`. */
export function signPayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

export function verifySignature(rawBody: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const t = Number(parts.t)
  if (!Number.isInteger(t) || Math.abs(now - t) > TOLERANCE_S || !parts.v1 || !/^[0-9a-f]{64}$/.test(parts.v1)) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'), 'hex')
  return timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'))
}

const isoDate = z.iso.datetime({ offset: true })

export const BillingEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(['subscription.updated', 'subscription.deleted']),
  occurred_at: isoDate,
  data: z.object({
    /** Organização gravada pelo HUB nos metadados ao criar a cobrança; nunca vem do navegador. */
    org_id: z.uuid(),
    subscription_id: z.string().min(1).max(200),
    customer_id: z.string().max(200).optional(),
    plan_code: z.string().regex(/^[a-z0-9-]+$/),
    plan_version: z.number().int().positive(),
    status: z.enum(['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired']),
    current_period_start: isoDate.nullable().optional(),
    current_period_end: isoDate.nullable().optional(),
    cancel_at_period_end: z.boolean().optional(),
    canceled_at: isoDate.nullable().optional(),
  }),
})
export type BillingEvent = z.infer<typeof BillingEventSchema>

export type ApplyResult = { result: 'processed' | 'duplicate' | 'ignored' | 'failed'; reason?: string; subscriptionId?: string }

const date = (s: string | null | undefined) => (s ? new Date(s) : null)

export async function applyBillingEvent(db: Database, provider: string, raw: unknown): Promise<ApplyResult> {
  if (!/^[a-z0-9_-]+$/.test(provider)) throw new DomainError('invalid_input', 'Provedor inválido.')
  const parsed = BillingEventSchema.safeParse(raw)
  if (!parsed.success) throw new DomainError('invalid_input', 'Evento de cobrança fora do contrato.', { issues: parsed.error.issues.length })
  const ev = parsed.data
  return db.asSystem(`billing: webhook ${provider}`, async (tx) => {
    const [stored] = await tx`
      insert into zro.billing_events (provider, provider_event_id, type, occurred_at, payload, org_id)
      values (${provider}, ${ev.id}, ${ev.type}, ${ev.occurred_at}, ${tx.json(ev as never)},
              (select id from zro.organizations where id = ${ev.data.org_id}))
      on conflict (provider, provider_event_id) do nothing
      returning id`
    if (!stored) return { result: 'duplicate' } satisfies ApplyResult
    const finish = async (r: ApplyResult) => {
      await tx`update zro.billing_events set status = ${r.result === 'processed' ? 'processed' : r.result}, processed_at = now(), error = ${r.reason ?? null}
               where id = ${stored.id as string}`
      await audit(tx, {
        orgId: r.result === 'failed' && r.reason === 'organização desconhecida' ? null : ev.data.org_id,
        actorKind: 'provider',
        action: `billing.${ev.type}.${r.result}`,
        targetType: 'subscription',
        targetId: r.subscriptionId ?? ev.data.subscription_id,
        metadata: { provider, event: ev.id, status: ev.data.status, plan: `${ev.data.plan_code}@${ev.data.plan_version}`, reason: r.reason },
      })
      return r
    }

    const [org] = await tx`select id from zro.organizations where id = ${ev.data.org_id}`
    if (!org) return finish({ result: 'failed', reason: 'organização desconhecida' })
    const [plan] = await tx`select id, grace_days from zro.plans where code = ${ev.data.plan_code} and version = ${ev.data.plan_version} and status in ('active', 'retired')`
    if (!plan) return finish({ result: 'failed', reason: 'plano desconhecido ou em rascunho' })

    const [cur] = await tx`select * from zro.subscriptions where provider = ${provider} and provider_subscription_id = ${ev.data.subscription_id} for update`
    if (cur && cur.org_id !== ev.data.org_id) return finish({ result: 'failed', reason: 'assinatura pertence a outra organização', subscriptionId: cur.id as string })
    const occurred = new Date(ev.occurred_at)
    if (cur?.provider_updated_at && (cur.provider_updated_at as Date) > occurred) {
      return finish({ result: 'ignored', reason: 'evento mais antigo que o estado atual', subscriptionId: cur.id as string })
    }

    const status = ev.type === 'subscription.deleted' && !['canceled', 'expired'].includes(ev.data.status) ? 'canceled' : ev.data.status
    const periodEnd = date(ev.data.current_period_end)
    let graceUntil: Date | null = null
    if (status === 'past_due') {
      const base = periodEnd && periodEnd > occurred ? periodEnd : occurred
      graceUntil = (cur?.grace_until as Date) ?? new Date(base.getTime() + Number(plan.grace_days) * 86_400_000)
    }
    const values = {
      org_id: ev.data.org_id,
      plan_id: plan.id as string,
      status,
      current_period_start: date(ev.data.current_period_start),
      current_period_end: periodEnd,
      cancel_at_period_end: ev.data.cancel_at_period_end ?? false,
      canceled_at: date(ev.data.canceled_at) ?? (status === 'canceled' ? occurred : null),
      grace_until: graceUntil,
      provider,
      provider_subscription_id: ev.data.subscription_id,
      provider_customer_id: ev.data.customer_id ?? null,
      provider_updated_at: occurred,
    }
    const [sub] = cur
      ? await tx`update zro.subscriptions set ${tx(values)} where id = ${cur.id as string} returning id`
      : await tx`insert into zro.subscriptions ${tx(values)} returning id`
    await recomputeEntitlements(tx, ev.data.org_id)
    return finish({ result: 'processed', subscriptionId: sub!.id as string })
  })
}
