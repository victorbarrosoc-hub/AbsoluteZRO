// Set (ADR 0031): duas pessoas da mesma equipe se veem online (e onde), invisível esconde, conversa direta só depois do
// pedido aceito, a conversa do projeto aberta pela página do projeto, denunciar e bloquear. Em Chromium e WebKit, no
// computador e no iPhone. Com SHOTS_DIR, guarda capturas (claro e escuro) e vídeos de cada navegador.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices, expect, test, webkit, type Browser, type BrowserContext, type BrowserType, type Page } from '@playwright/test'
import { authenticate, SESSION_COOKIE, signUp } from '@zro/auth'
import { createOrganization } from '@zro/core'
import { createDatabase, type Database } from '@zro/db'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const SHOTS = process.env.SHOTS_DIR
const marca = () => randomUUID().slice(0, 6)
let db: Database

test.beforeAll(() => {
  db = createDatabase(DB, { max: 2 })
})
test.afterAll(async () => {
  await db.close()
})

type Conta = { userId: string; token: string; orgId: string; arroba: string; nome: string }

/** Conta com @, e-mail confirmado e organização própria (pelo mesmo código do cadastro, sem passar pela tela). */
async function conta(nome: string): Promise<Conta> {
  const arroba = `${nome.toLowerCase()}.${marca()}`
  const r = await signUp(db, { email: `set-${marca()}@teste.absolutezro.local`, password: 'senha-e2e-segura-1', displayName: nome, arroba })
  await db.sql`update zro.users set email_verified_at = now() where id = ${r.userId}`
  const org = await createOrganization(db, (await authenticate(db, r.session.token))!, { name: `Produtora ${nome}` })
  return { userId: r.userId, token: r.session.token, orgId: org.id, arroba, nome }
}

async function naEquipe(p: Conta, orgId: string) {
  await db.sql`insert into zro.memberships (org_id, user_id, role) values (${orgId}, ${p.userId}, 'editor')`
  await db.sql`update zro.sessions set active_org_id = ${orgId} where user_id = ${p.userId}`
}

const ARQUIVOS = path.resolve(SHOTS ?? '.', 'video')

async function aba(b: Browser, baseURL: string, p: Conta, opts: Parameters<Browser['newContext']>[0], video: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await b.newContext({ ...opts, baseURL, ...(video && SHOTS ? { recordVideo: { dir: ARQUIVOS, size: opts?.viewport ?? undefined } } : {}) })
  await ctx.addCookies([{ name: SESSION_COOKIE, value: p.token, url: baseURL }])
  ctx.setDefaultTimeout(20_000)
  return { ctx, page: await ctx.newPage() }
}

async function foto(page: Page, nome: string) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  for (const tema of ['claro', 'escuro'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema === 'claro' ? 'light' : 'dark')
    await page.waitForTimeout(350)
    await page.screenshot({ path: path.join(SHOTS, `${nome}-${tema}.png`) })
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
}

const pilula = (page: Page) => page.locator('zro-set.topbar__set .pilula')
const folha = (page: Page) => page.getByRole('dialog', { name: 'Set' })
const naPagina = (page: Page) => page.locator('zro-set[modo=pagina] .painel')

