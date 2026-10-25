// E2E no servidor de produção local (PRD §14): conta, organização, projeto, 403 por URL direta, CSRF, webhook.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { signPayload } from '@zro/billing'

const email = () => `e2e-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
const PASS = 'senha-e2e-segura-1'

async function signupAndOrg(page: Page, orgName = 'Produtora E2E') {
  await page.goto('/criar-conta')
  await page.getByLabel('Nome').fill('Pessoa E2E')
  await page.getByLabel('E-mail').fill(email())
  await page.getByLabel('Senha').fill(PASS)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(orgName)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
}

test('área logada exige sessão', async ({ page }) => {
  await page.goto('/projetos')
  await expect(page).toHaveURL(/\/entrar$/)
})

test('cadastro → organização → projeto com Ciclo do O e alternativa em lista', async ({ page }) => {
  await signupAndOrg(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Olá')
  await page.goto('/projetos/novo')
  await page.getByLabel('Nome', { exact: true }).fill('Casamento E2E')
  await page.getByRole('button', { name: 'Criar projeto' }).click()
  await page.waitForURL(/\/projetos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Casamento E2E' })).toBeVisible()
  const list = page.getByRole('list', { name: 'Etapas do Ciclo do O' })
  await expect(list.getByRole('listitem')).toHaveCount(7)
  // Sem plano: ferramentas lançadas aparecem bloqueadas por assinatura, futuras indisponíveis
  await expect(list.getByRole('listitem').filter({ hasText: 'Synquei' })).toContainText('Bloqueado por assinatura')
  await expect(list.getByRole('listitem').filter({ hasText: 'AI Edit' })).toContainText('Indisponível')
})

test('API: sem assinatura recebe 403 por URL direta; sem sessão 401; outra origem 403', async ({ page, request }) => {
  await signupAndOrg(page, 'Org sem plano')
  const cookies = await page.context().cookies()
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const origin = new URL(page.url()).origin
  const created = await request.post('/api/v1/projects', { headers: { cookie, origin }, data: { title: 'Projeto API' } })
  expect(created.status()).toBe(201)
  const { id } = await created.json()

  const synq = await request.post(`/api/v1/projects/${id}/synquei/organization-plan`, { headers: { cookie, origin }, data: { manifest_row_id: randomUUID() } })
  expect(synq.status()).toBe(403)
  expect((await synq.json()).error).toBe('entitlement_required')

  const tp = await request.get(`/api/v1/projects/${id}/tpeasy/script`, { headers: { cookie } })
  expect(tp.status()).toBe(403)

  const anon = await request.get('/api/v1/projects')
  expect(anon.status()).toBe(401)

  const csrf = await request.post('/api/v1/projects', { headers: { cookie, origin: 'https://site-malicioso.example' }, data: { title: 'x' } })
  expect(csrf.status()).toBe(403)
  expect((await csrf.json()).error).toBe('origin_rejected')

  const other = await request.get(`/api/v1/projects/${randomUUID()}`, { headers: { cookie } })
  expect(other.status()).toBe(404)
})

test('webhook de cobrança: assinatura errada 400, provedor desconhecido 404, evento válido ativa e repetido não duplica', async ({ page, request }) => {
  await signupAndOrg(page, 'Org webhook')
  const me = await (await page.request.get('/api/v1/me')).json()
  const orgId = me.active_organization_id as string
  const ev = {
    id: `evt_${randomUUID()}`,
    type: 'subscription.updated',
    occurred_at: new Date().toISOString(),
    data: {
      org_id: orgId,
      subscription_id: `sub_${randomUUID()}`,
      plan_code: 'individual-synquei',
      plan_version: 1,
      status: 'active',
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    },
  }
  const body = JSON.stringify(ev)
  expect((await request.post('/api/v1/billing/webhooks/stripe', { data: body, headers: { 'content-type': 'application/json' } })).status()).toBe(404)
  expect(
    (
      await request.post('/api/v1/billing/webhooks/manual', {
        data: body,
        headers: { 'content-type': 'application/json', 'zro-signature': signPayload(body, 'errado') },
      })
    ).status(),
  ).toBe(400)
  const ok = await request.post('/api/v1/billing/webhooks/manual', {
    data: body,
    headers: { 'content-type': 'application/json', 'zro-signature': signPayload(body, 'segredo-e2e') },
  })
  expect(await ok.json()).toMatchObject({ result: 'processed' })
  const dup = await request.post('/api/v1/billing/webhooks/manual', {
    data: body,
    headers: { 'content-type': 'application/json', 'zro-signature': signPayload(body, 'segredo-e2e') },
  })
  expect(await dup.json()).toMatchObject({ result: 'duplicate' })
  const ent = await (await page.request.get('/api/v1/entitlements')).json()
  expect(ent.products.find((p: { productId: string }) => p.productId === 'synquei').access).toBe('contracted')
  expect(ent.products.find((p: { productId: string }) => p.productId === 'nossom').access).toBe('available')
})

test('console de administração não existe para quem não é da plataforma', async ({ page }) => {
  await signupAndOrg(page, 'Org comum')
  const r = await page.goto('/admin')
  expect(r?.status()).toBe(404)
})

test('páginas públicas e mobile sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/planos', '/entrar']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
  await page.goto('/planos')
  await expect(page.getByText('Contratação online ainda fechada')).toBeVisible()
  await expect(page.getByText('Preço a definir').first()).toBeVisible()
})
