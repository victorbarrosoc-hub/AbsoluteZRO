// E2E no servidor de produção local (PRD §14): conta, organização, projeto, 403 por URL direta, CSRF, webhook.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { signPayload } from '@zro/billing'
import { criarConta, entrar, esperarConversa } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'

const email = () => `e2e-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
const PASS = 'senha-e2e-segura-1'

/** Conta + organização. Organização nova entra no plano grátis (0007); `semPlano` tira esse plano para testar o bloqueio. */
async function signupAndOrg(page: Page, orgName = 'Produtora E2E', opts: { semPlano?: boolean } = {}) {
  const address = email()
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Pessoa E2E', email: address, senha: PASS })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(orgName)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  if (opts.semPlano) {
    const sql = postgres(DB, { max: 1, onnotice: () => {} })
    await sql`delete from zro.entitlements e using zro.subscriptions s, zro.memberships m, zro.users u
              where e.source_id = s.id and s.provider = 'free' and s.org_id = m.org_id and m.user_id = u.id and u.email = ${address}`
    await sql`delete from zro.subscriptions s using zro.memberships m, zro.users u
              where s.provider = 'free' and s.org_id = m.org_id and m.user_id = u.id and u.email = ${address}`
    await sql.end()
  }
  return address
}

test('conta nova recebe as ferramentas do plano grátis', async ({ page }) => {
  await signupAndOrg(page, 'Org grátis')
  const ent = await (await page.request.get('/api/v1/entitlements')).json()
  const access = (id: string) => ent.products.find((p: { productId: string }) => p.productId === id).access
  // Os lançados vêm contratados pelo plano grátis; os fechados por lançamento (ADR 0023) aparecem como closed, nunca contratados.
  for (const id of ['sobedesce', 'synquei', 'tpeasy']) expect(access(id), id).toBe('contracted')
  for (const id of ['carro-do-freela', 'nossom', 'ai-edit', 'finishing']) expect(access(id), id).toBe('closed')
  // Com o Carro do Freela fechado, o Início não promete projeto "de um job".
  await expect(page.locator('.quick')).toContainText('Comece do zero')
  await expect(page.locator('main')).not.toContainText('de um job')
})

test('área logada exige sessão', async ({ page }) => {
  await page.goto('/projetos')
  await expect(page).toHaveURL(/\/entrar$/)
})

test('entrar é uma conversa: e-mail, senha errada volta a ouvir, senha certa abre o destino', async ({ page }) => {
  const address = await signupAndOrg(page, 'Org conversa')
  await page.context().clearCookies()

  await page.goto('/entrar?next=%2Fperfil')
  await esperarConversa(page)
  // Uma pergunta por vez: a senha só aparece depois do e-mail, e nada é consultado antes do envio final.
  await expect(page.locator('.conversa__passo[data-ativo="true"] input')).toHaveAttribute('autocomplete', 'email')
  await expect(page.locator('.conversa__passo:has(#password)')).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.locator('.conversa__erro')).toHaveText('Digite seu e-mail.')
  await page.getByLabel('Qual é o seu e-mail?').fill(address)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByLabel('Sua senha')).toBeFocused()
  await expect(page.getByRole('button', { name: `${address}. Trocar e-mail` })).toBeVisible()
  await page.getByLabel('Sua senha').fill('senha-errada-123')
  // O olho mostra o que foi digitado sem enviar o form nem tirar o foco do campo.
  await page.getByRole('button', { name: 'Mostrar senha' }).click()
  await expect(page.getByLabel('Sua senha')).toHaveAttribute('type', 'text')
  await expect(page.getByLabel('Sua senha')).toBeFocused()
  await expect(page.getByLabel('Sua senha')).toHaveAttribute('autocomplete', 'current-password')
  await expect(page.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.conversa__erro')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ocultar senha' }).click()
  await expect(page.getByLabel('Sua senha')).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.locator('.conversa__erro')).toHaveText('E-mail ou senha incorretos.')
  await expect(page.locator('.conversa-orbe')).toHaveAttribute('data-estado', 'ouvindo')
  await expect(page.getByLabel('Sua senha')).toBeFocused()
  await page.getByLabel('Sua senha').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Conectado.' })).toBeVisible()
  await page.waitForURL('**/perfil')

  // De novo, pelo caminho mais curto
  await page.context().clearCookies()
  await page.goto('/entrar')
  await entrar(page, address, PASS)
  await page.waitForURL('**/inicio')
})

test('entrar sem JavaScript: todos os campos aparecem e o form posta direto', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL })
  const page = await ctx.newPage()
  await page.goto('/criar-conta')
  await page.getByLabel('Qual é o seu e-mail?').fill(email())
  await page.getByLabel('Como podemos te chamar?').fill('Pessoa Sem JS')
  await page.getByLabel('Crie uma senha').fill(PASS)
  // Enter envia o form inteiro (sem JavaScript a checagem de estabilidade do clique não roda bem no Playwright)
  await page.getByLabel('Crie uma senha').press('Enter')
  await page.waitForURL('**/boas-vindas')
  await ctx.close()
})

test('cadastro → organização → projeto com Ciclo do O e alternativa em lista', async ({ page }) => {
  await signupAndOrg(page, 'Produtora E2E', { semPlano: true })
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Olá')
  await page.goto('/projetos/novo')
  await page.getByLabel('Nome', { exact: true }).fill('Casamento E2E')
  await page.getByRole('button', { name: 'Criar projeto' }).click()
  await page.waitForURL(/\/projetos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Casamento E2E' })).toBeVisible()
  const list = page.getByRole('list', { name: 'Etapas do Ciclo do O' })
  await expect(list.getByRole('listitem')).toHaveCount(8)
  // Sem plano: ferramentas lançadas aparecem bloqueadas por assinatura; as fechadas por lançamento (ADR 0023), indisponíveis
  await expect(list.getByRole('listitem').filter({ hasText: 'Synquei' })).toContainText('Bloqueado por assinatura')
  await expect(list.getByRole('listitem').filter({ hasText: 'AEON' })).toContainText('Indisponível')
})

test('API: sem assinatura recebe 403 por URL direta; sem sessão 401; outra origem 403', async ({ page, request }) => {
  await signupAndOrg(page, 'Org sem plano', { semPlano: true })
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
  await signupAndOrg(page, 'Org webhook', { semPlano: true })
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
  expect(ent.products.find((p: { productId: string }) => p.productId === 'tpeasy').access).toBe('available')
  // NOSSOM está fechado por lançamento (ADR 0023): nunca "disponível para contratar"
  expect(ent.products.find((p: { productId: string }) => p.productId === 'nossom').access).toBe('closed')
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
  await expect(page.getByText('Por enquanto, tudo liberado.')).toBeVisible()
  await expect(page.getByText('R$ 149,90').first()).toBeVisible()
  // Avulso numa janela só: marcar dois apps soma o valor e o botão vira "Baixar 2 apps"
  await page.getByRole('button', { name: 'SOBEDESCE' }).click()
  await page.getByRole('button', { name: 'Synquei' }).click()
  await expect(page.getByRole('link', { name: 'Baixar 2 apps' })).toBeVisible()
  // Gate de lançamento (ADR 0023): produto fechado não aparece como incluído
  await expect(page.getByRole('button', { name: 'AEON' })).toHaveCount(0)
  await expect(page.locator('.tier__apps li[title="NOSSOM"], .tier__apps li[title="AEON"]')).toHaveCount(0)
})

test('gate de lançamento: anônimo não vê CTA, link nem instalador de produto fechado', async ({ page, request }) => {
  const FECHADOS = /nossom-teal\.vercel\.app|aeon\.absolutezro\.com|revela\.absolutezro\.com|carrodofreela\.com\.br/
  await page.goto('/')
  const strip = page.locator('.pstrip__list')
  await expect(strip.locator('.selo-dev').first()).toHaveText('Em desenvolvimento')
  await expect(strip.locator('a.pstrip__card[href*="synquei"]')).toHaveCount(1)
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
  expect(hrefs.filter((h) => FECHADOS.test(h))).toEqual([])
  // a órbita da Z só tem lançados
  await expect(page.locator('.pz__orbita li[title="NOSSOM"], .pz__orbita li[title="AEON"]')).toHaveCount(0)
  await expect(page.locator('.pz__orbita li[title="Synquei"]')).toHaveCount(1)
  // o fluxo começa no roteiro (o job é do Carro do Freela, fechado) e só mostra etapas lançadas
  await expect(page.locator('#fluxo-title')).toHaveText(/Do roteiro\s*à entrega\./)
  await expect(page.locator('main')).not.toContainText(/do job/i)

  await page.goto('/baixar')
  await expect(page.getByRole('button', { name: 'NOSSOM' }).locator('.selo-dev')).toHaveText('Em desenvolvimento')
  await expect(page.getByRole('button', { name: 'Synquei' }).locator('.selo-dev')).toHaveCount(0)
  await page.getByRole('button', { name: 'NOSSOM' }).click()
  const painel = page.locator('#dl-painel')
  await expect(painel.getByText('Em desenvolvimento')).toBeVisible()
  await expect(painel.locator('a.dl-opt')).toHaveCount(0)
  await expect(painel.getByText('Conheça mais')).toHaveCount(0)
  const hrefsBaixar = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
  expect(hrefsBaixar.filter((h) => FECHADOS.test(h))).toEqual([])
  // Maestro fechado (0024): nada do app de computador na página, no catálogo da central nem nas rotas
  expect(hrefsBaixar.filter((h) => /\/baixar\/app\/maestro\//.test(h))).toEqual([])

  const desktop = await (await request.get('/api/v1/desktop/apps')).json()
  expect(desktop.apps.map((a: { id: string }) => a.id)).not.toContain('nossom')
  expect(desktop.apps.map((a: { id: string }) => a.id)).not.toContain('maestro')
  expect((await request.get('/baixar/app/nossom/NOSSOM-0.2.2-win-x64.exe', { maxRedirects: 0 })).status()).toBe(404)
  for (const arquivo of ['mac', 'windows', 'versao.json', 'Maestro-0.1.0-b1-mac-universal.dmg'])
    expect((await request.get(`/baixar/app/maestro/${arquivo}`, { maxRedirects: 0 })).status(), arquivo).toBe(404)
})

test('menu lateral recolhe, lembra a escolha e o celular usa uma barra só', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signupAndOrg(page, 'Org menu')
  const shell = page.locator('.shell')
  await expect(shell).toHaveAttribute('data-nav', 'auto')
  await expect(page.locator('.sidebar .nav__text').first()).toBeVisible()
  await page.getByRole('button', { name: 'Recolher menu' }).click()
  await expect(shell).toHaveAttribute('data-nav', 'rail')
  await expect(page.locator('.sidebar .nav__text').first()).toBeHidden()
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Meus projetos' })).toBeVisible()
  await page.reload()
  await expect(shell).toHaveAttribute('data-nav', 'rail')

  // No celular o menu recolhido não vale: a folha mostra os nomes e fecha ao navegar.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.sidebar')).toBeHidden()
  await page.locator('.mobile-nav summary').click()
  await expect(page.locator('.mobile-nav__body .nav__text').first()).toBeVisible()
  await page.locator('.mobile-nav__body').getByRole('link', { name: 'Meus projetos' }).click()
  await page.waitForURL('**/projetos')
  await expect(page.locator('.mobile-nav__body')).toBeHidden()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await expect(shell).toHaveAttribute('data-nav', 'full')
})

test('sua conta: nome, foto, pedido de upgrade e acessos', async ({ page }) => {
  await signupAndOrg(page, 'Org conta')
  await page.goto('/perfil')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible()
  await page.getByLabel('Nome').fill('Pessoa Renomeada')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Nome salvo.')).toBeVisible()

  // PNG 1×1: o navegador reduz para WebP 256 px e envia sozinho.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[name="photo"]').setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Foto atualizada.')).toBeVisible()
  await page.reload()
  const src = await page.locator('.me__top img').getAttribute('src')
  expect(src).toMatch(/\/api\/v1\/users\/[0-9a-f-]{36}\/avatar\?v=\d+$/)
  const img = await page.request.get(src!)
  expect(img.status()).toBe(200)
  expect(img.headers()['content-type']).toBe('image/webp')

  // Pedir plano exige e-mail confirmado.
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set email_verified_at = now() where display_name = 'Pessoa Renomeada' and email_verified_at is null`
  await sql.end()
  await page.getByRole('navigation', { name: 'Sua conta' }).getByRole('link', { name: 'Plano' }).click()
  await page.waitForURL('**/perfil/plano')
  await page.getByRole('button', { name: 'Pedir este plano' }).first().click()
  await expect(page.getByText('Pedido enviado', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedidos abertos' })).toBeVisible()

  await page.goto('/perfil/acessos')
  await expect(page.getByRole('heading', { name: 'Org conta' })).toBeVisible()
  // Plano grátis lista as sete, mas só as três lançadas contam como acesso (gate de lançamento, ADR 0023).
  await expect(page.locator('.access-org__apps li.is-on')).toHaveCount(3)
})

