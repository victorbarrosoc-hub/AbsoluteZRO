// O cartão da Higgsfield em /conexoes no servidor de produção local, com a Higgsfield falsa
// (tests/fixtures/higgsfield-falsa.ts) na porta do playwright.config.ts: conectar, saldo puro sem crédito de assinatura e,
// com ele no extrato, "renova em" e o medidor pelo que entrou no ciclo (assinatura + pacotes), com a parte dos apps.
// E2E_CAPTURAS=<pasta> guarda as capturas do cartão (claro/escuro, 1440 e 393).
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { maisUmMes } from '@zro/core'
import { iniciarHiggsfieldFalsa, type HiggsfieldFalsa } from '../fixtures/higgsfield-falsa'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PORTA_HF = Number(process.env.E2E_HF_PORT || 3295)
const CAPTURAS = process.env.E2E_CAPTURAS
const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' })

let hf: HiggsfieldFalsa
test.beforeAll(async () => {
  hf = await iniciarHiggsfieldFalsa({ porta: PORTA_HF })
})
test.afterAll(async () => {
  await hf.fechar()
})

async function capturar(page: Page, nome: string) {
  if (!CAPTURAS) return
  const largura = page.viewportSize()?.width ?? 0
  for (const tema of ['claro', 'escuro'] as const) {
    await page.context().addCookies([{ name: 'zro_theme', value: tema === 'claro' ? 'light' : 'dark', url: page.url() }])
    await page.reload()
    const cartao = page.locator('article.conexao').filter({ has: page.getByRole('heading', { name: 'Higgsfield' }) })
    await cartao.waitFor()
    await cartao.screenshot({ path: path.join(CAPTURAS, `higgsfield-${nome}-${tema}-${largura}.png`), animations: 'disabled' })
  }
  await page.context().addCookies([{ name: 'zro_theme', value: 'light', url: page.url() }])
}

for (const largura of [1440, 393]) {
  test(`Higgsfield: renova em e o medidor do ciclo (${largura})`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: largura > 600 ? 900 : 852 })
    const email = `e2e-hf-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
    await page.goto('/criar-conta')
    await criarConta(page, { nome: 'Lia', email, senha: 'senha-e2e-segura-1' })
    await page.waitForURL('**/boas-vindas')
    await page.getByLabel('Nome').fill('Produtora Higgsfield')
    await page.getByRole('button', { name: 'Criar e continuar' }).click()
    await page.waitForURL('**/inicio')

    const sql = postgres(DB, { max: 1, onnotice: () => {} })
    try {
      // o cartão só aparece com um app que usa a Higgsfield aberto para a pessoa (gate de lançamento)
      const [u] = await sql`select id from zro.users where email = ${email}`
      await sql`insert into zro.product_release_access (product_id, user_id, kind, reason) values ('ai-edit', ${u!.id as string}, 'tester', 'e2e: Higgsfield')`

      hf.estado.transacoes = []
      hf.estado.creditos = 65.41
      hf.estado.plano = 'pro'
      await page.goto('/conexoes')
      const cartao = page.locator('article.conexao').filter({ has: page.getByRole('heading', { name: 'Higgsfield' }) })
      await expect(cartao).toContainText('Não conectada')
      await cartao.getByRole('link', { name: 'Conectar' }).click()
      await expect(page.getByText('Higgsfield conectada.')).toBeVisible()

      // sem crédito de assinatura no extrato: sem data, o medidor fica no saldo puro
      await expect(cartao).toContainText('65,41 disponíveis · pro')
      await expect(cartao).not.toContainText('renova em')
      await expect(cartao).toContainText('0 usados pelos apps neste mês')

      // a assinatura entrou há 15 dias (600) e um pacote (200); os apps usaram 120 no ciclo
      const agora = Date.now()
      const ha = (dias: number) => new Date(agora - dias * 86_400_000)
      const inicio = ha(15)
      hf.estado.transacoes = [
        { created_at: inicio.toISOString(), action: 'grant', credits: 600, display_name: 'Subscription Credits' },
        { created_at: ha(9).toISOString(), action: 'grant', credits: 200, display_name: 'Credit Package' },
        { created_at: ha(3).toISOString(), action: 'spend', credits: -734.59, display_name: 'Kling 3.0' },
      ]
      await sql`insert into zro.ia_geracoes (id, user_id, app, saida, modelo, prompt, pedido, estado, creditos, criada_em)
                values (${randomUUID().replace(/-/g, '').slice(0, 12)}, ${u!.id as string}, 'ai-edit', 'video', 'kling3_0', 'e2e', 'job-e2e', 'pronto', 120, ${ha(3)})`
      await page.reload()
      await expect(cartao).toContainText(`65,41 disponíveis · pro · renova em ${diaMes.format(maisUmMes(inicio))}`)
      await expect(cartao.locator('.conexao__renova')).toHaveAttribute('title', /último crédito de assinatura da Higgsfield/)
      await expect(cartao).toContainText('de 800 no ciclo · 120 usados pelos apps')
      const medidor = cartao.getByRole('meter', { name: 'Créditos disponíveis no ciclo' })
      await expect(medidor).toHaveAttribute('aria-valuetext', '65,41 de 800')
      await expect(medidor.locator('.conexao__medidor-apps')).toHaveAttribute('style', /width: ?15%/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await capturar(page, 'ciclo')
    } finally {
      await sql.end()
    }
  })
}
