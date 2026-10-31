// A Z nunca é a primeira tela (titular, 29/10/2026; Plano de Integração §7–8: "a tarefa principal do aplicativo vem
// primeiro"). No HUB, quem entra cai no Início; no app Absolute ZRO (/app, computador e Tela de Início do iPhone), nos
// apps. A Z é uma entrada discreta (fim do grupo no menu do HUB, pé da barra do app, anel do topo no celular), não é
// aba da barra de baixo e nada dela monta sozinho; /ia e /app/ia seguem valendo como link direto.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { criarConta } from './conversa'

async function contaComOrganizacao(page: Page) {
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Rui Entrada', email: `e2e-entrada-${randomUUID().slice(0, 8)}@teste.absolutezro.local`, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill('Produtora Entrada')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
}

test('HUB e app Absolute ZRO abrem na tarefa; a Z é discreta e só abre quando pedida', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await contaComOrganizacao(page)
  // HUB: o Início, sem o painel da Z; no menu a Z vem no fim do grupo, nunca primeiro
  await expect(page.locator('.greet h1')).toContainText('Olá,')
  await expect(page.locator('#ia-texto')).toHaveCount(0)
  const menu = page.getByRole('navigation', { name: 'Navegação do HUB' })
  const hrefs = await menu.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  expect(hrefs[0]).toBe('/inicio')
  expect(hrefs.indexOf('/ia')).toBeGreaterThan(hrefs.indexOf('/atividades'))

  // app Absolute ZRO (computador): abre nos apps; a Z é o item discreto no pé da barra, apagado
  await page.goto('/app')
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.locator('#painel-titulo')).toContainText('Olá,')
  await expect(page.locator('ul.painel__apps')).toHaveCount(1)
  // Maestro e Relay (0039) e Carro do Freela (0041) no ar só na web: abrem na web, sem o selo "Em desenvolvimento" do
  // canal de computador
  for (const app of ['Maestro', 'Relay', 'Carro do Freela']) {
    const cartao = page.locator('.painel__apps > li').filter({ has: page.getByRole('heading', { name: app, exact: true }) })
    await expect(cartao.getByText('Em desenvolvimento')).toHaveCount(0)
    await expect(cartao.getByRole('link', { name: /Abrir/ })).toHaveCount(1)
  }
  await expect(page.locator('#ia-texto')).toHaveCount(0)
  const abas = page.getByRole('navigation', { name: 'Painel' })
  await expect(abas.getByRole('link').first()).toHaveText(/Apps/)
  await expect(abas.getByRole('link').first()).toHaveAttribute('aria-current', 'page')
  await expect(abas.getByRole('link', { name: /Z|IA/ })).toHaveCount(0)
  const z = page.locator('.painel__lado .painel__z')
  await expect(z).toBeVisible()
  await expect(z).not.toHaveAttribute('aria-current', 'page')
  // o endereço antigo do painel cai no mesmo lugar
  await page.goto('/app/apps')
  await expect(page).toHaveURL(/\/app$/)
  // a Z só quando a pessoa pede
  await z.click()
  await expect(page).toHaveURL(/\/app\/ia$/)
  await expect(page.locator('#ia-texto')).toBeVisible()
  await expect(page.locator('.painel__lado .painel__z')).toHaveAttribute('aria-current', 'page')

  // iPhone: a barra de baixo tem só a tarefa; a Z é o anel do topo
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/app')
  await expect(page.locator('#ia-texto')).toHaveCount(0)
  await expect(abas.getByRole('link')).toHaveCount(4)
  await expect(page.locator('.painel__lado .painel__z')).toBeHidden()
  const anel = page.locator('.painel__movel-z')
  await expect(anel).toBeVisible()
  await expect(anel).toHaveAttribute('aria-label', 'Z, a IA da Absolute ZRO')
  await anel.click()
  await expect(page).toHaveURL(/\/app\/ia$/)
  await expect(page.locator('.painel__movel-z')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('#ia-texto')).toBeVisible()
})
