// Carro do Freela → HUB (0012): o site do Carro chama a API com o token da pessoa; o job vira projeto e a equipe da
// escala vira a equipe do projeto, com convite de convidado (guest) para quem é de fora e isolamento do convidado.
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
  revokeAppAccess,
  setIssuer,
  type AuthorizeRequest,
  type Authenticated,
} from '@zro/auth'
import { acceptInvitation, createProject, getProject, listProjects, loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { importCarroJob, syncCarroCrew } from '@zro/integrations'
import { admin, expectCode, givePlan, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const SCOPE = 'carro-do-freela.jobs'
beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(() => db.close())

const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`
const job = (id: string) => ({
  contract: 'carro-do-freela.job/1',
  job_id: id,
  title: 'Casamento na praia',
  production_type: 'casamento',
  briefing: 'Cerimônia às 16h, festa até 23h. Dois câmeras e um drone.',
  crew_roles: [{ role: 'Op. de câmera', count: 2 }],
})

async function carroClient(productId = 'carro-do-freela') {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: rid('carro'),
      name: 'Carro do Freela',
      productId,
      kind: 'confidential',
      redirectUris: ['https://carro.teste/cb'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
}

/** Login no app (código + PKCE) e troca por tokens, como o servidor do Carro faz. */
async function appToken(c: { clientId: string; clientSecret: string | null }, userId: string, orgId: string, scope: string) {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: 'https://carro.teste/cb',
    scope,
    state: 'st',
    code_challenge: challenge,
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
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://carro.teste/cb', code_verifier: verifier }),
      `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
    ),
    loadOidcClaims,
  )
  return t.access_token
}

