// Central da conta (26/10/2026): troca de e-mail confirmada, foto do perfil, pedidos de plano e resumo de acessos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authenticate, confirmEmailChange, requestEmailChange, requestPasswordReset, signIn } from '@zro/auth'
import {
  accessOverview,
  avatarVersion,
  cancelPlanRequest,
  readAvatar,
  removeAvatar,
  requestPlanChange,
  resolvePlanRequest,
  setAvatar,
  updateDisplayName,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, expectCode, givePlan, newOrgWithOwner, newUser, planId, refresh } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

// Menor WebP válido para o teste (cabeçalho RIFF....WEBP).
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0, 0, 0, 0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88,
  0xfe, 0x07, 0,
])

describe('troca de e-mail', () => {
  it('só vale depois de confirmada pelo endereço novo, que já nasce confirmado', async () => {
    const u = await newUser(db, 'troca-email')
    const novo = `novo-${u.email}`
    const r = await requestEmailChange(db, u.userId, 'senha-de-teste-123', novo)
    expect(r.email).toBe(novo)
    expect(r.token).toMatch(/^zm_/)
    expect((await authenticate(db, u.token))!.user.email).toBe(u.email)

    const done = await confirmEmailChange(db, r.token)
    expect(done).toEqual({ userId: u.userId, oldEmail: u.email, email: novo })
    const me = (await authenticate(db, u.token))!.user
    expect(me.email).toBe(novo)
    expect(me.emailVerified).toBe(true)
    await signIn(db, { email: novo, password: 'senha-de-teste-123' })
    await expectCode(signIn(db, { email: u.email, password: 'senha-de-teste-123' }), 'unauthenticated')
    expect(await confirmEmailChange(db, r.token)).toBeNull()
  })

  it('pede a senha atual e recusa e-mail que já é de outra conta', async () => {
    const u = await newUser(db, 'troca-email-recusa')
    const outro = await newUser(db, 'troca-email-outro')
    await expectCode(requestEmailChange(db, u.userId, 'senha-errada-123', `x-${u.email}`), 'unauthenticated')
    await expectCode(requestEmailChange(db, u.userId, 'senha-de-teste-123', outro.email), 'conflict')
    await expectCode(requestEmailChange(db, u.userId, 'senha-de-teste-123', u.email), 'invalid_input')
  })

  it('confirmar derruba links de nova senha mandados ao endereço antigo', async () => {
    const u = await newUser(db, 'troca-email-reset')
    const reset = await requestPasswordReset(db, u.email)
    expect(reset).not.toBeNull()
    const r = await requestEmailChange(db, u.userId, 'senha-de-teste-123', `novo-${u.email}`)
    await confirmEmailChange(db, r.token)
    const [t] = await db.sql`select used_at from zro.auth_tokens where user_id = ${u.userId} and purpose = 'reset_password'`
    expect(t!.used_at).not.toBeNull()
  })

  it('conta só com Google precisa criar senha antes', async () => {
    const u = await newUser(db, 'troca-email-google')
    await db.sql`delete from zro.auth_credentials where user_id = ${u.userId}`
    await expectCode(requestEmailChange(db, u.userId, 'qualquer-coisa-123', `g-${u.email}`), 'invalid_input')
  })
})

describe('nome e foto do perfil', () => {
  it('troca o nome pelo papel da aplicação', async () => {
    const o = await newOrgWithOwner(db, 'nome')
    await updateDisplayName(db, o.auth, '  Nome Novo  ')
    expect((await authenticate(db, o.token))!.user.displayName).toBe('Nome Novo')
    await expectCode(updateDisplayName(db, o.auth, '   '), 'invalid_input')
  })

  it('guarda a foto pelo tipo real dos bytes e só mostra a quem divide organização', async () => {
    const o = await newOrgWithOwner(db, 'foto')
    const fora = await newOrgWithOwner(db, 'foto-fora')
    expect(await avatarVersion(db, o.auth)).toBeNull()
    await setAvatar(db, o.auth, WEBP)
    expect(await avatarVersion(db, o.auth)).toEqual(expect.any(Number))
    expect((await readAvatar(db, o.auth, o.userId))!.type).toBe('image/webp')
    // Quem não está na organização não vê.
    expect(await readAvatar(db, fora.auth, o.userId)).toBeNull()
    // Nem por escrita direta em nome de outra pessoa (RLS).
    await expect(
      db.asUser(
        { userId: fora.userId, orgId: fora.orgId },
        (tx) => tx`insert into zro.user_avatars (user_id, content_type, data) values (${o.userId}, 'image/webp', ${Buffer.from(WEBP)})`,
      ),
    ).rejects.toThrow()
    await removeAvatar(db, o.auth)
    expect(await readAvatar(db, o.auth, o.userId)).toBeNull()
  })

  it('recusa arquivo que não é imagem ou grande demais', async () => {
    const o = await newOrgWithOwner(db, 'foto-ruim')
    await expectCode(setAvatar(db, o.auth, new TextEncoder().encode('<svg onload="x()"></svg>')), 'invalid_input')
    const big = new Uint8Array(300_001)
    big.set(WEBP)
    await expectCode(setAvatar(db, o.auth, big), 'invalid_input')
  })

  it('a equipe da mesma organização vê a foto', async () => {
    const o = await newOrgWithOwner(db, 'foto-equipe')
    await setAvatar(db, o.auth, WEBP)
    const colega = await newUser(db, 'foto-colega')
    await db.sql`insert into zro.memberships (org_id, user_id, role, status) values (${o.orgId}, ${colega.userId}, 'editor', 'active')`
    await db.sql`update zro.sessions set active_org_id = ${o.orgId} where user_id = ${colega.userId}`
    const a = await refresh(db, colega.token)
    expect((await readAvatar(db, a, o.userId))!.type).toBe('image/webp')
  })
})

