// Console da plataforma (/admin): só papel de plataforma, online agora, pessoas por segmento, troca de plano, CSV e axe.
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const CONSOLE = ['/admin', '/admin/pessoas', '/admin/planos', '/admin/lancamento', '/admin/apps']

async function signupAndOrg(page: Page, name: string, org: string) {
  const address = `adm-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome: name, email: address, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(org)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  return address
}

/** Promove a conta a admin da plataforma direto no banco de e2e (o console não tem cadastro de admin). */
async function promote(address: string) {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set platform_role = 'admin', email_verified_at = coalesce(email_verified_at, now()) where email = ${address}`
  await sql.end()
}

async function axe(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} · ${v.nodes[0]?.target.join(' ')}`)
  expect(summary, `${path}\n${summary.join('\n')}`).toEqual([])
}

test('console não existe para quem não é da plataforma', async ({ page }) => {
  await signupAndOrg(page, 'Pessoa comum', 'Org comum')
  for (const path of [...CONSOLE, '/admin/online', '/admin/pessoas/csv', `/admin/pessoas/${randomUUID()}`]) {
    const r = await page.goto(path)
    expect(r?.status(), path).toBe(404)
  }
})

test('admin vê online agora, acha a pessoa por segmento, troca o plano, exporta e a tela passa no axe', async ({ page, context, baseURL }) => {
  const address = await signupAndOrg(page, 'Admin E2E', 'Org do admin')
  await promote(address)

  await page.goto('/admin')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible()
  await expect(page.getByText('Online agora')).toBeVisible()
  const online = await (await page.request.get('/admin/online')).json()
  expect(online.total).toBeGreaterThanOrEqual(1) // a própria sessão
  await expect(page.locator('.adm-online__n')).toHaveText(String(online.total))

  await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Pessoas' }).click()
  await page.waitForURL('**/admin/pessoas')
  await expect(page.getByRole('heading', { level: 1, name: 'Pessoas' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Buscar' }).fill(address)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.waitForURL(/q=/)
  const row = page.locator('.person').filter({ hasText: address })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Conta Absolute ZRO')
  await expect(row).toContainText('Online')

  // Segmento Grátis tem a pessoa; Avulso ainda não.
  await page
    .getByRole('navigation', { name: 'Segmentos' })
    .getByRole('link', { name: /Grátis/ })
    .click()
  await expect(page.locator('.person').filter({ hasText: address })).toHaveCount(1)
  await page
    .getByRole('navigation', { name: 'Segmentos' })
    .getByRole('link', { name: /Avulso/ })
    .click()
  await expect(page.locator('.person').filter({ hasText: address })).toHaveCount(0)

  await page.goto(`/admin/pessoas?q=${encodeURIComponent(address)}`)
  await page.locator('.person').filter({ hasText: address }).getByRole('link').click()
  await page.waitForURL(/\/admin\/pessoas\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Admin E2E' })).toBeVisible()
  const person = new URL(page.url()).pathname

  await page.getByText('Trocar plano…').click()
  await page.getByLabel('Plano de Org do admin').selectOption({ label: 'Synquei · mensal' })
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Plano trocado.')).toBeVisible()
  await page.reload()
  await expect(page.locator('.org-plan')).toContainText('Synquei · manual')
  await expect(page.locator('.who')).toContainText('Avulso')

  await page.getByText('Suspender conta', { exact: true }).click()
  await expect(page.getByText('Esta é a sua conta: não dá para suspender a si mesmo.')).toBeVisible()
  await page.getByText('Histórico', { exact: true }).click()
  await expect(page.getByText('Plano trocado').first()).toBeVisible()

  await page.goto(`/admin/pessoas?seg=avulso&q=${encodeURIComponent(address)}`)
  await expect(page.locator('.person').filter({ hasText: address })).toHaveCount(1)

  const csv = await page.request.get(`/admin/pessoas/csv?q=${encodeURIComponent(address)}`)
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')
  const body = await csv.text()
  expect(body).toContain(address)
  expect(body).toContain('Synquei (Manual)')
  expect(body).toContain('Avulso')

  for (const theme of ['dark', 'light']) {
    await context.addCookies([{ name: 'zro_theme', value: theme, url: baseURL ?? 'http://localhost:3000' }])
    for (const path of [...CONSOLE, person]) await axe(page, path)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [...CONSOLE, person]) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