test('excluir a conta: senha, confirmação, sai da sessão e o e-mail volta a ficar livre', async ({ page }) => {
  const address = await signupAndOrg(page, 'Org excluir')
  await page.goto('/perfil/seguranca')
  await page.getByRole('link', { name: 'Excluir…' }).click()
  await page.waitForURL('**/perfil/excluir')
  await page.getByLabel('Senha atual').fill('senha-errada-123')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.locator('.zro-field__error')).toHaveText('Senha incorreta.')
  await page.getByLabel('Senha atual').fill(PASS)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Excluir a conta de vez?' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir conta' }).click()
  await page.waitForURL('**/conta-excluida')
  await expect(page.getByRole('heading', { level: 1, name: 'Conta excluída.' })).toBeVisible()
  expect((await page.context().cookies()).find((c) => c.name === 'zro_session')).toBeUndefined()
  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/entrar$/)
  // O mesmo e-mail cria uma conta nova.
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Pessoa de volta', email: address, senha: PASS })
  await page.waitForURL('**/boas-vindas')
})

test('central de apps: dentro do app de computador, instala com progresso, abre e atualiza', async ({ page }) => {
  // Ponte falsa no lugar do preload do Electron (desktop/preload.cjs): mesma forma de window.zroDesktop.apps.
  await page.addInitScript(() => {
    const estado: Record<string, { instalado: { versao: string } | null; atualizar: boolean }> = {
      synquei: { instalado: null, atualizar: false },
      sobedesce: { instalado: { versao: '0.0.9' }, atualizar: true },
      nossom: { instalado: null, atualizar: false },
    }
    const ouvintes: ((ev: unknown) => void)[] = []
    const emitir = (ev: unknown) => ouvintes.forEach((f) => f(ev))
    ;(window as unknown as { __abertos: string[] }).__abertos = []
    ;(window as unknown as { zroDesktop: unknown }).zroDesktop = {
      isDesktop: true,
      plataforma: 'mac',
      apps: {
        versao: 1,
        listar: async () => ({
          ok: true,
          dados: Object.entries(estado).map(([id, s]) => ({
            id,
            nome: id,
            disponivel: { versao: '1.0.0', build: 2, tamanho: 104857600 },
            instalado: s.instalado,
            atualizar: s.atualizar,
            ocupado: false,
          })),
        }),
        instalar: async (id: string) => {
          emitir({ id, fase: 'baixando', recebido: 52428800, total: 104857600 })
          await new Promise((r) => setTimeout(r, 400))
          emitir({ id, fase: 'instalando' })
          await new Promise((r) => setTimeout(r, 200))
          estado[id] = { instalado: { versao: '1.0.0' }, atualizar: false }
          emitir({ id, fase: 'pronto' })
          return { ok: true, dados: true }
        },
        abrir: async (id: string) => {
          ;(window as unknown as { __abertos: string[] }).__abertos.push(id)
          return { ok: true, dados: true }
        },
        remover: async () => ({ ok: true, dados: true }),
        cancelar: async () => ({ ok: true }),
        aoProgresso: (fn: (ev: unknown) => void) => {
          ouvintes.push(fn)
          return () => {}
        },
      },
    }
    addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('zro-desktop'))
  })
  await signupAndOrg(page, 'Org central')
  await page.goto('/downloads#app-synquei')
  const synquei = page.locator('#app-synquei')
  await synquei.getByRole('button', { name: 'Instalar' }).click()
  await expect(synquei.getByRole('progressbar')).toBeVisible()
  await expect(synquei.getByText('50%')).toBeVisible()
  await expect(synquei.getByRole('button', { name: 'Abrir' })).toBeVisible()
  await synquei.getByRole('button', { name: 'Abrir' }).click()
  expect(await page.evaluate(() => (window as unknown as { __abertos: string[] }).__abertos)).toEqual(['synquei'])
  // Instalado com versão antiga: Atualizar aparece. No app, o instalador avulso some.
  await page.getByRole('button', { name: 'SOBEDESCE' }).click()
  await expect(page.locator('#app-sobedesce').getByRole('button', { name: 'Atualizar' })).toBeVisible()
  await expect(page.locator('#app-sobedesce .dl-opt[data-os="mac"]')).toBeHidden()
  await expect(page.locator('#app-sobedesce .dl-opt[data-os="windows"]')).toBeHidden()
})

