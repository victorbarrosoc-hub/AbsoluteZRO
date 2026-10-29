// "Abrir no TPeasy" (0032): o servidor do TPeasy lê o roteiro do projeto com o token da pessoa (escopo tpeasy.roteiros).
// O escopo só deixa o app pedir; organização, papel e plano continuam saindo do banco (authorize).
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
import { createProject, loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { importScriptFromTpeasy, openScriptInTpeasy, toTpeasyBackup, tpeasyOpenUrl } from '@zro/integrations'
import { admin, expectCode, givePlan, newOrgWithOwner } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const SCOPE = 'tpeasy.roteiros'
const VOLTA = 'https://tpeasy.teste/api/zro/callback'
beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(() => db.close())

async function cliente(productId = 'tpeasy') {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: `tp-${randomBytes(4).toString('hex')}`,
      name: 'TPeasy',
      productId,
      kind: 'confidential',
      redirectUris: [VOLTA],
      allowLoopback: false,
      createdBy: by,
    }),
  )
}

async function token(c: { clientId: string; clientSecret: string | null }, userId: string, orgId: string, scope: string) {
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: VOLTA,
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
  const t = await exchangeToken(
    db,
    parseTokenRequest(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: VOLTA, code_verifier: verifier }),
      `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
    ),
    loadOidcClaims,
  )
  return t.access_token
}

async function projetoComRoteiro(label: string) {
  const o = await newOrgWithOwner(db, label)
  await givePlan(db, o.orgId, 'individual-tpeasy')
  const projectId = await createProject(db, o.auth, { title: 'Lançamento', type: 'outro' })
  return { o, projectId }
}

describe('Abrir no TPeasy', () => {
  it('o cliente do TPeasy nasce com o escopo do roteiro; o de outro produto não pode pedir', async () => {
    const c = await cliente()
    const [a] = await db.sql`select scopes from zro.oauth_clients where id = ${c.clientId}`
    expect(a!.scopes).toContain(SCOPE)
    const outro = await cliente('synquei')
    const o = await newOrgWithOwner(db, 'tp-escopo')
    await expect(token(outro, o.userId, o.orgId, `openid org ${SCOPE}`)).rejects.toThrow(/invalid_scope/)
  })

  it('com o token, o servidor do TPeasy lê a versão mais nova (número e documento)', async () => {
    const { o, projectId } = await projetoComRoteiro('tp-ler')
    const backup = (body: string) => toTpeasyBackup({ projectId, title: 'Lançamento', body, updatedAt: new Date() })
    await importScriptFromTpeasy(db, o.auth, { projectId, backup: backup('# Gancho\nv1') })
    const v2 = await importScriptFromTpeasy(db, o.auth, { projectId, backup: backup('# Gancho\nv2') })
    const at = await token(await cliente(), o.userId, o.orgId, `openid org offline_access ${SCOPE}`)
    const auth = (await authenticateAccessToken(db, `Bearer ${at}`, SCOPE))!
    const r = await openScriptInTpeasy(db, auth, projectId)
    expect(r.version).toBe(2)
    expect(r.documentId).toBe(v2.id)
    expect(r.backup.scripts).toEqual([expect.objectContaining({ id: `zro-${projectId}`, body: '# Gancho\nv2' })])
  })

  it('token sem o escopo não serve; projeto de outra organização e projeto sem roteiro são recusados', async () => {
    const { o, projectId } = await projetoComRoteiro('tp-nao')
    const c = await cliente()
    expect(await authenticateAccessToken(db, `Bearer ${await token(c, o.userId, o.orgId, 'openid org')}`, SCOPE)).toBeNull()
    const auth = (await authenticateAccessToken(db, `Bearer ${await token(c, o.userId, o.orgId, `openid org ${SCOPE}`)}`, SCOPE))!
    await expectCode(openScriptInTpeasy(db, auth, projectId), 'not_found')
    const outra = await projetoComRoteiro('tp-outra')
    await importScriptFromTpeasy(db, outra.o.auth, {
      projectId: outra.projectId,
      backup: toTpeasyBackup({ projectId: outra.projectId, title: 'x', body: 'y', updatedAt: new Date() }),
    })
    await expect(openScriptInTpeasy(db, auth, outra.projectId)).rejects.toThrow()
  })

  it('o botão passa pelo login do TPeasy e cai no roteiro do projeto', () => {
    const id = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'
    const esperado = `https://tpeasy.absolutezro.com/api/zro/entrar?volta=${encodeURIComponent(`/app/#hub/${id}`)}`
    expect(tpeasyOpenUrl(id, 'https://tpeasy.absolutezro.com/api/zro/entrar')).toBe(esperado)
    expect(tpeasyOpenUrl(id, null)).toBe(esperado)
    for (const ruim of ['http://tpeasy.absolutezro.com/api/zro/entrar', 'https://tpeasy.absolutezro.com/', 'não é url'])
      expect(tpeasyOpenUrl(id, ruim)).toBe(esperado)
    expect(tpeasyOpenUrl(id, 'https://tpeasy.vercel.app/api/zro/entrar?x=1')).toBe(
      `https://tpeasy.vercel.app/api/zro/entrar?volta=${encodeURIComponent(`/app/#hub/${id}`)}`,
    )
  })
})
