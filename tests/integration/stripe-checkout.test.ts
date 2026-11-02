// Checkout da oferta nova (ADR 0040) com o Stripe falso: o fetch é trocado, nada sai para a rede. O plano sai do pedido
// { plano, ciclo, app } no servidor; papel, e-mail confirmado e o que a organização já paga são conferidos antes.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyBillingEvent } from '@zro/billing'
import { billingPortalUrl, startCheckout, startRecargaCheckout } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { expectCode, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const ORIGEM = 'https://absolutezro.com'

function stripeFalso() {
  const pedidos: { url: string; corpo: URLSearchParams }[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, corpo: new URLSearchParams(String(init.body)) })
    const id = `cs_test_${pedidos.length}`
    const body = url.endsWith('/billing_portal/sessions')
      ? { url: 'https://billing.stripe.com/p/session/x' }
      : { id, url: `https://checkout.stripe.com/c/pay/${id}` }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof globalThis.fetch
  return { cfg: { secretKey: 'sk_test_falso', fetch }, pedidos }
}

/** Assinatura paga pelo Stripe, como o webhook grava. */
async function assinaturaStripe(orgId: string, plan_code: string) {
  const r = await applyBillingEvent(db, 'stripe', {
    id: `evt_${randomUUID()}`,
    type: 'subscription.updated',
    occurred_at: new Date().toISOString(),
    data: {
      org_id: orgId,
      subscription_id: `sub_${randomUUID()}`,
      customer_id: 'cus_da_org',
      plan_code,
      plan_version: 1,
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
  })
  expect(r.result).toBe('processed')
}

describe('checkout de assinatura', () => {
  it('Órbita mensal, Absoluto anual e Avulso de um app: preço e metadados do plano do banco', async () => {
    const o = await newOrgWithOwner(db, 'ck-planos', { freePlan: true })
    const s = stripeFalso()
    const url = await startCheckout(db, o.auth, s.cfg, { plano: 'orbita', ciclo: 'mes', origin: ORIGEM })
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    await startCheckout(db, o.auth, s.cfg, { plano: 'absoluto', ciclo: 'ano', origin: ORIGEM })
    await startCheckout(db, o.auth, s.cfg, { plano: 'avulso', ciclo: 'mes', app: 'maestro', origin: ORIGEM })
    const resumo = s.pedidos.map((p) => [
      p.corpo.get('subscription_data[metadata][plan_code]'),
      p.corpo.get('line_items[0][price_data][unit_amount]'),
      p.corpo.get('line_items[0][price_data][recurring][interval]'),
    ])
    expect(resumo).toEqual([
      ['orbita', '10990', 'month'],
      ['absoluto-anual', '299900', 'year'],
      ['avulso-maestro', '7990', 'month'],
    ])
    for (const p of s.pedidos) {
      expect(p.url).toBe('https://api.stripe.com/v1/checkout/sessions')
      expect(p.corpo.get('subscription_data[metadata][org_id]')).toBe(o.orgId)
      expect(p.corpo.get('subscription_data[metadata][user_id]')).toBe(o.userId)
      expect(p.corpo.get('success_url')).toBe(`${ORIGEM}/perfil/plano?assinatura=ok`)
    }
    const [a] = await db.sql`select count(*)::int as n from zro.audit_logs where org_id = ${o.orgId} and action = 'billing.checkout_started'`
    expect(a!.n).toBe(3)
    // O acesso não muda no checkout: só o webhook muda.
    const [sub] = await db.sql`select count(*)::int as n from zro.subscriptions where org_id = ${o.orgId} and provider = 'stripe'`
    expect(sub!.n).toBe(0)
  })

  it('plano fora da venda, ciclo ou app inválido: recusa sem chamar o Stripe', async () => {
    const o = await newOrgWithOwner(db, 'ck-invalido', { freePlan: true })
    const s = stripeFalso()
    for (const pedido of [
      { plano: 'avulso', ciclo: 'mes', app: 'tpeasy' },
      { plano: 'avulso', ciclo: 'mes', app: 'nossom' },
      { plano: 'avulso', ciclo: 'mes' },
      { plano: 'zero', ciclo: 'mes' },
      { plano: 'ciclo-do-o', ciclo: 'mes' },
      { plano: 'orbita', ciclo: 'trimestre' },
    ])
      await expectCode(startCheckout(db, o.auth, s.cfg, { ...pedido, origin: ORIGEM }), 'invalid_input')
    expect(s.pedidos).toHaveLength(0)
  })

  it('só quem cuida da cobrança, com e-mail confirmado', async () => {
    const o = await newOrgWithOwner(db, 'ck-papel', { freePlan: true })
    const s = stripeFalso()
    const editor = await newUser(db, 'ck-editor')
    await db.sql`insert into zro.memberships (org_id, user_id, role, status) values (${o.orgId}, ${editor.userId}, 'editor', 'active')`
    await db.sql`update zro.sessions set active_org_id = ${o.orgId} where user_id = ${editor.userId}`
    await expectCode(startCheckout(db, await refresh(db, editor.token), s.cfg, { plano: 'orbita', ciclo: 'mes', origin: ORIGEM }), 'forbidden_role')
    const fin = await newUser(db, 'ck-financeiro')
    await db.sql`insert into zro.memberships (org_id, user_id, role, status) values (${o.orgId}, ${fin.userId}, 'billing', 'active')`
    await db.sql`update zro.sessions set active_org_id = ${o.orgId} where user_id = ${fin.userId}`
    await startCheckout(db, await refresh(db, fin.token), s.cfg, { plano: 'orbita', ciclo: 'mes', origin: ORIGEM })
    await db.sql`update zro.users set email_verified_at = null where id = ${o.userId}`
    await expectCode(startCheckout(db, await refresh(db, o.token), s.cfg, { plano: 'orbita', ciclo: 'mes', origin: ORIGEM }), 'email_not_verified')
    await expectCode(startRecargaCheckout(db, await refresh(db, o.token), s.cfg, { pacote: 'z-100', origin: ORIGEM }), 'email_not_verified')
    expect(s.pedidos).toHaveLength(1)
  })

  it('não vende o que já paga; reaproveita o cliente do Stripe; o portal continua', async () => {
    const o = await newOrgWithOwner(db, 'ck-ja-paga', { freePlan: true })
    const s = stripeFalso()
    await expectCode(billingPortalUrl(db, o.auth, s.cfg, ORIGEM), 'not_found')
    await assinaturaStripe(o.orgId, 'absoluto')
    await expectCode(startCheckout(db, o.auth, s.cfg, { plano: 'absoluto', ciclo: 'ano', origin: ORIGEM }), 'conflict')
    await expectCode(startCheckout(db, o.auth, s.cfg, { plano: 'orbita', ciclo: 'mes', origin: ORIGEM }), 'conflict')
    await expectCode(startCheckout(db, o.auth, s.cfg, { plano: 'avulso', ciclo: 'mes', app: 'relay', origin: ORIGEM }), 'conflict')
    expect(s.pedidos).toHaveLength(0)
    await startRecargaCheckout(db, o.auth, s.cfg, { pacote: 'z-500', origin: ORIGEM })
    expect(s.pedidos[0]!.corpo.get('customer')).toBe('cus_da_org')
    expect(await billingPortalUrl(db, o.auth, s.cfg, ORIGEM)).toBe('https://billing.stripe.com/p/session/x')
    expect(s.pedidos[1]!.url).toBe('https://api.stripe.com/v1/billing_portal/sessions')
    expect(s.pedidos[1]!.corpo.get('return_url')).toBe(`${ORIGEM}/perfil/plano`)

    // Quem tem Órbita pode subir para o Absoluto (assinatura nova; a antiga se cancela no portal).
    const b = await newOrgWithOwner(db, 'ck-sobe', { freePlan: true })
    await assinaturaStripe(b.orgId, 'orbita')
    await startCheckout(db, b.auth, s.cfg, { plano: 'absoluto', ciclo: 'mes', origin: ORIGEM })
    await expectCode(startCheckout(db, b.auth, s.cfg, { plano: 'orbita', ciclo: 'ano', origin: ORIGEM }), 'conflict')
  })
})

describe('checkout da recarga da Z', () => {
  it('pagamento único com o preço do pacote; pacote fora da venda é recusado', async () => {
    const o = await newOrgWithOwner(db, 'ck-recarga', { freePlan: true })
    const s = stripeFalso()
    const url = await startRecargaCheckout(db, o.auth, s.cfg, { pacote: 'z-100', origin: ORIGEM })
    expect(url).toContain('checkout.stripe.com')
    const q = s.pedidos[0]!.corpo
    expect(q.get('mode')).toBe('payment')
    expect(q.get('line_items[0][price_data][unit_amount]')).toBe('1490')
    expect(q.get('metadata[org_id]')).toBe(o.orgId)
    expect(q.get('metadata[pacote]')).toBe('z-100')
    expect(q.get('success_url')).toBe(`${ORIGEM}/perfil/plano?recarga=ok`)
    await expectCode(startRecargaCheckout(db, o.auth, s.cfg, { pacote: 'z-1', origin: ORIGEM }), 'invalid_input')
    await expectCode(startRecargaCheckout(db, o.auth, s.cfg, { pacote: "'; --", origin: ORIGEM }), 'invalid_input')
    expect(s.pedidos).toHaveLength(1)
    // Nada muda antes do webhook.
    const [r] = await db.sql`select count(*)::int as n from zro.z_recargas where org_id = ${o.orgId}`
    expect(r!.n).toBe(0)
  })
})