const COMBOS: [string, BrowserType, Parameters<Browser['newContext']>[0]][] = [
  ['Chromium-computador', chromium, { viewport: { width: 1440, height: 900 } }],
  ['WebKit-iphone', webkit, { ...devices['iPhone 15'] }],
  ['WebKit-computador', webkit, { viewport: { width: 1280, height: 820 } }],
  ['Chromium-iphone', chromium, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
]

for (const [nome, tipo, opts] of COMBOS) {
  test(`Set (${nome}): online na equipe, invisível, conversa depois do aceite, projeto, denunciar e bloquear`, async ({ baseURL }) => {
    test.setTimeout(180_000)
    const principal = nome === 'Chromium-computador' || nome === 'WebKit-iphone'
    const b = await tipo.launch()
    try {
      const victor = await conta('Victor')
      const bia = await conta('Bia')
      const caio = await conta('Caio')
      await naEquipe(bia, victor.orgId)
      const A = await aba(b, baseURL!, victor, opts, principal)
      const B = await aba(b, baseURL!, bia, opts, false)
      const C = await aba(b, baseURL!, caio, opts, false)

      // 1. Bia entra; Victor vê Bia online e onde ela está
      await B.page.goto('/inicio')
      await expect(pilula(B.page)).toBeVisible()
      await A.page.goto('/inicio')
      await expect(pilula(A.page)).toHaveAttribute('aria-label', /1 pessoa online/)
      await pilula(A.page).click()
      const f = folha(A.page)
      await expect(f.getByRole('button', { name: /Bia/ })).toContainText('na Absolute ZRO')
      if (principal) await foto(A.page, `set-online-${nome}`)
      await f.getByRole('button', { name: 'Fechar' }).click()

      // 2. Bia fica invisível: some do "Agora" para o Victor
      await pilula(B.page).click()
      await folha(B.page).getByRole('button', { name: 'Invisível' }).click()
      await expect(folha(B.page).getByRole('button', { name: 'Invisível' })).toHaveAttribute('aria-pressed', 'true')
      await A.page.reload()
      await expect(pilula(A.page)).toHaveAttribute('aria-label', /ninguém online/)
      await pilula(A.page).click()
      await expect(folha(A.page).getByRole('button', { name: /Bia/ })).not.toContainText('Absolute ZRO')
      await folha(A.page).getByRole('button', { name: 'Fechar' }).click()

      // 3. Caio (outra produtora) só conversa depois que o Victor aceita
      await C.page.goto('/set?ajustes')
      const pc = naPagina(C.page)
      await pc.getByRole('textbox', { name: '@ da pessoa' }).fill(`@${victor.arroba}`)
      await pc.getByRole('button', { name: 'Pedir' }).click()
      await expect(pc.getByRole('status')).toContainText('Pedido enviado')
      await A.page.goto('/set?ajustes')
      const pa = naPagina(A.page)
      await expect(pa.getByText('Pedidos')).toBeVisible()
      if (principal) await foto(A.page, `set-pedido-${nome}`)
      await pa.getByRole('button', { name: 'Aceitar' }).click()
      await expect(pa.getByRole('status')).toContainText('Agora vocês são contatos')
      await pa.getByRole('button', { name: 'Conversar' }).click()
      const campoA = pa.getByRole('textbox', { name: 'Mensagem' })
      await campoA.fill('Oi, Caio! Vê o corte em https://absolutezro.com')
      await campoA.press('Enter')
      await expect(pa.getByRole('log')).toContainText('Oi, Caio!')
      await expect(pa.getByRole('log').getByRole('link', { name: 'https://absolutezro.com' })).toBeVisible()

      await C.page.goto('/set')
      await naPagina(C.page).getByRole('tab', { name: /Conversas/ }).click()
      await expect(naPagina(C.page).getByRole('tab', { name: /Conversas/ })).toContainText('1')
      await naPagina(C.page).getByRole('button', { name: /Victor/ }).click()
      await expect(naPagina(C.page).getByRole('log')).toContainText('Oi, Caio!')
      const campoC = naPagina(C.page).getByRole('textbox', { name: 'Mensagem' })
      await campoC.fill('Oi! Vi sim.')
      await campoC.press('Enter')
      // a conversa aberta do Victor recebe sozinha (a cada 4 s)
      await expect(pa.getByRole('log')).toContainText('Oi! Vi sim.', { timeout: 15_000 })
      if (principal) await foto(A.page, `set-conversa-${nome}`)

      // 4. A conversa do projeto: a Bia escreve pelo /set?projeto, o Victor abre pela página do projeto
      const [pj] = await db.sql`insert into zro.projects (org_id, title, created_by) values (${victor.orgId}, 'Filme Safra', ${victor.userId}) returning id`
      await B.page.goto(`/set?projeto=${pj!.id as string}`)
      const campoB = naPagina(B.page).getByRole('textbox', { name: 'Mensagem' })
      await campoB.fill('Diária confirmada para sexta.')
      await campoB.press('Enter')
      await expect(naPagina(B.page).getByRole('log')).toContainText('Diária confirmada')
      await A.page.goto(`/projetos/${pj!.id as string}`)
      await A.page.locator('[data-set-projeto]').click()
      await A.page.waitForURL(/\/set\?projeto=/)
      await expect(naPagina(A.page).getByRole('log')).toContainText('Diária confirmada para sexta.')
      await expect(naPagina(A.page).getByRole('log')).toContainText('Bia')
      if (principal) await foto(A.page, `set-projeto-${nome}`)

      // 5. Denunciar e bloquear o Caio, pela conversa
      await A.page.goto('/set')
      await naPagina(A.page).getByRole('tab', { name: /Conversas/ }).click()
      await naPagina(A.page).getByRole('button', { name: /Caio/ }).click()
      await naPagina(A.page).getByRole('button', { name: 'Opções da conversa' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Denunciar' }).click()
      await naPagina(A.page).getByRole('radio', { name: 'Spam' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Enviar denúncia' }).click()
      await expect(naPagina(A.page).getByRole('heading', { name: 'Denúncia enviada' })).toBeVisible()
      await naPagina(A.page).getByRole('button', { name: 'Cancelar' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Opções da conversa' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Bloquear', exact: true }).click()
      if (principal) await foto(A.page, `set-bloquear-${nome}`)
      await naPagina(A.page).getByRole('button', { name: 'Bloquear', exact: true }).click()
      await expect(naPagina(A.page).getByRole('status')).toContainText('Bloqueado')
      const [d] = await db.sql`select motivo from zro.set_denuncias where denunciante = ${victor.userId} and denunciado = ${caio.userId}`
      expect(d?.motivo).toBe('spam')

      await C.page.reload()
      await naPagina(C.page).getByRole('tab', { name: /Conversas/ }).click()
      await expect(naPagina(C.page).getByRole('button', { name: /Victor/ })).toHaveCount(0)

      for (const x of [A, B, C]) await x.ctx.close()
      const v = await A.page.video()?.path()
      if (v && SHOTS) fs.renameSync(v, path.join(SHOTS, `set-${nome}.webm`))
    } finally {
      await b.close()
    }
  })
}
