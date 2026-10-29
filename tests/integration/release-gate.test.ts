// Gate de lançamento (ADR 0023, migration 0018) pelas contas do PRD §11: anônimo, conta grátis, assinante do SOBEDESCE,
// usuário de outro produto, admin da plataforma sem linha, tester com linha, outro admin, sessão antiga e cross-tenant.
// Regra: fechado é fechado para todo mundo que não está na lista, mesmo com plano Completo ou papel de admin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Authenticated } from '@zro/auth'
import {
  checkEntitlement,
  grantReleaseAccess,
  listReleaseAccess,
  productAccessFor,
  releaseAllows,
  releaseClaimsFor,
  releaseState,
  resetReleaseCache,
  revokeReleaseAccess,
  setProductRelease,
} from '@zro/billing'
import { authorize, loadOidcClaims, revokeClosedProductAccess } from '@zro/core'
import { PG, pgErrorCode, type Database, type Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { importCarroJob } from '@zro/integrations'
import { admin, allowRelease, expectCode, givePlan, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const LANCADOS = ['sobedesce', 'synquei', 'tpeasy']
const FECHADOS = ['nossom', 'ai-edit', 'finishing', 'carro-do-freela']
const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)

/** A mesma pessoa chamando pelo token de um app da família (canal api). */
const viaApp = (auth: Authenticated, productId: string): Authenticated => ({
  ...auth,
  session: { ...auth.session, app: { clientId: `${productId}-web`, productId } },
})

const job = (id: string) => ({ contract: 'carro-do-freela.job/1', job_id: id, title: 'Job', production_type: 'show', crew_roles: [] })

describe('seed e regra do banco', () => {
  it('SOBEDESCE, Synquei e TPeasy lançados em todos os canais; NOSSOM, AEON, Revela e Carro em desenvolvimento', async () => {
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    for (const id of LANCADOS) {
      expect(s[id]?.state, id).toBe('released')
      expect(s[id]?.open, id).toBe(true)
      expect(Object.values(s[id]!.channels).every(Boolean), id).toBe(true)
    }
    for (const id of FECHADOS) {
      expect(s[id]?.state, id).toBe('development')
      expect(s[id]?.open, id).toBe(false)
      expect(Object.values(s[id]!.channels).some(Boolean), id).toBe(false)
    }
  })

  it('anônimo: entra no lançado, nunca no fechado; produto sem linha ou desconhecido é fechado', async () => {
    for (const ch of ['web', 'desktop', 'api', 'download', 'sso'] as const) {
      expect(await sys((tx) => releaseAllows(tx, 'sobedesce', null, ch)), ch).toBe(true)
      expect(await sys((tx) => releaseAllows(tx, 'nossom', null, ch)), ch).toBe(false)
    }
    expect(await sys((tx) => releaseAllows(tx, 'produto-inexistente', null, 'web'))).toBe(false)
    // sem linha em product_release (um produto novo nasce fechado): nem o canal web abre
    await db.sql`insert into zro.products (id, name, stage, step_order, role_in_flow, integration_mode) values ('teste-sem-linha', 'Sem linha', 'active', 990, 'teste', 'external_link') on conflict (id) do nothing`
    expect(await sys((tx) => releaseAllows(tx, 'teste-sem-linha', null, 'web'))).toBe(false)
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s['teste-sem-linha']).toMatchObject({ state: 'development', open: false })
    await db.sql`delete from zro.products where id = 'teste-sem-linha'`
    resetReleaseCache()
  })

  it('RLS: o estado é legível pelo papel zro_app; a lista de acesso e a escrita, não', async () => {
    const o = await newOrgWithOwner(db, 'gate-rls')
    const ctx = { userId: o.userId, orgId: o.orgId }
    const rows = await db.asUser(ctx, (tx) => tx`select product_id, state from zro.product_release where product_id = 'nossom'`)
    expect(rows).toEqual([{ product_id: 'nossom', state: 'development' }])
    const lista = await db.asUser(ctx, (tx) => tx`select * from zro.product_release_access`).catch((e) => e)
    expect(pgErrorCode(lista)).toBe(PG.insufficientPrivilege)
    const escrita = await db.asUser(ctx, (tx) => tx`update zro.product_release set state = 'released' where product_id = 'nossom'`).catch((e) => e)
    expect(pgErrorCode(escrita)).toBe(PG.insufficientPrivilege)
    // a função é a mesma para o papel restrito (as páginas do HUB rodam como zro_app)
    const [r] = await db.asUser(ctx, (tx) => tx`select zro.release_allows('sobedesce', ${o.userId}::uuid, 'web') as ok`)
    expect(r!.ok).toBe(true)
  })
})