describe('pedidos de plano', () => {
  it('upgrade: só quem cuida da cobrança pede, um aberto por plano, e o console atende', async () => {
    const o = await newOrgWithOwner(db, 'pedido')
    const ciclo = await planId(db, 'ciclo-do-o')
    const id = await requestPlanChange(db, o.auth, { kind: 'upgrade', planId: ciclo })
    await expectCode(requestPlanChange(db, o.auth, { kind: 'upgrade', planId: ciclo }), 'conflict')
    // Plano grátis não é upgrade.
    const [free] = await db.sql`select id from zro.plans where kind = 'free' and status = 'active' limit 1`
    await expectCode(requestPlanChange(db, o.auth, { kind: 'upgrade', planId: free!.id as string }), 'invalid_input')

    const adminId = await admin(db)
    await db.asSystem('teste: console', (tx) => resolvePlanRequest(tx, { userId: adminId, reason: 'teste' }, id))
    const [r] = await db.sql`select status, resolved_by from zro.plan_requests where id = ${id}`
    expect(r).toEqual({ status: 'done', resolved_by: adminId })
    // Atendido, pode pedir de novo.
    await requestPlanChange(db, o.auth, { kind: 'upgrade', planId: ciclo })
  })

  it('renovar exige plano pago; quem pediu pode desistir', async () => {
    const o = await newOrgWithOwner(db, 'renovar')
    await expectCode(requestPlanChange(db, o.auth, { kind: 'renew' }), 'invalid_input')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    const id = await requestPlanChange(db, o.auth, { kind: 'renew' })
    await cancelPlanRequest(db, o.auth, id)
    const [r] = await db.sql`select status from zro.plan_requests where id = ${id}`
    expect(r!.status).toBe('canceled')
    await expectCode(cancelPlanRequest(db, o.auth, id), 'not_found')
  })

  it('editor não pede nem vê pedidos; outra organização também não', async () => {
    const o = await newOrgWithOwner(db, 'pedido-papel')
    const ciclo = await planId(db, 'ciclo-do-o')
    await requestPlanChange(db, o.auth, { kind: 'upgrade', planId: ciclo })
    const editor = await newUser(db, 'pedido-editor')
    await db.sql`insert into zro.memberships (org_id, user_id, role, status) values (${o.orgId}, ${editor.userId}, 'editor', 'active')`
    await db.sql`update zro.sessions set active_org_id = ${o.orgId} where user_id = ${editor.userId}`
    const ea = await refresh(db, editor.token)
    await expectCode(requestPlanChange(db, ea, { kind: 'upgrade', planId: ciclo }), 'forbidden_role')
    const visto = await db.asUser({ userId: editor.userId, orgId: o.orgId }, (tx) => tx`select id from zro.plan_requests`)
    expect(visto).toHaveLength(0)

    const fora = await newOrgWithOwner(db, 'pedido-fora')
    const deFora = await db.asUser({ userId: fora.userId, orgId: fora.orgId }, (tx) => tx`select id from zro.plan_requests where org_id = ${o.orgId}`)
    expect(deFora).toHaveLength(0)
    // Nem pedir em nome de outra organização pela escrita direta.
    await expect(
      db.asUser(
        { userId: fora.userId, orgId: fora.orgId },
        (tx) => tx`insert into zro.plan_requests (org_id, requested_by, kind) values (${o.orgId}, ${fora.userId}, 'renew')`,
      ),
    ).rejects.toThrow()
    // E a pessoa não marca o próprio pedido como atendido.
    await expect(
      db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => tx`update zro.plan_requests set status = 'done' where org_id = ${o.orgId}`),
    ).rejects.toThrow()
  })
})

describe('resumo de acessos', () => {
  it('lista cada organização com papel, planos (só para a cobrança) e ferramentas liberadas', async () => {
    const o = await newOrgWithOwner(db, 'acessos')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    const outra = await newOrgWithOwner(db, 'acessos-outra')
    await db.sql`insert into zro.memberships (org_id, user_id, role, status) values (${outra.orgId}, ${o.userId}, 'viewer', 'active')`
    const list = await accessOverview(db, await refresh(db, o.token))
    const mine = list.find((x) => x.id === o.orgId)!
    expect(mine.role).toBe('owner')
    expect(mine.active).toBe(true)
    expect(mine.plans!.map((p) => p.name)).toContain('Absolute ZRO Completo')
    expect(mine.products.some((p) => p.access === 'contracted')).toBe(true)
    const theirs = list.find((x) => x.id === outra.orgId)!
    expect(theirs.role).toBe('viewer')
    expect(theirs.plans).toBeNull()
  })
})
