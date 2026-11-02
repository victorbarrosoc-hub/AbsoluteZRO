// Vendas pelo Stripe (ADR 0019; oferta Zero/Órbita/Absoluto/Avulso e recargas da Z na ADR 0040): checkout com o Stripe
// falso (fetch trocado, nada sai para a rede), webhook (assinatura, idempotência, ordem) e os planos antigos.
import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import {
  applyBillingEvent,
  checkEntitlement,
  codigoDoPlano,
  createCheckoutSession,
  createRecargaCheckoutSession,
  featureFlagsFor,
  grantEntitlement,
  isFeatureFlag,
  launchSales,
  motivoParaNaoAssinar,
  niveisEfetivos,
  ofertaAtual,
  peekQuota,
  planoAtual,
  planoParaVenda,
  productAccessFor,
  recargaParaVenda,
  saldoRecarga,
  salesStatus,
  STRIPE_WEBHOOK_EVENTS,
  stripeEventToBillingEvent,
  stripeForm,
  verifyStripeSignature,
  type RecargaBillingEvent,
  type SubscriptionBillingEvent,
} from '../src/index'
import { admin, legacyFreeOrg, newOrgWithOwner } from '../../../tests/integration/helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sign = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`

const NO_AR = ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'maestro', 'relay']

const subEvent = (
  over: Record<string, unknown> = {},
  meta: Record<string, string> = {},
  type = 'customer.subscription.updated',
  created = Math.floor(Date.now() / 1000),
) => ({
  id: `evt_${randomUUID().slice(0, 8)}`,
  type,
  created,
  data: {
    object: {
      id: `sub_${randomUUID().slice(0, 8)}`,
      customer: 'cus_teste',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ current_period_start: created - 60, current_period_end: created + 30 * 86_400 }] },
      metadata: { org_id: randomUUID(), plan_code: 'orbita', plan_version: '1', ...meta },
      ...over,
    },
  },
})

/** checkout.session.* de uma recarga da Z, como o Stripe manda. */
const recargaEvent = (over: Record<string, unknown> = {}, meta: Record<string, string> = {}, type = 'checkout.session.completed', valor = 1490) => ({
  id: `evt_${randomUUID().slice(0, 8)}`,
  type,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: `cs_test_${randomUUID().replace(/-/g, '')}`,
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      amount_total: valor,
      currency: 'brl',
      metadata: { tipo: 'recarga_z', org_id: randomUUID(), pacote: 'z-100', ...meta },
      ...over,
    },
  },
})

/** Stripe falso: guarda cada pedido (endereço, corpo e cabeçalhos) e responde como o checkout. */
function stripeFalso() {
  const pedidos: { url: string; corpo: URLSearchParams; headers: Record<string, string> }[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, corpo: new URLSearchParams(String(init.body)), headers: init.headers as Record<string, string> })
    const id = `cs_test_${pedidos.length}`
    return new Response(JSON.stringify({ id, url: `https://checkout.stripe.com/c/pay/${id}` }), { status: 200 })
  }) as unknown as typeof globalThis.fetch
  return { fetch, pedidos }
}

