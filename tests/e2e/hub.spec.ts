// E2E no servidor de produção local (PRD §14): conta, organização, projeto, 403 por URL direta, CSRF, webhook.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { signPayload } from '@zro/billing'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'

const email = () => `e2e-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
const PASS = 'senha-e2e-segura-1'

/** Conta + organização. Organização nova entra no plano grátis (0007); `semPlano` tira esse plano para testar o bloqueio. */
async function signupAndOrg(page: Page, orgName = 'Produtora E2E', opts: { semPlano?: boolean } = {}) {
  const address = email()
  await page.goto('/criar-conta')
  await page.getByLabel('Nome').fill('Pessoa E2E')
  await page.getByLabel('E-mail').fill(address)
  await page.getByLabel('Senha').fill(PASS)
  await page.getByRole('button', { name: 'Criar conta' }).click()
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
}

test('conta nova recebe as ferramentas do plano grátis', async ({ page }) => {
  await signupAndOrg(page, 'Org grátis')
  const ent = await (await page.request.get('/api/v1/entitlements')).json()
  const access = (id: string) => ent.products.find((p: { productId: string }) => p.productId === id).access
  for (const id of ['carro-do-freela', 'nossom', 'sobedesce', 'synquei', 'tpeasy']) expect(access(id)).toBe('contracted')
  expect(access('ai-edit')).toBe('coming_soon')
})

test('área logada exige sessão', async ({ page }) => {
  await page.goto('/projetos')
  await expect(page).toHaveURL(/\/entrar$/)
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
  await expect(list.getByRole('listitem')).toHaveCount(7)
  // Sem plano: ferramentas lançadas aparecem bloqueadas por assinatura, futuras indisponíveis
  await expect(list.getByRole('listitem').filter({ hasText: 'Synquei' })).toContainText('Bloqueado por assinatura')
  await expect(list.getByRole('listitem').filter({ hasText: 'AI Edit' })).toContainText('Indisponível')
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
  await expect(page.locator('.access-org__apps li.is-on')).toHaveCount(5)
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
  await page.goto('/downloads')
  const synquei = page.locator('#app-synquei')
  await synquei.getByRole('button', { name: 'Instalar' }).click()
  await expect(synquei.getByRole('progressbar')).toBeVisible()
  await expect(synquei.getByText('50%')).toBeVisible()
  await expect(synquei.getByRole('button', { name: 'Abrir' })).toBeVisible()
  await synquei.getByRole('button', { name: 'Abrir' }).click()
  expect(await page.evaluate(() => (window as unknown as { __abertos: string[] }).__abertos)).toEqual(['synquei'])
  // Instalado com versão antiga: Atualizar aparece. No app, o instalador avulso some.
  await expect(page.locator('#app-sobedesce').getByRole('button', { name: 'Atualizar' })).toBeVisible()
  await expect(page.locator('#app-sobedesce .dl-opts--instalador')).toBeHidden()
})

test('central de apps: no navegador não aparece nada da central', async ({ page }) => {
  await signupAndOrg(page, 'Org navegador')
  await page.goto('/downloads')
  await expect(page.locator('.app-actions')).toHaveCount(0)
  await expect(page.locator('#app-synquei .dl-opt[data-os="mac"]')).toBeVisible()
})
