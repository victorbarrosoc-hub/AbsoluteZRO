// Vendas pelo Stripe (decisão do titular em 26/10/2026): checkout, webhook, teste de 7 dias e data de corte.
import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import {
  applyBillingEvent,
  checkEntitlement,
  createCheckoutSession,
  featureFlagsFor,
  grantEntitlement,
  grantReleaseAccess,
  isFeatureFlag,
  productAccessFor,
  launchSales,
  recomputeEntitlements,
  salesStatus,
  stripeEventToBillingEvent,
  stripeForm,
  verifyStripeSignature,
} from '../src/index'
import { admin, newOrgWithOwner } from '../../../tests/integration/helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sign = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`

const subEvent = (over: Record<string, unknown> = {}, meta: Record<string, string> = {}, type = 'customer.subscription.updated') => ({
  id: `evt_${randomUUID().slice(0, 8)}`,
  type,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: `sub_${randomUUID().slice(0, 8)}`,
      customer: 'cus_teste',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ current_period_start: 1793000000, current_period_end: 1795600000 }] },
      metadata: { org_id: randomUUID(), plan_code: 'individual-synquei', plan_version: '2', ...meta },
      ...over,
    },
  },
})

describe('preços à venda', () => {
  it('avulso R$ 59,90/mês ou R$ 449/ano; Completo R$ 149,90 ou R$ 1.499; Pro R$ 299,90 ou R$ 2.999; créditos de IA por plano', async () => {
    const rows = await db.sql`select code, price_cents, billing_interval from zro.plans where status = 'active' and kind <> 'free' order by code`
    const by = Object.fromEntries(rows.map((r) => [r.code as string, r]))
    expect(by['ciclo-do-o']).toMatchObject({ price_cents: 14990, billing_interval: 'month' })
    expect(by['ciclo-do-o-anual']).toMatchObject({ price_cents: 149900, billing_interval: 'year' })
    expect(by['absolute-zro-pro']).toMatchObject({ price_cents: 29990, billing_interval: 'month' })
    expect(by['absolute-zro-pro-anual']).toMatchObject({ price_cents: 299900, billing_interval: 'year' })
    for (const app of ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'nossom']) {
      expect(by[`individual-${app}`]).toMatchObject({ price_cents: 5990, billing_interval: 'month' })
      expect(by[`individual-${app}-anual`]).toMatchObject({ price_cents: 44900, billing_interval: 'year' })
    }
    const credits = await db.sql`
      select p.code, count(*)::int as n, min((pp.limits ->> 'zro.ai_credits')::int) as ai from zro.plan_products pp join zro.plans p on p.id = pp.plan_id
      where p.status = 'active' and p.code in ('individual-nossom', 'ciclo-do-o', 'absolute-zro-pro', 'absolute-zro-pro-anual') group by p.code order by p.code`
    expect(credits.map((r) => `${r.code}:${r.n}:${r.ai}`)).toEqual([
      'absolute-zro-pro:7:2000',
      'absolute-zro-pro-anual:7:2000',
      'ciclo-do-o:7:600',
      'individual-nossom:1:200',
    ])
    const [anual] = await db.sql`select count(*)::int as n from zro.plan_products pp join zro.plans p on p.id = pp.plan_id where p.code = 'ciclo-do-o-anual'`
    expect(anual!.n).toBe(7)
  })
})