describe('contas do PRD §11', () => {
  it('conta grátis: o plano lista os fechados, mas eles ficam closed e o entitlement é negado com product_closed', async () => {
    const o = await newOrgWithOwner(db, 'gate-gratis', { freePlan: true })
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    const by = Object.fromEntries(access.map((a) => [a.productId, a]))
    for (const id of LANCADOS) expect(by[id]!.access, id).toBe('contracted')
    for (const id of FECHADOS) {
      expect(by[id]!.access, id).toBe('closed')
      expect(by[id]!.release, id).toMatchObject({ state: 'development', open: false, allowed: false })
    }
    const c = await sys((tx) => checkEntitlement(tx, o.orgId, 'nossom', null, { who: { userId: o.userId, channel: 'web' } }))
    expect(c).toMatchObject({ ok: false, code: 'product_closed', closed: true })
    // sem "quem" é o cálculo puro do plano (worker): o entitlement existe
    expect((await sys((tx) => checkEntitlement(tx, o.orgId, 'nossom', null))).ok).toBe(true)
    const err = await expectCode(authorize(db, o.auth, { product: { id: 'nossom' } }), 'product_closed')
    expect(err.status).toBe(403)
    expect((err as unknown as { details: Record<string, unknown> }).details).toMatchObject({ closed: true, product: 'nossom', upgrade: false })
    expect((err as unknown as { message: string }).message).toBe('Este app ainda está em desenvolvimento.')
  })

  it('assinante do SOBEDESCE: SOBEDESCE segue igual; fechados negados mesmo com o Completo', async () => {
    const o = await newOrgWithOwner(db, 'gate-assinante')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    await expect(authorize(db, o.auth, { product: { id: 'sobedesce', feature: 'manifest_import' } })).resolves.toMatchObject({ orgId: o.orgId })
    await expectCode(authorize(db, o.auth, { product: { id: 'synquei' } }), 'entitlement_required')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    await expect(authorize(db, o.auth, { product: { id: 'synquei' } })).resolves.toBeTruthy()
    for (const id of FECHADOS) await expectCode(authorize(db, o.auth, { product: { id } }), 'product_closed')
    await expectCode(importCarroJob(db, o.auth, job('job-gate-1')), 'product_closed')
  })

  it('usuário de outro produto: o token do SOBEDESCE abre a Z; a mesma chamada vinda de um app fechado é negada', async () => {
    const o = await newOrgWithOwner(db, 'gate-outro', { freePlan: true })
    await expect(authorize(db, viaApp(o.auth, 'sobedesce'), { release: { productId: 'sobedesce' } })).resolves.toBeTruthy()
    await expectCode(authorize(db, viaApp(o.auth, 'nossom'), { release: { productId: 'nossom' } }), 'product_closed')
    await expectCode(authorize(db, viaApp(o.auth, 'ai-edit'), { product: { id: 'ai-edit' } }), 'product_closed')
  })

  it('admin da plataforma SEM linha é negado como qualquer pessoa (a lista é por conta, não por papel)', async () => {
    const o = await newOrgWithOwner(db, 'gate-admin', { freePlan: true })
    await db.sql`update zro.users set platform_role = 'admin' where id = ${o.userId}`
    const auth = { ...o.auth, user: { ...o.auth.user, platformRole: 'admin' as const } }
    for (const id of FECHADOS) await expectCode(authorize(db, auth, { product: { id } }), 'product_closed')
    const claims = await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    expect(claims.products.sort()).toEqual([...LANCADOS].sort())
    for (const id of FECHADOS) expect(claims.release[id], id).toBe('closed')
  })

  it('tester com linha entra no canal listado, não nos outros; vencido ou revogado volta a fechado', async () => {
    const o = await newOrgWithOwner(db, 'gate-tester', { freePlan: true })
    const adm = await admin(db)
    await sys((tx) =>
      grantReleaseAccess(
        tx,
        { userId: adm, reason: 'teste do NOSSOM' },
        { productId: 'nossom', userId: o.userId, kind: 'tester', channels: ['web', 'sso'], endsAt: null },
      ),
    )
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'web'))).toBe(true)
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'sso'))).toBe(true)
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'download'))).toBe(false)
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'api'))).toBe(false)
    expect(await sys((tx) => releaseAllows(tx, 'ai-edit', o.userId, 'web'))).toBe(false)
    // no HUB (canal web) o NOSSOM aparece contratado pelo plano grátis, com o gate marcando "allowed"
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    const nossom = access.find((a) => a.productId === 'nossom')!
    expect(nossom.access).toBe('contracted')
    expect(nossom.release).toMatchObject({ state: 'development', open: false, allowed: true })
    expect(access.find((a) => a.productId === 'ai-edit')!.access).toBe('closed')
    await expect(authorize(db, o.auth, { product: { id: 'nossom' } })).resolves.toBeTruthy()
    // pelo token do app (canal api) o tester não listou api: negado
    await expectCode(authorize(db, viaApp(o.auth, 'nossom'), { product: { id: 'nossom' } }), 'product_closed')
    const claims = await sys((tx) => releaseClaimsFor(tx, o.userId, 'sso'))
    expect(claims).toMatchObject({ nossom: 'allowed', sobedesce: 'released', 'ai-edit': 'closed' })
    expect((await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))).products).toContain('nossom')

    // validade vencida
    await db.sql`update zro.product_release_access set starts_at = now() - interval '2 minutes', ends_at = now() - interval '1 minute'
                 where product_id = 'nossom' and user_id = ${o.userId}`
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'web'))).toBe(false)
    // renovar a concessão zera a validade; revogar fecha de novo, e a revogação fica na lista com histórico
    await sys((tx) =>
      grantReleaseAccess(tx, { userId: adm, reason: 'renovado' }, { productId: 'nossom', userId: o.userId, kind: 'tester', channels: ['web'], endsAt: null }),
    )
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'web'))).toBe(true)
    await sys((tx) => revokeReleaseAccess(tx, { userId: adm, reason: 'fim do teste' }, { productId: 'nossom', userId: o.userId }))
    expect(await sys((tx) => releaseAllows(tx, 'nossom', o.userId, 'web'))).toBe(false)
    await expectCode(authorize(db, o.auth, { product: { id: 'nossom' } }), 'product_closed')
    await expectCode(
      sys((tx) => revokeReleaseAccess(tx, { userId: adm, reason: 'de novo' }, { productId: 'nossom', userId: o.userId })),
      'not_found',
    )
    expect((await sys((tx) => listReleaseAccess(tx, { productId: 'nossom' }))).some((a) => a.userId === o.userId)).toBe(false)
    const hist = await sys((tx) => listReleaseAccess(tx, { productId: 'nossom', all: true }))
    expect(hist.find((a) => a.userId === o.userId)).toMatchObject({ active: false, kind: 'tester', channels: ['web'] })
  })

  it('Carro do Freela: só a conta proprietária listada entra; outro admin da plataforma, assinante e membro da mesma organização, não', async () => {
    const dono = await newOrgWithOwner(db, 'carro-dono', { freePlan: true })
    await allowRelease(db, 'carro-do-freela', dono.userId, { kind: 'owner' })
    const outroAdmin = await newOrgWithOwner(db, 'carro-outro-admin', { freePlan: true })
    await db.sql`update zro.users set platform_role = 'admin' where id = ${outroAdmin.userId}`
    const assinante = await newOrgWithOwner(db, 'carro-assinante')
    await givePlan(db, assinante.orgId, 'individual-carro-do-freela')
    const colega = await newUser(db, 'carro-colega')
    await db.asSystem('teste', async (tx) => {
      await tx`insert into zro.memberships (org_id, user_id, role) values (${dono.orgId}, ${colega.userId}, 'admin')`
      await tx`update zro.sessions set active_org_id = ${dono.orgId} where user_id = ${colega.userId}`
    })
    const colegaAuth = await refresh(db, colega.token)
    expect(colegaAuth.session.activeOrgId).toBe(dono.orgId)

    const r = await importCarroJob(db, dono.auth, job('job-dono'))
    expect(r.created).toBe(true)
    await expectCode(importCarroJob(db, outroAdmin.auth, job('job-outro-admin')), 'product_closed')
    await expectCode(importCarroJob(db, assinante.auth, job('job-assinante')), 'product_closed')
    // mesma organização do dono (cross-tenant dentro da org): a lista é por conta, o colega não herda
    await expectCode(importCarroJob(db, colegaAuth, job('job-colega')), 'product_closed')
    const claims = await sys((tx) => releaseClaimsFor(tx, dono.userId))
    expect(claims['carro-do-freela']).toBe('allowed')
    expect((await sys((tx) => releaseClaimsFor(tx, outroAdmin.userId)))['carro-do-freela']).toBe('closed')
  })

  it('cross-tenant: a linha vale para a conta, mas o plano é da organização', async () => {
    const a = await newOrgWithOwner(db, 'gate-ct-a')
    await allowRelease(db, 'nossom', a.userId, { kind: 'internal' })
    // organização sem plano: passa no gate, cai no entitlement (não é "fechado", é "não contratado")
    await expectCode(authorize(db, a.auth, { product: { id: 'nossom' } }), 'entitlement_required')
    await givePlan(db, a.orgId, 'individual-nossom')
    await expect(authorize(db, a.auth, { product: { id: 'nossom' } })).resolves.toBeTruthy()
    // outra pessoa na mesma organização, com o mesmo plano, continua fechada
    const b = await newUser(db, 'gate-ct-b')
    await db.asSystem('teste', async (tx) => {
      await tx`insert into zro.memberships (org_id, user_id, role) values (${a.orgId}, ${b.userId}, 'editor')`
      await tx`update zro.sessions set active_org_id = ${a.orgId} where user_id = ${b.userId}`
    })
    await expectCode(authorize(db, await refresh(db, b.token), { product: { id: 'nossom' } }), 'product_closed')
  })
})

