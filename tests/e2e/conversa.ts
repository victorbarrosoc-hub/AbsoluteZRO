// Entrar e criar conta são uma conversa (components/conversa-conta.tsx): uma pergunta por vez, e o envio só acontece
// no último passo. Os testes respondem passo a passo, como uma pessoa.
import { expect, type Page } from '@playwright/test'

/** Espera a conversa ficar interativa (com JavaScript, só o passo da vez aparece). */
export async function esperarConversa(page: Page) {
  await expect(page.locator('form.conversa[data-js]')).toBeVisible()
}

export async function criarConta(page: Page, r: { nome: string; email: string; senha: string }) {
  await esperarConversa(page)
  await page.getByLabel('Qual é o seu e-mail?').fill(r.email)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Como podemos te chamar?').fill(r.nome)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Crie uma senha').fill(r.senha)
  await page.getByRole('button', { name: 'Criar conta' }).click()
}

export async function entrar(page: Page, email: string, senha: string) {
  await esperarConversa(page)
  await page.getByLabel('Qual é o seu e-mail?').fill(email)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Sua senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}
