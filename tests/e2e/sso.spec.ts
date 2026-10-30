// Login único de ponta a ponta: um app pede "Entrar com Absolute ZRO", a pessoa cria conta, cria a organização,
// autoriza e o app troca o código por tokens (PKCE + segredo). Mais axe na tela de permissão.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

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
  await criarConta(page, { nome: 'Pessoa SSO', email: email, senha: 'senha-e2e-segura-1' })
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
  const claims = await info.json()
  expect(claims).toMatchObject({
    email,
    email_verified: false,
    name: 'Pessoa SSO',
    zro_org: { name: 'Produtora SSO', role: 'owner' },
    // Organização nova entra no plano grátis (0007), mas o login único só traz o que está lançado (gate, ADR 0023).
    zro_products: expect.arrayContaining(['sobedesce', 'synquei', 'tpeasy']),
    zro_release: expect.objectContaining({ sobedesce: 'released', nossom: 'closed', 'carro-do-freela': 'released' }),
  })
  expect(claims.zro_products).not.toContain('nossom')

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
            values (${clientId}, 'Synquei (teste)', 'synquei', 'confidential', ${createHash('sha256').update('x').digest('hex')}, ${[APP]}, true)`
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
  await criarConta(page, { nome: 'Pessoa Família', email: `fam-${randomUUID().slice(0, 8)}@teste.absolutezro.local`, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas**')
  await page.getByLabel('Nome').fill('Produtora Família')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()

  // Sem "Permitir e continuar": o HUB devolve direto ao app.
  await expect.poll(() => landed?.searchParams.get('state')).toBe('estado-familia')
  expect(landed!.searchParams.get('code')).toMatch(/^zc_/)
  await page.waitForURL('https://app.e2e.teste/**')

  await page.goto('/perfil/acessos')
  await expect(page.locator('#apps').getByText('Synquei (teste)').first()).toBeVisible()
})

test('app em desenvolvimento (NOSSOM): sem código, a pessoa vê "Em desenvolvimento" e volta ao HUB; prompt=none devolve access_denied', async ({
  page,
  request,
}) => {
  const clientId = `e2e-dev-${randomUUID().slice(0, 8)}`
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, trusted)
            values (${clientId}, 'NOSSOM (teste)', 'nossom', 'confidential', ${createHash('sha256').update('x').digest('hex')}, ${[APP]}, true)`

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
    state: 'estado-dev',
    code_challenge: createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url'),
    code_challenge_method: 'S256',
  })
  await page.goto(`/oauth/authorize?${q}`)
  await page.waitForURL('**/entrar?next=**')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  const email = `dev-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await criarConta(page, { nome: 'Pessoa Dev', email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas**')
  await page.getByLabel('Nome').fill('Produtora Dev')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()

  // Nada de código: a porta fechada, com o app e o caminho de volta. Sem dado interno na tela.
  await page.waitForURL('**/oauth/authorize**')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Em desenvolvimento.')
  await expect(page.getByText('NOSSOM', { exact: true })).toBeVisible()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])
  expect(landed).toBeNull()
  const [log] =
    await sql`select l.metadata from zro.audit_logs l join zro.users u on u.id = l.actor_user_id where l.action = 'release.denied' and u.email = ${email}`
  expect(log?.metadata).toEqual({ client: clientId, channel: 'sso' })

  // prompt=none (renovação silenciosa): o app recebe access_denied, sem código.
  const silent = await page.request.get(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), prompt: 'none' })}`, { maxRedirects: 0 })
  expect([303, 307]).toContain(silent.status())
  const back = new URL(silent.headers().location!)
  expect(back.origin + back.pathname).toBe(APP)
  expect(back.searchParams.get('error')).toBe('access_denied')
  expect(back.searchParams.get('code')).toBeNull()

  await page.getByRole('link', { name: 'Voltar ao HUB' }).click()
  await page.waitForURL('**/inicio')

  // A mesma porta fechada tem endereço público; produto que não existe é 404 e produto lançado manda para o HUB.
  expect((await request.get('/em-desenvolvimento/nossom')).status()).toBe(200)
  expect((await request.get('/em-desenvolvimento/nao-existe')).status()).toBe(404)
  const aberto = await request.get('/em-desenvolvimento/sobedesce', { maxRedirects: 0 })
  expect([303, 307]).toContain(aberto.status())
  expect(aberto.headers().location).toContain('/inicio')

  // Conta listada no console entra como num app lançado (trusted: direto, sem a tela Permitir). Sem seguir o
  // redirecionamento: o destino é o app de fora, e o que importa é o código na volta.
  await sql`insert into zro.product_release_access (product_id, user_id, kind, reason)
            select 'nossom', id, 'tester', 'e2e: tester do NOSSOM' from zro.users where email = ${email}`
  await sql.end()
  const liberado = await page.request.get(`/oauth/authorize?${q}`, { maxRedirects: 0 })
  expect([303, 307]).toContain(liberado.status())
  const volta = new URL(liberado.headers().location!)
  expect(volta.origin + volta.pathname).toBe(APP)
  expect(volta.searchParams.get('state')).toBe('estado-dev')
  expect(volta.searchParams.get('code')).toMatch(/^zc_/)
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
  await criarConta(page, { nome: 'Pessoa do App', email: email, senha: 'senha-e2e-segura-1' })
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