describe('console: estado, cache e auditoria', () => {
  it('mudar o estado abre e fecha o produto; o cache de 30 s é esquecido ao salvar; tudo vai para a auditoria', async () => {
    const adm = await admin(db)
    const o = await newOrgWithOwner(db, 'gate-console', { freePlan: true })
    await db.sql`insert into zro.products (id, name, stage, step_order, role_in_flow, integration_mode) values ('teste-gate', 'Teste do gate', 'active', 991, 'teste', 'external_link') on conflict (id) do nothing`
    try {
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', o.userId, 'web'))).toBe(false)
      const info = await sys((tx) =>
        setProductRelease(tx, { userId: adm, reason: 'beta público só na web' }, { productId: 'teste-gate', state: 'public_beta', channels: { web: true } }),
      )
      expect(info).toMatchObject({ state: 'public_beta', open: true, channels: { web: true, desktop: false, sso: false } })
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', o.userId, 'web'))).toBe(true)
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', null, 'web'))).toBe(true)
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', o.userId, 'sso'))).toBe(false)
      // released com um canal fechado ao público: conta listada naquele canal entra
      await sys((tx) =>
        grantReleaseAccess(
          tx,
          { userId: adm, reason: 'testa o desktop' },
          { productId: 'teste-gate', userId: o.userId, kind: 'internal', channels: ['desktop'], endsAt: null },
        ),
      )
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', o.userId, 'desktop'))).toBe(true)
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', null, 'desktop'))).toBe(false)
      // cache: a leitura em cache ainda diz public_beta; depois de encerrar, a fresca diz retired
      expect((await sys((tx) => releaseState(tx)))['teste-gate']!.state).toBe('public_beta')
      await db.sql`update zro.product_release set state = 'retired', updated_by = ${adm} where product_id = 'teste-gate'`
      expect((await sys((tx) => releaseState(tx)))['teste-gate']!.state).toBe('public_beta')
      resetReleaseCache()
      expect((await sys((tx) => releaseState(tx)))['teste-gate']!.state).toBe('retired')
      // encerrado: nem a conta listada entra
      expect(await sys((tx) => releaseAllows(tx, 'teste-gate', o.userId, 'desktop'))).toBe(false)
      const logs =
        await db.sql`select action, actor_user_id, metadata from zro.audit_logs where target_type = 'product' and target_id = 'teste-gate' order by id`
      expect(logs.map((l) => l.action)).toEqual(['release.state_set', 'release.access_granted', 'release.state_changed'])
      expect(logs[0]!.actor_user_id).toBe(adm)
      expect(logs[0]!.metadata).toMatchObject({ state: 'public_beta', note: 'beta público só na web', channels: { web: true, sso: false } })
      expect(logs[1]!.metadata).toMatchObject({ user_id: o.userId, kind: 'internal', channels: ['desktop'], reason: 'testa o desktop' })
      expect(logs[2]!.metadata).toMatchObject({ state: 'retired', before: 'public_beta' })
      // auditoria só cresce
      const del = await db.asSystem('t', (tx) => tx`delete from zro.audit_logs where target_id = 'teste-gate'`).catch((e) => e)
      expect(pgErrorCode(del)).toBe(PG.insufficientPrivilege)
    } finally {
      await db.sql`delete from zro.products where id = 'teste-gate'`
      resetReleaseCache()
    }
  })

  it('concessão exige motivo, canal válido e conta ativa escolhida pela id', async () => {
    const adm = await admin(db)
    const o = await newOrgWithOwner(db, 'gate-valida')
    const grant = (p: Partial<Parameters<typeof grantReleaseAccess>[2]>, reason = 'ok') =>
      sys((tx) =>
        grantReleaseAccess(tx, { userId: adm, reason }, { productId: 'nossom', userId: o.userId, kind: 'tester', channels: ['web'], endsAt: null, ...p }),
      )
    await expectCode(grant({}, ''), 'invalid_input')
    await expectCode(grant({ channels: [] }), 'invalid_input')
    await expectCode(grant({ channels: ['ftp' as never] }), 'invalid_input')
    await expectCode(grant({ userId: 'nao-e-uuid' }), 'invalid_input')
    await expectCode(grant({ userId: '00000000-0000-4000-8000-000000000000' }), 'not_found')
    await expectCode(grant({ productId: 'produto-inexistente' }), 'not_found')
    await expectCode(grant({ endsAt: new Date(Date.now() - 1000) }), 'invalid_input')
    await db.sql`update zro.users set status = 'suspended' where id = ${o.userId}`
    await expectCode(grant({}), 'not_found')
  })
})