describe('Maestro com a sua marca (0025)', () => {
  it('adicional R$ 89,90/mês ou R$ 899/ano e o Pro v2 com o sinal, tudo em rascunho; o Pro publicado não muda', async () => {
    const rows = await db.sql`
      select p.code, p.version, p.status, p.price_cents, p.billing_interval, pp.features, pp.limits
      from zro.plans p join zro.plan_products pp on pp.plan_id = p.id and pp.product_id = 'maestro'
      where p.code like 'maestro-marca-propria%' or p.code like 'absolute-zro-pro%' order by p.code, p.version`
    expect(rows.map((r) => `${r.code}@${r.version}:${r.status}:${r.price_cents}:${r.billing_interval}`)).toEqual([
      'absolute-zro-pro@2:draft:29990:month',
      'absolute-zro-pro-anual@2:draft:299900:year',
      'maestro-marca-propria@1:draft:8990:month',
      'maestro-marca-propria-anual@1:draft:89900:year',
    ])
    for (const r of rows) {
      expect(r.features).toEqual([])
      expect(r.limits).toEqual({ 'maestro.marca_propria': 1 })
    }
    // Pro v2 = as 7 ferramentas da v1 (com os mesmos créditos) + o sinal do Maestro
    const [n] = await db.sql`
      select count(*)::int as n, max((pp.limits ->> 'zro.ai_credits')::int) as ai from zro.plan_products pp join zro.plans p on p.id = pp.plan_id
      where p.code = 'absolute-zro-pro' and p.version = 2 and pp.product_id <> 'maestro'`
    expect(n).toMatchObject({ n: 7, ai: 2000 })
    // nenhum rascunho aparece à venda
    const [vend] = await db.sql`select count(*)::int as n from zro.plans where status = 'active' and code like 'maestro-marca-propria%'`
    expect(vend!.n).toBe(0)
  })

  it('o adicional dá só o sinal: não abre o Maestro nem conta como ferramenta contratada', async () => {
    const o = await newOrgWithOwner(db, 'marca-propria')
    const adminId = await admin(db)
    await db.asSystem('t', (tx) =>
      grantEntitlement(
        tx,
        { userId: adminId, reason: 'teste do adicional' },
        { orgId: o.orgId, productId: 'maestro', features: [], limits: { 'maestro.marca_propria': 1 }, endsAt: null },
      ),
    )
    const check = await db.asSystem('t', (tx) => checkEntitlement(tx, o.orgId, 'maestro', null))
    expect(check).toMatchObject({ ok: false, code: 'entitlement_required' })
    const acesso = await db.asSystem('t', (tx) => productAccessFor(tx, o.orgId, { userId: o.userId }))
    expect(acesso.find((a) => a.productId === 'maestro')?.source).toBeNull()
    // o Maestro está fechado (0024): sem a pessoa na lista, nem o sinal sai
    expect(await db.asSystem('t', (tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).toEqual([])
    await db.asSystem('t', (tx) =>
      grantReleaseAccess(tx, { userId: adminId, reason: 'teste' }, { productId: 'maestro', userId: o.userId, kind: 'tester', channels: ['sso'], endsAt: null }),
    )
    expect(await db.asSystem('t', (tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).toEqual(['maestro.marca_propria'])
    // outra organização não herda o sinal
    const b = await newOrgWithOwner(db, 'marca-propria-b')
    expect(await db.asSystem('t', (tx) => featureFlagsFor(tx, b.orgId, { userId: o.userId }))).toEqual([])
    expect(isFeatureFlag('maestro.marca_propria')).toBe(true)
    expect(isFeatureFlag('zro.ai_credits')).toBe(false)
  })
})

describe('Stripe: formulário, assinatura e tradução', () => {
  it('monta o corpo no formato do Stripe', () => {
    const q = new URLSearchParams(stripeForm({ mode: 'subscription', line_items: [{ price_data: { unit_amount: 1990 } }], x: null }))
    expect(q.get('mode')).toBe('subscription')
    expect(q.get('line_items[0][price_data][unit_amount]')).toBe('1990')
    expect(q.has('x')).toBe(false)
  })

  it('aceita só assinatura válida e recente', () => {
    const body = '{"id":"evt_1"}'
    expect(verifyStripeSignature(body, sign(body, 'whsec_a'), 'whsec_a')).toBe(true)
    expect(verifyStripeSignature(body, sign(body, 'whsec_b'), 'whsec_a')).toBe(false)
    expect(verifyStripeSignature(body + ' ', sign(body, 'whsec_a'), 'whsec_a')).toBe(false)
    expect(verifyStripeSignature(body, sign(body, 'whsec_a', Math.floor(Date.now() / 1000) - 600), 'whsec_a')).toBe(false)
    expect(verifyStripeSignature(body, null, 'whsec_a')).toBe(false)
  })

  it('traduz assinatura; ignora evento de outro tipo e assinatura sem os dados do HUB', () => {
    const e = subEvent({ status: 'unpaid' })
    const ev = stripeEventToBillingEvent(e)!
    expect(ev.type).toBe('subscription.updated')
    expect(ev.data).toMatchObject({ status: 'past_due', plan_code: 'individual-synquei', plan_version: 2, customer_id: 'cus_teste' })
    expect(ev.data.current_period_end).toBe(new Date(1795600000 * 1000).toISOString())
    expect(stripeEventToBillingEvent(subEvent({ status: 'incomplete_expired' }))!.data.status).toBe('expired')
    expect(stripeEventToBillingEvent(subEvent({}, {}, 'customer.subscription.deleted'))!.type).toBe('subscription.deleted')
    expect(stripeEventToBillingEvent({ ...subEvent(), type: 'invoice.paid' })).toBeNull()
    expect(stripeEventToBillingEvent(subEvent({ metadata: {} }))).toBeNull()
  })

  it('checkout leva preço, organização e plano nos metadados da assinatura', async () => {
    let sent = ''
    const fake = (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }), { status: 200 })
    }) as typeof fetch
    const orgId = randomUUID()
    const r = await createCheckoutSession(
      { secretKey: 'sk_test_x', fetch: fake },
      {
        orgId,
        userId: randomUUID(),
        email: 'p@teste.local',
        customerId: null,
        plan: { code: 'ciclo-do-o', version: 2, name: 'Absolute ZRO Completo', price_cents: 4990, currency: 'BRL', billing_interval: 'month' },
        successUrl: 'https://absolutezro.com/perfil/plano?assinatura=ok',
        cancelUrl: 'https://absolutezro.com/perfil/plano',
      },
    )
    expect(r.url).toContain('checkout.stripe.com')
    const q = new URLSearchParams(sent)
    expect(q.get('mode')).toBe('subscription')
    expect(q.get('line_items[0][price_data][currency]')).toBe('brl')
    expect(q.get('line_items[0][price_data][unit_amount]')).toBe('4990')
    expect(q.get('line_items[0][price_data][recurring][interval]')).toBe('month')
    expect(q.get('subscription_data[metadata][org_id]')).toBe(orgId)
    expect(q.get('subscription_data[metadata][plan_code]')).toBe('ciclo-do-o')
    expect(q.get('customer_email')).toBe('p@teste.local')
  })

  it('erro do Stripe vira mensagem curta, sem detalhes do provedor', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: 'No such customer' } }), { status: 400 })) as unknown as typeof fetch
    await expect(
      createCheckoutSession(
        { secretKey: 'sk_test_x', fetch: fake },
        {
          orgId: randomUUID(),
          userId: randomUUID(),
          email: 'p@teste.local',
          customerId: 'cus_x',
          plan: { code: 'individual-tpeasy', version: 2, name: 'TPeasy', price_cents: 1990, currency: 'BRL', billing_interval: 'month' },
          successUrl: 'https://a',
          cancelUrl: 'https://b',
        },
      ),
    ).rejects.toMatchObject({ code: 'upstream_unavailable' })
  })

  it('evento do Stripe libera a ferramenta assinada; repetido não duplica', async () => {
    const o = await newOrgWithOwner(db, 'stripe-synquei')
    const e = subEvent({}, { org_id: o.orgId })
    const ev = stripeEventToBillingEvent(e)!
    expect(await applyBillingEvent(db, 'stripe', ev)).toMatchObject({ result: 'processed' })
    expect(await applyBillingEvent(db, 'stripe', ev)).toMatchObject({ result: 'duplicate' })
    const [s] = await db.sql`select status, provider_customer_id from zro.subscriptions where org_id = ${o.orgId} and provider = 'stripe'`
    expect(s).toMatchObject({ status: 'active', provider_customer_id: 'cus_teste' })
    const ok = await db.asSystem('t', (tx) => checkEntitlement(tx, o.orgId, 'synquei', null))
    expect(ok.ok).toBe(true)
  })
})

