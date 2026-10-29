// Perfil profissional com @ (ADR 0029): o @ escolhido ao criar a conta, o aviso único, o editor do perfil, buscar e
// convidar pelo @ em Equipe (a pessoa aceita na central), o menu de ações de cada pessoa (papel e remover com
// confirmação) e esconder o perfil da busca. Com SHOTS_DIR, guarda as capturas no claro e no escuro, computador e celular.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PASS = 'senha-e2e-segura-1'
const SHOTS = process.env.SHOTS_DIR
const marca = () => randomUUID().slice(0, 6)

/** Capturas no claro e no escuro, no computador e no celular, sem recarregar (menus e buscas abertos continuam). */
async function foto(page: Page, nome: string, alvo?: Locator) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  const antes = page.viewportSize() ?? { width: 1280, height: 720 }
  for (const [tela, vp] of [
    ['computador', { width: 1280, height: 860 }],
    ['celular', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(vp)
    for (const tema of ['claro', 'escuro'] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema === 'claro' ? 'light' : 'dark')
      if (alvo) await alvo.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      else await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(SHOTS, `${nome}-${tema}-${tela}.png`) })
    }
  }
  await page.setViewportSize(antes)
}

async function confirmarEmail(email: string) {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`
  await sql.end()
}

/** Conta nova com o @ escolhido, organização própria e e-mail confirmado. */
async function pessoa(page: Page, nome: string, arroba: string, org: string) {
  const email = `pessoas-${marca()}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome, email, senha: PASS, arroba })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(org)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  await confirmarEmail(email)
  return email
}

async function outraPessoa(browser: Browser, baseURL: string | undefined, nome: string, arroba: string, org: string) {
  const ctx = await browser.newContext({ baseURL })
  const page = await ctx.newPage()
  await pessoa(page, nome, arroba, org)
  return { ctx, page }
}

test('criar conta com o @ escolhido, o aviso único e o editor do perfil', async ({ page }) => {
  const a = `ana.${marca()}`
  await pessoa(page, 'Ana Lima', `@${a}`, 'Produtora Ana')
  const aviso = page.getByRole('region', { name: `Você agora é @${a}` })
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('E-mail e telefone nunca aparecem')
  await foto(page, 'aviso-unico')
  await aviso.getByRole('button', { name: 'Entendi' }).click()
  await expect(aviso).toBeHidden()
  await page.reload()
  await expect(page.getByRole('region', { name: /Você agora é/ })).toHaveCount(0)

  await page.goto('/perfil/profissional')
  await expect(page.getByRole('textbox', { name: 'Seu @' })).toHaveValue(a)
  await page.locator('.pchip', { hasText: 'Câmera' }).click()
  await page.locator('.pchip', { hasText: 'Drone' }).click()
  await page.getByLabel('Cidade').fill('Natal')
  await page.getByLabel('Bio').fill('Câmera e drone para casamento e publicidade.')
  await page.getByRole('button', { name: 'Salvar perfil' }).click()
  await expect(page.getByText('Perfil salvo.')).toBeVisible()
  await page.reload()
  await expect(page.locator('.pficha').first()).toContainText('Câmera, Drone · Natal')
  await expect(page.getByRole('switch', { name: 'Aparecer na busca' })).toHaveAttribute('aria-checked', 'true')
  await foto(page, 'perfil-editor')

  // @ ocupado ao criar outra conta: volta ao passo do @ com o aviso
  const page2 = await page.context().browser()!.newPage()
  await page2.goto(new URL('/criar-conta', page.url()).toString())
  await criarConta(page2, { nome: 'Outra Ana', email: `pessoas-${marca()}@teste.absolutezro.local`, senha: PASS, arroba: a.toUpperCase() })
  await expect(page2.locator('.conversa__erro')).toContainText(`@${a} já é de outra pessoa`)
  await expect(page2.getByLabel('Escolha seu @')).toBeFocused()
  await page2.close()
})

