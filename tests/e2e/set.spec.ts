// Set (ADR 0032): duas pessoas da mesma equipe se veem online (e onde), invisível esconde, adicionar pelo @ no Online
// (prévia com nome e foto, o pedido aparece para a outra pessoa, aceitar ali mesmo, os dois se veem e o toque abre a
// conversa), perfil escondido igual a não existir e o limite do dia, a conversa do projeto aberta pela página do projeto, denunciar e bloquear. Em Chromium e WebKit, no
// computador e no iPhone; a moderação resolve no console; a leitura repetida volta 304 com a ETag. Com SHOTS_DIR, guarda capturas (claro e escuro) e vídeos de cada navegador.
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

async function aba(
  b: Browser,
  baseURL: string,
  p: Conta,
  opts: Parameters<Browser['newContext']>[0],
  video: boolean,
): Promise<{ ctx: BrowserContext; page: Page }> {
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
    // capturas no Chromium (computador e 393 px): o WebKit sem tela não desenha o vidro (backdrop-filter) nas fotos
    const fotos = nome.startsWith('Chromium')
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
      if (fotos) await foto(A.page, `set-online-${nome}`)
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

      // 3. Caio (outra produtora) acha o Victor pelo @ no Online, o Victor aceita ali mesmo, os dois se veem online e o
      // toque na pessoa abre a conversa
      await pilula(A.page).click()
      await expect(folha(A.page).getByText('Ninguém online agora.')).toBeVisible()
      await expect(folha(A.page).getByRole('button', { name: 'Adicionar pelo @' })).toBeVisible()
      if (fotos) await foto(A.page, `add-online-${nome}`)
      await folha(A.page).getByRole('button', { name: 'Fechar', exact: true }).click()

      await C.page.goto('/inicio')
      await pilula(C.page).click()
      const fc = folha(C.page)
      // sem equipe nem contatos: o vazio já leva para o @
      await fc.getByRole('button', { name: 'Adicionar alguém pelo @' }).click()
      const campo = fc.getByRole('textbox', { name: '@ da pessoa' })
      await expect(campo).toBeFocused()
      await campo.fill(`@${victor.arroba}`)
      await expect(fc.locator('.achado')).toContainText('Victor')
      await expect(fc.locator('.achado')).toContainText(`@${victor.arroba}`)
      if (fotos) await foto(C.page, `add-previa-${nome}`)
      await fc.getByRole('button', { name: 'Adicionar Victor' }).click()
      await expect(fc.getByRole('status')).toContainText('Pedido enviado')
      await expect(fc.getByRole('status')).toContainText('Victor')
      if (fotos) await foto(C.page, `add-enviado-${nome}`)

      await A.page.reload()
      await expect(pilula(A.page)).toHaveAttribute('aria-label', /1 pedido de contato/)
      await pilula(A.page).click()
      const fa = folha(A.page)
      await expect(fa.getByRole('tab', { name: /Online/ })).toContainText('1')
      await expect(fa.getByText('Pedidos')).toBeVisible()
      if (fotos) await foto(A.page, `add-pedidos-${nome}`)
      await fa.getByRole('button', { name: 'Aceitar Caio' }).click()
      await expect(fa.getByRole('status')).toContainText('Agora vocês são contatos')
      await expect(fa.getByText('Pedidos')).toHaveCount(0)
      // o Caio está com a folha aberta: aparece no "Agora", com o ponto verde e o app
      await expect(fa.getByRole('button', { name: /Caio/ })).toContainText('na Absolute ZRO', { timeout: 20_000 })
      if (fotos) await foto(A.page, `add-contato-${nome}`)
      await fa.getByRole('button', { name: /Caio/ }).click()
      const campoA = fa.getByRole('textbox', { name: 'Mensagem' })
      await campoA.fill('Oi, Caio! Vê o corte em https://absolutezro.com')
      await campoA.press('Enter')
      await expect(fa.getByRole('log')).toContainText('Oi, Caio!')
      await expect(fa.getByRole('log').getByRole('link', { name: 'https://absolutezro.com' })).toBeVisible()

      // o Caio vê o Victor online sem recarregar (a folha relê a cada 12 s) e o toque abre a mesma conversa
      await expect(fc.getByRole('button', { name: /Victor/ })).toContainText('na Absolute ZRO', { timeout: 25_000 })
      await fc.getByRole('button', { name: /Victor/ }).click()
      await expect(fc.getByRole('log')).toContainText('Oi, Caio!')
      const campoC = fc.getByRole('textbox', { name: 'Mensagem' })
      await campoC.fill('Oi! Vi sim.')
      await campoC.press('Enter')
      // a conversa aberta do Victor recebe sozinha (a cada 4 s)
      await expect(fa.getByRole('log')).toContainText('Oi! Vi sim.', { timeout: 15_000 })
      if (fotos) await foto(A.page, `set-conversa-${nome}`)
      await fa.getByRole('button', { name: 'Voltar' }).click()
      await fa.getByRole('button', { name: 'Fechar', exact: true }).click()

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
      if (fotos) await foto(A.page, `set-projeto-${nome}`)

      // 5. Denunciar e bloquear o Caio, pela conversa
      await A.page.goto('/set')
      await naPagina(A.page)
        .getByRole('tab', { name: /Conversas/ })
        .click()
      await naPagina(A.page).getByRole('button', { name: /Caio/ }).click()
      await naPagina(A.page).getByRole('button', { name: 'Opções da conversa' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Denunciar' }).click()
      await naPagina(A.page).getByRole('radio', { name: 'Spam' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Enviar denúncia' }).click()
      await expect(naPagina(A.page).getByRole('heading', { name: 'Denúncia enviada' })).toBeVisible()
      await naPagina(A.page).getByRole('button', { name: 'Cancelar' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Opções da conversa' }).click()
      await naPagina(A.page).getByRole('button', { name: 'Bloquear', exact: true }).click()
      if (fotos) await foto(A.page, `set-bloquear-${nome}`)
      await naPagina(A.page).getByRole('button', { name: 'Bloquear', exact: true }).click()
      await expect(naPagina(A.page).getByRole('status')).toContainText('Bloqueado')
      const [d] = await db.sql`select motivo from zro.set_denuncias where denunciante = ${victor.userId} and denunciado = ${caio.userId}`
      expect(d?.motivo).toBe('spam')

      await C.page.goto('/set')
      await naPagina(C.page)
        .getByRole('tab', { name: /Conversas/ })
        .click()
      await expect(naPagina(C.page).getByRole('button', { name: /Victor/ })).toHaveCount(0)

      // 6. A moderação vê a denúncia no console (motivo e de quem; nada de e-mail) e resolve
      if (nome === 'Chromium-computador') {
        const mod = await conta('Moderadora')
        await db.sql`update zro.users set platform_role = 'support' where id = ${mod.userId}`
        const M = await aba(b, baseURL!, mod, opts, false)
        await M.page.goto('/admin/denuncias')
        const item = M.page.locator('li[data-denuncia]').filter({ hasText: `@${caio.arroba}` })
        await expect(item).toContainText('Spam')
        await expect(item).toContainText('De Victor')
        await expect(item).not.toContainText('@teste.absolutezro.local')
        if (fotos) await foto(M.page, `set-moderacao-${nome}`)
        await item.getByRole('button', { name: 'Resolver' }).click()
        await expect(M.page.locator('li[data-denuncia]').filter({ hasText: `@${caio.arroba}` })).toHaveCount(0)
        await M.ctx.close()
      }

      for (const x of [A, B, C]) await x.ctx.close()
      const v = await A.page.video()?.path()
      if (v && SHOTS) fs.renameSync(v, path.join(SHOTS, `set-${nome}.webm`))
    } finally {
      await b.close()
    }
  })
}

for (const [nome, viewport, movel] of [
  ['computador', { width: 1440, height: 900 }, false],
  ['iphone', { width: 393, height: 852 }, true],
] as const) {
  test(`Set (${nome}): adicionar pelo @ não acha perfil escondido e avisa o limite do dia`, async ({ baseURL }) => {
    test.setTimeout(90_000)
    const b = await chromium.launch()
    try {
      const ana = await conta('Ana')
      const lia = await conta('Lia')
      const rui = await conta('Rui')
      await db.sql`update zro.perfis set visivel = false where user_id = ${lia.userId}`
      const A = await aba(b, baseURL!, ana, { viewport, ...(movel ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) }, false)
      await A.page.goto('/inicio')
      await pilula(A.page).click()
      const f = folha(A.page)
      await f.getByRole('button', { name: 'Adicionar pelo @' }).click()
      const campo = f.getByRole('textbox', { name: '@ da pessoa' })
      // escondido e inexistente: a mesma resposta neutra (só o @ digitado)
      await campo.fill(lia.arroba)
      await expect(f.getByRole('alert')).toHaveText(`Não achamos @${lia.arroba}.`)
      await expect(f.locator('.achado')).toHaveCount(0)
      await campo.fill(`ninguem.${marca()}`)
      await expect(f.getByRole('alert')).toHaveText(/^Não achamos @ninguem\./)
      // 20 pedidos hoje: o próximo avisa, com a pessoa ainda na tela
      await db.sql`insert into zro.rate_limit_attempts (key) select ${`set-contato:${ana.userId}`} from generate_series(1, 20)`
      await campo.fill(`@${rui.arroba}`)
      await f.getByRole('button', { name: 'Adicionar Rui' }).click()
      await expect(f.getByRole('alert')).toHaveText('Muitos pedidos hoje. Tente amanhã.')
      await expect(f.locator('.achado')).toContainText('Rui')
      if (SHOTS) await foto(A.page, `add-limite-${nome}`)
      // Esc fecha só o campo; a folha fica
      await campo.press('Escape')
      await expect(campo).toHaveCount(0)
      await expect(f).toBeVisible()
      expect(await db.sql`select 1 from zro.set_contatos where pedido_por = ${ana.userId}`).toHaveLength(0)

      // a API: a prévia do escondido é o mesmo 404 e nada de e-mail na prévia de quem existe
      const headers = { cookie: `${SESSION_COOKIE}=${ana.token}`, origin: baseURL! }
      const r1 = await A.ctx.request.post(`${baseURL}/api/v1/set/contatos`, { headers, data: { ver: `@${lia.arroba}` } })
      expect(r1.status()).toBe(404)
      const r2 = await A.ctx.request.post(`${baseURL}/api/v1/set/contatos`, { headers, data: { ver: rui.arroba } })
      expect(r2.status()).toBe(200)
      const j = await r2.json()
      expect(j).toMatchObject({ pessoa: { id: rui.userId, arroba: rui.arroba, nome: 'Rui' }, situacao: 'nenhuma' })
      expect(JSON.stringify(j)).not.toContain('@teste.absolutezro.local')
      await A.ctx.close()
    } finally {
      await b.close()
    }
  })

  test(`Set (${nome}): sugestões enquanto digita o @ ("@ron" acha Ronny Freitas) e Adicionar`, async ({ baseURL }) => {
    test.setTimeout(60_000)
    const b = await chromium.launch()
    try {
      const ana = await conta('Ana')
      const ronny = await conta('Ronny')
      const arroba = `ronnyfreitas${nome === 'iphone' ? 'i' : 'c'}`
      await db.sql`update zro.perfis set arroba = ${arroba} where user_id = ${ronny.userId}`
      await db.sql`update zro.users set display_name = 'Ronny Freitas' where id = ${ronny.userId}`
      const A = await aba(b, baseURL!, ana, { viewport, ...(movel ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) }, false)
      await A.page.goto('/inicio')
      await pilula(A.page).click()
      const f = folha(A.page)
      await f.getByRole('button', { name: 'Adicionar pelo @' }).click()
      const campo = f.getByRole('textbox', { name: '@ da pessoa' })
      await campo.pressSequentially('@ron')
      const linha = f.getByRole('option').filter({ hasText: `@${arroba}` })
      await expect(linha).toContainText('Ronny Freitas')
      // "@ron" não existe, mas a sugestão basta: nada de "Não achamos"
      await expect(f.getByRole('alert')).toHaveCount(0)
      if (SHOTS) await foto(A.page, `add-sugestoes-${nome}`)
      if (movel) await linha.getByRole('button', { name: 'Adicionar Ronny Freitas' }).tap()
      else {
        await campo.press('ArrowDown')
        await expect(f.getByRole('option', { selected: true })).toHaveCount(1)
        await campo.press('Enter')
      }
      await expect(f.locator('.achado[data-feito]')).toContainText('Pedido enviado')
      await expect(f.locator('.achado[data-feito]')).toContainText('Ronny Freitas')
      expect(await db.sql`select 1 from zro.set_contatos where pedido_por = ${ana.userId}`).toHaveLength(1)
      await A.ctx.close()
    } finally {
      await b.close()
    }
  })
}

test('Set: a leitura repetida (o poll) volta 304 com a mesma ETag e 200 quando muda', async ({ baseURL, request }) => {
  const ana = await conta('Ana')
  const headers = { cookie: `${SESSION_COOKIE}=${ana.token}` }
  const r1 = await request.get(`${baseURL}/api/v1/set`, { headers })
  expect(r1.status()).toBe(200)
  const etag = r1.headers()['etag']!
  expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/)
  expect(r1.headers()['cache-control']).toBe('no-store')
  const r2 = await request.get(`${baseURL}/api/v1/set`, { headers: { ...headers, 'if-none-match': etag } })
  expect(r2.status()).toBe(304)
  expect(await r2.text()).toBe('')
  // ficou invisível: o estado mudou, a ETag também
  const p = await request.put(`${baseURL}/api/v1/set/preferencias`, { headers: { ...headers, origin: baseURL! }, data: { invisivel: true } })
  expect(p.status()).toBe(200)
  const r3 = await request.get(`${baseURL}/api/v1/set`, { headers: { ...headers, 'if-none-match': etag } })
  expect(r3.status()).toBe(200)
  expect(r3.headers()['etag']).not.toBe(etag)
  expect(JSON.stringify(await r3.json())).not.toContain('@teste.absolutezro.local')
})
