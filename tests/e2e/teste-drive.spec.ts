// Teste do Drive (/admin/teste-drive): 404 para quem não é admin (nem o suporte), a lista do que falta configurar quando
// as variáveis do Google não existem (o e2e nunca as tem), a CSP com o Google só nesta rota e o resultado de exemplo
// (fictício, fora de produção). Nenhum script nem chamada do Google acontece aqui.
// Fotos (opcional): TESTE_DRIVE_FOTOS=<pasta> tira computador e iPhone (393 px), tema claro.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const FOTOS = process.env.TESTE_DRIVE_FOTOS || ''

async function conta(page: Page, nome: string) {
  const email = `tdrive-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome, email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(`Org ${nome}`)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  return email
}

async function papel(email: string, role: 'admin' | 'support') {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set platform_role = ${role}, email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`
  await sql.end()
}

/** Toda requisição a um domínio do Google, para provar que nada sai daqui. */
function vigiarGoogle(page: Page) {
  const urls: string[] = []
  page.on('request', (r) => {
    if (/google(apis)?\.com|gstatic\.com/.test(new URL(r.url()).hostname)) urls.push(r.url())
  })
  return urls
}

async function foto(page: Page, nome: string) {
  if (!FOTOS) return
  fs.mkdirSync(FOTOS, { recursive: true })
  const antes = page.viewportSize()!
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  for (const [larg, alt, sufixo] of [
    [1440, 900, 'computador'],
    [393, 852, 'iphone'],
  ] as const) {
    await page.setViewportSize({ width: larg, height: alt })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(FOTOS, `${nome}-claro-${sufixo}.png`), fullPage: true })
  }
  await page.setViewportSize(antes)
}

test('o teste do Drive não existe para quem não é admin da plataforma (nem para o suporte)', async ({ page }) => {
  const google = vigiarGoogle(page)
  const email = await conta(page, 'Cliente Drive')
  expect((await page.goto('/admin/teste-drive'))?.status()).toBe(404)
  expect((await page.goto('/admin/teste-drive?exemplo=1'))?.status()).toBe(404)
  await papel(email, 'support')
  expect((await page.goto('/admin'))?.status()).toBe(200)
  expect((await page.goto('/admin/teste-drive'))?.status()).toBe(404)
  // Fora do menu do console, de propósito.
  await page.goto('/admin')
  await expect(page.locator('a[href^="/admin/teste-drive"]')).toHaveCount(0)
  expect(google).toEqual([])
})

test('sem login, a rota leva para entrar', async ({ page }) => {
  await page.goto('/admin/teste-drive')
  await expect(page).toHaveURL(/\/entrar/)
})

test('admin vê o que falta configurar; a CSP com o Google vale só nesta rota', async ({ page }) => {
  const google = vigiarGoogle(page)
  // Sem a entrada animada: o axe mede a cor final, não a do meio da transição.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const email = await conta(page, 'Titular Drive')
  await papel(email, 'admin')

  const r = await page.goto('/admin/teste-drive')
  expect(r?.status()).toBe(200)
  const csp = r!.headers()['content-security-policy'] ?? ''
  expect(csp).toContain('script-src')
  for (const origem of [
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://www.googleapis.com',
    'https://content.googleapis.com',
    'https://docs.google.com',
  ])
    expect(csp).toContain(origem)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(r!.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups')
  // Noutras rotas (inclusive do console), nada do Google.
  for (const outra of ['/admin', '/inicio']) {
    const h = (await page.request.get(outra)).headers()
    expect(h['content-security-policy'], outra).not.toMatch(/google|script-src/)
    expect(h['cross-origin-opener-policy'], outra).toBe('same-origin')
  }

  await expect(page.getByRole('heading', { level: 1, name: 'Teste do Drive' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Faltam configurações' })).toBeVisible()
  for (const nome of ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_PICKER_API_KEY', 'NEXT_PUBLIC_GOOGLE_APP_ID'])
    await expect(page.locator('.td-vars li').filter({ hasText: nome })).toContainText('Falta')
  await expect(page.getByText('https://absolutezro.com/*')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Escolher a pasta' })).toHaveCount(0)
  expect(await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute('content'))).toMatch(/noindex/)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([])
  await foto(page, 'faltam-configuracoes')

  // Resultado de exemplo (fictício, só fora de produção): veredito, fluxos e as 8 checagens.
  await page.goto('/admin/teste-drive?exemplo=1')
  await expect(page.getByRole('note')).toContainText('Exemplo com dados fictícios')
  await expect(page.getByRole('heading', { name: 'drive.file cobre só parte' })).toBeVisible()
  const checks = page.getByRole('list', { name: 'Checagens' }).locator('li')
  await expect(checks).toHaveCount(8)
  await expect(checks.nth(1)).toContainText('Falhou')
  await expect(checks.nth(1)).toContainText('HTTP 200')
  await expect(checks.nth(1)).toContainText('Voltou 0 itens')
  await expect(checks.nth(2)).toContainText('Não deu para testar')
  const fluxos = page.getByRole('list', { name: 'Fluxos do SOBEDESCE' })
  await expect(fluxos.locator('li').filter({ hasText: 'Backup do Drive' })).toContainText('quebra')
  await expect(fluxos.locator('li').filter({ hasText: 'Para o Drive' })).toContainText('funciona')
  await expect(page.getByRole('button', { name: 'Escolher a pasta' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Copiar resultado' })).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([])
  await foto(page, 'resultado-exemplo')

  expect(google).toEqual([])
})
