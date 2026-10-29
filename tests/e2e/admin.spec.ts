// Console da plataforma (/admin): só papel de plataforma, online agora, pessoas por segmento, troca de plano, CSV e axe.
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PORTA_PTAX = Number(process.env.E2E_PTAX_PORT || 3297)
const CONSOLE = ['/admin', '/admin/pessoas', '/admin/planos', '/admin/custos', '/admin/lancamento', '/admin/apps']

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
async function promote(address: string, role: 'admin' | 'support' = 'admin') {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set platform_role = ${role}, email_verified_at = coalesce(email_verified_at, now()) where email = ${address}`
  await sql.end()
}

async function axe(page: Page, path: string) {
  // contraste medido no estado final: sem as animações de entrada (como quem usa "reduzir movimento")
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} · ${v.nodes[0]?.target.join(' ')}`)
  expect(summary, `${path}\n${summary.join('\n')}`).toEqual([])
}

test('console não existe para quem não é da plataforma', async ({ page }) => {
  await signupAndOrg(page, 'Pessoa comum', 'Org comum')
  for (const path of [...CONSOLE, '/admin/online', '/admin/pessoas/csv', '/admin/custos/csv', `/admin/pessoas/${randomUUID()}`]) {
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

test('custos: suporte não vê; admin vê o mês, usa o dólar manual e o automático, edita um item, cria e apaga outro, exporta', async ({ page }) => {
  // Banco Central falso (PTAX): fora do ar no começo; depois responde US$ 1 = R$ 5,00 para qualquer dia.
  const bcb = { fora: true }
  const servidor = http.createServer((req, res) => {
    if (bcb.fora) return void res.writeHead(503).end()
    const [, m, d, a] = decodeURIComponent(req.url ?? '').match(/'(\d{2})-(\d{2})-(\d{4})'/) ?? []
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ value: [{ cotacaoCompra: 4.99, cotacaoVenda: 5, dataHoraCotacao: `${a}-${m}-${d} 13:05:00.000` }] }))
  })
  await new Promise<void>((ok) => servidor.listen(PORTA_PTAX, '127.0.0.1', ok))
  try {
    await custos(page, bcb)
  } finally {
    servidor.closeAllConnections()
    await new Promise<void>((ok) => servidor.close(() => ok()))
  }
})