async function addMember(orgId: string, userId: string, role: string) {
  await db.asSystem('teste', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${orgId}, ${userId}, ${role})`)
}

describe('token de app (Bearer) nas rotas do Carro', () => {
  it('o cliente do Carro nasce com o escopo de API; o de outro produto não', async () => {
    const c = await carroClient()
    const outro = await carroClient('sobedesce')
    const [a] = await db.sql`select scopes from zro.oauth_clients where id = ${c.clientId}`
    const [b] = await db.sql`select scopes from zro.oauth_clients where id = ${outro.clientId}`
    expect(a!.scopes).toContain(SCOPE)
    expect(b!.scopes).not.toContain(SCOPE)
    const o = await newOrgWithOwner(db, 'escopo')
    await expect(appToken(outro, o.userId, o.orgId, `openid org ${SCOPE}`)).rejects.toThrow(/invalid_scope/)
  })

  it('o token vira a pessoa na organização do login, e o job vira projeto com o briefing', async () => {
    const o = await newOrgWithOwner(db, 'bearer')
    await givePlan(db, o.orgId, 'individual-carro-do-freela')
    const c = await carroClient()
    const at = await appToken(c, o.userId, o.orgId, `openid email profile org offline_access ${SCOPE}`)
    const auth = (await authenticateAccessToken(db, `Bearer ${at}`, SCOPE))!
    expect(auth.user).toMatchObject({ id: o.userId, email: o.email, platformRole: null })
    expect(auth.session.activeOrgId).toBe(o.orgId)
    const r = await importCarroJob(db, auth, job('job-bearer'))
    expect(r.created).toBe(true)
    const [doc] = await db.sql`select body from zro.project_documents where project_id = ${r.projectId} and kind = 'brief'`
    expect(doc?.body).toContain('Cerimônia às 16h')
  })

  it('recusa token sem o escopo, adulterado, de app removido no Perfil ou de app desativado', async () => {
    const o = await newOrgWithOwner(db, 'bearer-nao')
    const c = await carroClient()
    const semEscopo = await appToken(c, o.userId, o.orgId, 'openid org')
    expect(await authenticateAccessToken(db, `Bearer ${semEscopo}`, SCOPE)).toBeNull()
    const at = await appToken(c, o.userId, o.orgId, `openid org ${SCOPE}`)
    expect(await authenticateAccessToken(db, `Bearer ${at}x`, SCOPE)).toBeNull()
    expect(await authenticateAccessToken(db, at, SCOPE)).toBeNull()
    expect(await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)).not.toBeNull()
    await revokeAppAccess(db, o.userId, c.clientId)
    expect(await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)).toBeNull()
    const at2 = await appToken(c, o.userId, o.orgId, `openid org ${SCOPE}`)
    await db.asSystem('teste', (tx) => tx`update zro.oauth_clients set status = 'disabled' where id = ${c.clientId}`)
    expect(await authenticateAccessToken(db, `Bearer ${at2}`, SCOPE)).toBeNull()
  })

  it('quem saiu da organização perde o acesso mesmo com token válido', async () => {
    const o = await newOrgWithOwner(db, 'bearer-saiu')
    await givePlan(db, o.orgId, 'individual-carro-do-freela')
    const ed = await newUser(db, 'editor-saiu')
    await addMember(o.orgId, ed.userId, 'editor')
    const c = await carroClient()
    const at = await appToken(c, ed.userId, o.orgId, `openid org ${SCOPE}`)
    await db.asSystem('teste', (tx) => tx`update zro.memberships set status = 'removed' where org_id = ${o.orgId} and user_id = ${ed.userId}`)
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, SCOPE)
    await expectCode(importCarroJob(db, auth, job('job-saiu')), 'forbidden_role')
  })
})

describe('equipe da escala → equipe do projeto', () => {
  async function cena(label: string) {
    const o = await newOrgWithOwner(db, label)
    await givePlan(db, o.orgId, 'individual-carro-do-freela')
    const membro = await newUser(db, `${label}-membro`)
    await addMember(o.orgId, membro.userId, 'editor')
    const freela = await newUser(db, `${label}-freela`)
    return { o, membro, freela }
  }
  const crew = (jobId: string, people: { userId: string; email: string }[], fn = 'Op. de câmera') => ({
    contract: 'carro-do-freela.crew/1',
    job_id: jobId,
    members: people.map((p) => ({ zro_user_id: p.userId, email: p.email, function: fn, project_role: 'editor' })),
  })

  it('pede o job antes; membro entra direto, quem é de fora recebe convite; reenviar não duplica', async () => {
    const { o, membro, freela } = await cena('equipe')
    await expectCode(syncCarroCrew(db, o.auth, crew('job-eq', [membro])), 'not_found')
    const { projectId } = await importCarroJob(db, o.auth, job('job-eq'))
    const r = await syncCarroCrew(db, o.auth, crew('job-eq', [membro, freela, freela]))
    expect(r.projectId).toBe(projectId)
    expect(r.members.map((m) => m.status)).toEqual(['na_equipe', 'convidado'])
    expect(r.invites).toHaveLength(1)
    expect(r.invites[0]!.email).toBe(freela.email)
    const [pm] = await db.sql`select role, function from zro.project_members where project_id = ${projectId} and user_id = ${membro.userId}`
    expect(pm).toMatchObject({ role: 'editor', function: 'Op. de câmera' })
    const de2 = await syncCarroCrew(db, o.auth, crew('job-eq', [membro, freela]))
    expect(de2.members.map((m) => m.status)).toEqual(['na_equipe', 'convite_pendente'])
    expect(de2.invites).toHaveLength(0)
  })

  it('o convidado aceita com a própria conta e entra só no projeto do job', async () => {
    const { o, freela } = await cena('convidado')
    const { projectId } = await importCarroJob(db, o.auth, job('job-conv'))
    const outro = await createProject(db, o.auth, { title: 'Outro projeto da produtora', type: 'publicidade', visibility: 'organization' })
    const r = await syncCarroCrew(db, o.auth, crew('job-conv', [freela], 'Drone'))
    const intruso = await newUser(db, 'intruso')
    await expectCode(acceptInvitation(db, intruso.auth, r.invites[0]!.token), 'forbidden_role')
    await acceptInvitation(db, freela.auth, r.invites[0]!.token)
    const auth = await refresh(db, freela.token)
    expect(auth.session.activeOrgId).toBe(o.orgId)
    const [m] = await db.sql`select role from zro.memberships where org_id = ${o.orgId} and user_id = ${freela.userId}`
    expect(m!.role).toBe('guest')
    const { projects: projetos } = await listProjects(db, auth)
    expect(projetos.map((p) => p.id)).toEqual([projectId])
    expect(projetos.map((p) => p.id)).not.toContain(outro)
    const [pm] = await db.sql`select role, function from zro.project_members where project_id = ${projectId} and user_id = ${freela.userId}`
    expect(pm).toMatchObject({ role: 'editor', function: 'Drone' })
  })

  it('isolamento: o convidado não vê equipe, plano, vínculos nem eventos da organização', async () => {
    const { o, membro, freela } = await cena('isolado')
    const { projectId } = await importCarroJob(db, o.auth, job('job-iso'))
    const r = await syncCarroCrew(db, o.auth, crew('job-iso', [freela]))
    await acceptInvitation(db, freela.auth, r.invites[0]!.token)
    const seen = await db.asUser({ userId: freela.userId, orgId: o.orgId }, async (tx) => ({
      memberships: (await tx`select user_id from zro.memberships where org_id = ${o.orgId}`).map((x) => x.user_id),
      entitlements: (await tx`select 1 from zro.entitlements where org_id = ${o.orgId}`).length,
      links: (await tx`select 1 from zro.integration_links where org_id = ${o.orgId}`).length,
      events: (await tx`select project_id from zro.workflow_events where org_id = ${o.orgId}`).map((x) => x.project_id),
      users: (await tx`select id from zro.users where id in (${o.userId}, ${membro.userId}, ${freela.userId})`).map((x) => x.id),
    }))
    // o convidado só enxerga quem está com ele no projeto (aqui, só a si mesmo: ninguém mais foi escalado)
    expect(seen.users).toEqual([freela.userId])
    expect(seen.memberships).toEqual([freela.userId])
    expect(seen.entitlements).toBe(0)
    expect(seen.links).toBe(0)
    expect(seen.events.every((p) => p === projectId)).toBe(true)
    // quem é da organização continua vendo tudo
    const membroVe = await db.asUser(
      { userId: membro.userId, orgId: o.orgId },
      async (tx) => (await tx`select 1 from zro.memberships where org_id = ${o.orgId}`).length,
    )
    expect(membroVe).toBe(3)
    // com um colega no mesmo projeto, o convidado passa a ver o colega na equipe do projeto
    await syncCarroCrew(db, o.auth, crew('job-iso', [membro]))
    const auth0 = await refresh(db, freela.token)
    const p = await getProject(db, auth0, projectId)
    expect(p.team.map((m) => m.user_id).sort()).toEqual([membro.userId, freela.userId].sort())
    expect(p.invites).toHaveLength(0)
    expect(p.steps.find((s) => s.stepKey === 'carro-do-freela')!.displayState).toBe('done')
    expect(p.steps.some((s) => s.displayState === 'blocked_subscription')).toBe(false)
    const dono = await getProject(db, o.auth, projectId)
    expect(dono.team.map((m) => m.display_name)).toContain(membro.auth.user.displayName)
    // e o convidado não importa job nem monta equipe
    const auth = await refresh(db, freela.token)
    await expectCode(importCarroJob(db, auth, job('job-iso-2')), 'forbidden_role')
    await expectCode(syncCarroCrew(db, auth, crew('job-iso', [membro])), 'forbidden_role')
  })

  it('convite de convidado nunca rebaixa quem já entrou na organização por outro caminho', async () => {
    const { o, freela } = await cena('sem-rebaixar')
    await importCarroJob(db, o.auth, job('job-rb'))
    const r = await syncCarroCrew(db, o.auth, crew('job-rb', [freela]))
    await addMember(o.orgId, freela.userId, 'manager')
    await acceptInvitation(db, freela.auth, r.invites[0]!.token)
    const [m] = await db.sql`select role from zro.memberships where org_id = ${o.orgId} and user_id = ${freela.userId}`
    expect(m!.role).toBe('manager')
  })

  it('edição importa o job, mas só dono, administração e gestão montam a equipe', async () => {
    const { o, membro, freela } = await cena('papel')
    await db.asSystem('teste', (tx) => tx`update zro.sessions set active_org_id = ${o.orgId} where user_id = ${membro.userId}`)
    const ed: Authenticated = await refresh(db, membro.token)
    expect(ed.session.activeOrgId).toBe(o.orgId)
    await importCarroJob(db, ed, job('job-papel'))
    await expectCode(syncCarroCrew(db, ed, crew('job-papel', [freela])), 'forbidden_role')
  })

  it('contrato: equipe vazia ou pessoa sem conta da Absolute ZRO é recusada', async () => {
    const { o } = await cena('contrato')
    await importCarroJob(db, o.auth, job('job-ct'))
    await expectCode(syncCarroCrew(db, o.auth, { contract: 'carro-do-freela.crew/1', job_id: 'job-ct', members: [] }), 'invalid_input')
    await expectCode(
      syncCarroCrew(db, o.auth, { contract: 'carro-do-freela.crew/1', job_id: 'job-ct', members: [{ zro_user_id: 'x', email: 'a@b.co', function: 'Drone' }] }),
      'invalid_input',
    )
  })
})