describe('ligar vendas', () => {
  /** Tudo numa transação desfeita no fim: ligar vendas mexe em estado global (planos e ajustes). */
  async function rolledBack(fn: (tx: Parameters<Parameters<Database['asSystem']>[1]>[0]) => Promise<void>) {
    const STOP = new Error('rollback')
    await expect(
      db.asSystem('teste: ligar vendas', async (tx) => {
        await fn(tx)
        throw STOP
      }),
    ).rejects.toBe(STOP)
  }

  it('conta antiga segue liberada até o corte; conta nova ganha 7 dias do Completo, sem cartão', async () => {
    const antiga = await newOrgWithOwner(db, 'antiga', { freePlan: true })
    const adminId = await admin(db)
    const cutoff = new Date(Date.now() + 30 * 86_400_000)
    await rolledBack(async (tx) => {
      expect(await salesStatus(tx)).toEqual({ launched: false })
      const r = await launchSales(tx, { userId: adminId, reason: 'lançamento' }, { cutoff, trialDays: 7 })
      expect(r.grandfathered).toBeGreaterThan(0)
      expect(await salesStatus(tx)).toMatchObject({ launched: true, trialDays: 7 })

      const [old] = await tx`select s.current_period_end from zro.subscriptions s where s.org_id = ${antiga.orgId} and s.provider = 'free'`
      expect((old!.current_period_end as Date).getTime()).toBe(cutoff.getTime())
      const [e] = await tx`select max(ends_at) as ends from zro.entitlements where org_id = ${antiga.orgId} and status = 'active'`
      expect((e!.ends as Date).getTime()).toBe(cutoff.getTime())

      // Conta nova criada depois de ligar: grátis sem ferramentas + teste do Completo.
      const [u] =
        await tx`insert into zro.users (email, display_name, email_verified_at) values (${`nova-${randomUUID().slice(0, 8)}@teste.local`}, 'Nova', now()) returning id`
      await tx`select set_config('zro.user_id', ${u!.id as string}, true)`
      const [org] = await tx`select zro.create_organization('Nova', ${'nova-' + randomUUID().slice(0, 8)}, 'team') as id`
      const subs =
        await tx`select s.status, s.provider, s.current_period_end, p.code, p.version from zro.subscriptions s join zro.plans p on p.id = s.plan_id where s.org_id = ${org!.id as string} order by s.provider`
      expect(subs.map((s) => `${s.provider}:${s.code}@${s.version}:${s.status}`)).toEqual(['free:conta-absolute-zro@3:active', 'trial:ciclo-do-o@2:trialing'])
      const days = ((subs[1]!.current_period_end as Date).getTime() - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(6.9)
      expect(days).toBeLessThan(7.1)
      for (const p of ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'nossom']) {
        expect((await checkEntitlement(tx, org!.id as string, p, null)).ok, p).toBe(true)
      }
      // O teste tem poucos créditos de IA, inclusive depois de recalcular os acessos.
      const ai = async () =>
        Number(
          (await tx`select max((limits ->> 'zro.ai_credits')::int) as n from zro.entitlements where org_id = ${org!.id as string} and status = 'active'`)[0]!.n,
        )
      expect(await ai()).toBe(50)
      await recomputeEntitlements(tx, org!.id as string)
      expect(await ai()).toBe(50)
      // Chamar de novo não move a data de corte.
      await launchSales(tx, { userId: adminId, reason: 'ajuste' }, { cutoff: new Date(Date.now() + 90 * 86_400_000), trialDays: 14 })
      const [again] = await tx`select s.current_period_end from zro.subscriptions s where s.org_id = ${antiga.orgId} and s.provider = 'free'`
      expect((again!.current_period_end as Date).getTime()).toBe(cutoff.getTime())
    })
    // Fora da transação nada mudou.
    expect(await db.asSystem('t', (tx) => salesStatus(tx))).toEqual({ launched: false })
  })

  it('pede motivo, corte no futuro e teste entre 0 e 30 dias', async () => {
    const adminId = await admin(db)
    const future = new Date(Date.now() + 86_400_000)
    await rolledBack(async (tx) => {
      await expect(launchSales(tx, { userId: adminId, reason: ' ' }, { cutoff: future, trialDays: 7 })).rejects.toMatchObject({ code: 'invalid_input' })
      await expect(launchSales(tx, { userId: adminId, reason: 'x' }, { cutoff: new Date(Date.now() - 1000), trialDays: 7 })).rejects.toMatchObject({
        code: 'invalid_input',
      })
      await expect(launchSales(tx, { userId: adminId, reason: 'x' }, { cutoff: future, trialDays: 31 })).rejects.toMatchObject({ code: 'invalid_input' })
    })
  })
})
