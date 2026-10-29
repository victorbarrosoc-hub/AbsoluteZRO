// Autorização na ordem do PRD §5.2, equipe, projetos e fila (PRD §7.3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { createLogger } from '@zro/observability'
import {
  acceptInvitation,
  authorize,
  backoffDelay,
  changeMemberRole,
  createOrganization,
  createProject,
  findEventCycle,
  getProject,
  inviteMember,
  listMyOrganizations,
  listProjects,
  publishEvent,
  recoverStaleRuns,
  removeMember,
  reprocessRun,
  runOnce,
  switchOrganization,
  AmbiguousError,
  type HandlerDef,
  type RouteTable,
} from '../src/index'
import { expectCode, givePlan, newOrgWithOwner, newUser, refresh } from '../../../tests/integration/helpers'

let db: Database
const quiet = createLogger('teste', () => {})
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

describe('autorização', () => {
  it('ordem: sem sessão 401 → sem organização 409 → papel 403 → projeto 404 → entitlement 403', async () => {
    await expectCode(authorize(db, null), 'unauthenticated')
    const solo = await newUser(db, 'solo')
    await expectCode(authorize(db, solo.auth), 'no_active_organization')
    const o = await newOrgWithOwner(db, 'ordem')
    const viewer = await newUser(db, 'viewer')
    await db.asSystem('t', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${o.orgId}, ${viewer.userId}, 'viewer')`)
    await switchOrganization(db, viewer.auth, o.orgId)
    const va = await refresh(db, viewer.token)
    await expectCode(authorize(db, va, { roles: ['owner', 'admin'] }), 'forbidden_role')
    await expectCode(authorize(db, o.auth, { project: { id: '00000000-0000-0000-0000-000000000000', access: 'view' } }), 'project_not_found')
    const err = await expectCode(authorize(db, o.auth, { product: { id: 'synquei', feature: 'organization_plan' } }), 'entitlement_required')
    expect(err.status).toBe(403)
    await expectCode(authorize(db, o.auth, { product: { id: 'ferramenta-inexistente' } }), 'product_unavailable')
  })

  it('organização no cliente não vale: só a da sessão, conferida no banco', async () => {
    const a = await newOrgWithOwner(db, 'iso-a')
    const b = await newOrgWithOwner(db, 'iso-b')
    const pb = await createProject(db, b.auth, { title: 'Projeto de B' })
    await expectCode(switchOrganization(db, a.auth, b.orgId), 'forbidden_role')
    await expectCode(getProject(db, a.auth, pb), 'project_not_found')
    const { projects } = await listProjects(db, a.auth)
    expect(projects.map((p) => p.id)).not.toContain(pb)
  })

  it('quota sem limite configurado bloqueia antes de executar', async () => {
    const o = await newOrgWithOwner(db, 'quota')
    await givePlan(db, o.orgId, 'individual-synquei')
    await expectCode(authorize(db, o.auth, { product: { id: 'synquei' }, quota: { metric: 'synquei.metrica_sem_limite' } }), 'quota_not_configured')
  })
})

describe('equipe (caso E e convites)', () => {
  it('convite exige e-mail igual e confirmado; troca de organização isola os dados', async () => {
    const o = await newOrgWithOwner(db, 'equipe')
    const p = await createProject(db, o.auth, { title: 'Da equipe' })
    const guest = await newUser(db, 'convidado')
    const otherOrg = await createOrganization(db, guest.auth, { name: 'Outra' })
    const inv = await inviteMember(db, o.auth, { email: guest.email, role: 'editor' })
    const intruso = await newUser(db, 'intruso')
    await expectCode(acceptInvitation(db, intruso.auth, inv.token), 'forbidden_role')
    const unverified = await newUser(db, 'sem-confirmar', { verified: false })
    await expectCode(acceptInvitation(db, unverified.auth, inv.token), 'email_not_verified')
    await acceptInvitation(db, await refresh(db, guest.token), inv.token)
    let ga = await refresh(db, guest.token)
    expect(ga.session.activeOrgId).toBe(o.orgId)
    expect((await listProjects(db, ga)).projects.map((x) => x.id)).toContain(p)
    expect((await listMyOrganizations(db, ga)).map((x) => x.id).sort()).toEqual([o.orgId, otherOrg.id].sort())
    await switchOrganization(db, ga, otherOrg.id)
    ga = await refresh(db, guest.token)
    expect((await listProjects(db, ga)).projects.map((x) => x.id)).not.toContain(p)
    await expectCode(acceptInvitation(db, ga, inv.token), 'not_found') // uso único
  })

  it('admin não convida admin; dono não fica sem dono; removido perde acesso', async () => {
    const o = await newOrgWithOwner(db, 'papeis')
    const adm = await newUser(db, 'adm')
    await db.asSystem('t', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${o.orgId}, ${adm.userId}, 'admin')`)
    await switchOrganization(db, adm.auth, o.orgId)
    const aa = await refresh(db, adm.token)
    await expectCode(inviteMember(db, aa, { email: 'x@teste.absolutezro.local', role: 'admin' }), 'forbidden_role')
    await expectCode(changeMemberRole(db, o.auth, o.userId, 'viewer'), 'conflict')
    await removeMember(db, o.auth, adm.userId)
    await expectCode(authorize(db, await refresh(db, adm.token)), 'no_active_organization')
  })
})

