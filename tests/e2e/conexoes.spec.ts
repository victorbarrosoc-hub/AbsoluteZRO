// Conexões (ADR 0026) no servidor de produção local, com o Google falso (tests/fixtures/google-falso.ts) na porta do
// playwright.config.ts: vazio, conectar, cancelar, agendas, app desligado, reconectar e desconectar.
// E2E_CAPTURAS=<pasta> guarda as capturas (claro/escuro, computador/celular).
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { iniciarGoogleFalso, type GoogleFalso } from '../fixtures/google-falso'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PORTA_GOOGLE = Number(process.env.E2E_GOOGLE_PORT || 3298)
const CAPTURAS = process.env.E2E_CAPTURAS

let google: GoogleFalso
test.beforeAll(async () => {
  google = await iniciarGoogleFalso({ porta: PORTA_GOOGLE, clientId: 'google-e2e' })
})
test.afterAll(async () => {
  await google.fechar()
})

async function contaComOrg(page: Page) {
  const email = `e2e-cx-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Diana', email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill('Produtora Conexões')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  return email
}

async function capturar(page: Page, nome: string) {
  if (!CAPTURAS) return
  for (const tema of ['claro', 'escuro'] as const) {
    await page.context().addCookies([{ name: 'zro_theme', value: tema === 'claro' ? 'light' : 'dark', url: page.url() }])
    await page.reload()
    await page.locator('.conexoes').waitFor()
    await page.screenshot({
      path: path.join(CAPTURAS, `hub-${nome}-${tema}-${(page.viewportSize()?.width ?? 0) < 600 ? 'celular' : 'computador'}.png`),
      fullPage: true,
    })
  }
  await page.context().addCookies([{ name: 'zro_theme', value: 'light', url: page.url() }])
}

test('Conexões: vazio, cancelar, conectar, agendas e apps, reconectar e desconectar', async ({ page }) => {
  const email = await contaComOrg(page)
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  try {
    // Pela central da conta.
    await page.goto('/perfil')
    await page.locator('.account-nav').getByRole('link', { name: 'Conexões' }).click()
    await expect(page).toHaveURL(/\/conexoes$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Conexões' })).toBeVisible()
    const agenda = page.locator('article.conexao').filter({ has: page.getByRole('heading', { name: 'Google Agenda' }) })
    await expect(agenda).toContainText('Não conectada')
    await expect(page.locator('article.conexao').filter({ hasText: 'Google Drive' })).toContainText('Pelo SOBEDESCE')
    await expect(page.getByRole('link', { name: /Abrir no SOBEDESCE/ })).toHaveAttribute('href', /\/conta$/)
    await capturar(page, 'conexoes-vazia')

    // Cancelar na tela do Google: volta com a mensagem e nada muda.
    google.estado.decisao = 'negar'
    await agenda.getByRole('link', { name: 'Conectar' }).click()
    await expect(page).toHaveURL(/erro=cancelado/)
    await expect(page.getByText('Conexão cancelada. Nada mudou.')).toBeVisible()
    // Permissão da Agenda desmarcada.
    google.estado.decisao = 'sem_agenda'
    await agenda.getByRole('link', { name: 'Conectar' }).click()
    await expect(page.getByText('Marque as permissões da Agenda na tela do Google para conectar.')).toBeVisible()

    // Conectar.
    google.estado.decisao = 'aceitar'
    await agenda.getByRole('link', { name: 'Conectar' }).click()
    await expect(page).toHaveURL(/ok=google/)
    await expect(page.getByText('Google Agenda conectado.')).toBeVisible()
    await expect(agenda).toContainText('pessoa@gmail.test')
    await expect(agenda.locator('.conexao__selo')).toHaveText(/Conectada/)
    const [u] = await sql`select id from zro.users where email = ${email}`
    const [c] = await sql`select id, refresh_token_enc from zro.conexoes where user_id = ${u!.id as string}`
    expect(String(c!.refresh_token_enc)).toMatch(/^v1\./)
    // O Maestro já usou: aparece em "Usado por".
    await sql`insert into zro.conexao_apps (conexao_id, app, usado_em) values (${c!.id as string}, 'maestro', now())`
    await page.reload()
    await expect(agenda.getByText('Pessoa · principal')).toBeVisible()
    await expect(agenda.getByText('Trabalho')).toBeVisible()
    await expect(agenda.getByText(/usou agora/)).toBeVisible()
    await capturar(page, 'conexoes-conectada')

    // Agendas: ligar "Trabalho" salva sozinho.
    await agenda.locator('label', { hasText: 'Trabalho' }).locator('input').check()
    await expect(agenda.getByText('Agendas salvas.')).toBeVisible()
    await expect
      .poll(async () => (await sql`select calendarios from zro.conexoes where id = ${c!.id as string}`)[0]!.calendarios)
      .toEqual(['primary', 'trabalho@group.calendar.google.com'])
    // Desligar o Maestro.
    await agenda.getByLabel('Maestro pode usar').uncheck()
    await expect.poll(async () => (await sql`select ativo from zro.conexao_apps where conexao_id = ${c!.id as string}`)[0]!.ativo).toBe(false)

    // O Google pediu para conectar de novo.
    await sql`update zro.conexoes set estado = 'reconectar', refresh_token_enc = null, access_token_enc = null where id = ${c!.id as string}`
    await page.reload()
    await expect(agenda).toContainText('Precisa conectar de novo')
    await expect(agenda.getByRole('link', { name: 'Conectar de novo' })).toBeVisible()
    await agenda.getByRole('link', { name: 'Conectar de novo' }).click()
    await expect(page.getByText('Google Agenda conectado.')).toBeVisible()

    // Desconectar: dois toques, revoga no Google e apaga.
    const revogadosAntes = google.estado.revogados.length
    await agenda.getByRole('button', { name: 'Desconectar' }).click()
    await agenda.getByRole('button', { name: 'Desconectar' }).click()
    await expect(page.getByText('Google Agenda desconectado.')).toBeVisible()
    await expect(agenda).toContainText('Não conectada')
    expect(google.estado.revogados.length).toBe(revogadosAntes + 1)
    expect(await sql`select 1 from zro.conexoes where user_id = ${u!.id as string}`).toHaveLength(0)
  } finally {
    await sql.end()
  }
})

test('Conexões no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await contaComOrg(page)
  await page.goto('/conexoes')
  await expect(page.locator('.conexoes')).toBeVisible()
  // Sem rolagem lateral.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await capturar(page, 'conexoes-vazia')
  google.estado.decisao = 'aceitar'
  await page.getByRole('link', { name: 'Conectar' }).click()
  await expect(page.getByText('Google Agenda conectado.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await capturar(page, 'conexoes-conectada')
})

test('Conexões exige sessão', async ({ page }) => {
  await page.goto('/conexoes')
  await expect(page).toHaveURL(/\/entrar/)
  await page.goto('/conexoes/google')
  await expect(page).toHaveURL(/\/entrar/)
})
