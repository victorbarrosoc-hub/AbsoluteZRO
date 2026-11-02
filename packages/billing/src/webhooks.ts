/**
 * Webhooks de cobrança (PRD §9.3): assinados, idempotentes, reconciliáveis e auditados.
 * Contrato neutro que cada adaptador de provedor (Stripe em stripe.ts; o "manual" assina com HMAC e serve ao console
 * e aos testes) converte antes de chegar aqui: assinatura (`subscription.*`, concede ou retira os níveis pelo plano)
 * e recarga da Z paga (`recarga.paga`, pagamento único). Acesso nunca nasce do retorno da página de checkout: só
 * daqui ou do console.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Database } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { z } from 'zod'
import { concederRecarga } from './admin'
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

export const SubscriptionEventSchema = z.object({
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

/** Pagamento único confirmado de uma recarga da Z (0055). `payment_ref` é o pagamento no provedor (sessão do checkout). */
export const RecargaEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('recarga.paga'),
  occurred_at: isoDate,
  data: z.object({
    org_id: z.uuid(),
    pacote: z.string().regex(/^[a-z0-9-]{1,40}$/),
    payment_ref: z.string().min(1).max(200),
    amount_cents: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    /** quem comprou (metadados do HUB), só para a auditoria */
    user_id: z.uuid().nullable().optional(),
  }),
})

export const BillingEventSchema = z.union([SubscriptionEventSchema, RecargaEventSchema])
export type BillingEvent = z.infer<typeof BillingEventSchema>
export type SubscriptionBillingEvent = z.infer<typeof SubscriptionEventSchema>
export type RecargaBillingEvent = z.infer<typeof RecargaEventSchema>

export type ApplyResult = {
  result: 'processed' | 'duplicate' | 'ignored' | 'failed'
  reason?: string
  subscriptionId?: string
  recargaId?: string
}

const date = (s: string | null | undefined) => (s ? new Date(s) : null)

/**
 * Dois eventos do mesmo segundo (o Stripe data em segundos; `created` com `incomplete` e `updated` com `active`
 * costumam empatar): o que chega depois só vale se não andar para trás. Encerrada é final.
 */
const AVANCO: Record<string, number> = { incomplete: 0, trialing: 1, active: 1, past_due: 1, canceled: 2, expired: 2 }

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
      const recarga = ev.type === 'recarga.paga'
      await audit(tx, {
        orgId: r.result === 'failed' && r.reason === 'organização desconhecida' ? null : ev.data.org_id,
        actorKind: 'provider',
        action: `billing.${ev.type}.${r.result}`,
        targetType: recarga ? 'z_recarga' : 'subscription',
        targetId: recarga ? (r.recargaId ?? null) : (r.subscriptionId ?? ev.data.subscription_id),
        metadata: recarga
          ? { provider, event: ev.id, pacote: ev.data.pacote, pagamento: ev.data.payment_ref, valor: ev.data.amount_cents, reason: r.reason }
          : { provider, event: ev.id, status: ev.data.status, plan: `${ev.data.plan_code}@${ev.data.plan_version}`, reason: r.reason },
      })
      return r
    }

    const [org] = await tx`select id from zro.organizations where id = ${ev.data.org_id}`
    if (!org) return finish({ result: 'failed', reason: 'organização desconhecida' })

    if (ev.type === 'recarga.paga') {
      const [pac] = await tx`select price_cents, currency from zro.z_recarga_pacotes where code = ${ev.data.pacote} and status in ('active', 'retired')`
      if (!pac) return finish({ result: 'failed', reason: 'pacote desconhecido' })
      // Pagou diferente do pacote (preço mudou no meio, cupom): vai para revisão, nada é concedido sozinho.
      if (Number(pac.price_cents) !== ev.data.amount_cents || String(pac.currency).toUpperCase() !== ev.data.currency.toUpperCase())
        return finish({ result: 'failed', reason: 'valor pago diferente do pacote' })
      const r = await concederRecarga(
        tx,
        { userId: ev.data.user_id ?? null, reason: `compra pelo ${provider}`, kind: 'provider' },
        { orgId: ev.data.org_id, pacote: ev.data.pacote, origem: 'compra', providerRef: `${provider}:${ev.data.payment_ref}` },
      )
      return finish(r.duplicate ? { result: 'ignored', reason: 'pagamento já registrado', recargaId: r.id } : { result: 'processed', recargaId: r.id })
    }

    const [plan] =
      await tx`select id, grace_days from zro.plans where code = ${ev.data.plan_code} and version = ${ev.data.plan_version} and status in ('active', 'retired')`
    if (!plan) return finish({ result: 'failed', reason: 'plano desconhecido ou em rascunho' })

    const [cur] = await tx`select * from zro.subscriptions where provider = ${provider} and provider_subscription_id = ${ev.data.subscription_id} for update`
    if (cur && cur.org_id !== ev.data.org_id)
      return finish({ result: 'failed', reason: 'assinatura pertence a outra organização', subscriptionId: cur.id as string })
    const occurred = new Date(ev.occurred_at)
    const status = ev.type === 'subscription.deleted' && !['canceled', 'expired'].includes(ev.data.status) ? 'canceled' : ev.data.status
    const prev = cur?.provider_updated_at as Date | null | undefined
    if (prev && prev > occurred) {
      return finish({ result: 'ignored', reason: 'evento mais antigo que o estado atual', subscriptionId: cur!.id as string })
    }
    if (prev && prev.getTime() === occurred.getTime() && AVANCO[status]! < AVANCO[cur!.status as string]!) {
      return finish({ result: 'ignored', reason: 'evento do mesmo instante com estado anterior', subscriptionId: cur!.id as string })
    }

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
