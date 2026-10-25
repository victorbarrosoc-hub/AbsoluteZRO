// Acessibilidade básica (PRD §10, §14): axe nas telas principais, regras WCAG 2.0/2.1 A e AA.
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function check(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} · ${v.nodes[0]?.target.join(' ')}`)
  expect(summary, `${path}\n${summary.join('\n')}`).toEqual([])
}

test('páginas públicas sem violações WCAG A/AA', async ({ page }) => {
  for (const p of ['/', '/planos', '/entrar', '/criar-conta']) await check(page, p)
})

test('área logada e projeto sem violações WCAG A/AA', async ({ page }) => {
  await page.goto('/criar-conta')
  await page.getByLabel('Nome').fill('Pessoa A11y')
  await page.getByLabel('E-mail').fill(`a11y-${randomUUID().slice(0, 8)}@teste.absolutezro.local`)
  await page.getByLabel('Senha').fill('senha-e2e-segura-1')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.waitForURL('**/boas-vindas')
  await check(page, '/boas-vindas')
  await page.getByLabel('Nome').fill('Org A11y')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  await page.goto('/projetos/novo')
  await page.getByLabel('Nome', { exact: true }).fill('Projeto A11y')
  await page.getByRole('button', { name: 'Criar projeto' }).click()
  await page.waitForURL(/\/projetos\/[0-9a-f-]{36}$/)
  const projeto = new URL(page.url()).pathname
  for (const p of ['/inicio', '/projetos', projeto, '/ciclo', '/ferramentas', '/equipe', '/assinatura', '/perfil']) await check(page, p)
})
