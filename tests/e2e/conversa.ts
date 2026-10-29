// Entrar e criar conta são uma conversa (components/conversa-conta.tsx): uma pergunta por vez, e o envio só acontece
// no último passo. Os testes respondem passo a passo, como uma pessoa.
import { expect, type Page } from '@playwright/test'

/** Espera a conversa ficar interativa (com JavaScript, só o passo da vez aparece). */
export async function esperarConversa(page: Page) {
  await expect(page.locator('form.conversa[data-js]')).toBeVisible()
}

/** `arroba`: o @ escolhido (sem ele, fica a sugestão do nome; ocupada, o servidor põe um número). */
export async function criarConta(page: Page, r: { nome: string; email: string; senha: string; arroba?: string }) {
  await esperarConversa(page)
  await page.getByLabel('Qual é o seu e-mail?').fill(r.email)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Como podemos te chamar?').fill(r.nome)
  await page.getByRole('button', { name: 'Continuar' }).click()
  // O @ do perfil profissional (ADR 0029) vem sugerido pelo nome.
  await expect(page.getByLabel('Escolha seu @')).not.toHaveValue('')
  if (r.arroba) await page.getByLabel('Escolha seu @').fill(r.arroba)
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