describe('preços antigos (0011), fora da venda desde a 0055', () => {
  it('avulso R$ 59,90/mês ou R$ 449/ano; Completo R$ 149,90 ou R$ 1.499; Pro R$ 299,90 ou R$ 2.999; créditos de IA por plano', async () => {
    // Saíram da venda (retired, legado) sem apagar: quem já tem segue com eles.
    const rows =
      await db.sql`select code, price_cents, billing_interval from zro.plans where legado and status = 'retired' and kind <> 'free' and price_cents is not null order by code, version`
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
      where (p.code, p.version) in (('individual-nossom', 2), ('ciclo-do-o', 2), ('absolute-zro-pro', 1), ('absolute-zro-pro-anual', 1)) group by p.code order by p.code`
    expect(credits.map((r) => `${r.code}:${r.n}:${r.ai}`)).toEqual([
      // o Maestro (0027) e o Relay (0031) entram nos planos sem mexer nos créditos
      'absolute-zro-pro:9:2000',
      'absolute-zro-pro-anual:9:2000',
      'ciclo-do-o:9:600',
      'individual-nossom:2:200',
    ])
    const [anual] = await db.sql`select count(*)::int as n from zro.plan_products pp join zro.plans p on p.id = pp.plan_id where p.code = 'ciclo-do-o-anual'`
    expect(anual!.n).toBe(9)
  })
})

describe('Maestro com a sua marca (0025)', () => {
  it('adicional R$ 89,90/mês ou R$ 899/ano e o Pro v2 com o sinal, nunca publicados (fora da venda desde a 0055); o Pro publicado não ganha o sinal', async () => {
    const rows = await db.sql`
      select p.code, p.version, p.status, p.price_cents, p.billing_interval, pp.features, pp.limits
      from zro.plans p join zro.plan_products pp on pp.plan_id = p.id and pp.product_id = 'maestro'
      where (p.code like 'maestro-marca-propria%' or p.code like 'absolute-zro-pro%') and pp.limits ? 'maestro.marca_propria'
      order by p.code, p.version`
    expect(rows.map((r) => `${r.code}@${r.version}:${r.status}:${r.price_cents}:${r.billing_interval}`)).toEqual([
      'absolute-zro-pro@2:retired:29990:month',
      'absolute-zro-pro-anual@2:retired:299900:year',
      'maestro-marca-propria@1:retired:8990:month',
      'maestro-marca-propria-anual@1:retired:89900:year',
    ])
    for (const r of rows) {
      // o adicional é só o sinal; o Pro v2 abre o Maestro inteiro (0027) e leva o sinal junto
      if (String(r.code).startsWith('maestro-')) {
        expect(r.features).toEqual([])
        expect(r.limits).toEqual({ 'maestro.marca_propria': 1 })
      } else {
        expect(r.features).toBeNull()
        expect(r.limits).toEqual({ 'zro.ai_credits': 2000, 'maestro.marca_propria': 1 })
      }
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
    // o Maestro está aberto em Beta grátis (0027): o sinal sai para quem tem o adicional, sem lista de acesso
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
    const ev = stripeEventToBillingEvent(e) as SubscriptionBillingEvent
    expect(ev.type).toBe('subscription.updated')
    expect(ev.data).toMatchObject({ status: 'past_due', plan_code: 'orbita', plan_version: 1, customer_id: 'cus_teste' })
    expect(ev.data.current_period_end).toBe(new Date((e.created + 30 * 86_400) * 1000).toISOString())
    expect((stripeEventToBillingEvent(subEvent({ status: 'incomplete_expired' })) as SubscriptionBillingEvent).data.status).toBe('expired')
    expect(stripeEventToBillingEvent(subEvent({}, {}, 'customer.subscription.deleted'))!.type).toBe('subscription.deleted')
    expect(stripeEventToBillingEvent({ ...subEvent(), type: 'invoice.paid' })).toBeNull()
    expect(stripeEventToBillingEvent(subEvent({ metadata: {} }))).toBeNull()
  })

  it('traduz o checkout pago da recarga; ignora o não pago, o de assinatura e o sem os dados do HUB', () => {
    const org = randomUUID()
    const ev = stripeEventToBillingEvent(recargaEvent({}, { org_id: org })) as RecargaBillingEvent
    expect(ev).toMatchObject({ type: 'recarga.paga', data: { org_id: org, pacote: 'z-100', amount_cents: 1490, currency: 'BRL' } })
    expect(ev.data.payment_ref).toMatch(/^cs_/)
    // boleto: o completed chega sem pagamento; o pagamento vem no async_payment_succeeded
    expect(stripeEventToBillingEvent(recargaEvent({ payment_status: 'unpaid' }))).toBeNull()
    expect(stripeEventToBillingEvent(recargaEvent({}, {}, 'checkout.session.async_payment_succeeded'))!.type).toBe('recarga.paga')
    expect(stripeEventToBillingEvent(recargaEvent({}, {}, 'checkout.session.async_payment_failed'))).toBeNull()
    expect(stripeEventToBillingEvent(recargaEvent({ mode: 'subscription' }))).toBeNull()
    expect(stripeEventToBillingEvent(recargaEvent({ metadata: { org_id: org, pacote: 'z-100' } }))).toBeNull()
    expect(STRIPE_WEBHOOK_EVENTS).toEqual([
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
    ])
  })

  it('checkout de assinatura leva preço do plano, organização e plano nos metadados', async () => {
    const fake = stripeFalso()
    const orgId = randomUUID()
    const r = await createCheckoutSession(
      { secretKey: 'sk_test_x', fetch: fake.fetch },
      {
        orgId,
        userId: randomUUID(),
        email: 'p@teste.local',
        customerId: null,
        plan: { code: 'orbita-anual', version: 1, name: 'Órbita', price_cents: 109900, currency: 'BRL', billing_interval: 'year' },
        successUrl: 'https://absolutezro.com/perfil/plano?assinatura=ok',
        cancelUrl: 'https://absolutezro.com/perfil/plano',
      },
    )
    expect(r.url).toContain('checkout.stripe.com')
    expect(fake.pedidos[0]!.url).toBe('https://api.stripe.com/v1/checkout/sessions')
    const q = fake.pedidos[0]!.corpo
    expect(q.get('mode')).toBe('subscription')
    expect(q.get('line_items[0][price_data][currency]')).toBe('brl')
    expect(q.get('line_items[0][price_data][unit_amount]')).toBe('109900')
    expect(q.get('line_items[0][price_data][recurring][interval]')).toBe('year')
    expect(q.get('line_items[0][price_data][product_data][name]')).toBe('Órbita (anual)')
    expect(q.get('subscription_data[metadata][org_id]')).toBe(orgId)
    expect(q.get('subscription_data[metadata][plan_code]')).toBe('orbita-anual')
    expect(q.get('subscription_data[metadata][plan_version]')).toBe('1')
    expect(q.get('customer_email')).toBe('p@teste.local')
  })

  it('checkout da recarga é pagamento único, sem cupom, com o pacote nos metadados e chave de idempotência', async () => {
    const fake = stripeFalso()
    const orgId = randomUUID()
    await createRecargaCheckoutSession(
      { secretKey: 'sk_test_x', fetch: fake.fetch },
      {
        orgId,
        userId: randomUUID(),
        email: 'p@teste.local',
        customerId: 'cus_1',
        pacote: { code: 'z-500', mensagens: 500, centavos: 4990, moeda: 'BRL', validade_meses: 12 },
        successUrl: 'https://a',
        cancelUrl: 'https://b',
      },
      'recarga:chave',
    )
    const { corpo: q, headers } = fake.pedidos[0]!
    expect(q.get('mode')).toBe('payment')
    expect(q.get('line_items[0][price_data][unit_amount]')).toBe('4990')
    expect(q.has('line_items[0][price_data][recurring][interval]')).toBe(false)
    expect(q.get('line_items[0][price_data][product_data][name]')).toBe('Z: +500 mensagens')
    expect(q.get('metadata[tipo]')).toBe('recarga_z')
    expect(q.get('metadata[org_id]')).toBe(orgId)
    expect(q.get('payment_intent_data[metadata][pacote]')).toBe('z-500')
    expect(q.get('customer')).toBe('cus_1')
    expect(q.has('allow_promotion_codes')).toBe(false)
    expect(headers['idempotency-key']).toBe('recarga:chave')
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
          plan: { code: 'avulso-relay', version: 1, name: 'Relay', price_cents: 7990, currency: 'BRL', billing_interval: 'month' },
          successUrl: 'https://a',
          cancelUrl: 'https://b',
        },
      ),
    ).rejects.toMatchObject({ code: 'upstream_unavailable' })
  })
})

describe('oferta à venda (ADR 0040)', () => {
  it('Órbita, Absoluto e o Avulso de cada app lançado, mensal e anual, saem do banco; TPeasy e apps fechados ficam de fora', async () => {
    const o = await db.asSystem('t', (tx) => ofertaAtual(tx))
    const por = Object.fromEntries(o.pacotes.map((p) => [p.plano, p]))
    expect(por.orbita).toMatchObject({ nome: 'Órbita', mes: { code: 'orbita', centavos: 10990 }, ano: { code: 'orbita-anual', centavos: 109900 }, z: 100 })
    expect(por.absoluto).toMatchObject({ mes: { centavos: 29990 }, ano: { centavos: 299900 }, z: 300 })
    expect(por.orbita!.apps).toEqual(expect.arrayContaining(NO_AR))
    for (const fechado of ['ai-edit', 'finishing', 'nossom']) expect(por.absoluto!.apps).not.toContain(fechado)
    expect(o.avulsos.map((a) => a.app).sort()).toEqual(['carro-do-freela', 'maestro', 'relay', 'sobedesce', 'synquei'])
    for (const a of o.avulsos) expect(a).toMatchObject({ mes: { centavos: 7990 }, ano: { centavos: 79900, code: `avulso-${a.app}-anual` }, z: 50 })
    expect(o.recargas.map((r) => `${r.code}:${r.mensagens}:${r.centavos}:${r.validade_meses}`)).toEqual(['z-100:100:1490:12', 'z-500:500:4990:12'])
    expect(o.zero).toMatchObject({ nome: 'Zero', z: 10 })
    expect(o.anual_em_meses).toBe(10)
  })

  it('o pedido vira o código do plano; ciclo, app e plano fora da venda são recusados', async () => {
    expect(codigoDoPlano({ plano: 'orbita', ciclo: 'mes' })).toBe('orbita')
    expect(codigoDoPlano({ plano: 'absoluto', ciclo: 'ano' })).toBe('absoluto-anual')
    expect(codigoDoPlano({ plano: 'avulso', ciclo: 'ano', app: 'maestro' })).toBe('avulso-maestro-anual')
    expect(() => codigoDoPlano({ plano: 'pro', ciclo: 'mes' })).toThrow(/plano/)
    expect(() => codigoDoPlano({ plano: 'orbita', ciclo: 'semana' })).toThrow(/mensal ou anual/)
    expect(() => codigoDoPlano({ plano: 'avulso', ciclo: 'mes', app: "x'; drop" })).toThrow(/app/)
    const p = await db.asSystem('t', (tx) => planoParaVenda(tx, { plano: 'avulso', ciclo: 'mes', app: 'synquei' }))
    expect(p).toMatchObject({
      code: 'avulso-synquei',
      kind: 'individual',
      nivel: 'absoluto',
      price_cents: 7990,
      billing_interval: 'month',
      products: ['synquei'],
    })
    for (const pedido of [
      { plano: 'avulso', ciclo: 'mes', app: 'tpeasy' },
      { plano: 'avulso', ciclo: 'mes', app: 'nossom' },
    ])
      await expect(db.asSystem('t', (tx) => planoParaVenda(tx, pedido))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(db.asSystem('t', (tx) => recargaParaVenda(tx, 'z-9999'))).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('não vende o que a organização já paga', () => {
    const orbita = { code: 'orbita', kind: 'bundle', nivel: 'orbita' as const, products: NO_AR }
    const absoluto = { code: 'absoluto', kind: 'bundle', nivel: 'absoluto' as const, products: NO_AR }
    const maestro = { code: 'avulso-maestro', kind: 'individual' as const, nivel: 'absoluto' as const, products: ['maestro'] }
    const alvo = (code: string, kind: 'bundle' | 'individual', nivel: 'orbita' | 'absoluto', products = NO_AR) => ({ code, kind, nivel, products })
    expect(motivoParaNaoAssinar([], alvo('orbita', 'bundle', 'orbita'))).toBeNull()
    expect(motivoParaNaoAssinar([orbita], alvo('orbita-anual', 'bundle', 'orbita'))).toMatch(/já assina este plano/)
    expect(motivoParaNaoAssinar([orbita], alvo('absoluto', 'bundle', 'absoluto'))).toBeNull()
    expect(motivoParaNaoAssinar([absoluto], alvo('orbita', 'bundle', 'orbita'))).toMatch(/já assina o Absoluto/)
    expect(motivoParaNaoAssinar([absoluto], alvo('avulso-relay', 'individual', 'absoluto', ['relay']))).toMatch(/já inclui/)
    expect(motivoParaNaoAssinar([orbita], alvo('avulso-relay', 'individual', 'absoluto', ['relay']))).toBeNull()
    expect(motivoParaNaoAssinar([maestro], alvo('avulso-maestro-anual', 'individual', 'absoluto', ['maestro']))).toMatch(/já assina este plano/)
    expect(motivoParaNaoAssinar([maestro], alvo('avulso-relay', 'individual', 'absoluto', ['relay']))).toBeNull()
  })
})

describe('webhook do Stripe: níveis pela assinatura (idempotente, ordenado, auditado)', () => {
  const nivelDe = async (o: { userId: string; orgId: string }) =>
    Object.fromEntries((await db.asSystem('t', (tx) => niveisEfetivos(tx, o.userId, o.orgId))).map((n) => [n.productId, `${n.nivel}:${n.origem}`]))
  const apply = (e: ReturnType<typeof subEvent>) => applyBillingEvent(db, 'stripe', stripeEventToBillingEvent(e)!)

  it('Órbita pelo Stripe: nível órbita em todos os apps no ar e Z 100; cancelado volta para o Zero', async () => {
    const o = await newOrgWithOwner(db, 'stripe-orbita', { freePlan: true })
    expect(Object.values(await nivelDe(o)).every((v) => v === 'zero:zero')).toBe(true)
    const sub = `sub_${randomUUID().slice(0, 8)}`
    const t = Math.floor(Date.now() / 1000)
    const e = subEvent({ id: sub }, { org_id: o.orgId }, 'customer.subscription.created', t)
    expect(await apply(e)).toMatchObject({ result: 'processed' })
    // Repetido (o Stripe reenvia): não duplica nada.
    expect(await apply(e)).toMatchObject({ result: 'duplicate' })
    const n = await nivelDe(o)
    for (const app of NO_AR) expect(n[app], app).toBe('orbita:assinatura')
    const q = await db.asSystem('t', (tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 0))
    expect(q).toMatchObject({ limit: 100 })
    expect(await db.asSystem('t', (tx) => planoAtual(tx, o.userId, o.orgId))).toMatchObject({ nome: 'Órbita' })

    expect(await apply(subEvent({ id: sub, status: 'canceled' }, { org_id: o.orgId }, 'customer.subscription.deleted', t + 5))).toMatchObject({
      result: 'processed',
    })
    expect(Object.values(await nivelDe(o)).every((v) => v === 'zero:zero')).toBe(true)
    const acoes = await db.sql`select action from zro.audit_logs where org_id = ${o.orgId} and action like 'billing.subscription.%' order by created_at`
    expect(acoes.map((a) => a.action)).toEqual(['billing.subscription.updated.processed', 'billing.subscription.deleted.processed'])
  })

  it('ordem: evento mais velho não desfaz o novo; no mesmo segundo, "incomplete" não volta atrás do "active"', async () => {
    const o = await newOrgWithOwner(db, 'stripe-ordem', { freePlan: true })
    const sub = `sub_${randomUUID().slice(0, 8)}`
    const t = Math.floor(Date.now() / 1000)
    const meta = { org_id: o.orgId, plan_code: 'absoluto', plan_version: '1' }
    // O updated (active) chega antes do created (incomplete), os dois no mesmo segundo.
    expect(await apply(subEvent({ id: sub, status: 'active' }, meta, 'customer.subscription.updated', t))).toMatchObject({ result: 'processed' })
    expect(await apply(subEvent({ id: sub, status: 'incomplete' }, meta, 'customer.subscription.created', t))).toMatchObject({
      result: 'ignored',
      reason: 'evento do mesmo instante com estado anterior',
    })
    expect(await apply(subEvent({ id: sub, status: 'past_due' }, meta, 'customer.subscription.updated', t - 60))).toMatchObject({
      result: 'ignored',
      reason: 'evento mais antigo que o estado atual',
    })
    const [s] = await db.sql`select status from zro.subscriptions where provider = 'stripe' and provider_subscription_id = ${sub}`
    expect(s!.status).toBe('active')
    expect((await nivelDe(o)).maestro).toBe('absoluto:assinatura')
    const [ev] = await db.sql`select count(*)::int as n from zro.billing_events where provider = 'stripe' and org_id = ${o.orgId} and status = 'ignored'`
    expect(ev!.n).toBe(2)
  })

  it('Avulso: Absoluto só naquele app; os outros seguem no Zero', async () => {
    const o = await newOrgWithOwner(db, 'stripe-avulso', { freePlan: true })
    expect(await apply(subEvent({}, { org_id: o.orgId, plan_code: 'avulso-relay-anual', plan_version: '1' }))).toMatchObject({ result: 'processed' })
    const n = await nivelDe(o)
    expect(n.relay).toBe('absoluto:avulso')
    expect(n.maestro).toBe('zero:zero')
    const q = await db.asSystem('t', (tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 0))
    expect(q).toMatchObject({ limit: 50 })
  })

  it('conta antiga que assina não perde nada: segue Absoluto sem limites (legado) e ganha a Z do plano', async () => {
    const o = await legacyFreeOrg(db, 'stripe-legado')
    expect((await nivelDe(o)).maestro).toBe('absoluto:legado')
    expect(await apply(subEvent({}, { org_id: o.orgId }))).toMatchObject({ result: 'processed' })
    expect((await nivelDe(o)).maestro).toBe('absoluto:legado')
    expect(await db.asSystem('t', (tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 0))).toMatchObject({ limit: 100 })
  })

  it('assinatura de outra organização, organização ou plano desconhecidos: falha registrada, nada muda', async () => {
    const a = await newOrgWithOwner(db, 'stripe-a', { freePlan: true })
    const b = await newOrgWithOwner(db, 'stripe-b', { freePlan: true })
    const sub = `sub_${randomUUID().slice(0, 8)}`
    expect(await apply(subEvent({ id: sub }, { org_id: a.orgId }))).toMatchObject({ result: 'processed' })
    expect(await apply(subEvent({ id: sub }, { org_id: b.orgId }))).toMatchObject({ result: 'failed', reason: 'assinatura pertence a outra organização' })
    expect(await apply(subEvent({}, { org_id: randomUUID() }))).toMatchObject({ result: 'failed', reason: 'organização desconhecida' })
    expect(await apply(subEvent({}, { org_id: a.orgId, plan_code: 'nao-existe' }))).toMatchObject({ result: 'failed' })
    expect((await nivelDe(b)).maestro).toBe('zero:zero')
  })
})

describe('webhook do Stripe: recarga da Z paga', () => {
  const apply = (e: ReturnType<typeof recargaEvent>) => applyBillingEvent(db, 'stripe', stripeEventToBillingEvent(e)!)

  it('pagamento confirmado vira recarga uma vez só (mesmo evento ou outro evento da mesma sessão)', async () => {
    const o = await newOrgWithOwner(db, 'recarga-paga', { freePlan: true })
    const e = recargaEvent({}, { org_id: o.orgId, user_id: o.userId })
    const r = await apply(e)
    expect(r).toMatchObject({ result: 'processed' })
    expect(await apply(e)).toMatchObject({ result: 'duplicate' })
    // o mesmo checkout em outro evento (ex.: async depois do completed): não vira outra recarga
    const outro = { ...e, id: `evt_${randomUUID().slice(0, 8)}`, type: 'checkout.session.async_payment_succeeded' }
    expect(await apply(outro)).toMatchObject({ result: 'ignored', reason: 'pagamento já registrado', recargaId: r.recargaId })
    expect(await db.asSystem('t', (tx) => saldoRecarga(tx, o.orgId))).toBe(100)
    const [z] = await db.sql`select origem, provider_ref, criado_por, expira_em from zro.z_recargas where org_id = ${o.orgId}`
    expect(z).toMatchObject({ origem: 'compra', provider_ref: `stripe:${e.data.object.id}`, criado_por: o.userId })
    const dias = ((z!.expira_em as Date).getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(360)
    const acoes = await db.sql`select action, actor_kind from zro.audit_logs where org_id = ${o.orgId} and action like 'billing.recarga%' order by created_at`
    // (a compra e o processado saem na mesma transação, com o mesmo horário)
    expect(acoes.map((a) => `${a.action}:${a.actor_kind}`).sort()).toEqual([
      'billing.recarga.paga.ignored:provider',
      'billing.recarga.paga.processed:provider',
      'billing.recarga_comprada:provider',
    ])
  })

  it('valor diferente do pacote ou pacote desconhecido: falha para revisão, sem recarga', async () => {
    const o = await newOrgWithOwner(db, 'recarga-valor', { freePlan: true })
    expect(await apply(recargaEvent({ amount_total: 990 }, { org_id: o.orgId }))).toMatchObject({ result: 'failed', reason: 'valor pago diferente do pacote' })
    expect(await apply(recargaEvent({}, { org_id: o.orgId, pacote: 'z-1' }))).toMatchObject({ result: 'failed', reason: 'pacote desconhecido' })
    expect(await apply(recargaEvent({}, { org_id: randomUUID() }))).toMatchObject({ result: 'failed', reason: 'organização desconhecida' })
    expect(await db.asSystem('t', (tx) => saldoRecarga(tx, o.orgId))).toBe(0)
  })

  it('dois webhooks ao mesmo tempo para o mesmo pagamento: uma recarga só', async () => {
    const o = await newOrgWithOwner(db, 'recarga-corrida', { freePlan: true })
    const e = recargaEvent({}, { org_id: o.orgId, pacote: 'z-500' }, 'checkout.session.completed', 4990)
    const outro = { ...e, id: `evt_${randomUUID().slice(0, 8)}` }
    const rs = await Promise.all([apply(e), apply(outro)])
    expect(rs.map((r) => r.result).sort()).toEqual(['ignored', 'processed'])
    expect(await db.asSystem('t', (tx) => saldoRecarga(tx, o.orgId))).toBe(500)
  })
})

describe('ligar vendas (aposentado pela 0055)', () => {
  it('recusa: os planos agora são Zero, Órbita e Absoluto, e o teste é a campanha do console', async () => {
    const adminId = await admin(db)
    await expect(
      db.asSystem('t', (tx) => launchSales(tx, { userId: adminId, reason: 'lançamento' }, { cutoff: new Date(Date.now() + 86_400_000), trialDays: 7 })),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(await db.asSystem('t', (tx) => salesStatus(tx))).toEqual({ launched: false })
  })
})