describe('sessões de antes do gate (db:release:revoke)', () => {
  it('prévia conta sem mudar; --apply revoga refresh tokens e consentimentos dos clientes fechados, poupando quem está na lista', async () => {
    const adm = await admin(db)
    const fora = await newUser(db, 'rev-fora')
    const dentro = await newUser(db, 'rev-dentro')
    await allowRelease(db, 'nossom', dentro.userId, { kind: 'tester' })
    const clientFechado = `nossom-rev-${fora.userId.slice(0, 8)}`
    const clientAberto = `sobedesce-rev-${fora.userId.slice(0, 8)}`
    await db.asSystem('teste', async (tx) => {
      for (const [id, product] of [
        [clientFechado, 'nossom'],
        [clientAberto, 'sobedesce'],
      ]) {
        await tx`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, created_by) values (${id}, ${id}, ${product}, 'confidential', 'x', ${['https://a.teste/cb']}, ${adm})`
        for (const u of [fora.userId, dentro.userId]) {
          await tx`insert into zro.oauth_consents (user_id, client_id, scopes) values (${u}, ${id}, ${['openid']})`
          await tx`insert into zro.oauth_refresh_tokens (token_hash, family_id, client_id, user_id, scopes, auth_time, family_started_at, expires_at)
                   values (${`h-${id}-${u}`}, gen_random_uuid(), ${id}, ${u}, ${['openid']}, now(), now(), now() + interval '30 days')`
        }
      }
    })
    await expectCode(
      sys((tx) => revokeClosedProductAccess(tx, { reason: '', apply: false })),
      'invalid_input',
    )
    const previa = await sys((tx) => revokeClosedProductAccess(tx, { reason: 'gate', apply: false, productId: 'nossom' }))
    const c = previa.clients.find((x) => x.clientId === clientFechado)!
    expect(c).toMatchObject({ productId: 'nossom', refreshTokens: 1, consents: 1 })
    expect(previa.clients.some((x) => x.clientId === clientAberto)).toBe(false)
    const vivos = () =>
      db.sql`select client_id, user_id from zro.oauth_refresh_tokens where client_id in (${clientFechado}, ${clientAberto}) and revoked_at is null`
    expect((await vivos()).length).toBe(4)

    const feito = await sys((tx) => revokeClosedProductAccess(tx, { reason: 'gate de lançamento', apply: true, productId: 'nossom', actorUserId: adm }))
    expect(feito.refreshTokens).toBeGreaterThanOrEqual(1)
    const restantes = await vivos()
    expect(restantes.some((r) => r.client_id === clientFechado && r.user_id === fora.userId)).toBe(false)
    expect(restantes.some((r) => r.client_id === clientFechado && r.user_id === dentro.userId)).toBe(true)
    expect(restantes.filter((r) => r.client_id === clientAberto).length).toBe(2)
    const [consent] = await db.sql`select revoked_at from zro.oauth_consents where client_id = ${clientFechado} and user_id = ${fora.userId}`
    expect(consent!.revoked_at).not.toBeNull()
    const [log] =
      await db.sql`select actor_user_id, actor_kind, metadata from zro.audit_logs where action = 'release.tokens_revoked' and target_id = ${clientFechado}`
    expect(log).toMatchObject({ actor_user_id: adm, actor_kind: 'admin' })
    expect(log!.metadata).toMatchObject({ product: 'nossom', reason: 'gate de lançamento' })
  })
})
