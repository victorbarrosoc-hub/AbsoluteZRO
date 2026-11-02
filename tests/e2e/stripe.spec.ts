// Stripe pela rota de verdade (ADR 0040), sem o Stripe: o servidor do e2e tem só STRIPE_WEBHOOK_SECRET (venda fechada,
// sem STRIPE_SECRET_KEY), e os eventos são assinados aqui como o Stripe assina. Nada sai para a rede.
import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { signPayload } from '@zro/billing'
import { criarConta } from './conversa'

const SEGREDO = 'whsec_e2e_falso'

async function contaComOrg(page: Page, org: string) {
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Pessoa Stripe', email: `e2e-${randomUUID().slice(0, 8)}@teste.absolutezro.local`, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(org)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  const me = await (await page.request.get('/api/v1/me')).json()
  return me.active_organization_id as string
}

const enviar = (request: APIRequestContext, ev: unknown, segredo = SEGREDO) => {
  const body = JSON.stringify(ev)
  return request.post('/api/v1/billing/webhooks/stripe', {
    data: body,
    headers: { 'content-type': 'application/json', 'stripe-signature': signPayload(body, segredo) },
  })
}

const assinatura = (orgId: string, sub: string, type: string, status: string, created = Math.floor(Date.now() / 1000)) => ({
  id: `evt_${randomUUID().slice(0, 12)}`,
  type,
  created,
  data: {
    object: {
      id: sub,
      customer: 'cus_e2e',
      status,
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ current_period_start: created, current_period_end: created + 30 * 86_400 }] },
      metadata: { org_id: orgId, plan_code: 'orbita', plan_version: '1', user_id: randomUUID() },
    },
  },
})

test('webhook do Stripe: Órbita concede o nível, recarga entra uma vez, cancelamento volta ao Zero', async ({ page, request }) => {
  const orgId = await contaComOrg(page, 'Org Stripe')
  const sub = `sub_${randomUUID().slice(0, 12)}`
  const t = Math.floor(Date.now() / 1000)

  // Sem a assinatura certa, nada entra.
  expect((await enviar(request, assinatura(orgId, sub, 'customer.subscription.created', 'active', t), 'whsec_errado')).status()).toBe(400)
  const criado = assinatura(orgId, sub, 'customer.subscription.created', 'active', t)
  expect(await (await enviar(request, criado)).json()).toMatchObject({ result: 'processed' })
  expect(await (await enviar(request, criado)).json()).toMatchObject({ result: 'duplicate' })
  // Evento que não muda acesso: ignorado, 200.
  expect(await (await enviar(request, { id: 'evt_x', type: 'invoice.paid', created: t, data: { object: {} } })).json()).toMatchObject({
    result: 'ignored',
  })

  const ent = await (await page.request.get('/api/v1/entitlements')).json()
  expect(ent.nivel).toMatchObject({ maestro: 'orbita', relay: 'orbita', synquei: 'orbita' })
  await page.goto('/perfil/plano')
  await expect(page.locator('.plan-chip')).toHaveText('Órbita')
  await expect(page.locator('.plan-option').filter({ hasText: 'Órbita' }).getByText('Já está no seu plano')).toBeVisible()

  // Recarga da Z paga: entra uma vez, mesmo com o mesmo checkout em dois eventos.
  const sessao = `cs_test_${randomUUID().replace(/-/g, '')}`
  const recarga = (type: string) => ({
    id: `evt_${randomUUID().slice(0, 12)}`,
    type,
    created: t,
    data: {
      object: {
        id: sessao,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 1490,
        currency: 'brl',
        metadata: { tipo: 'recarga_z', org_id: orgId, pacote: 'z-100' },
      },
    },
  })
  expect(await (await enviar(request, recarga('checkout.session.completed'))).json()).toMatchObject({ result: 'processed' })
  expect(await (await enviar(request, recarga('checkout.session.async_payment_succeeded'))).json()).toMatchObject({
    result: 'ignored',
    reason: 'pagamento já registrado',
  })
  const limites = await (await page.request.get('/api/v1/me/limites')).json()
  expect(limites.z).toMatchObject({ franquia: 100, recarga: 100 })

  // Cancelada no portal: volta ao Zero.
  expect(await (await enviar(request, assinatura(orgId, sub, 'customer.subscription.deleted', 'canceled', t + 10))).json()).toMatchObject({
    result: 'processed',
  })
  const depois = await (await page.request.get('/api/v1/entitlements')).json()
  expect(depois.nivel).toMatchObject({ maestro: 'zero', relay: 'zero' })
})

test('oferta pública para os apps: preços do banco, cacheável, venda fechada sem as chaves', async ({ request }) => {
  const r = await request.get('/api/v1/planos')
  expect(r.status()).toBe(200)
  expect(r.headers()['cache-control']).toContain('public')
  const o = await r.json()
  expect(o.vendas).toBe(false)
  const orbita = o.pacotes.find((p: { plano: string }) => p.plano === 'orbita')
  expect(orbita).toMatchObject({ mes: { centavos: 10990 }, ano: { centavos: 109900 }, z: 100 })
  expect(o.avulsos.map((a: { app: string }) => a.app)).not.toContain('tpeasy')
  expect(o.recargas.map((x: { centavos: number }) => x.centavos)).toEqual([1490, 4990])
  expect(JSON.stringify(o)).not.toMatch(/fase|em breve/i)
})
