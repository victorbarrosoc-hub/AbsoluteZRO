// Login único de ponta a ponta: um app pede "Entrar com Absolute ZRO", a pessoa cria conta, cria a organização,
// autoriza e o app troca o código por tokens (PKCE + segredo). Mais axe na tela de permissão.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import postgres from 'postgres'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const APP = 'https://app.e2e.teste/callback'

test('Entrar com Absolute ZRO: cadastro, permissão, código e tokens', async ({ page, request, baseURL }) => {
  const clientId = `e2e-${randomUUID().slice(0, 8)}`
  const secret = `zk_${randomBytes(32).toString('base64url')}`
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris)
            values (${clientId}, 'SOBEDESCE (teste)', 'sobedesce', 'confidential', ${createHash('sha256').update(secret).digest('hex')}, ${[APP]})`
  await sql.end()

  // O "app" de teste: só captura para onde o HUB devolveu a pessoa.
  let landed: URL | null = null
  await page.route('https://app.e2e.teste/**', (route) => {
    landed = new URL(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>App</title><p>ok</p>' })
  })

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: APP,
    scope: 'openid email profile org offline_access',
    state: 'estado-e2e',
    nonce: 'nonce-e2e',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  await page.goto(`/oauth/authorize?${q}`)
  await page.waitForURL('**/entrar?next=**')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  const email = `sso-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.getByLabel('Nome').fill('Pessoa SSO')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-e2e-segura-1')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.waitForURL('**/boas-vindas**')
  await page.getByLabel('Nome').fill('Produtora SSO')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()

  await page.waitForURL('**/oauth/authorize**')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('SOBEDESCE (teste)')
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])
  await page.getByRole('button', { name: 'Permitir e continuar' }).click()
  await expect.poll(() => landed?.searchParams.get('state')).toBe('estado-e2e')
  const code = landed!.searchParams.get('code')!
  expect(code).toMatch(/^zc_/)

  const basic = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`
  const tok = await request.post('/oauth/token', {
    headers: { authorization: basic, 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: APP, code_verifier: verifier }).toString(),
  })
  expect(tok.status()).toBe(200)
  const t = await tok.json()
  expect(t.token_type).toBe('Bearer')
  expect(t.refresh_token).toMatch(/^zt_/)

  const info = await request.get('/oauth/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } })
  expect(await info.json()).toMatchObject({
    email,
    email_verified: false,
    name: 'Pessoa SSO',
    zro_org: { name: 'Produtora SSO', role: 'owner' },
    // Organização nova entra no plano grátis (0007): as ferramentas dele vêm no login único.
    zro_products: expect.arrayContaining(['carro-do-freela', 'nossom', 'sobedesce', 'synquei', 'tpeasy']),
  })

  // Segunda vez: já autorizado, volta direto ao app sem a tela de permissão.
  const again = await page.request.get(`/oauth/authorize?${q}`, { maxRedirects: 0 })
  expect([303, 307]).toContain(again.status())
  const back = new URL(again.headers().location!)
  expect(back.origin + back.pathname).toBe(APP)
  expect(back.searchParams.get('code')).toMatch(/^zc_/)

  const disc = await (await request.get('/.well-known/openid-configuration')).json()
  expect(disc.issuer).toBe(baseURL)
  expect(disc.code_challenge_methods_supported).toEqual(['S256'])
  const keys = await (await request.get('/oauth/jwks')).json()
  expect(keys.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' })

  // Retorno não cadastrado: o HUB não redireciona (sem redirecionamento aberto).
  await page.goto(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), redirect_uri: 'https://malicioso.teste/cb' })}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Não deu para continuar')
})

test('app da família (trusted): entra direto, sem a tela Permitir, e o acesso fica no Perfil', async ({ page }) => {
  const clientId = `e2e-f-${randomUUID().slice(0, 8)}`
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, trusted)
            values (${clientId}, 'NOSSOM (teste)', 'nossom', 'confidential', ${createHash('sha256').update('x').digest('hex')}, ${[APP]}, true)`
  await sql.end()

  let landed: URL | null = null
  await page.route('https://app.e2e.teste/**', (route) => {
    landed = new URL(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>App</title><p>ok</p>' })
  })
  const challenge = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: APP,
    scope: 'openid email profile org',
    state: 'estado-familia',
    nonce: 'n',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  await page.goto(`/oauth/authorize?${q}`)
  await page.waitForURL('**/entrar?next=**')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome').fill('Pessoa Família')
  await page.getByLabel('E-mail').fill(`fam-${randomUUID().slice(0, 8)}@teste.absolutezro.local`)
  await page.getByLabel('Senha').fill('senha-e2e-segura-1')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.waitForURL('**/boas-vindas**')
  await page.getByLabel('Nome').fill('Produtora Família')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()

  // Sem "Permitir e continuar": o HUB devolve direto ao app.
  await expect.poll(() => landed?.searchParams.get('state')).toBe('estado-familia')
  expect(landed!.searchParams.get('code')).toMatch(/^zc_/)

  await page.goto('/perfil/acessos')
  await expect(page.locator('#apps').getByText('NOSSOM (teste)').first()).toBeVisible()
})

test('Criar conta num app: a conta nasce na Absolute ZRO e volta ao app já logada', async ({ page }) => {
  const clientId = `e2e-${randomUUID().slice(0, 8)}`
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, trusted)
            values (${clientId}, 'TPeasy (teste)', 'tpeasy', 'confidential', ${createHash('sha256').update('x').digest('hex')}, ${[APP]}, true)`

  let landed: URL | null = null
  await page.route('https://app.e2e.teste/**', (route) => {
    landed = new URL(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>App</title><p>ok</p>' })
  })
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: APP,
    scope: 'openid email profile org',
    state: 'estado-criar',
    code_challenge: createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'create',
  })
  await page.goto(`/oauth/authorize?${q}`)
  await page.waitForURL('**/criar-conta?next=**')
  const next = new URL(page.url()).searchParams.get('next')!
  expect(next).toContain('/oauth/authorize?')
  expect(next).not.toContain('prompt=create')
  await expect(page.getByRole('link', { name: 'Continuar com o Google' })).toHaveCount(0)

  const email = `criar-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.getByLabel('Nome').fill('Pessoa do App')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-e2e-segura-1')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.waitForURL('**/boas-vindas**')
  await expect(page.getByLabel('Nome')).toHaveValue('Pessoa do App')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()

  // App da família (trusted): sem tela de permissão, direto de volta com o código.
  await expect.poll(() => landed?.searchParams.get('state')).toBe('estado-criar')
  expect(landed!.searchParams.get('code')).toMatch(/^zc_/)
  const [acc] = await sql`select a.logins from zro.app_accounts a join zro.users u on u.id = a.user_id where u.email = ${email} and a.client_id = ${clientId}`
  expect(acc?.logins).toBe(1)
  await sql.end()
})