describe('projetos', () => {
  it('etapas começam com estado real, mostram bloqueio por assinatura e indisponível no que está fechado por lançamento', async () => {
    const o = await newOrgWithOwner(db, 'etapas')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    const id = await createProject(db, o.auth, { title: 'Casamento Ana e Leo', type: 'casamento' })
    const { steps } = await getProject(db, o.auth, id)
    const by = Object.fromEntries(steps.map((s) => [s.stepKey, s.displayState]))
    // Carro, AEON, NOSSOM, Revela, Maestro e Relay estão fechados (ADR 0023): nunca "contrate", sempre indisponível.
    expect(by).toEqual({
      'carro-do-freela': 'unavailable',
      tpeasy: 'blocked_subscription',
      sobedesce: 'not_started',
      synquei: 'blocked_subscription',
      'ai-edit': 'unavailable',
      nossom: 'unavailable',
      finishing: 'unavailable',
      maestro: 'unavailable',
      relay: 'unavailable',
    })
    await expectCode(createProject(db, o.auth, { title: '' }), 'invalid_input')
  })
})

describe('fila', () => {
  const routes: RouteTable = { 'job.created': [{ handler: 'teste.handler', productId: null, feature: null, maxAttempts: 2 }] }
  const handlers = (fn: HandlerDef['run'], idempotent = true): Record<string, HandlerDef> => ({
    'teste.handler': { name: 'teste.handler', productId: null, feature: null, idempotent, emits: [], run: fn },
  })
  const pub = (orgId: string, key: string) =>
    db.asSystem('t', (tx) =>
      publishEvent(
        tx,
        {
          orgId,
          projectId: null,
          type: 'job.created',
          producer: 'carro-do-freela',
          payload: { product: 'carro-do-freela', external_job_id: key, title: 't' },
          idempotencyKey: `teste:${key}`,
        },
        routes,
      ),
    )

  it('evento idempotente; execução com sucesso', async () => {
    const o = await newOrgWithOwner(db, 'fila-ok')
    const e1 = await pub(o.orgId, 'a1')
    const e2 = await pub(o.orgId, 'a1')
    expect(e2).toMatchObject({ duplicate: true, eventId: e1.eventId, runs: [] })
    await runOnce(db, { handlers: handlers(async () => ({ result: { ok: true } })), routes, log: quiet })
    const [r] = await db.sql`select status, result from zro.workflow_runs where id = ${e1.runs[0]!.id}`
    expect(r).toMatchObject({ status: 'succeeded', result: { ok: true } })
  })

  it('falha temporária volta com backoff e termina em dead-letter', async () => {
    const o = await newOrgWithOwner(db, 'fila-dlq')
    const e = await pub(o.orgId, 'b1')
    const fail = handlers(async () => {
      throw new Error('serviço fora do ar')
    })
    await runOnce(db, { handlers: fail, routes, log: quiet, backoffBaseMs: 1, backoffCapMs: 1 })
    let [r] = await db.sql`select status, attempts from zro.workflow_runs where id = ${e.runs[0]!.id}`
    expect(r).toMatchObject({ status: 'queued', attempts: 1 })
    await new Promise((ok) => setTimeout(ok, 20))
    await runOnce(db, { handlers: fail, routes, log: quiet, backoffBaseMs: 1, backoffCapMs: 1 })
    ;[r] = await db.sql`select status, attempts, last_error from zro.workflow_runs where id = ${e.runs[0]!.id}`
    expect(r).toMatchObject({ status: 'dead_letter', attempts: 2, last_error: 'serviço fora do ar' })
  })

  it('despacho ambíguo vai para revisão, sem repetir sozinho; reprocessar é manual e único', async () => {
    const o = await newOrgWithOwner(db, 'fila-amb')
    const e = await pub(o.orgId, 'c1')
    const amb = handlers(async () => {
      throw new AmbiguousError('timeout depois de enviar')
    }, false)
    await runOnce(db, { handlers: amb, routes, log: quiet })
    const [r] = await db.sql`select status from zro.workflow_runs where id = ${e.runs[0]!.id}`
    expect(r!.status).toBe('requires_review')
    expect(await runOnce(db, { handlers: amb, routes, log: quiet })).toBe(0)
    const a = await reprocessRun(db, o.auth, e.runs[0]!.id, amb)
    const b = await reprocessRun(db, o.auth, e.runs[0]!.id, amb)
    expect(a.created).toBe(true)
    expect(b).toEqual({ id: a.id, created: false })
  })

  it('worker que caiu: idempotente volta para a fila, não idempotente vai para revisão', async () => {
    const o = await newOrgWithOwner(db, 'fila-presa')
    const e = await pub(o.orgId, 'd1')
    await db.asSystem(
      't',
      (tx) => tx`update zro.workflow_runs set status = 'running', locked_at = now() - interval '1 hour', locked_by = 'morto' where id = ${e.runs[0]!.id}`,
    )
    const res = await recoverStaleRuns(
      db,
      handlers(async () => ({ result: {} }), false),
      60_000,
    )
    expect(res.review).toBeGreaterThanOrEqual(1)
    const [r] = await db.sql`select status from zro.workflow_runs where id = ${e.runs[0]!.id}`
    expect(r!.status).toBe('requires_review')
  })

  it('backoff cresce com teto e jitter limitado', () => {
    expect(backoffDelay(1, 1000, 60_000, () => 0.5)).toBe(1000)
    expect(backoffDelay(3, 1000, 60_000, () => 0.5)).toBe(4000)
    expect(backoffDelay(20, 1000, 60_000, () => 0.5)).toBe(60_000)
    expect(backoffDelay(1, 1000, 60_000, () => 0)).toBe(800)
  })

  it('detecta ciclo de eventos', () => {
    expect(findEventCycle({ 'job.created': [{ handler: 'h', productId: null, feature: null }] }, { h: ['script.ready'] })).toBeNull()
    expect(
      findEventCycle(
        { 'job.created': [{ handler: 'h', productId: null, feature: null }], 'script.ready': [{ handler: 'g', productId: null, feature: null }] },
        { h: ['script.ready'], g: ['job.created'] },
      ),
    ).toEqual(['job.created', 'script.ready', 'job.created'])
  })

  it('evento fora do contrato é recusado', async () => {
    const o = await newOrgWithOwner(db, 'fila-contrato')
    await expect(
      db.asSystem('t', (tx) =>
        publishEvent(tx, { orgId: o.orgId, projectId: null, type: 'job.created', producer: 'x', payload: { nada: 1 }, idempotencyKey: 'teste:contrato' }, {}),
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})
