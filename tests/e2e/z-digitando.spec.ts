// A Z no HUB (/ia): sem os botões de sugestão, o campo digita sozinho as sugestões, para no foco, Tab completa (sem
// enviar), apagar devolve a sugestão e "reduzir movimento" mostra uma sugestão inteira, parada. No celular, o toque na
// sugestão completa. A IA está "ligada" no servidor do e2e por uma chave falsa (playwright.config.ts) que nunca é usada:
// nada é enviado aqui.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { criarConta } from './conversa'

const SUGESTOES = ['O que pede atenção hoje?', 'Resuma meus projetos', 'Quantos créditos de IA ainda tenho?', 'Qual ferramenta uso para cada etapa?']

async function contaComOrganizacao(page: Page) {
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Lia Digita', email: `e2e-z-${randomUUID().slice(0, 8)}@teste.absolutezro.local`, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill('Produtora Z')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
}

const campo = (page: Page) => page.locator('#ia-texto')
const fantasma = (page: Page) => page.locator('.ia-fantasma .zf-texto')
const texto = async (page: Page) => (await fantasma(page).textContent()) ?? ''

test('a Z do HUB digita as sugestões no campo; Tab completa e nada é enviado', async ({ page }) => {
  await contaComOrganizacao(page)
  const enviados: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/ia/mensagens')) enviados.push(r.url())
  })
  await page.goto('/ia')
  await expect(page.locator('.ia-inicio__titulo')).toContainText('Lia')
  // sem os botões; nome estável e a lista das sugestões numa descrição fixa
  await expect(page.locator('.ia-sugestoes')).toHaveCount(0)
  for (const s of SUGESTOES) await expect(page.getByRole('button', { name: s })).toHaveCount(0)
  await expect(campo(page)).toHaveAttribute('aria-label', 'Pergunte à Z')
  await expect(campo(page)).toHaveAttribute('placeholder', '')
  await expect(campo(page)).toHaveAccessibleDescription(/Sugestões: O que pede atenção hoje\?; Resuma meus projetos/)
  await expect(page.locator('.ia-fantasma')).toHaveAttribute('aria-hidden', 'true')
  // anima: começa depois de o campo aparecer, letra a letra
  await expect.poll(async () => (await texto(page)).length, { timeout: 5000 }).toBeGreaterThan(3)
  const parcial = await texto(page)
  expect(SUGESTOES.some((s) => s.startsWith(parcial))).toBe(true)
  await expect.poll(() => texto(page)).not.toBe(parcial)
  // o campo não muda de altura enquanto digita (nada de layout andando)
  const alto = await page.locator('.ia-campo').evaluate((el) => el.getBoundingClientRect().height)
  await page.waitForTimeout(500)
  expect(await page.locator('.ia-campo').evaluate((el) => el.getBoundingClientRect().height)).toBe(alto)
  // foco: para na hora, a sugestão inteira e parada
  await campo(page).focus()
  const inteira = await texto(page)
  expect(SUGESTOES).toContain(inteira)
  await page.waitForTimeout(500)
  await expect(fantasma(page)).toHaveText(inteira)
  // Tab completa sem enviar; o botão de enviar acende
  await page.keyboard.press('Tab')
  await expect(campo(page)).toHaveValue(inteira)
  await expect(campo(page)).toBeFocused()
  await expect(page.locator('.ia-fantasma')).toHaveAttribute('data-vazio', '')
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled()
  await page.waitForTimeout(300)
  expect(enviados).toHaveLength(0)
  await expect(page.locator('.ia-msg')).toHaveCount(0)
  // escreveu: a sugestão some; apagou: volta inteira; saiu do campo vazio: volta a digitar
  await campo(page).fill('Oi')
  await expect(page.locator('.ia-fantasma')).toHaveAttribute('data-vazio', '')
  await campo(page).fill('')
  await expect(fantasma(page)).toHaveText(inteira)
  // Esc dispensa e o Tab volta a andar o foco
  await page.keyboard.press('Escape')
  await expect(page.locator('.ia-fantasma')).toHaveAttribute('data-vazio', '')
  await page.keyboard.press('Tab')
  await expect(campo(page)).not.toBeFocused()
  await expect(campo(page)).toHaveValue('')
  await expect.poll(() => texto(page), { timeout: 4000 }).not.toBe(inteira)
})

test('reduzir movimento, no escuro: uma sugestão inteira, sem digitar nem piscar, e → completa', async ({ page }) => {
  await contaComOrganizacao(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'zro_theme', value: 'dark', url: page.url() }])
  await page.goto('/ia')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => SUGESTOES.includes(await texto(page))).toBe(true)
  await expect(page.locator('.ia-fantasma .zf-cursor')).toBeHidden()
  await campo(page).focus()
  const inteira = await texto(page)
  await page.keyboard.press('ArrowRight')
  await expect(campo(page)).toHaveValue(inteira)
})

test('no iPhone, tocar na sugestão completa o campo, sem rolagem de lado', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await contaComOrganizacao(page)
  await page.goto('/ia')
  await expect.poll(async () => SUGESTOES.includes(await texto(page))).toBe(true)
  const t = await texto(page)
  await fantasma(page).tap()
  await expect(campo(page)).toHaveValue(t)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await ctx.close()
})
