// Login único (ADR 0012): authorization code + PKCE, rotação de refresh token, reuso, isolamento e retorno seguro.
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticateAccessToken,
  discovery,
  exchangeToken,
  grantConsent,
  issueCode,
  loadSigner,
  loginAgainPath,
  OAuthError,
  parseAuthorizeRequest,
  parseTokenRequest,
  redirectAllowed,
  registerClient,
  revokeAppAccess,
  setIssuer,
  userInfo,
  validRedirectUri,
  verifyJwt,
  type AuthorizeRequest,
} from '@zro/auth'
import { grantEntitlement } from '@zro/billing'
import { loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, allowRelease, giveLimits, givePlan, newOrgWithOwner, newUser } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(() => db.close())

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`

async function newClient(
  kind: 'confidential' | 'public' = 'confidential',
  redirectUris = ['https://app.teste/callback'],
  allowLoopback = false,
  productId = 'sobedesce',
) {
  const by = await admin(db)
  return db.asSystem('teste', (tx) => registerClient(tx, { id: rid('app'), name: 'App de teste', productId, kind, redirectUris, allowLoopback, createdBy: by }))
}

function authorizeQuery(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://app.teste/callback',
    scope: 'openid email profile org offline_access',
    state: 'st-123',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    nonce: 'n-1',
    ...extra,
  })
}

async function login(clientId: string, userId: string, orgId: string | null, challenge: string): Promise<string> {
  return db.asSystem('teste', async (tx) => {
    const p = await parseAuthorizeRequest(tx, authorizeQuery(clientId, challenge))
    if (!p.ok) throw new Error('pedido inválido')
    await grantConsent(tx, userId, clientId, p.req.scopes)
    const url = await issueCode(tx, p.req as AuthorizeRequest, { userId, orgId, authTime: new Date() })
    return new URL(url).searchParams.get('code')!
  })
}

const form = (o: Record<string, string>) => new URLSearchParams(o)

describe('cadastro e retorno', () => {
  it('aceita só https, loopback ou esquema do app', () => {
    expect(validRedirectUri('https://sobedesce.vercel.app/api/zro/callback')).toBe(true)
    expect(validRedirectUri('http://127.0.0.1/callback')).toBe(true)
    expect(validRedirectUri('com.absolutezro.synquei:/callback')).toBe(true)
    expect(validRedirectUri('http://exemplo.com/callback')).toBe(false)
    expect(validRedirectUri('https://a.com/cb#frag')).toBe(false)
    expect(validRedirectUri('javascript:alert(1)')).toBe(false)
  })

  it('loopback aceita qualquer porta no mesmo caminho; o resto só igual ao cadastro', () => {
    const c = { redirectUris: ['http://127.0.0.1/callback', 'https://app.teste/cb'], allowLoopback: true }
    expect(redirectAllowed(c, 'http://127.0.0.1:53111/callback')).toBe(true)
    expect(redirectAllowed(c, 'http://127.0.0.1:53111/outro')).toBe(false)
    expect(redirectAllowed(c, 'https://app.teste/cb')).toBe(true)
    expect(redirectAllowed(c, 'https://app.teste/cb2')).toBe(false)
    expect(redirectAllowed({ ...c, allowLoopback: false }, 'http://127.0.0.1:53111/callback')).toBe(false)
  })

  it('cliente ou retorno errado não volta para o app (sem redirecionamento aberto)', async () => {
    const c = await newClient()
    const { challenge } = pkce()
    const bad = await db.asSystem('t', (tx) => parseAuthorizeRequest(tx, authorizeQuery(c.clientId, challenge, { redirect_uri: 'https://malicioso.teste/cb' })))
    expect(bad).toMatchObject({ ok: false, redirect: false })
    const noPkce = await db.asSystem('t', (tx) => parseAuthorizeRequest(tx, authorizeQuery(c.clientId, challenge, { code_challenge_method: 'plain' })))
    expect(noPkce.ok === false && noPkce.redirect && noPkce.to).toContain('error=invalid_request')
  })
})

describe('prompt=login ("Usar outra conta" no app)', () => {
  it('é aceito e anunciado; prompt desconhecido continua ignorado', async () => {
    const c = await newClient()
    const { challenge } = pkce()
    const p = await db.asSystem('t', (tx) => parseAuthorizeRequest(tx, authorizeQuery(c.clientId, challenge, { prompt: 'login' })))
    expect(p.ok && p.req.prompt).toBe('login')
    const outro = await db.asSystem('t', (tx) => parseAuthorizeRequest(tx, authorizeQuery(c.clientId, challenge, { prompt: 'select_account' })))
    expect(outro.ok && outro.req.prompt).toBeNull()
    expect(discovery(ISS).prompt_values_supported).toContain('login')
  })

  it('manda para o login do HUB (mesmo com sessão) e volta ao mesmo pedido sem o prompt, sem laço', () => {
    const q = authorizeQuery('app-x', 'c'.repeat(43), { prompt: 'login' })
    const to = new URL(loginAgainPath(q), 'https://hub.teste')
    expect(to.origin).toBe('https://hub.teste')
    expect(to.pathname).toBe('/entrar')
    expect(to.searchParams.get('outra')).toBe('1')
    const next = new URL(to.searchParams.get('next')!, 'https://hub.teste')
    expect(next.pathname).toBe('/oauth/authorize')
    expect(next.searchParams.get('prompt')).toBeNull()
    for (const k of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'nonce', 'scope']) expect(next.searchParams.get(k)).toBe(q.get(k))
    expect(q.get('prompt')).toBe('login')
  })
})

describe('código + PKCE', () => {
  it('troca o código por tokens com a organização e os produtos contratados', async () => {
    const o = await newOrgWithOwner(db, 'oidc')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    const c = await newClient()
    const { verifier, challenge } = pkce()
    const code = await login(c.clientId, o.userId, o.orgId, challenge)
    const t = await exchangeToken(
      db,
      parseTokenRequest(
        form({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/callback', code_verifier: verifier }),
        `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
      ),
      loadOidcClaims,
    )
    const signer = await loadSigner(db)
    const id = verifyJwt(signer, t.id_token, { typ: 'JWT', issuer: ISS })!
    expect(id).toMatchObject({ sub: o.userId, aud: c.clientId, nonce: 'n-1', email: o.email, email_verified: true })
    expect((id.zro_org as { id: string }).id).toBe(o.orgId)
    expect(id.zro_products).toEqual(['sobedesce'])
    // zro_release (ADR 0023): lançado para o público, em todos os tokens e no userinfo; o não lançado nem aparece (0049)
    expect(id.zro_release).toMatchObject({ sobedesce: 'released', synquei: 'released', 'carro-do-freela': 'released' })
    for (const naoLancado of ['nossom', 'ai-edit', 'finishing']) expect(id.zro_release).not.toHaveProperty(naoLancado)
    const at = verifyJwt(signer, t.access_token, { typ: 'at+jwt', issuer: ISS })!
    expect(at.aud).toBe(c.clientId)
    expect((at.zro_release as Record<string, string>).sobedesce).toBe('released')
    expect(t.refresh_token).toMatch(/^zt_/)
    const info = await userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)
    expect(info).toMatchObject({ sub: o.userId, email: o.email, zro_products: ['sobedesce'], zro_release: expect.objectContaining({ sobedesce: 'released' }) })
    expect(info.zro_release).not.toHaveProperty('nossom')
  })

  it('recusa verifier errado, segredo errado e código reapresentado', async () => {
    const u = await newUser(db, 'oidc-erros')
    const c = await newClient()
    const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
    const p1 = pkce()
    const code1 = await login(c.clientId, u.userId, null, p1.challenge)
    const bad = pkce()
    await expect(
      exchangeToken(
        db,
        parseTokenRequest(
          form({ grant_type: 'authorization_code', code: code1, redirect_uri: 'https://app.teste/callback', code_verifier: bad.verifier }),
          basic,
        ),
        loadOidcClaims,
      ),
    ).rejects.toMatchObject({ error: 'invalid_grant' })
    // O código foi gasto na primeira tentativa, mesmo com erro.
    await expect(
      exchangeToken(
        db,
        parseTokenRequest(
          form({ grant_type: 'authorization_code', code: code1, redirect_uri: 'https://app.teste/callback', code_verifier: p1.verifier }),
          basic,
        ),
        loadOidcClaims,
      ),
    ).rejects.toMatchObject({ error: 'invalid_grant' })

    const p2 = pkce()
    const code2 = await login(c.clientId, u.userId, null, p2.challenge)
    const wrongSecret = `Basic ${Buffer.from(`${c.clientId}:zk_errado`).toString('base64')}`
    await expect(
      exchangeToken(
        db,
        parseTokenRequest(
          form({ grant_type: 'authorization_code', code: code2, redirect_uri: 'https://app.teste/callback', code_verifier: p2.verifier }),
          wrongSecret,
        ),
        loadOidcClaims,
      ),
    ).rejects.toMatchObject({ error: 'invalid_client', status: 401 })

    const t = await exchangeToken(
      db,
      parseTokenRequest(form({ grant_type: 'authorization_code', code: code2, redirect_uri: 'https://app.teste/callback', code_verifier: p2.verifier }), basic),
      loadOidcClaims,
    )
    // Reapresentar o código revoga o refresh token que ele gerou.
    await expect(
      exchangeToken(
        db,
        parseTokenRequest(
          form({ grant_type: 'authorization_code', code: code2, redirect_uri: 'https://app.teste/callback', code_verifier: p2.verifier }),
          basic,
        ),
        loadOidcClaims,
      ),
    ).rejects.toBeInstanceOf(OAuthError)
    await expect(
      exchangeToken(db, parseTokenRequest(form({ grant_type: 'refresh_token', refresh_token: t.refresh_token! }), basic), loadOidcClaims),
    ).rejects.toMatchObject({ error: 'invalid_grant' })
  })
})

