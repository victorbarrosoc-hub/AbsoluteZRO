// O rádio do set dentro do HUB (ADR 0042, absolutezro.com/radio): não lançado, então conta comum recebe 404 na página,
// nos scripts e na API; duas contas de admin entram com a conta do HUB, uma cria a diária e a outra entra pelo link do
// QR e escolhe o setor, as duas ligam o rádio (microfone falso do Chromium), se conectam, a fala segurada acende o Geral
// do outro lado e o aviso de set ocupa a tela.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const RAIZ = fileURLToPath(new URL('../..', import.meta.url))

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
})

test.beforeAll(async () => {
  // o schema do rádio no banco de e2e, como em produção (papel radio_app e as migrações de products/radio)
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  const [tem] = await sql`select to_regclass('radio.migracoes') is not null as ok`
  if (!tem?.ok) {
    await sql.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'radio_app') then create role radio_app nologin; end if; end $$;
      create schema if not exists radio;
      create table if not exists radio.migracoes (nome text primary key, sha text not null, aplicada timestamptz not null default now());`)
    const pasta = path.join(RAIZ, 'products/radio/db/migrations')
    for (const f of readdirSync(pasta).sort()) await sql.unsafe(readFileSync(path.join(pasta, f), 'utf8'))
    await sql.unsafe(readFileSync(path.join(RAIZ, 'infra/migrations/0059_radio_no_hub.sql'), 'utf8'))
  }
  await sql.end()
})

async function conta(browser: Browser, nome: string, admin: boolean): Promise<Page & { email: string }> {
  const ctx = await browser.newContext({ permissions: ['microphone'], viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const email = `radio-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome, email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(`Produtora ${nome}`)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  if (admin) {
    const sql = postgres(DB, { max: 1, onnotice: () => {} })
    await sql`update zro.users set platform_role = 'admin', email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`
    await sql.end()
  }
  return Object.assign(page, { email })
}

test('conta comum: o rádio não existe (página, scripts e API dão 404)', async ({ browser }) => {
  const page = await conta(browser, 'Comum', false)
  for (const p of ['/radio', '/radio/app/app.js', '/radio/app/app.css']) expect((await page.goto(p))?.status(), p).toBe(404)
  const api = await page.request.get('/api/v1/radio/diarias')
  expect(api.status()).toBe(404)
})

test('duas contas de admin: criar diária, entrar pelo link, ligar o rádio, falar e mandar aviso', async ({ browser }) => {
  test.setTimeout(120_000)
  const ana = await conta(browser, 'Ana', true)
  const erros: string[] = []
  ana.on('pageerror', (e) => erros.push(String(e)))
  const r = await ana.goto('/radio')
  expect(r?.status()).toBe(200)
  expect(r?.headers()['permissions-policy']).toContain('microphone=(self)')
  await ana.waitForSelector('#tela-diarias:not([hidden])')
  await ana.fill('#criar-nome', 'Comercial')
  await ana.click('#criar button')
  await ana.waitForSelector('#tela-radio:not([hidden])')
  const codigo = (await ana.textContent('#codigo'))!.trim()
  expect(ana.url()).toContain(`/radio?d=${codigo}`)

  const bia = await conta(browser, 'Bia', true)
  bia.on('pageerror', (e) => erros.push(String(e)))
  await bia.goto(`/radio?d=${codigo}`)
  await bia.waitForSelector('#tela-radio:not([hidden])')
  await expect(bia.locator('#diaria-nome')).toHaveText('Comercial')
  // quem entra pelo link escolhe o setor
  await expect(bia.locator('#setor-folha')).toBeVisible()
  await bia.click('#setores [data-canal="som"]')
  await expect(bia.locator('#setor-folha')).toBeHidden()

  for (const p of [ana, bia]) await p.click('#ligar-btn')
  for (const p of [ana, bia])
    await p.waitForFunction(() => document.querySelectorAll('#pessoas li[data-estado="ligado"]').length === 2, null, { timeout: 40_000 })

  const caixa = (await ana.locator('#ptt').boundingBox())!
  await ana.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await ana.mouse.down()
  await ana.waitForTimeout(400) // segurou: push-to-talk (um toque travaria o TALK aberto)
  await expect(bia.locator('#no-ar')).toHaveText(/Ana · Geral/)
  await expect(bia.locator('.faixa[data-canal="geral"]')).toHaveClass(/is-no-ar/)
  await ana.mouse.up()
  await expect(bia.locator('#no-ar')).toHaveText('')

  await ana.click('[data-aviso="acao"]')
  await expect(bia.locator('#aviso-tela')).toBeVisible()
  await expect(bia.locator('#aviso-texto')).toHaveText('Ação')
  expect(erros).toEqual([])
})

test('Admin › Apps: dar acesso ao rádio pelo e-mail, a pessoa entra, tirar e ela sai', async ({ browser }) => {
  const chefe = await conta(browser, 'Chefe', true)
  const convidada = await conta(browser, 'Convidada', false)
  expect((await convidada.goto('/radio'))?.status()).toBe(404)

  await chefe.goto('/admin/apps')
  const cartao = chefe.locator('.app-card--radio')
  await expect(cartao).toBeVisible()
  await expect(cartao.getByText('Fechado')).toBeVisible()

  // e-mail sem conta: diz isso e não libera ninguém
  await cartao.getByLabel('E-mail de quem pode entrar').fill('ninguem-aqui@teste.absolutezro.local')
  await cartao.getByRole('button', { name: 'Dar acesso' }).click()
  await expect(cartao.getByRole('alert')).toContainText('ainda não tem conta')

  await cartao.getByLabel('E-mail de quem pode entrar').fill(convidada.email.toUpperCase())
  await cartao.getByRole('button', { name: 'Dar acesso' }).click()
  await expect(cartao.getByRole('status')).toContainText('já entra no rádio')
  await chefe.reload()
  await expect(chefe.locator('.radio-acesso')).toContainText(convidada.email)

  // a convidada entra (o gate é lido a cada pedido, sem novo login)
  expect((await convidada.goto('/radio'))?.status()).toBe(200)
  await expect(convidada.locator('#tela-diarias')).toBeVisible()

  // tirar: na hora volta a não existir
  await chefe.locator('.radio-acesso li').filter({ hasText: convidada.email }).getByRole('button', { name: 'Tirar' }).click()
  // a linha sai da lista (é o retorno da ação)
  await expect(chefe.locator('.app-card--radio')).not.toContainText(convidada.email)
  expect((await convidada.goto('/radio'))?.status()).toBe(404)
})
