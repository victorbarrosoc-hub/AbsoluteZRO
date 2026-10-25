// Isolamento entre organizações e papéis (PRD §5.2, §9.2 caso E, §14). Banco real, papel zro_app.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testDatabase } from '../src/testing'
import type { Database } from '../src/index'
import { PG, pgErrorCode } from '../src/index'
import { addMember, createOrg, createProject, createUser } from './helpers'

let db: Database
let ana: string, bia: string, caio: string, dani: string
let orgA: string, orgB: string
let projA: string, projRestrito: string, projB: string

beforeAll(async () => {
  db = testDatabase()
  ana = await createUser(db, 'ana')
  bia = await createUser(db, 'bia')
  caio = await createUser(db, 'caio')
  dani = await createUser(db, 'dani')
  orgA = await createOrg(db, ana, 'Produtora A')
  orgB = await createOrg(db, bia, 'Produtora B')
  await addMember(db, orgA, caio, 'viewer')
  await addMember(db, orgA, dani, 'billing')
  await addMember(db, orgB, ana, 'editor') // Ana participa das duas
  projA = await createProject(db, ana, orgA, 'Casamento')
  projRestrito = await createProject(db, ana, orgA, 'Restrito', 'restricted')
  projB = await createProject(db, bia, orgB, 'Comercial B')
})
afterAll(() => db.close())

const ids = (rows: readonly { id?: unknown }[]) => rows.map((r) => r.id)

describe('RLS', () => {
  it('todas as tabelas do schema zro têm RLS ligado', async () => {
    const rows = await db.sql`select tablename from pg_tables where schemaname = 'zro' and tablename <> 'schema_migrations' and not rowsecurity`
    expect(rows.map((r) => r.tablename)).toEqual([])
  })

  it('cliente de outra organização não vê projetos de terceiros', async () => {
    const rows = await db.asUser({ userId: bia, orgId: orgB }, (tx) => tx`select id from zro.projects`)
    expect(ids(rows)).toEqual([projB])
  })

  it('forjar a organização ativa sem vínculo não mostra nada', async () => {
    const rows = await db.asUser({ userId: bia, orgId: orgA }, (tx) => tx`select id from zro.projects`)
    expect(rows).toHaveLength(0)
  })

  it('a mesma pessoa vê só a organização ativa (caso E)', async () => {
    const naA = await db.asUser({ userId: ana, orgId: orgA }, (tx) => tx`select id from zro.projects order by title`)
    const naB = await db.asUser({ userId: ana, orgId: orgB }, (tx) => tx`select id from zro.projects`)
    expect(new Set(ids(naA))).toEqual(new Set([projA, projRestrito]))
    expect(ids(naB)).toEqual([projB])
  })

  it('viewer vê projeto da organização mas não o restrito, e não edita', async () => {
    const rows = await db.asUser({ userId: caio, orgId: orgA }, (tx) => tx`select id from zro.projects`)
    expect(ids(rows)).toEqual([projA])
    const upd = await db.asUser({ userId: caio, orgId: orgA }, (tx) => tx`update zro.projects set title = 'x' where id = ${projA} returning id`)
    expect(upd).toHaveLength(0)
  })

  it('papel billing não vê projetos', async () => {
    const rows = await db.asUser({ userId: dani, orgId: orgA }, (tx) => tx`select id from zro.projects`)
    expect(rows).toHaveLength(0)
  })

  it('viewer não cria projeto', async () => {
    const err = await db
      .asUser({ userId: caio, orgId: orgA }, (tx) => tx`insert into zro.projects (org_id, title, created_by) values (${orgA}, 'x', ${caio})`)
      .catch((e) => e)
    expect(pgErrorCode(err)).toBe(PG.rlsViolation)
  })

  it('não dá para criar projeto em outra organização trocando o org_id', async () => {
    const err = await db
      .asUser({ userId: ana, orgId: orgA }, (tx) => tx`insert into zro.projects (org_id, title, created_by) values (${orgB}, 'x', ${ana})`)
      .catch((e) => e)
    expect(pgErrorCode(err)).toBe(PG.rlsViolation)
  })

  it('zro_app não lê senhas, tokens nem eventos de cobrança', async () => {
    for (const t of ['auth_credentials', 'auth_tokens', 'billing_events', 'rate_limit_attempts']) {
      const err = await db.asUser({ userId: ana, orgId: orgA }, (tx) => tx.unsafe(`select * from zro.${t}`)).catch((e) => e)
      expect(pgErrorCode(err), t).toBe(PG.insufficientPrivilege)
    }
  })

  it('sessões: a pessoa não lê o hash do token', async () => {
    const err = await db.asUser({ userId: ana, orgId: orgA }, (tx) => tx`select token_hash from zro.sessions`).catch((e) => e)
    expect(pgErrorCode(err)).toBe(PG.insufficientPrivilege)
  })

  it('assinaturas e entitlements não são graváveis pelo usuário', async () => {
    const err = await db
      .asUser({ userId: ana, orgId: orgA }, (tx) => tx`insert into zro.entitlements (org_id, product_id, source) values (${orgA}, 'synquei', 'admin_grant')`)
      .catch((e) => e)
    expect(pgErrorCode(err)).toBe(PG.insufficientPrivilege)
  })

  it('admin não rebaixa dono; dono não fica sozinho sem dono', async () => {
    const eva = await createUser(db, 'eva')
    await addMember(db, orgA, eva, 'admin')
    const r = await db.asUser({ userId: eva, orgId: orgA }, (tx) => tx`update zro.memberships set role = 'viewer' where org_id = ${orgA} and user_id = ${ana} returning user_id`)
    expect(r).toHaveLength(0)
    const err = await db
      .asUser({ userId: ana, orgId: orgA }, (tx) => tx`update zro.memberships set role = 'admin' where org_id = ${orgA} and user_id = ${ana}`)
      .catch((e) => e)
    expect(pgErrorCode(err)).toBe(PG.checkViolation)
  })

  it('auditoria só cresce', async () => {
    await db.asUser({ userId: ana, orgId: orgA }, (tx) => tx`insert into zro.audit_logs (org_id, actor_user_id, action) values (${orgA}, ${ana}, 'teste')`)
    const err = await db.asSystem('teste', (tx) => tx`delete from zro.audit_logs where action = 'teste'`).catch((e) => e)
    expect(pgErrorCode(err)).toBe(PG.insufficientPrivilege)
  })

  it('catálogo é público e esconde rascunhos', async () => {
    await db.asSystem('teste', (tx) => tx`insert into zro.plans (code, version, name, kind, status) values ('rascunho-x', 1, 'X', 'bundle', 'draft') on conflict do nothing`)
    const rows = await db.asUser({ userId: caio, orgId: orgA }, (tx) => tx`select code from zro.plans`)
    const codes = rows.map((r) => r.code)
    expect(codes).toContain('ciclo-do-o')
    expect(codes).not.toContain('rascunho-x')
  })
})
