// Conta única Absolute ZRO (25/10/2026): plano grátis na organização nova, conta por app e "Entrar com o Google".
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticate,
  googleFinish,
  googleStart,
  issueCode,
  parseAuthorizeRequest,
  registerClient,
  setIssuer,
  signIn,
  signInWithGoogle,
  type AuthorizeRequest,
  type GooglePending,
} from '@zro/auth'
import { loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, expectCode, newOrgWithOwner, newUser } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
  setIssuer('https://hub.teste.absolutezro.local')
})
afterAll(() => db.close())

const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`
const APPS = ['ai-edit', 'carro-do-freela', 'finishing', 'maestro', 'nossom', 'relay', 'sobedesce', 'synquei', 'tpeasy']

describe('plano grátis da organização nova', () => {
  it('libera as ferramentas do plano grátis vigente e aparece no login único', async () => {
    const o = await newOrgWithOwner(db, 'gratis', { freePlan: true })
    const rows = await db.sql`
      select e.product_id, s.provider, p.code, p.version from zro.entitlements e
      join zro.subscriptions s on s.id = e.source_id join zro.plans p on p.id = s.plan_id
      where e.org_id = ${o.orgId} and e.status = 'active' order by e.product_id`
    expect(rows.map((r) => r.product_id)).toEqual(APPS)
    expect(rows.every((r) => r.provider === 'free' && r.code === 'conta-absolute-zro' && r.version === 2)).toBe(true)
    const claims = await db.asSystem('t', (tx) => loadOidcClaims(tx, o.userId, o.orgId))
    // No login único só entram os abertos (gate de lançamento, ADR 0023): os lançados, o Maestro (0027/0039), o
    // Carro do Freela (0041); os não lançados (AEON, Revela, NOSSOM; 0049) nem entram em zro_release.
    expect([...claims.products].sort()).toEqual(['carro-do-freela', 'maestro', 'sobedesce', 'synquei', 'tpeasy'])
    expect(claims.release).toMatchObject({
      maestro: 'released',
      sobedesce: 'released',
      synquei: 'released',
      tpeasy: 'released',
      'carro-do-freela': 'released',
    })
    for (const id of ['nossom', 'ai-edit', 'finishing']) expect(claims.release, id).not.toHaveProperty(id)
  })

  it('é idempotente: não assina de novo nem duplica entitlements', async () => {
    const o = await newOrgWithOwner(db, 'gratis-2x', { freePlan: true })
    await db.sql`select zro.start_free_plan(${o.orgId}::uuid)`
    const [n] = await db.sql`select (select count(*) from zro.subscriptions where org_id = ${o.orgId})::int as subs,
      (select count(*) from zro.entitlements where org_id = ${o.orgId})::int as ents`
    expect(n).toEqual({ subs: 1, ents: APPS.length })
  })

  it('zro_app não chama a função direto', async () => {
    const o = await newOrgWithOwner(db, 'gratis-rls')
    await expect(db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => tx`select zro.start_free_plan(${o.orgId}::uuid)`)).rejects.toThrow()
  })
})

describe('conta por app', () => {
  async function loginApp(clientId: string, userId: string, orgId: string) {
    const challenge = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url')
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://app.teste/callback',
      scope: 'openid email org',
      state: 's',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'create',
    })
    return db.asSystem('t', async (tx) => {
      const p = await parseAuthorizeRequest(tx, q)
      if (!p.ok) throw new Error('pedido inválido')
      expect(p.req.prompt).toBe('create')
      return issueCode(tx, p.req as AuthorizeRequest, { userId, orgId, authTime: new Date() })
    })
  }

  it('registra a primeira entrada e conta as seguintes; cada pessoa só vê as próprias', async () => {
    const by = await admin(db)
    const c = await db.asSystem('t', (tx) =>
      registerClient(tx, {
        id: rid('app'),
        name: 'App',
        productId: 'tpeasy',
        kind: 'confidential',
        redirectUris: ['https://app.teste/callback'],
        allowLoopback: false,
        createdBy: by,
        trusted: true,
      }),
    )
    const a = await newOrgWithOwner(db, 'conta-app-a', { freePlan: true })
    const b = await newOrgWithOwner(db, 'conta-app-b', { freePlan: true })
    await loginApp(c.clientId, a.userId, a.orgId)
    await loginApp(c.clientId, a.userId, a.orgId)
    await loginApp(c.clientId, b.userId, b.orgId)
    const [row] = await db.sql`select product_id, logins from zro.app_accounts where user_id = ${a.userId} and client_id = ${c.clientId}`
    expect(row).toEqual({ product_id: 'tpeasy', logins: 2 })
    const seen = await db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`select user_id from zro.app_accounts where client_id = ${c.clientId}`)
    expect(seen.map((r) => r.user_id)).toEqual([a.userId])
    await expect(
      db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`insert into zro.app_accounts (user_id, client_id) values (${a.userId}, ${c.clientId})`),
    ).rejects.toThrow()
  })
})

describe('Entrar com o Google', () => {
  const cfg = { clientId: 'cliente.apps.googleusercontent.com', clientSecret: 'segredo-de-teste', redirectUri: 'https://hub.teste/entrar/google/retorno' }
  const jwt = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`
  const fakeGoogle =
    (claims: Record<string, unknown>, seen?: URLSearchParams[]): typeof fetch =>
    async (_url, init) => {
      seen?.push(new URLSearchParams(String(init?.body)))
      return Response.json({ id_token: jwt(claims), access_token: 'x' })
    }
  const good = (p: GooglePending, extra: Record<string, unknown> = {}) => ({
    iss: 'https://accounts.google.com',
    aud: cfg.clientId,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: p.nonce,
    sub: rid('g'),
    email: `${rid('google')}@teste.absolutezro.local`,
    email_verified: true,
    name: 'Pessoa Google',
    ...extra,
  })

  it('manda PKCE, state e nonce; confere tudo na volta', async () => {
    const { url, pending } = googleStart(cfg, '/oauth/authorize?x=1')
    const u = new URL(url)
    expect(u.origin).toBe('https://accounts.google.com')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('state')).toBe(pending.state)
    const seen: URLSearchParams[] = []
    const who = await googleFinish(cfg, pending, { code: 'c', state: pending.state, error: null }, fakeGoogle(good(pending), seen))
    expect(who.name).toBe('Pessoa Google')
    expect(seen[0]!.get('code_verifier')).toBe(pending.verifier)
    const ret = { code: 'c', state: pending.state, error: null }
    await expectCode(googleFinish(cfg, pending, { ...ret, state: 'outro' }, fakeGoogle(good(pending))), 'unauthenticated')
    await expectCode(googleFinish(cfg, pending, ret, fakeGoogle(good(pending, { nonce: 'outro' }))), 'unauthenticated')
    await expectCode(googleFinish(cfg, pending, ret, fakeGoogle(good(pending, { aud: 'outro-app' }))), 'unauthenticated')
    await expectCode(googleFinish(cfg, pending, ret, fakeGoogle(good(pending, { iss: 'https://falso.teste' }))), 'unauthenticated')
    await expectCode(googleFinish(cfg, pending, ret, fakeGoogle(good(pending, { exp: 1 }))), 'unauthenticated')
    const unverified = await googleFinish(cfg, pending, ret, fakeGoogle(good(pending, { email_verified: false }))).catch((e) => e)
    expect(unverified.details).toEqual({ reason: 'google_email' })
  })

  it('sem conta: cria a conta Absolute ZRO já confirmada e sem senha; na volta, usa o mesmo vínculo', async () => {
    const p = { subject: rid('g'), email: `${rid('nova')}@teste.absolutezro.local`, name: 'Nova' }
    const first = await signInWithGoogle(db, p)
    expect(first).toMatchObject({ created: true, linked: true })
    const auth = await authenticate(db, first.token)
    expect(auth?.user).toMatchObject({ email: p.email, emailVerified: true })
    const [cred] = await db.sql`select count(*)::int as n from zro.auth_credentials where user_id = ${first.userId}`
    expect(cred!.n).toBe(0)
    const again = await signInWithGoogle(db, { ...p, email: p.email })
    expect(again).toMatchObject({ userId: first.userId, created: false, linked: false })
  })

  it('mesmo e-mail confirmado = mesma conta; a senha continua valendo', async () => {
    const u = await newUser(db, 'mescla')
    const r = await signInWithGoogle(db, { subject: rid('g'), email: u.email, name: 'Outro nome' })
    expect(r).toMatchObject({ userId: u.userId, created: false, linked: true })
    await expect(signIn(db, { email: u.email, password: 'senha-de-teste-123' })).resolves.toMatchObject({ userId: u.userId })
  })

  it('conta com e-mail nunca confirmado: o Google assume, a senha cai e as sessões abertas acabam', async () => {
    const u = await newUser(db, 'sem-confirmar', { verified: false })
    const r = await signInWithGoogle(db, { subject: rid('g'), email: u.email, name: 'Dona' })
    expect(r.userId).toBe(u.userId)
    expect(await authenticate(db, u.token)).toBeNull()
    await expectCode(signIn(db, { email: u.email, password: 'senha-de-teste-123' }), 'unauthenticated')
    expect((await authenticate(db, r.token))?.user.emailVerified).toBe(true)
  })

  it('conta suspensa não entra', async () => {
    const u = await newUser(db, 'suspensa')
    await db.asSystem('t', (tx) => tx`update zro.users set status = 'suspended' where id = ${u.userId}`)
    const err = await signInWithGoogle(db, { subject: rid('g'), email: u.email, name: 'x' }).catch((e) => e)
    expect(err.details).toEqual({ reason: 'suspensa' })
    const [n] = await db.sql`select count(*)::int as n from zro.external_identities where user_id = ${u.userId}`
    expect(n!.n).toBe(0)
  })
})