test('buscar e convidar pelo @, aceitar na central, menu de ações e esconder o perfil', async ({ page, browser, baseURL }) => {
  const m = marca()
  const bia = `bia.${m}`
  const b = await outraPessoa(browser, baseURL, `Bia Souza ${m}`, bia, 'Org da Bia')
  await pessoa(page, 'Caio Dono', `caio.${m}`, 'Produtora Pessoas')

  // Equipe › Convidar: o @ acha a ficha (sem e-mail) e o convite sai pelo @
  await page.goto('/equipe')
  await page.getByPlaceholder('@fulano, nome ou e-mail').fill(`@bia.${m}`)
  const ficha = page.getByRole('article', { name: `Bia Souza ${m}, @${bia}` })
  await expect(ficha).toBeVisible()
  await expect(page.locator('.pbusca')).not.toContainText('@teste.absolutezro.local')
  await foto(page, 'convidar-busca', ficha)
  await ficha.getByRole('button', { name: `Convidar @${bia}` }).click()
  await expect(ficha.getByText('Convidado')).toBeVisible()
  await page.reload()
  await expect(page.getByText(`@${bia}`).first()).toBeVisible()

  // A Bia aceita na central (Equipe › Convites para você)
  await b.page.goto('/equipe')
  const convite = b.page.locator('li', { hasText: 'Produtora Pessoas' })
  await expect(convite).toContainText('Edição')
  await convite.getByRole('button', { name: 'Aceitar' }).click()
  await b.page.waitForURL('**/inicio')
  // A Bia esconde o perfil da busca (o interruptor do perfil profissional)
  await b.page.goto('/perfil/profissional')
  const chave = b.page.getByRole('switch', { name: 'Aparecer na busca' })
  await chave.click()
  await expect(chave).toHaveAttribute('aria-checked', 'false')

  // Menu de ações: mudar o papel e remover com confirmação
  await page.goto('/equipe')
  const linha = page.locator('.pmembro', { hasText: `Bia Souza ${m}` })
  await expect(linha).toContainText('Edição')
  await linha.getByRole('button', { name: `Ações para Bia Souza ${m}` }).click()
  const menu = page.getByRole('menu', { name: `Ações para Bia Souza ${m}` })
  await expect(menu.getByRole('menuitemradio', { name: 'Edição' })).toHaveAttribute('aria-checked', 'true')
  await foto(page, 'equipe-menu', menu)
  await menu.getByRole('menuitemradio', { name: 'Leitura' }).click()
  await expect(linha).toContainText('Leitura')
  await linha.getByRole('button', { name: `Ações para Bia Souza ${m}` }).click()
  await page.getByRole('menuitem', { name: 'Remover da equipe…' }).click()
  const folha = page.getByRole('dialog', { name: `Remover Bia Souza ${m}?` })
  await expect(folha).toBeVisible()
  await foto(page, 'equipe-remover')
  await folha.getByRole('button', { name: 'Cancelar' }).click()
  await expect(folha).toBeHidden()
  await linha.getByRole('button', { name: `Ações para Bia Souza ${m}` }).click()
  await page.getByRole('menuitem', { name: 'Remover da equipe…' }).click()
  await folha.getByRole('button', { name: 'Remover' }).click()
  await expect(page.locator('.pmembro', { hasText: `Bia Souza ${m}` })).toHaveCount(0)

  // Escondido, a busca não acha mais, nem pelo @ exato
  await page.goto('/equipe')
  await page.getByPlaceholder('@fulano, nome ou e-mail').fill(`@${bia}`)
  await expect(page.getByText('Ninguém com esse @ ou nome.')).toBeVisible()
  await page.goto(`/pessoas/@${bia}`)
  await expect(page.getByRole('heading', { name: `Bia Souza ${m}` })).toHaveCount(0)
  await b.ctx.close()
})