async function custos(page: Page, bcb: { fora: boolean }) {
  const suporte = await signupAndOrg(page, 'Suporte E2E', 'Org do suporte')
  await promote(suporte, 'support')
  await page.goto('/admin')
  await expect(page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Custos' })).toHaveCount(0)
  expect((await page.goto('/admin/custos'))?.status()).toBe(404)
  expect((await page.request.get('/admin/custos/csv')).status()).toBe(404)
  await page.context().clearCookies()

  const address = await signupAndOrg(page, 'Dono E2E', 'Org do dono')
  await promote(address)
  await page.goto('/admin')
  await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Custos' }).click()
  await page.waitForURL('**/admin/custos')
  await expect(page.getByRole('heading', { level: 1, name: 'Custo do ecossistema' })).toBeVisible()
  // Ativos hoje (itens da migration): Claude US$ 200 + Vercel US$ 20 + ElevenLabs US$ 22. Sem cotação, em dólar.
  await expect(page.locator('.cst-hero__n')).toHaveText('US$ 242')
  await expect(page.locator('.cst-conferir')).toHaveText(/\d+ itens a conferir/)
  await expect(page.getByText('Nenhuma assinatura paga ainda')).toBeVisible()

  // Dólar: o Banco Central (falso) fora do ar; o valor manual vale e as contas aparecem em reais.
  await page.getByRole('button', { name: 'Sem cotação' }).click()
  const dolar = page.getByRole('dialog', { name: 'Dólar' })
  await dolar.getByRole('button', { name: 'Usar valor manual' }).click()
  await dolar.getByLabel('US$ 1 em reais').fill('5,50')
  await dolar.getByRole('button', { name: 'Usar este valor' }).click()
  await expect(dolar).toHaveCount(0)
  await expect(page.locator('.cst-hero__n')).toHaveText('R$ 1.331')
  await expect(page.locator('.cst-hero__sub')).toContainText('US$ 242')
  await expect(page.locator('.cst-dolar__origem')).toHaveText(/^Valor manual, \d\d\/\d\d$/)
  await expect(page.locator('.cst-eq__planos')).toContainText('Absolute ZRO Completo')

  // Metas na folha própria.
  await page.getByRole('button', { name: 'Definir metas' }).click()
  const metas = page.getByRole('dialog', { name: 'Metas' })
  await metas.getByLabel('Meta de assinantes').fill('100')
  await metas.getByRole('button', { name: 'Salvar' }).click()
  await expect(metas).toHaveCount(0)

  // Editar: Claude passa de US$ 200 para US$ 210.
  const linha = (texto: string) => page.locator('.cst-linha').filter({ hasText: texto })
  await expect(linha('Claude (desenvolvimento)')).toHaveAccessibleName(/^Editar\s*Anthropic/)
  await linha('Claude (desenvolvimento)').click()
  const folha = page.getByRole('dialog', { name: 'Anthropic · Claude (desenvolvimento)' })
  await folha.getByLabel('Valor').fill('210')
  await folha.getByRole('button', { name: 'Salvar' }).click()
  await expect(folha).toHaveCount(0)
  await expect(page.locator('.cst-hero__sub')).toContainText('US$ 252')

  // Criar e apagar (com confirmação).
  await page.getByRole('button', { name: 'Novo item' }).click()
  const novo = page.getByRole('dialog', { name: 'Novo item' })
  await novo.getByLabel('Fornecedor').fill('Figma')
  await novo.getByLabel('Item', { exact: true }).fill('Design')
  await novo.getByLabel('Valor').fill('15')
  await novo.getByRole('button', { name: 'Criar' }).click()
  await expect(novo).toHaveCount(0)
  await linha('Figma').click()
  const fig = page.getByRole('dialog', { name: 'Figma · Design' })
  await fig.getByRole('button', { name: 'Apagar item…' }).click()
  await fig.getByRole('button', { name: 'Apagar', exact: true }).click()
  await expect(fig).toHaveCount(0)
  await expect(linha('Figma')).toHaveCount(0)

  // Filtro por estado.
  await page
    .getByRole('group', { name: 'Estado' })
    .getByRole('button', { name: /Futuros/ })
    .click()
  await expect(linha('Supabase')).toBeVisible()
  await expect(linha('Claude (desenvolvimento)')).toHaveCount(0)

  const csv = await page.request.get('/admin/custos/csv')
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')
  expect(await csv.text()).toContain('Anthropic,Claude (desenvolvimento),IA,Max 20x,210.00,USD,Mensal,210.00,1155.00,Ativo')

  // O Banco Central volta: o agendamento (só com o segredo) busca; o manual continua valendo até voltar ao automático.
  bcb.fora = false
  expect((await page.request.get('/api/cron/dolar')).status()).toBe(401)
  const cron = await page.request.get('/api/cron/dolar', { headers: { authorization: 'Bearer segredo-cron-e2e' } })
  expect(cron.status()).toBe(200)
  expect(await cron.json()).toMatchObject({ ok: true, venda: 5, fonte: 'bcb-ptax' })
  await page.reload()
  await expect(page.locator('.cst-hero__n')).toHaveText('R$ 1.386')
  await page.locator('.cst-cotacao').click()
  await expect(dolar.getByText(/^Banco Central: R\$ 5,0000 em \d\d\/\d\d\.$/)).toBeVisible()
  await dolar.getByRole('button', { name: 'Voltar ao automático' }).click()
  await expect(dolar).toHaveCount(0)
  // US$ 252 × 5 (o Claude passou para US$ 210 acima).
  await expect(page.locator('.cst-hero__n')).toHaveText('R$ 1.260')
  await expect(page.locator('.cst-dolar__origem')).toHaveText(/^Banco Central, \d\d\/\d\d$/)
  await expect(page.locator('.cst-cotacao')).toHaveText('R$ 5,00')

  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  const logs = await sql`select action from zro.audit_logs where action like 'admin.custo%' order by id`
  await sql.end()
  expect(logs.map((l) => l.action)).toEqual(
    expect.arrayContaining([
      'admin.custos_config_alterada',
      'admin.custos_cotacao_manual',
      'admin.custos_cotacao_automatica',
      'admin.custo_alterado',
      'admin.custo_criado',
      'admin.custo_apagado',
      'admin.custos_exportados',
    ]),
  )
}
