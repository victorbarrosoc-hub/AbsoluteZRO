// Planos, Ciclo do O, webhooks e quotas (PRD §9, critérios de aceite §14).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { applyBillingEvent, cancelManualSubscription, checkEntitlement, consumeQuota, createPlanVersion, productAccessFor, publishPlanVersion, recomputeEntitlements, signPayload, subscriptionWindow, verifySignature } from '../src/index'
import { admin, giveLimits, givePlan, newOrgWithOwner, planId } from '../../../tests/integration/helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const check = (orgId: string, product: string, feature: string | null = null) => db.asSystem('t', (tx) => checkEntitlement(tx, orgId, product, feature))

describe('janela da assinatura', () => {
  const base = { id: 'x', current_period_start: new Date('2026-10-01'), current_period_end: new Date('2026-11-01'), cancel_at_period_end: false, canceled_at: null, grace_until: null, created_at: new Date('2026-10-01') }
  it('ativa vai até o fim do período; past_due até a carência; cancelada no fim do período vale até lá', () => {
    expect(subscriptionWindow({ ...base, status: 'active' })?.until).toEqual(new Date('2026-11-01'))
    expect(subscriptionWindow({ ...base, status: 'past_due', grace_until: new Date('2026-11-04') })?.until).toEqual(new Date('2026-11-04'))
    expect(subscriptionWindow({ ...base, status: 'canceled', cancel_at_period_end: true, canceled_at: new Date('2026-10-10') })?.until).toEqual(new Date('2026-11-01'))
    expect(subscriptionWindow({ ...base, status: 'canceled', canceled_at: new Date('2026-10-10') })).toBeNull()
    expect(subscriptionWindow({ ...base, status: 'incomplete' })).toBeNull()
  })
})

describe('casos de acesso (PRD §9.2)', () => {
  it('A: só SOBEDESCE → Synquei aparece para contratar e é negado', async () => {
    const o = await newOrgWithOwner(db, 'caso-a')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    expect((await check(o.orgId, 'sobedesce', 'manifest_import')).ok).toBe(true)
    const s = await check(o.orgId, 'synquei', 'organization_plan')
    expect(s).toMatchObject({ ok: false, code: 'entitlement_required' })
    const access = await db.asSystem('t', (tx) => productAccessFor(tx, o.orgId))
    expect(access.find((p) => p.productId === 'synquei')?.access).toBe('available')
    expect(access.find((p) => p.productId === 'sobedesce')?.access).toBe('contracted')
  })

  it('B: SOBEDESCE + Synquei → os dois liberados', async () => {
    const o = await newOrgWithOwner(db, 'caso-b')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    await givePlan(db, o.orgId, 'individual-synquei')
    expect((await check(o.orgId, 'synquei', 'organization_plan')).ok).toBe(true)
    expect((await check(o.orgId, 'nossom')).ok).toBe(false)
  })

  it('C: Ciclo do O libera as cinco ferramentas lançadas; as futuras seguem indisponíveis', async () => {
    const o = await newOrgWithOwner(db, 'caso-c')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    for (const p of ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'nossom']) expect((await check(o.orgId, p)).ok, p).toBe(true)
    expect(await check(o.orgId, 'ai-edit')).toMatchObject({ ok: false, code: 'product_unavailable' })
    expect(await check(o.orgId, 'finishing')).toMatchObject({ ok: false, code: 'product_unavailable' })
  })

  it('D: cancelamento imediato bloqueia; no fim do período mantém até lá', async () => {
    const o = await newOrgWithOwner(db, 'caso-d')
    const adminId = await admin(db)
    const sub = await givePlan(db, o.orgId, 'individual-synquei')
    await db.asSystem('t', (tx) => cancelManualSubscription(tx, { userId: adminId, reason: 'teste' }, { subscriptionId: sub, atPeriodEnd: true }))
    expect((await check(o.orgId, 'synquei')).ok).toBe(true)
    await db.asSystem('t', (tx) => cancelManualSubscription(tx, { userId: adminId, reason: 'teste' }, { subscriptionId: sub, atPeriodEnd: false }))
    expect((await check(o.orgId, 'synquei')).ok).toBe(false)
    // nada é apagado: a assinatura e o histórico continuam
    const [s] = await db.sql`select status from zro.subscriptions where id = ${sub}`
    expect(s!.status).toBe('canceled')
  })

  it('período vencido sem renovação deixa de valer', async () => {
    const o = await newOrgWithOwner(db, 'vencido')
    await givePlan(db, o.orgId, 'individual-tpeasy', new Date(Date.now() + 60_000))
    expect((await check(o.orgId, 'tpeasy')).ok).toBe(true)
    await db.asSystem('t', (tx) => tx`update zro.entitlements set ends_at = now() - interval '1 second' where org_id = ${o.orgId}`)
    expect((await check(o.orgId, 'tpeasy')).ok).toBe(false)
  })

  it('feature fora do plano é negada', async () => {
    const o = await newOrgWithOwner(db, 'feature')
    const adminId = await admin(db)
    const { id } = await db.asSystem('t', (tx) => createPlanVersion(tx, { userId: adminId, reason: 't' }, { code: `so-export-${randomUUID().slice(0, 6)}`, name: 'Só exportar', kind: 'individual', priceCents: null, currency: null, billingInterval: null, trialDays: null, graceDays: 0, products: [{ productId: 'tpeasy', features: ['script_export'], limits: {} }] }))
    await db.asSystem('t', (tx) => publishPlanVersion(tx, { userId: adminId, reason: 't' }, id))
    await db.asSystem('t', async (tx) => {
      await tx`insert into zro.subscriptions (org_id, plan_id, status, current_period_end, provider, provider_subscription_id) values (${o.orgId}, ${id}, 'active', now() + interval '1 day', 'manual', ${'m-' + randomUUID()})`
      await recomputeEntitlements(tx, o.orgId)
    })
    expect((await check(o.orgId, 'tpeasy', 'script_export')).ok).toBe(true)
    expect(await check(o.orgId, 'tpeasy', 'script_import')).toMatchObject({ ok: false, code: 'feature_not_included' })
  })
})

