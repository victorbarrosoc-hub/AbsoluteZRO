// Entrar pelo navegador do sistema, para os apps de computador (ADR 0041): o app abre /entrar/app no navegador, a pessoa
// entra, toca em "Voltar para o app" e o deep link traz um código de uso único que o app troca por sessão.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { expect, request as pwRequest, test } from '@playwright/test'
import { criarConta } from './conversa'

const verifier = () => randomBytes(32).toString('base64url')
const desafio = (v: string) => createHash('sha256').update(v).digest('base64url')

test('pedido inválido não vai a lugar nenhum (protocolo fora da lista, state e desafio malformados, open redirect)', async ({ request }) => {
  const ok = { app: 'relay', state: randomBytes(24).toString('base64url'), challenge: desafio(verifier()) }
  const go = (extra: Record<string, string>) => request.get(`/entrar/app?${new URLSearchParams({ ...ok, ...extra })}`, { maxRedirects: 0 })
  const ruins: Record<string, string>[] = [{ app: 'javascript' }, { app: 'https' }, { app: 'evil' }, { state: 'curto' }, { challenge: 'curto' }]
  for (const ruim of ruins) {
    const r = await go(ruim)
    expect([302, 303, 307, 308], JSON.stringify(ruim)).toContain(r.status())
    expect(r.headers().location).toBe('/entrar?erro=app')
  }
  // `next` de fora do HUB é descartado: a tela de confirmação nunca recebe um destino externo
  for (const next of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
    const r = await go({ next })
    const loc = new URL(r.headers().location!, 'http://x')
    expect(loc.pathname).toBe('/entrar/app/confirmar')
    expect(loc.searchParams.has('next'), next).toBe(false)
  }
  const bom = await go({ next: '/oauth/authorize?client_id=relay-web' })
  expect(new URL(bom.headers().location!, 'http://x').searchParams.get('next')).toBe('/oauth/authorize?client_id=relay-web')
})

test('entrar no navegador, voltar ao app com o código e trocar por sessão (uso único, PKCE)', async ({ page, baseURL }) => {
  const v = verifier()
  const state = randomBytes(24).toString('base64url')
  const q = new URLSearchParams({ app: 'relay', state, challenge: desafio(v), next: '/oauth/authorize?client_id=relay-web' })

  // sem sessão: a confirmação pede a entrada e volta
  await page.goto(`/entrar/app?${q}`)
  await page.waitForURL('**/entrar?next=**')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  await criarConta(page, { nome: 'Pessoa App', email: `app-${randomUUID().slice(0, 8)}@teste.absolutezro.local`, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas**')
  await page.getByLabel('Nome').fill('Produtora App')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/entrar/app/confirmar**')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pronto')

  await page.getByRole('button', { name: 'Voltar para o Relay' }).click()
  // o navegador abre relay://…; sem o app instalado, o link de reserva mostra o endereço
  const link = page.getByRole('link', { name: 'toque aqui' })
  await expect(link).toBeVisible()
  const volta = new URL((await link.getAttribute('href'))!)
  expect(volta.protocol).toBe('relay:')
  expect(volta.hostname).toBe('entrar-app')
  expect(volta.searchParams.get('state')).toBe(state)
  const code = volta.searchParams.get('code')!
  expect(code).toMatch(/^zd_[A-Za-z0-9_-]{43}$/)

  // o app (sem cookie nenhum) troca o código
  const app = await pwRequest.newContext({ baseURL })
  const troca = (body: Record<string, string>) => app.post('/entrar/app/trocar', { data: body })
  const base = { app: 'relay', code, state, verifier: v }

  const errado = await troca({ ...base, verifier: verifier() })
  expect(errado.status()).toBe(401)
  // o desafio errado queimou o código: nem o verifier certo abre mais
  expect((await troca(base)).status()).toBe(401)

  // um código novo, agora completo
  await page.getByRole('button', { name: 'Voltar para o Relay' }).click()
  await expect(link).not.toHaveAttribute('href', volta.href)
  const novo = new URL((await page.getByRole('link', { name: 'toque aqui' }).getAttribute('href'))!).searchParams.get('code')!
  expect(novo).not.toBe(code)
  const certo = await troca({ ...base, code: novo })
  expect(certo.status()).toBe(200)
  expect(await certo.json()).toEqual({ ok: true, next: '/oauth/authorize?client_id=relay-web' })
  expect(certo.headers()['set-cookie']).toMatch(/zro_session=zs_/)
  // a sessão que o app recebeu vale no HUB
  expect((await app.get('/api/v1/me')).status()).toBe(200)
  // uso único
  expect((await troca({ ...base, code: novo })).status()).toBe(401)
  await app.dispose()
})
