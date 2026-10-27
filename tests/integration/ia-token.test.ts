// A Z chamada por um app da família com o token do login único (escopo zro.ia), de ponta a ponta: login no app,
// troca de código, refresh e a conversa no HUB. É o caminho que as plataformas usam (repasse no servidor do app).
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticateAccessToken,
  exchangeToken,
  grantConsent,
  issueCode,
  parseAuthorizeRequest,
  parseTokenRequest,
  registerClient,
  setIssuer,
  type AuthorizeRequest,
} from '@zro/auth'
import { iniciarTurno, loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, giveLimits, newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
  setIssuer('https://hub.teste.absolutezro.local')
})
afterAll(() => db.close())

async function cliente(productId: string) {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: `${productId}-${randomBytes(4).toString('hex')}`,
      name: productId,
      productId,
      kind: 'confidential',
      redirectUris: ['https://app.teste/cb'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
}

async function login(c: { clientId: string; clientSecret: string | null }, userId: string, orgId: string, scope: string) {
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: 'https://app.teste/cb',
    scope,
    state: 'st',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })
  const code = await db.asSystem('teste', async (tx) => {
    const p = await parseAuthorizeRequest(tx, q)
    if (!p.ok) throw new Error('pedido recusado: ' + JSON.stringify(p))
    await grantConsent(tx, userId, c.clientId, p.req.scopes)
    return new URL(await issueCode(tx, p.req as AuthorizeRequest, { userId, orgId, authTime: new Date() })).searchParams.get('code')!
  })
  const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
  const t = await exchangeToken(
    db,
    parseTokenRequest(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/cb', code_verifier: verifier }), basic),
    loadOidcClaims,
  )
  return { t, basic }
}

describe('a Z com o token de um app da família', () => {
  it('login com zro.ia: o token abre a conversa, atribuída à plataforma, também depois do refresh', async () => {
    const o = await newOrgWithOwner(db, 'z-token')
    await giveLimits(db, o.orgId, 'sobedesce', { 'zro.ai_credits': 10 })
    const c = await cliente('sobedesce')
    const { t, basic } = await login(c, o.userId, o.orgId, 'openid email profile org offline_access zro.ia')
    expect(t.scope.split(' ')).toContain('zro.ia')
    const auth = await authenticateAccessToken(db, `Bearer ${t.access_token}`, 'zro.ia')
    expect(auth?.session.app?.productId).toBe('sobedesce')
    const turno = await iniciarTurno(db, auth, { texto: 'Oi, Z' })
    expect(turno.conversa.id).toBeTruthy()

    const r = await exchangeToken(
      db,
      parseTokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token! }), basic),
      loadOidcClaims,
    )
    const auth2 = await authenticateAccessToken(db, `Bearer ${r.access_token}`, 'zro.ia')
    expect(auth2).not.toBeNull()
    await iniciarTurno(db, auth2, { texto: 'De novo' })
  })
})
