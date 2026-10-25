// Login único (ADR 0012): authorization code + PKCE, rotação de refresh token, reuso, isolamento e retorno seguro.
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  exchangeToken,
  grantConsent,
  issueCode,
  loadSigner,
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
import { loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, givePlan, newOrgWithOwner, newUser } from './helpers'

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

async function newClient(kind: 'confidential' | 'public' = 'confidential', redirectUris = ['https://app.teste/callback'], allowLoopback = false) {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, { id: rid('app'), name: 'App de teste', productId: 'sobedesce', kind, redirectUris, allowLoopback, createdBy: by }),
  )
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
    const at = verifyJwt(signer, t.access_token, { typ: 'at+jwt', issuer: ISS })!
    expect(at.aud).toBe(c.clientId)
    expect(t.refresh_token).toMatch(/^zt_/)
    const info = await userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)
    expect(info).toMatchObject({ sub: o.userId, email: o.email, zro_products: ['sobedesce'] })
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