test('Carro do Freela: o token do app (escopo carro-do-freela.jobs) cria o projeto do job pela API, sem cookie', async ({ page, request }) => {
  const clientId = `e2e-c-${randomUUID().slice(0, 8)}`
  const secret = `zk_${randomBytes(32).toString('base64url')}`
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, trusted, scopes)
            values (${clientId}, 'Carro do Freela (teste)', 'carro-do-freela', 'confidential', ${createHash('sha256').update(secret).digest('hex')}, ${[APP]}, true,
                    ${['openid', 'email', 'profile', 'org', 'offline_access', 'carro-do-freela.jobs']})`
  await sql.end()
  let landed: URL | null = null
  await page.route('https://app.e2e.teste/**', (route) => {
    landed = new URL(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>App</title><p>ok</p>' })
  })
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: APP,
    scope: 'openid email profile org offline_access carro-do-freela.jobs',
    state: 'estado-carro',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })
  await page.goto(`/oauth/authorize?${q}`)
  await page.waitForURL('**/entrar?next=**')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  const emailCarro = `carro-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await criarConta(page, { nome: 'Produtora do Carro', email: emailCarro, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas**')
  // O Carro é fechado (adendo do PRD, ADR 0023): só a conta proprietária listada entra. Aqui a conta nova faz esse papel.
  const sqlGate = postgres(DB, { max: 1, onnotice: () => {} })
  await sqlGate`insert into zro.product_release_access (product_id, user_id, kind, reason)
                select 'carro-do-freela', id, 'owner', 'e2e: conta proprietária' from zro.users where email = ${emailCarro}`
  await sqlGate.end()
  await page.getByLabel('Nome').fill('Produtora Carro')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await expect.poll(() => landed?.searchParams.get('state')).toBe('estado-carro')

  const tok = await request.post('/oauth/token', {
    headers: { authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams({
      grant_type: 'authorization_code',
      code: landed!.searchParams.get('code')!,
      redirect_uri: APP,
      code_verifier: verifier,
    }).toString(),
  })
  const t = await tok.json()
  expect(t.scope).toContain('carro-do-freela.jobs')

  const job = { contract: 'carro-do-freela.job/1', job_id: `cdf-${randomUUID()}`, title: 'Clipe — Selo Norte', briefing: 'Chamada: 13:30 na praia' }
  const semToken = await request.post('/api/v1/carro-do-freela/jobs', { headers: { authorization: 'Bearer nada' }, data: job })
  expect(semToken.status()).toBe(401)
  // Bearer não passa pela checagem de origem (não é credencial que o navegador manda sozinho)
  const criado = await request.post('/api/v1/carro-do-freela/jobs', {
    headers: { authorization: `Bearer ${t.access_token}`, origin: 'https://outro.teste' },
    data: job,
  })
  expect(criado.status()).toBe(201)
  const { projectId } = await criado.json()
  const de2 = await request.post('/api/v1/carro-do-freela/jobs', { headers: { authorization: `Bearer ${t.access_token}` }, data: job })
  expect(de2.status()).toBe(200)
  expect((await de2.json()).projectId).toBe(projectId)
  // montar equipe convida por e-mail: exige o e-mail da conta confirmado
  const equipe = await request.post('/api/v1/carro-do-freela/jobs/crew', {
    headers: { authorization: `Bearer ${t.access_token}` },
    data: {
      contract: 'carro-do-freela.crew/1',
      job_id: job.job_id,
      members: [{ zro_user_id: randomUUID(), email: 'zeca@teste.absolutezro.local', function: 'Drone' }],
    },
  })
  expect(equipe.status()).toBe(403)
  expect((await equipe.json()).error).toBe('email_not_verified')
  // o projeto existe para a pessoa, com o briefing
  await page.goto(`/projetos/${projectId}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clipe — Selo Norte')
  await expect(page.locator('#equipe')).toContainText('Ninguém na equipe ainda.')
})