test('central de apps: no navegador não aparece nada da central', async ({ page }) => {
  await signupAndOrg(page, 'Org navegador')
  await page.goto('/downloads')
  // só os ícones; o toque abre a parte de download do app, com o "Conheça mais"
  await page.getByRole('button', { name: 'Synquei' }).click()
  await expect(page.getByRole('link', { name: /Conheça mais/ })).toHaveAttribute('href', 'https://synquei.vercel.app')
  await expect(page.locator('.app-actions')).toHaveCount(0)
  await expect(page.locator('#app-synquei .dl-opt[data-os="mac"]')).toBeVisible()
})

/**
 * Troca de tela sem duas telas uma sobre a outra (titular, 29/10/2026, o mesmo defeito do Maestro no iPhone): pelo menu,
 * a tela velha (grupo z-sai) termina antes de a nova (z-entra) começar e, amostrando quadro a quadro, nunca as duas
 * acima de 10%. components/movimento.tsx e o bloco "troca de tela" de app/globals.css.
 */
async function trocarDeTela(page: Page, link: () => Promise<void>, url: string) {
  await page.evaluate(() => {
    const w = window as unknown as { sonda: { juntas: number; vts: number; relogio: [number, number] | null } }
    w.sonda = { juntas: 0, vts: 0, relogio: null }
    const d = document as Document & { __sonda?: boolean }
    if (!d.__sonda) {
      d.__sonda = true
      const original = document.startViewTransition.bind(document)
      document.startViewTransition = ((arg: ViewTransitionUpdateCallback) => {
        w.sonda.vts++
        const vt = original(arg)
        vt.ready
          .then(() => {
            const an = document.getAnimations()
            const pe = (n: string) => an.find((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === n)
            const sai = pe('::view-transition-old(z-sai)')
            const entra = pe('::view-transition-new(z-entra)')
            if (sai && entra) w.sonda.relogio = [Number(sai.effect!.getComputedTiming().endTime), Number(entra.effect!.getTiming().delay ?? 0)]
          })
          .catch(() => {})
        return vt
      }) as typeof document.startViewTransition
    }
    const op = (n: string) =>
      document.getAnimations().some((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === n)
        ? Number(getComputedStyle(document.documentElement, n).opacity)
        : 0
    const t0 = performance.now()
    const iv = setInterval(() => {
      if (op('::view-transition-old(z-sai)') > 0.1 && op('::view-transition-new(z-entra)') > 0.1) w.sonda.juntas++
      if (performance.now() - t0 > 3000) clearInterval(iv)
    }, 4)
  })
  await link()
  await page.waitForURL(`**${url}`)
  await page.waitForFunction(() => !document.documentElement.dataset.zSentido, null, { timeout: 8000 })
  const s = await page.evaluate(() => (window as unknown as { sonda: { juntas: number; vts: number; relogio: [number, number] | null } }).sonda)
  expect(s.vts, `${url}: houve View Transition`).toBeGreaterThan(0)
  expect(s.relogio, `${url}: grupos z-sai e z-entra`).not.toBeNull()
  expect(s.relogio![0], `${url}: a velha termina antes de a nova começar`).toBeLessThanOrEqual(s.relogio![1] + 12)
  expect(s.juntas, `${url}: velha e nova juntas`).toBe(0)
  await expect(page.locator('#conteudo > .z-pagina')).toHaveCount(1)
}

test('troca de tela pelo menu: a velha sai antes de a nova entrar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signupAndOrg(page, 'Org troca')
  await page.waitForLoadState('networkidle')
  const menu = page.locator('.sidebar')
  for (const [nome, url] of [
    ['Meus projetos', '/projetos'],
    ['Atividades', '/atividades'],
    ['Início', '/inicio'],
  ] as const) {
    await trocarDeTela(page, () => menu.getByRole('link', { name: nome, exact: true }).click(), url)
  }
})