describe('refresh token', () => {
  it('gira a cada uso; reapresentar um antigo revoga a família inteira', async () => {
    const u = await newUser(db, 'oidc-refresh')
    const c = await newClient('public', ['http://127.0.0.1/callback'], true)
    const p = pkce()
    const code = await db.asSystem('t', async (tx) => {
      const q = authorizeQuery(c.clientId, p.challenge, { redirect_uri: 'http://127.0.0.1:51234/callback' })
      const r = await parseAuthorizeRequest(tx, q)
      if (!r.ok) throw new Error('pedido inválido')
      await grantConsent(tx, u.userId, c.clientId, r.req.scopes)
      return new URL(await issueCode(tx, r.req, { userId: u.userId, orgId: null, authTime: new Date() })).searchParams.get('code')!
    })
    const pub = (o: Record<string, string>) => parseTokenRequest(form({ client_id: c.clientId, ...o }), null)
    const t1 = await exchangeToken(
      db,
      pub({ grant_type: 'authorization_code', code, redirect_uri: 'http://127.0.0.1:51234/callback', code_verifier: p.verifier }),
      loadOidcClaims,
    )
    const t2 = await exchangeToken(db, pub({ grant_type: 'refresh_token', refresh_token: t1.refresh_token! }), loadOidcClaims)
    expect(t2.refresh_token).not.toBe(t1.refresh_token)
    await expect(exchangeToken(db, pub({ grant_type: 'refresh_token', refresh_token: t1.refresh_token! }), loadOidcClaims)).rejects.toMatchObject({
      error: 'invalid_grant',
    })
    // A família caiu: nem o token novo vale mais.
    await expect(exchangeToken(db, pub({ grant_type: 'refresh_token', refresh_token: t2.refresh_token! }), loadOidcClaims)).rejects.toMatchObject({
      error: 'invalid_grant',
    })
  })

  it('remover o acesso do app no Perfil derruba os refresh tokens', async () => {
    const u = await newUser(db, 'oidc-perfil')
    const c = await newClient()
    const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
    const p = pkce()
    const code = await login(c.clientId, u.userId, null, p.challenge)
    const t = await exchangeToken(
      db,
      parseTokenRequest(form({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/callback', code_verifier: p.verifier }), basic),
      loadOidcClaims,
    )
    await revokeAppAccess(db, u.userId, c.clientId)
    await expect(
      exchangeToken(db, parseTokenRequest(form({ grant_type: 'refresh_token', refresh_token: t.refresh_token! }), basic), loadOidcClaims),
    ).rejects.toMatchObject({ error: 'invalid_grant' })
  })
})

describe('gate de lançamento (ADR 0023)', () => {
  const basic = (c: { clientId: string; clientSecret: string | null }) => `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
  const closedClient = () => newClient('confidential', ['https://app.teste/callback'], false, 'nossom')
  const exchange = (c: { clientId: string; clientSecret: string | null }, code: string, verifier: string) =>
    exchangeToken(
      db,
      parseTokenRequest(form({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/callback', code_verifier: verifier }), basic(c)),
      loadOidcClaims,
    )

  it('cliente de produto fechado: conta fora da lista não recebe código (access_denied), mesmo com plano e papel de suporte', async () => {
    const o = await newOrgWithOwner(db, 'gate-fechado', { freePlan: true })
    await db.sql`update zro.users set platform_role = 'support' where id = ${o.userId}`
    const c = await closedClient()
    const { challenge } = pkce()
    await expect(login(c.clientId, o.userId, o.orgId, challenge)).rejects.toMatchObject({
      error: 'access_denied',
      description: 'Este app não está disponível para a sua conta.',
    })
    // nada ficou para trás: nem conta no app
    const [acc] = await db.sql`select 1 from zro.app_accounts where user_id = ${o.userId} and client_id = ${c.clientId}`
    expect(acc).toBeUndefined()
    // o cliente do produto lançado segue igual para a mesma conta
    const aberto = await newClient()
    await expect(login(aberto.clientId, o.userId, o.orgId, pkce().challenge)).resolves.toMatch(/^zc_/)
  })

  it('conta listada entra com zro_release=allowed; o canal api precisa estar na lista; revogada, nem refresh, userinfo ou Bearer', async () => {
    const o = await newOrgWithOwner(db, 'gate-listada', { freePlan: true })
    await allowRelease(db, 'nossom', o.userId, { channels: ['sso', 'web'] })
    const c = await closedClient()
    const { verifier, challenge } = pkce()
    const code = await login(c.clientId, o.userId, o.orgId, challenge)
    const t = await exchange(c, code, verifier)
    const signer = await loadSigner(db)
    const id = verifyJwt(signer, t.id_token, { typ: 'JWT', issuer: ISS })!
    expect(id.zro_release).toMatchObject({ nossom: 'allowed', sobedesce: 'released' })
    expect(id.zro_release).not.toHaveProperty('finishing')
    expect(id.zro_products).toContain('nossom')
    const at = verifyJwt(signer, t.access_token, { typ: 'at+jwt', issuer: ISS })!
    expect((at.zro_release as Record<string, string>).nossom).toBe('allowed')
    expect(await userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)).toMatchObject({ zro_release: expect.objectContaining({ nossom: 'allowed' }) })
    // Bearer na API é o canal api: não listado, o token não vale; listado, vale
    expect(await authenticateAccessToken(db, `Bearer ${t.access_token}`, 'org')).toBeNull()
    await allowRelease(db, 'nossom', o.userId, { channels: ['sso', 'web', 'api'] })
    expect((await authenticateAccessToken(db, `Bearer ${t.access_token}`, 'org'))?.session.app?.productId).toBe('nossom')
    const t2 = await exchangeToken(db, parseTokenRequest(form({ grant_type: 'refresh_token', refresh_token: t.refresh_token! }), basic(c)), loadOidcClaims)
    expect(t2.refresh_token).toBeTruthy()
    // sessão antiga: revogar a linha derruba refresh, userinfo e Bearer na hora
    await db.sql`update zro.product_release_access set revoked_at = now() where product_id = 'nossom' and user_id = ${o.userId}`
    await expect(
      exchangeToken(db, parseTokenRequest(form({ grant_type: 'refresh_token', refresh_token: t2.refresh_token! }), basic(c)), loadOidcClaims),
    ).rejects.toMatchObject({ error: 'invalid_grant', description: 'Este app não está disponível para a sua conta.' })
    await expect(userInfo(db, `Bearer ${t2.access_token}`, loadOidcClaims)).rejects.toMatchObject({ error: 'invalid_token', status: 401 })
    expect(await authenticateAccessToken(db, `Bearer ${t2.access_token}`, 'org')).toBeNull()
    // o cliente de um produto lançado continua funcionando para a mesma pessoa
    const aberto = await newClient()
    const p = pkce()
    const t3 = await exchange(aberto, await login(aberto.clientId, o.userId, o.orgId, p.challenge), p.verifier)
    expect((await userInfo(db, `Bearer ${t3.access_token}`, loadOidcClaims)).zro_products).toContain('sobedesce')
  })
})

describe('zro_features (sinais de recurso, 0025)', () => {
  const basic = (c: { clientId: string; clientSecret: string | null }) => `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
  const exchange = (c: { clientId: string; clientSecret: string | null }, code: string, verifier: string) =>
    exchangeToken(
      db,
      parseTokenRequest(form({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/callback', code_verifier: verifier }), basic(c)),
      loadOidcClaims,
    )

  it('o token do Maestro leva maestro.marca_propria só com o sinal; o de outro app, nada; sem o sinal, lista vazia', async () => {
    const o = await newOrgWithOwner(db, 'zro-features')
    const sem = await newOrgWithOwner(db, 'zro-features-sem')
    await allowRelease(db, 'maestro', o.userId, { channels: ['sso', 'web'] })
    await allowRelease(db, 'maestro', sem.userId, { channels: ['sso', 'web'] })
    for (const org of [o.orgId, sem.orgId]) await giveLimits(db, org, 'maestro', {})
    const adminId = await admin(db)
    await db.asSystem('t', (tx) =>
      grantEntitlement(
        tx,
        { userId: adminId, reason: 'adicional' },
        { orgId: o.orgId, productId: 'maestro', features: [], limits: { 'maestro.marca_propria': 1 }, endsAt: null },
      ),
    )
    const signer = await loadSigner(db)
    const maestro = await newClient('confidential', ['https://app.teste/callback'], false, 'maestro')
    const p = pkce()
    const t = await exchange(maestro, await login(maestro.clientId, o.userId, o.orgId, p.challenge), p.verifier)
    const id = verifyJwt(signer, t.id_token, { typ: 'JWT', issuer: ISS })!
    expect(id.zro_features).toEqual(['maestro.marca_propria'])
    expect(id.zro_products).toContain('maestro')
    expect(verifyJwt(signer, t.access_token, { typ: 'at+jwt', issuer: ISS })!.zro_features).toEqual(['maestro.marca_propria'])
    expect((await userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)).zro_features).toEqual(['maestro.marca_propria'])

    const outro = await newClient()
    const p2 = pkce()
    const t2 = await exchange(outro, await login(outro.clientId, o.userId, o.orgId, p2.challenge), p2.verifier)
    expect(verifyJwt(signer, t2.id_token, { typ: 'JWT', issuer: ISS })!.zro_features).toEqual([])

    const p3 = pkce()
    const t3 = await exchange(maestro, await login(maestro.clientId, sem.userId, sem.orgId, p3.challenge), p3.verifier)
    const id3 = verifyJwt(signer, t3.id_token, { typ: 'JWT', issuer: ISS })!
    expect(id3.zro_products).toContain('maestro')
    expect(id3.zro_features).toEqual([])
  })
})

describe('isolamento', () => {
  it('zro_app não lê segredo, códigos nem refresh tokens; consentimento só o próprio', async () => {
    const a = await newOrgWithOwner(db, 'oidc-a')
    const b = await newOrgWithOwner(db, 'oidc-b')
    const c = await newClient()
    await db.asSystem('t', (tx) => grantConsent(tx, b.userId, c.clientId, ['openid']))
    const ctx = { userId: a.userId, orgId: a.orgId }
    // Cada leitura proibida numa transação própria: o erro de permissão aborta a transação.
    for (const q of [
      'select secret_hash from zro.oauth_clients limit 1',
      'select * from zro.oauth_codes limit 1',
      'select * from zro.oauth_refresh_tokens limit 1',
    ]) {
      await expect(db.asUser(ctx, (tx) => tx.unsafe(q))).rejects.toThrow(/permission denied/)
    }
    await db.asUser(ctx, async (tx) => {
      const seen = await tx`select user_id from zro.oauth_consents`
      expect(seen.every((r) => r.user_id === a.userId)).toBe(true)
      const [name] = await tx`select name from zro.oauth_clients where id = ${c.clientId}`
      expect(name?.name).toBe('App de teste')
    })
  })
})

describe('perfil único (0015)', () => {
  // PNG 1×1 válido (o setAvatar confere o formato pelos primeiros bytes)
  const png = (cor: number) =>
    Buffer.from(`iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk${cor ? 'YPhfDwAChwGA' : 'AAIAAAUAAen'}60eEAAAAASUVORK5CYII=`, 'base64')

  it('nome, foto e updated_at vêm do login único; foto nova muda o endereço e o antigo some', async () => {
    const { publicAvatar, setAvatar, updateDisplayName } = await import('@zro/core')
    const foto = (id: string) => publicAvatar(db, id)
    const u = await newUser(db, 'perfil')
    const c = await newClient()
    const { verifier, challenge } = pkce()
    const code = await login(c.clientId, u.userId, null, challenge)
    const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
    const t = await exchangeToken(
      db,
      parseTokenRequest(form({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/callback', code_verifier: verifier }), basic),
      loadOidcClaims,
    )
    const bearer = `Bearer ${t.access_token}`
    const antes = await userInfo(db, bearer, loadOidcClaims)
    expect(antes).toMatchObject({ name: 'perfil', zro_conta: `${ISS}/perfil` })
    expect(antes.picture).toBeUndefined()

    await setAvatar(db, u.auth, png(1))
    await updateDisplayName(db, u.auth, 'Victor Barroso')
    const depois = await userInfo(db, bearer, loadOidcClaims)
    expect(depois.name).toBe('Victor Barroso')
    expect(depois.picture).toMatch(new RegExp(`^${ISS}/api/v1/foto/[0-9a-f-]{36}$`))
    expect(depois.updated_at as number).toBeGreaterThanOrEqual(antes.updated_at as number)
    const id1 = (depois.picture as string).split('/').pop()!
    expect((await foto(id1))?.type).toBe('image/png')

    await setAvatar(db, u.auth, png(0))
    const nova = await userInfo(db, bearer, loadOidcClaims)
    const id2 = (nova.picture as string).split('/').pop()!
    expect(id2).not.toBe(id1)
    expect(await foto(id1)).toBeNull()
    expect(await foto(id2)).not.toBeNull()
    expect(await foto('nao-e-uuid')).toBeNull()
  })
})
