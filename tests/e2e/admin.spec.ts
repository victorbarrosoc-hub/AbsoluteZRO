// Painel de pessoas do console (/admin/pessoas): só papel de plataforma, troca de plano, CSV e axe.
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'

async function signupAndOrg(page: Page, name: string, org: string) {
  const address = `adm-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await page.getByLabel('Nome').fill(name)
  await page.getByLabel('E-mail').fill(address)
  await page.getByLabel('Senha').fill('senha-e2e-segura-1')
  await page.getByRole('button', { name: 'Criar conta' }).click()
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

test('painel de pessoas não existe para quem não é da plataforma', async ({ page }) => {
  await signupAndOrg(page, 'Pessoa comum', 'Org comum')
  for (const path of ['/admin/pessoas', '/admin/pessoas/csv', `/admin/pessoas/${randomUUID()}`]) {
    const r = await page.goto(path)
    expect(r?.status(), path).toBe(404)
  }
})

test('admin vê pessoas, troca o plano, exporta CSV e a tela passa no axe', async ({ page, context, baseURL }) => {
  const address = await signupAndOrg(page, 'Admin E2E', 'Org do admin')
  await promote(address)

  await page.goto('/admin')
  await page.getByRole('link', { name: 'Pessoas' }).first().click()
  await page.waitForURL('**/admin/pessoas')
  await expect(page.getByRole('heading', { level: 1, name: 'Pessoas' })).toBeVisible()
  await expect(page.getByText('Contas', { exact: true })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Buscar' }).fill(address)
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await page.waitForURL(/q=/)
  const row = page.locator('.person-row').filter({ hasText: address })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Org do admin')
  await expect(row).toContainText('Conta Absolute ZRO · grátis')

  await row.getByLabel('Plano de Org do admin').selectOption({ label: 'Synquei (v1)' })
  await row.getByRole('button', { name: 'Salvar' }).click()
  await expect(row.getByText('Plano trocado.')).toBeVisible()
  await page.reload()
  await expect(page.locator('.person-row').filter({ hasText: address })).toContainText('Synquei · manual')

  const csv = await page.request.get(`/admin/pessoas/csv?q=${encodeURIComponent(address)}`)
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')
  const body = await csv.text()
  expect(body).toContain(address)
  expect(body).toContain('Synquei (Manual)')

  await page.locator('.person-row').filter({ hasText: address }).getByRole('link', { name: 'Admin E2E' }).click()
  await page.waitForURL(/\/admin\/pessoas\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Admin E2E' })).toBeVisible()
  await expect(page.getByText('Esta é a sua conta: não dá para suspender a si mesmo.')).toBeVisible()
  await expect(page.getByText('Plano trocado').first()).toBeVisible()
  const person = new URL(page.url()).pathname

  for (const theme of ['dark', 'light']) {
    await context.addCookies([{ name: 'zro_theme', value: theme, url: baseURL ?? 'http://localhost:3000' }])
    await axe(page, '/admin/pessoas')
    await axe(page, person)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/admin/pessoas', person]) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
    if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/mobile${path === person ? '-pessoa' : ''}.png`, fullPage: true })
  }
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/admin/pessoas')
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/desktop.png`, fullPage: true })
    await page.goto(person)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/desktop-pessoa.png`, fullPage: true })
  }
})
