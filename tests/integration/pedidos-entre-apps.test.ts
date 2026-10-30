// Ponte entre apps (Maestro v2, fase 7): o Maestro pede ao HUB um pedido assinado para o SOBEDESCE. Confere aud, sub,
// vida e jti de uso único; a lista fechada de ações; o produto de destino no plano (403 sem o SOBEDESCE); o pedido
// sem a pessoa (credencial do app) só para desfazer; o limite e a auditoria.
import { createHash, randomBytes, createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticateAccessToken,
  authenticateAppClient,
  exchangeToken,
  grantConsent,
  issueCode,
  jwks,
  parseAuthorizeRequest,
  parseTokenRequest,
  PEDIDO_TTL_S,
  PEDIDO_TYP,
  registerClient,
  setIssuer,
  type AuthorizeRequest,
} from '@zro/auth'
import { grantEntitlement } from '@zro/billing'
import {
  ACOES_SOBEDESCE,
  APP_PEDIDO_ACAO,
  LIMITE_PONTE,
  LIMITE_PONTE_ACOMPANHAR,
  LIMITE_PONTE_TOKEN,
  loadOidcClaims,
  pedidoEntreAppsDaPessoa,
  pedidoEntreAppsDoApp,
  PONTES,
  PRODUTO_DA_ACAO,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { ACOES_PONTE_RELAY, ACOES_PONTE_SOBEDESCE, AppPedidoRespostaSchema } from '@zro/media-contracts'
import { admin, allowRelease, expectCode, newOrgWithOwner } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const SCOPE = 'maestro.projects'
const CFG = { base: 'https://sobedesce.teste', clientId: 'sobedesce-web' }
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`

beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(() => db.close())

async function cliente(productId = 'maestro') {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: rid('maestro'),
      name: 'Maestro',
      productId,
      kind: 'confidential',
      redirectUris: ['https://maestro.teste/cb'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
}

async function tokenDoApp(c: { clientId: string; clientSecret: string | null }, userId: string, orgId: string) {
  await allowRelease(db, 'maestro', userId)
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: 'https://maestro.teste/cb',
    scope: `openid org offline_access ${SCOPE}`,
    state: 'st',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })
  const code = await db.asSystem('teste', async (tx) => {
    const p = await parseAuthorizeRequest(tx, q)
    if (!p.ok) throw new Error('pedido recusado')
    await grantConsent(tx, userId, c.clientId, p.req.scopes)
    return new URL(await issueCode(tx, p.req as AuthorizeRequest, { userId, orgId, authTime: new Date() })).searchParams.get('code')!
  })
  const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
  const t = await exchangeToken(
    db,
    parseTokenRequest(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://maestro.teste/cb', code_verifier: verifier }),
      basic,
    ),
    loadOidcClaims,
  )
  return { at: t.access_token, basic }
}

async function darProduto(orgId: string, productId: string) {
  const by = await admin(db)
  await db.asSystem('teste', (tx) => grantEntitlement(tx, { userId: by, reason: 'teste' }, { orgId, productId, features: null, limits: {}, endsAt: null }))
}

async function conferir(token: string) {
  const [c, d, a] = token.split('.')
  const cab = JSON.parse(Buffer.from(c!, 'base64url').toString()) as Record<string, unknown>
  const dados = JSON.parse(Buffer.from(d!, 'base64url').toString()) as Record<string, unknown>
  const chave = (await jwks(db)).keys.find((k) => k.kid === cab.kid)
  const ok = verify(
    'sha256',
    Buffer.from(`${c}.${d}`),
    { key: createPublicKey({ key: chave as JsonWebKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(a!, 'base64url'),
  )
  return { ok, cab, dados }
}

describe('ponte entre apps (Maestro → SOBEDESCE)', () => {
  it('as ações do HUB são as do contrato', () => {
    expect(Object.keys(ACOES_SOBEDESCE).sort()).toEqual([...ACOES_PONTE_SOBEDESCE].sort())
    expect([...PONTES.maestro!.sobedesce!].sort()).toEqual([...ACOES_PONTE_SOBEDESCE].sort())
  })

  it('com o SOBEDESCE no plano: pedido assinado com aud do SOBEDESCE, sub da pessoa, 60 s e jti único, auditado', async () => {
    const o = await newOrgWithOwner(db, 'ponte')
    await darProduto(o.orgId, 'maestro')
    await darProduto(o.orgId, 'sobedesce')
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    const p1 = await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.listar' }, CFG)
    const p2 = await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.listar' }, CFG)
    expect(AppPedidoRespostaSchema.safeParse(p1).success).toBe(true)
    expect(p1.url).toBe('https://sobedesce.teste/api/zro/drive/listar')
    const { ok, cab, dados } = await conferir(p1.token)
    expect(ok).toBe(true)
    expect(cab.typ).toBe(PEDIDO_TYP)
    expect(dados).toMatchObject({ iss: ISS, aud: 'sobedesce-web', sub: o.userId, zro_pedido: 'drive.listar' })
    expect((dados.exp as number) - (dados.iat as number)).toBe(PEDIDO_TTL_S)
    expect((await conferir(p2.token)).dados.jti).not.toBe(dados.jti)
    const log =
      await db.sql`select action, actor_user_id, org_id, metadata from zro.audit_logs where action = ${APP_PEDIDO_ACAO} and actor_user_id = ${o.userId}`
    expect(log).toHaveLength(2)
    expect(log[0]!.metadata).toEqual({ app: 'maestro', destino: 'sobedesce', acao: 'drive.listar', jeito: 'pessoa' })
    expect(log[0]!.org_id).toBe(o.orgId)
  })

  it('sem o SOBEDESCE no plano: 403 (e nada é assinado nem auditado)', async () => {
    const o = await newOrgWithOwner(db, 'sem-sd')
    await darProduto(o.orgId, 'maestro')
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    const e = await expectCode(pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.token' }, CFG), 'entitlement_required')
    expect(e.status).toBe(403)
    const log = await db.sql`select 1 from zro.audit_logs where action = ${APP_PEDIDO_ACAO} and actor_user_id = ${o.userId}`
    expect(log).toHaveLength(0)
    // Desfazer vale mesmo sem o produto (tirar a exposição de um arquivo nunca fica preso ao plano).
    const r = await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.recolher_revisao' }, CFG)
    expect(r.acao).toBe('drive.recolher_revisao')
  })

  it('ação fora da lista, outro destino ou outro app: 403 acao_nao_permitida', async () => {
    const o = await newOrgWithOwner(db, 'lista')
    await darProduto(o.orgId, 'maestro')
    await darProduto(o.orgId, 'sobedesce')
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    for (const entrada of [
      { destino: 'sobedesce', acao: 'drive.buscar' },
      { destino: 'sobedesce', acao: 'transferencias.ler' },
      { destino: 'synquei', acao: 'drive.listar' },
    ]) {
      const e = await expectCode(pedidoEntreAppsDaPessoa(db, auth, entrada, CFG), 'action_not_allowed')
      expect(e.status).toBe(403)
    }
    await expectCode(pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce' }, CFG), 'invalid_input')
    // Sessão do navegador do HUB (sem app): não pede pela ponte.
    await expectCode(pedidoEntreAppsDaPessoa(db, o.auth, { destino: 'sobedesce', acao: 'drive.listar' }, CFG), 'action_not_allowed')
  })

  it('sem a pessoa (credencial do app): só desfazer, só para quem já entrou no app', async () => {
    const o = await newOrgWithOwner(db, 'cron')
    await darProduto(o.orgId, 'maestro')
    const c = await cliente()
    const { basic } = await tokenDoApp(c, o.userId, o.orgId)
    const app = await authenticateAppClient(db, basic)
    expect(app?.id).toBe(c.clientId)
    expect(await authenticateAppClient(db, `Basic ${Buffer.from(`${c.clientId}:errado`).toString('base64')}`)).toBeNull()
    expect(await authenticateAppClient(db, null)).toBeNull()
    const r = await pedidoEntreAppsDoApp(db, app, { destino: 'sobedesce', acao: 'drive.recolher_revisao', sub: o.userId }, CFG)
    expect((await conferir(r.token)).dados).toMatchObject({ sub: o.userId, zro_pedido: 'drive.recolher_revisao' })
    await expectCode(pedidoEntreAppsDoApp(db, app, { destino: 'sobedesce', acao: 'drive.token', sub: o.userId }, CFG), 'action_not_allowed')
    const estranho = await newOrgWithOwner(db, 'estranho')
    await expectCode(pedidoEntreAppsDoApp(db, app, { destino: 'sobedesce', acao: 'drive.recolher_revisao', sub: estranho.userId }, CFG), 'not_found')
    const log = await db.sql`select actor_kind, metadata from zro.audit_logs where action = ${APP_PEDIDO_ACAO} and actor_user_id = ${o.userId}`
    expect(log[0]).toMatchObject({ actor_kind: 'system', metadata: { jeito: 'app', acao: 'drive.recolher_revisao' } })
  })

  it('drive.token tem limite próprio por pessoa', async () => {
    const o = await newOrgWithOwner(db, 'limite')
    await darProduto(o.orgId, 'maestro')
    await darProduto(o.orgId, 'sobedesce')
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    for (let i = 0; i < LIMITE_PONTE_TOKEN.max; i++) await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.token' }, CFG)
    await expectCode(pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.token' }, CFG), 'rate_limited')
    // As outras ações seguem (contador separado).
    expect((await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.miniatura' }, CFG)).acao).toBe('drive.miniatura')
  })
})

describe('ponte Maestro → SOBEDESCE para o Relay (Gerar versões)', () => {
  it('relay.* com o SOBEDESCE e o Relay no plano: assinado para a rota exata da fila', async () => {
    const o = await newOrgWithOwner(db, 'relay')
    for (const p of ['maestro', 'sobedesce', 'relay']) await darProduto(o.orgId, p)
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    for (const acao of ACOES_PONTE_RELAY) {
      const p = await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao }, CFG)
      expect(AppPedidoRespostaSchema.safeParse(p).success).toBe(true)
      expect(p.url).toBe(`https://sobedesce.teste${ACOES_SOBEDESCE[acao]}`)
      expect((await conferir(p.token)).dados).toMatchObject({ aud: 'sobedesce-web', sub: o.userId, zro_pedido: acao })
    }
    expect(ACOES_SOBEDESCE['relay.converter']).toBe('/api/zro/relay/converter')
    // O Relay só tem o site (gate do canal web, 0032): a ponte confere o plano dele sem exigir um canal de API.
    expect(Object.keys(PRODUTO_DA_ACAO).sort()).toEqual([...ACOES_PONTE_RELAY].sort())
  })

  it('sem o Relay no plano: 403 com o produto que falta, e nada assinado nem auditado', async () => {
    const o = await newOrgWithOwner(db, 'sem-relay')
    await darProduto(o.orgId, 'maestro')
    await darProduto(o.orgId, 'sobedesce')
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    const e = (await expectCode(pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'relay.converter' }, CFG), 'entitlement_required')) as {
      status: number
      details?: Record<string, unknown>
    }
    expect(e.status).toBe(403)
    expect(e.details).toMatchObject({ product: 'relay' })
    const log = await db.sql`select 1 from zro.audit_logs where action = ${APP_PEDIDO_ACAO} and actor_user_id = ${o.userId}`
    expect(log).toHaveLength(0)
    // O Drive segue sem o Relay.
    expect((await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.listar' }, CFG)).acao).toBe('drive.listar')
    // Sem o SOBEDESCE (o destino), o Relay sozinho não basta.
    const o2 = await newOrgWithOwner(db, 'so-relay')
    await darProduto(o2.orgId, 'maestro')
    await darProduto(o2.orgId, 'relay')
    const { at: at2 } = await tokenDoApp(await cliente(), o2.userId, o2.orgId)
    const auth2 = await authenticateAccessToken(db, `Bearer ${at2}`, SCOPE)
    const e2 = (await expectCode(pedidoEntreAppsDaPessoa(db, auth2, { destino: 'sobedesce', acao: 'relay.pedido' }, CFG), 'entitlement_required')) as {
      details?: Record<string, unknown>
    }
    expect(e2.details).toMatchObject({ product: 'sobedesce' })
  })

  it('relay.* nunca anda sem a pessoa (credencial do app)', async () => {
    const o = await newOrgWithOwner(db, 'relay-app')
    for (const p of ['maestro', 'sobedesce', 'relay']) await darProduto(o.orgId, p)
    const c = await cliente()
    const { basic } = await tokenDoApp(c, o.userId, o.orgId)
    const app = await authenticateAppClient(db, basic)
    await expectCode(pedidoEntreAppsDoApp(db, app, { destino: 'sobedesce', acao: 'relay.converter', sub: o.userId }, CFG), 'action_not_allowed')
  })

  it('acompanhar (relay.pedido) tem contador próprio: não gasta o do Drive', async () => {
    const o = await newOrgWithOwner(db, 'relay-limite')
    for (const p of ['maestro', 'sobedesce', 'relay']) await darProduto(o.orgId, p)
    const c = await cliente()
    const { at } = await tokenDoApp(c, o.userId, o.orgId)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    for (let i = 0; i < LIMITE_PONTE.max + 5; i++) await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'relay.pedido' }, CFG)
    expect(LIMITE_PONTE_ACOMPANHAR.max).toBeGreaterThan(LIMITE_PONTE.max)
    expect((await pedidoEntreAppsDaPessoa(db, auth, { destino: 'sobedesce', acao: 'drive.listar' }, CFG)).acao).toBe('drive.listar')
  })
})