describe('webhook de cobrança', () => {
  const secret = 'segredo-de-teste'
  const event = (orgId: string, over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
    id: `evt_${randomUUID()}`,
    type: 'subscription.updated',
    occurred_at: new Date().toISOString(),
    ...over,
    data: { org_id: orgId, subscription_id: 'sub_1', plan_code: 'ciclo-do-o', plan_version: 1, status: 'active', current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...data },
  })

  it('assinatura HMAC confere, com tolerância de tempo', () => {
    const body = '{"a":1}'
    const h = signPayload(body, secret)
    expect(verifySignature(body, h, secret)).toBe(true)
    expect(verifySignature(body + ' ', h, secret)).toBe(false)
    expect(verifySignature(body, h, 'outro')).toBe(false)
    expect(verifySignature(body, signPayload(body, secret, Math.floor(Date.now() / 1000) - 3600), secret)).toBe(false)
    expect(verifySignature(body, null, secret)).toBe(false)
  })

  it('ativa, é idempotente e ignora evento mais velho', async () => {
    const o = await newOrgWithOwner(db, 'webhook')
    const subId = `sub_${randomUUID()}`
    const e1 = event(o.orgId, {}, { subscription_id: subId })
    expect((await applyBillingEvent(db, 'manual', e1)).result).toBe('processed')
    expect((await applyBillingEvent(db, 'manual', e1)).result).toBe('duplicate')
    expect((await check(o.orgId, 'nossom')).ok).toBe(true)
    const old = event(o.orgId, { occurred_at: new Date(Date.now() - 3_600_000).toISOString() }, { subscription_id: subId, status: 'canceled' })
    expect((await applyBillingEvent(db, 'manual', old)).result).toBe('ignored')
    expect((await check(o.orgId, 'nossom')).ok).toBe(true)
    const del = event(o.orgId, { type: 'subscription.deleted', occurred_at: new Date(Date.now() + 1000).toISOString() }, { subscription_id: subId, status: 'canceled' })
    expect((await applyBillingEvent(db, 'manual', del)).result).toBe('processed')
    expect((await check(o.orgId, 'nossom')).ok).toBe(false)
  })

  it('pagamento falhou: carência do plano e depois bloqueio', async () => {
    const o = await newOrgWithOwner(db, 'carencia')
    const subId = `sub_${randomUUID()}`
    await db.asSystem('t', (tx) => tx`update zro.plans set grace_days = 3 where code = 'individual-synquei' and version = 1`)
    const ended = new Date(Date.now() - 86_400_000).toISOString()
    const r = await applyBillingEvent(db, 'manual', event(o.orgId, {}, { subscription_id: subId, plan_code: 'individual-synquei', status: 'past_due', current_period_end: ended }))
    expect(r.result).toBe('processed')
    expect((await check(o.orgId, 'synquei')).ok).toBe(true)
    await db.asSystem('t', async (tx) => {
      await tx`update zro.subscriptions set grace_until = now() - interval '1 minute' where provider_subscription_id = ${subId}`
      await recomputeEntitlements(tx, o.orgId)
    })
    expect((await check(o.orgId, 'synquei')).ok).toBe(false)
    await db.asSystem('t', (tx) => tx`update zro.plans set grace_days = 0 where code = 'individual-synquei' and version = 1`)
  })

  it('organização ou plano desconhecidos ficam registrados como falha, sem conceder nada', async () => {
    const r1 = await applyBillingEvent(db, 'manual', event(randomUUID()))
    expect(r1).toMatchObject({ result: 'failed', reason: 'organização desconhecida' })
    const o = await newOrgWithOwner(db, 'plano-x')
    const r2 = await applyBillingEvent(db, 'manual', event(o.orgId, {}, { subscription_id: `sub_${randomUUID()}`, plan_code: 'nao-existe' }))
    expect(r2.result).toBe('failed')
    const [e] = await db.sql`select status, error from zro.billing_events where provider_event_id is not null order by received_at desc limit 1`
    expect(e!.status).toBe('failed')
  })

  it('assinatura de uma organização não muda de dono por evento', async () => {
    const a = await newOrgWithOwner(db, 'dono-a')
    const b = await newOrgWithOwner(db, 'dono-b')
    const subId = `sub_${randomUUID()}`
    await applyBillingEvent(db, 'manual', event(a.orgId, {}, { subscription_id: subId }))
    const r = await applyBillingEvent(db, 'manual', event(b.orgId, { occurred_at: new Date(Date.now() + 1000).toISOString() }, { subscription_id: subId }))
    expect(r).toMatchObject({ result: 'failed', reason: 'assinatura pertence a outra organização' })
    expect((await check(b.orgId, 'synquei')).ok).toBe(false)
  })

  it('evento fora do contrato é recusado', async () => {
    await expect(applyBillingEvent(db, 'manual', { id: 'x' })).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('quotas', () => {
  it('sem limite configurado a operação medida é bloqueada', async () => {
    const o = await newOrgWithOwner(db, 'quota-0')
    await givePlan(db, o.orgId, 'individual-synquei')
    const r = await db.asSystem('t', (tx) => consumeQuota(tx, { orgId: o.orgId, metric: 'synquei.organization_plans', idempotencyKey: 'k1' }))
    expect(r).toMatchObject({ ok: false, code: 'quota_not_configured' })
  })

  it('consome até o limite, é idempotente e seguro em concorrência', async () => {
    const o = await newOrgWithOwner(db, 'quota-1')
    await giveLimits(db, o.orgId, 'synquei', { 'synquei.organization_plans': 3 })
    const use = (k: string) => db.asSystem('t', (tx) => consumeQuota(tx, { orgId: o.orgId, metric: 'synquei.organization_plans', idempotencyKey: k }))
    expect(await use('a')).toMatchObject({ ok: true, used: 1, limit: 3 })
    expect(await use('a')).toMatchObject({ ok: true, duplicate: true, used: 1 })
    const parallel = await Promise.all(['b', 'c', 'd', 'e', 'f'].map(use))
    expect(parallel.filter((r) => r.ok)).toHaveLength(2)
    expect(parallel.filter((r) => !r.ok && r.code === 'quota_exceeded')).toHaveLength(3)
    const [q] = await db.sql`select used, limit_value from zro.quotas where org_id = ${o.orgId}`
    expect(Number(q!.used)).toBe(3)
  })

  it('o maior limite entre as fontes vale', async () => {
    const o = await newOrgWithOwner(db, 'quota-2')
    await giveLimits(db, o.orgId, 'synquei', { 'synquei.organization_plans': 1 })
    await giveLimits(db, o.orgId, 'synquei', { 'synquei.organization_plans': 5 })
    const r = await db.asSystem('t', (tx) => consumeQuota(tx, { orgId: o.orgId, metric: 'synquei.organization_plans', idempotencyKey: 'z' }))
    expect(r).toMatchObject({ ok: true, limit: 5 })
  })
})

describe('catálogo versionado', () => {
  it('nova versão começa em rascunho; publicar aposenta a anterior para novas vendas', async () => {
    const adminId = await admin(db)
    const code = `plano-${randomUUID().slice(0, 6)}`
    const v1 = await db.asSystem('t', (tx) => createPlanVersion(tx, { userId: adminId, reason: 't' }, { code, name: 'X', kind: 'bundle', priceCents: null, currency: null, billingInterval: null, trialDays: null, graceDays: 0, products: [] }))
    await db.asSystem('t', (tx) => publishPlanVersion(tx, { userId: adminId, reason: 't' }, v1.id))
    const v2 = await db.asSystem('t', (tx) => createPlanVersion(tx, { userId: adminId, reason: 't' }, { code, name: 'X2', kind: 'bundle', priceCents: null, currency: null, billingInterval: null, trialDays: null, graceDays: 0, products: [] }))
    expect(v2.version).toBe(2)
    await db.asSystem('t', (tx) => publishPlanVersion(tx, { userId: adminId, reason: 't' }, v2.id))
    const rows = await db.sql`select version, status from zro.plans where code = ${code} order by version`
    expect(rows.map((r) => r.status)).toEqual(['retired', 'active'])
    expect(await planId(db, code, 2)).toBe(v2.id)
  })
})
