// O rádio do set dentro do HUB (ADR 0042, absolutezro.com/radio): no ar desde a 0062, então conta comum entra (página,
// scripts e API); duas contas de admin entram com a conta do HUB, uma cria a diária e a outra entra pelo link do
// QR e escolhe o setor, as duas ligam o rádio (microfone falso do Chromium), se conectam, a fala segurada acende o Geral
// do outro lado e o aviso de set ocupa a tela.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta, entrar } from './conversa'

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

test('sem login (link aberto num navegador fora da conta): vai para o entrar e volta ao rádio com o código', async ({ browser }) => {
  const admin = await conta(browser, 'Volta', true)
  const fora = await (await browser.newContext()).newPage()
  await fora.goto('/radio?d=ABC234')
  await fora.waitForURL(/\/entrar\?next=/)
  expect(decodeURIComponent(new URL(fora.url()).searchParams.get('next') ?? '')).toBe('/radio?d=ABC234')
  await expect(fora.locator('body')).not.toContainText('Rádio')
  // a mesma conta, entrando neste navegador, cai no rádio
  await entrar(fora, admin.email, 'senha-e2e-segura-1')
  await fora.waitForURL(/\/radio\?d=ABC234/)
  await expect(fora.locator('#pg-inicio, #pg-noar, #pg-diarias').first()).toBeAttached()
})

test('conta comum (no ar, 0062): entra no rádio (página, scripts e API)', async ({ browser }) => {
  const page = await conta(browser, 'Comum', false)
  for (const p of ['/radio', '/radio/app/app.js', '/radio/app/app.css']) expect((await page.goto(p))?.status(), p).toBe(200)
  expect((await page.request.get('/api/v1/radio/diarias')).status()).toBe(200)
})

test('duas contas de admin: criar diária, entrar pelo link, ligar o rádio, falar e mandar aviso', async ({ browser }) => {
  test.setTimeout(120_000)
  const ana = await conta(browser, 'Ana', true)
  const erros: string[] = []
  ana.on('pageerror', (e) => erros.push(String(e)))
  const r = await ana.goto('/radio')
  expect(r?.status()).toBe(200)
  expect(r?.headers()['permissions-policy']).toContain('microphone=(self)')
  // servidores de conexão: sem a chave TURN no ambiente de teste, só STUN
  const ice = await (await ana.request.get('/api/v1/radio/ice')).json()
  expect(ice.turn).toBe(false)
  expect(ice.iceServers[0].urls).toContain('stun:stun.cloudflare.com:3478')
  await ana.waitForSelector('#pg-inicio:not([hidden])')
  // no celular (o tamanho destas contas) a lateral some: Diárias e o TALK ficam nas abas de baixo
  await ana.locator('[data-ir="diarias"]:visible').first().click()
  await ana.fill('#criar-nome', 'Comercial')
  await ana.click('#criar button')
  await ana.waitForSelector('#noar:not([hidden])')
  const codigo = (await ana.textContent('#codigo'))!.trim()
  expect(ana.url()).toContain(`/radio?d=${codigo}`)

  const bia = await conta(browser, 'Bia', true)
  bia.on('pageerror', (e) => erros.push(String(e)))
  await bia.goto(`/radio?d=${codigo}`)
  await bia.waitForSelector('#noar:not([hidden])')
  await expect(bia.locator('#diaria-nome')).toHaveText('Comercial')
  // quem entra pelo link escolhe o setor
  await expect(bia.locator('#setor-folha')).toBeVisible()
  await bia.click('#setores [data-canal="som"]')
  await expect(bia.locator('#setor-folha')).toBeHidden()

  for (const p of [ana, bia]) await p.click('#ligar-btn')
  for (const p of [ana, bia])
    await p.waitForFunction(() => document.querySelectorAll('#pessoas .pessoa[data-estado="ligado"]').length === 2, null, { timeout: 40_000 })

  const caixa = (await ana.locator('#ptt:visible, #ptt-aba:visible').first().boundingBox())!
  await ana.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await ana.mouse.down()
  await ana.waitForTimeout(400) // segurou: push-to-talk (um toque travaria o TALK aberto)
  await expect(bia.locator('#no-ar')).toHaveText(/Ana · Geral/)
  await expect(bia.locator('.canal[data-canal="geral"]')).toHaveClass(/is-no-ar/)
  await ana.mouse.up()
  await expect(bia.locator('#no-ar')).toHaveText('')

  await ana.click('#avisos [data-aviso="acao"]')
  await expect(bia.locator('#aviso-tela')).toBeVisible()
  await expect(bia.locator('#aviso-texto')).toHaveText('Gravando')
  // no Gravando o set fica em silêncio, menos a Direção e o Som: a Bia (Som) segue podendo falar
  await expect(bia.locator('#eu-calado')).toBeHidden()
  expect(erros).toEqual([])
})

test('Admin › Apps: o RADION aparece aberto e a lista de acesso segue no cartão', async ({ browser }) => {
  const chefe = await conta(browser, 'Chefe', true)
  const convidada = await conta(browser, 'Convidada', false)
  expect((await convidada.goto('/radio'))?.status()).toBe(200)
  await chefe.goto('/admin/apps')
  const cartao = chefe.locator('.app-card--radio')
  await expect(cartao).toBeVisible()
  await expect(cartao.getByText('Aberto')).toBeVisible()
  await cartao.getByLabel('E-mail de quem pode entrar').fill(convidada.email.toUpperCase())
  await cartao.getByRole('button', { name: 'Dar acesso' }).click()
  await expect(cartao.getByRole('status')).toContainText('já entra no rádio')
  await chefe.reload()
  await expect(chefe.locator('.radio-acesso')).toContainText(convidada.email)
})
