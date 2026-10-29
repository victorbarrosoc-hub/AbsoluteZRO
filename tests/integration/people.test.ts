// Painel de pessoas do console (/admin/pessoas): troca de plano por organização, suspensão e consultas.
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authenticate } from '@zro/auth'
import { changeOrgPlan, checkEntitlement } from '@zro/billing'
import {
  consoleOverview,
  listPeople,
  onlineNow,
  parsePeopleFilter,
  peopleCsv,
  peopleFilterQuery,
  peopleSummary,
  personDetail,
  reactivateUser,
  segmentCounts,
  suspendUser,
} from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, expectCode, newOrgWithOwner, newUser, planId } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste: painel de pessoas', fn)
const filter = (q: Record<string, string>) => parsePeopleFilter(new URLSearchParams(q))

describe('trocar plano da organização (changeOrgPlan)', () => {
  it('grátis → manual: encerra o grátis, concede o novo, recalcula acessos e audita', async () => {
    const o = await newOrgWithOwner(db, 'troca', { freePlan: true })
    const adm = await admin(db)
    const synquei = await planId(db, 'individual-synquei')
    const r = await sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'Troca no painel' }, { orgId: o.orgId, planId: synquei }))
    expect(r.canceled).toBe(1)
    const subs = await db.sql`select provider, status, plan_id from zro.subscriptions where org_id = ${o.orgId} order by created_at`
    expect(subs.map((s) => [s.provider, s.status])).toEqual([
      ['free', 'canceled'],
      ['manual', 'active'],
    ])
    expect(subs[1]!.plan_id).toBe(synquei)
    const ok = await sys(async (tx) => checkEntitlement(tx, o.orgId, 'synquei', null))
    expect(ok.ok).toBe(true)
    const gone = await sys(async (tx) => checkEntitlement(tx, o.orgId, 'nossom', null))
    expect(gone.ok).toBe(false)
    const logs = await db.sql`select action, actor_kind, metadata from zro.audit_logs where org_id = ${o.orgId} and actor_user_id = ${adm} order by id`
    expect(logs.map((l) => l.action)).toEqual(['billing.subscription_canceled', 'billing.plan_assigned', 'billing.plan_changed'])
    expect(logs.every((l) => l.actor_kind === 'admin' && (l.metadata as { reason: string }).reason === 'Troca no painel')).toBe(true)
  })

  it('volta para o plano grátis como assinatura manual e recusa o mesmo plano de novo', async () => {
    const o = await newOrgWithOwner(db, 'volta', { freePlan: true })
    const adm = await admin(db)
    const free = await planId(db, 'conta-absolute-zro', 2)
    await expectCode(
      sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'x' }, { orgId: o.orgId, planId: free })),
      'conflict',
    )
    await sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'x' }, { orgId: o.orgId, planId: await planId(db, 'individual-synquei') }))
    await sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'x' }, { orgId: o.orgId, planId: free }))
    const active = await db.sql`select provider from zro.subscriptions where org_id = ${o.orgId} and status = 'active'`
    expect(active.map((s) => s.provider)).toEqual(['manual'])
    expect((await sys(async (tx) => checkEntitlement(tx, o.orgId, 'nossom', null))).ok).toBe(true)
  })

  it('assinatura de provedor externo (Stripe) não é trocada à mão', async () => {
    const o = await newOrgWithOwner(db, 'stripe')
    const adm = await admin(db)
    await db.sql`insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id)
                 values (${o.orgId}, ${await planId(db, 'individual-synquei')}, 'active', now(), 'stripe', ${'sub_' + randomBytes(6).toString('hex')})`
    const err = await expectCode(
      sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'x' }, { orgId: o.orgId, planId: await planId(db, 'conta-absolute-zro', 2) })),
      'conflict',
    )
    expect((err as unknown as Error).message).toContain('Pago pelo Stripe')
    const subs = await db.sql`select provider, status from zro.subscriptions where org_id = ${o.orgId}`
    expect(subs).toEqual([{ provider: 'stripe', status: 'active' }])
  })

  it('pede motivo e plano ativo', async () => {
    const o = await newOrgWithOwner(db, 'motivo')
    const adm = await admin(db)
    await expectCode(
      sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: ' ' }, { orgId: o.orgId, planId: await planId(db, 'individual-synquei') })),
      'invalid_input',
    )
    await expectCode(
      sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'x' }, { orgId: o.orgId, planId: await planId(db, 'conta-absolute-zro', 1) })),
      'invalid_input',
    )
  })
})

describe('suspender e reativar conta', () => {
  it('suspende, encerra sessões e refresh tokens, e reativa', async () => {
    const p = await newUser(db, 'suspensa')
    const adm = await admin(db)
    const [client] = await db.sql`select id from zro.oauth_clients limit 1`
    if (client) {
      await db.sql`insert into zro.oauth_refresh_tokens (token_hash, family_id, client_id, user_id, scopes, auth_time, family_started_at, expires_at)
                   values (${randomBytes(16).toString('hex')}, gen_random_uuid(), ${client.id as string}, ${p.userId}, ${['openid']}, now(), now(), now() + interval '1 day')`
    }
    const r = await sys(async (tx) => suspendUser(tx, { userId: adm, reason: 'abuso' }, p.userId))
    expect(r.sessions).toBe(1)
    expect(r.refreshTokens).toBe(client ? 1 : 0)
    expect(await authenticate(db, p.token)).toBeNull()
    const [open] = await db.sql`select count(*)::int as n from zro.oauth_refresh_tokens where user_id = ${p.userId} and revoked_at is null`
    expect(open!.n).toBe(0)
    const [log] = await db.sql`select action, actor_kind from zro.audit_logs where target_type = 'user' and target_id = ${p.userId} and actor_kind = 'admin'`
    expect(log).toMatchObject({ action: 'user.suspended', actor_kind: 'admin' })
    await expectCode(
      sys(async (tx) => suspendUser(tx, { userId: adm, reason: 'de novo' }, p.userId)),
      'conflict',
    )
    await sys(async (tx) => reactivateUser(tx, { userId: adm, reason: 'resolvido' }, p.userId))
    const [u] = await db.sql`select status from zro.users where id = ${p.userId}`
    expect(u!.status).toBe('active')
    // A sessão antiga continua encerrada: a pessoa entra de novo.
    expect(await authenticate(db, p.token)).toBeNull()
  })

  it('não suspende a si mesmo nem outra conta da administração', async () => {
    const a1 = await admin(db)
    const a2 = await admin(db)
    await expectCode(
      sys(async (tx) => suspendUser(tx, { userId: a1, reason: 'x' }, a1)),
      'conflict',
    )
    await expectCode(
      sys(async (tx) => suspendUser(tx, { userId: a1, reason: 'x' }, a2)),
      'conflict',
    )
    const [u] = await db.sql`select status from zro.users where id = ${a2}`
    expect(u!.status).toBe('active')
  })
})

describe('consultas do painel', () => {
  // Outros arquivos de teste criam contas em paralelo no mesmo banco: os números só podem crescer.
  it('números, contas por app, série de 30 dias e funil', async () => {
    const before = await sys(async (tx) => peopleSummary(tx))
    const o = await newOrgWithOwner(db, 'numeros', { freePlan: true })
    const solo = await newUser(db, 'sem-org')
    const after = await sys(async (tx) => peopleSummary(tx))
    expect(after.accounts).toBeGreaterThanOrEqual(before.accounts + 2)
    expect(after.new7).toBeGreaterThanOrEqual(before.new7 + 2)
    expect(after.new30).toBeGreaterThanOrEqual(before.new30 + 2)
    expect(after.active7).toBeGreaterThanOrEqual(before.active7 + 2)
    expect(after.noOrg).toBeGreaterThanOrEqual(before.noOrg + 1)
    expect(after.series).toHaveLength(30)
    expect(after.series.at(-1)!.signups).toBeGreaterThanOrEqual(2)
    expect(after.funnel[0]!.n).toBe(after.accounts)
    expect(o.userId && solo.userId).toBeTruthy()
  })

  it('busca, filtros (plano, sem organização, suspensas, Google, app) e ordem', async () => {
    const tag = randomBytes(3).toString('hex')
    const o = await newOrgWithOwner(db, `busca-${tag}`, { freePlan: true })
    const solo = await newUser(db, `solo-${tag}`)
    const adm = await admin(db)

    const byName = await sys(async (tx) => listPeople(tx, filter({ q: tag.toUpperCase() })))
    expect(byName.rows.map((r) => r.id).sort()).toEqual([o.userId, solo.userId].sort())
    expect(byName.total).toBeGreaterThanOrEqual(2)

    const row = byName.rows.find((r) => r.id === o.userId)!
    expect(row.orgs).toHaveLength(1)
    expect(row.orgs[0]!.role).toBe('owner')
    expect(row.orgs[0]!.plans.map((p) => [p.planCode, p.provider])).toEqual([['conta-absolute-zro', 'free']])
    expect(row.hubLastSeenAt).toBeInstanceOf(Date)

    const free = await sys(async (tx) => listPeople(tx, filter({ q: tag, plano: 'conta-absolute-zro' })))
    expect(free.rows.map((r) => r.id)).toEqual([o.userId])
    const noPlan = await sys(async (tx) => listPeople(tx, filter({ q: tag, plano: 'sem-plano' })))
    expect(noPlan.rows.map((r) => r.id)).toEqual([solo.userId])
    const noOrg = await sys(async (tx) => listPeople(tx, filter({ q: tag, f: 'sem-org' })))
    expect(noOrg.rows.map((r) => r.id)).toEqual([solo.userId])

    await sys(async (tx) => suspendUser(tx, { userId: adm, reason: 'teste' }, solo.userId))
    const susp = await sys(async (tx) => listPeople(tx, filter({ q: tag, f: 'suspensas' })))
    expect(susp.rows.map((r) => r.id)).toEqual([solo.userId])

    await db.sql`insert into zro.external_identities (provider, subject, user_id, email) values ('google', ${'g-' + tag}, ${o.userId}, ${o.email})`
    const google = await sys(async (tx) => listPeople(tx, filter({ q: tag, f: 'google' })))
    expect(google.rows.map((r) => [r.id, r.google])).toEqual([[o.userId, true]])

    const clientId = `app-${tag}`
    await db.sql`insert into zro.oauth_clients (id, name, kind, secret_hash, redirect_uris) values (${clientId}, 'App teste', 'confidential', 'x', ${['https://app.teste/cb']})`
    await db.sql`insert into zro.app_accounts (user_id, client_id, logins) values (${solo.userId}, ${clientId}, 3)`
    const byApp = await sys(async (tx) => listPeople(tx, filter({ app: clientId })))
    expect(byApp.rows.map((r) => r.id)).toEqual([solo.userId])
    expect(byApp.rows[0]!.apps).toMatchObject([{ clientId, name: 'App teste', logins: 3 }])

    const recent = await sys(async (tx) => listPeople(tx, filter({ q: tag })))
    expect(recent.rows[0]!.id).toBe(solo.userId) // criada depois
    const byNameOrder = await sys(async (tx) => listPeople(tx, filter({ q: tag, o: 'nome' })))
    expect(byNameOrder.rows[0]!.id).toBe(o.userId) // "busca-…" antes de "solo-…"

    const csv = peopleCsv(recent.rows)
    expect(csv.startsWith('﻿nome,email')).toBe(true)
    expect(csv).toContain(o.email)
    expect(csv).toContain('Conta Absolute ZRO (Grátis)')
    expect(csv).not.toContain(o.token)
  })

  it('filtro desconhecido na URL vira sem filtro; CSV não executa fórmula', () => {
    expect(parsePeopleFilter(new URLSearchParams({ f: 'xpto', o: 'drop', plano: 'A B', app: '../x', produto: 'X;', seg: 'vip', pagina: '-3' }))).toEqual({
      q: '',
      app: null,
      product: null,
      plan: null,
      segment: null,
      flag: null,
      order: 'recentes',
      page: 1,
    })
    const csv = peopleCsv([
      {
        id: '1',
        name: '=HYPERLINK("x")',
        email: 'a@b.c',
        status: 'active',
        platformRole: null,
        emailVerified: true,
        createdAt: new Date(0),
        hubLastSeenAt: null,
        lastSeenAt: null,
        google: false,
        online: false,
        segment: 'sem-plano',
        avatarId: null,
        files: { count: 0, bytes: 0 },
        orgs: [],
        apps: [],
      },
    ])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('página da pessoa: organizações, assinaturas, acessos, sessões e linha do tempo', async () => {
    const o = await newOrgWithOwner(db, 'detalhe', { freePlan: true })
    const adm = await admin(db)
    await sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'cortesia' }, { orgId: o.orgId, planId: await planId(db, 'individual-synquei') }))
    const d = (await sys(async (tx) => personDetail(tx, o.userId)))!
    expect(d.person.email).toBe(o.email)
    expect(d.person.orgs[0]!.plans.map((p) => p.provider)).toEqual(['manual'])
    expect(d.subscriptions.map((s) => [s.provider, s.status])).toEqual([
      ['manual', 'active'],
      ['free', 'canceled'],
    ])
    expect(d.entitlements.map((e) => e.productId)).toEqual(['synquei', 'relay']) // o Relay entra em todo plano (0031)
    expect(d.sessions).toHaveLength(1)
    expect(d.timeline.map((t) => t.action)).toContain('billing.plan_changed')
    expect(d.timeline.find((t) => t.action === 'billing.plan_changed')!.reason).toBe('cortesia')
    expect(await sys(async (tx) => personDetail(tx, '00000000-0000-4000-8000-000000000000'))).toBeNull()
  })
})

describe('segmentos, online, arquivos e páginas', () => {
  it('ecossistema (Completo), avulso (plano de um app), grátis e sem plano; abas contam cada um', async () => {
    const tag = randomBytes(3).toString('hex')
    const adm = await admin(db)
    const eco = await newOrgWithOwner(db, `seg-eco-${tag}`, { freePlan: true })
    const avulso = await newOrgWithOwner(db, `seg-avulso-${tag}`, { freePlan: true })
    const gratis = await newOrgWithOwner(db, `seg-gratis-${tag}`, { freePlan: true })
    const nada = await newUser(db, `seg-nada-${tag}`)
    const before = await sys(async (tx) => segmentCounts(tx))
    await sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'teste' }, { orgId: eco.orgId, planId: await planId(db, 'ciclo-do-o', 2) }))
    await sys(async (tx) => changeOrgPlan(tx, { userId: adm, reason: 'teste' }, { orgId: avulso.orgId, planId: await planId(db, 'individual-synquei') }))
    const after = await sys(async (tx) => segmentCounts(tx))

    const all = await sys(async (tx) => listPeople(tx, filter({ q: tag })))
    const seg = Object.fromEntries(all.rows.map((r) => [r.id, r.segment]))
    expect(seg[eco.userId]).toBe('ecossistema')
    expect(seg[avulso.userId]).toBe('avulso')
    expect(seg[gratis.userId]).toBe('gratis')
    expect(seg[nada.userId]).toBe('sem-plano')

    for (const [s, who] of [
      ['ecossistema', eco.userId],
      ['avulso', avulso.userId],
      ['gratis', gratis.userId],
      ['sem-plano', nada.userId],
    ] as const) {
      const r = await sys(async (tx) => listPeople(tx, filter({ q: tag, seg: s })))
      expect(
        r.rows.map((x) => x.id),
        s,
      ).toEqual([who])
      expect(r.matched).toBe(1)
    }
    // Outros testes rodam no mesmo banco: só dá para garantir o que este teste moveu.
    expect(after.todas).toBeGreaterThanOrEqual(before.todas)
    expect(after.ecossistema).toBeGreaterThanOrEqual(before.ecossistema + 1)
    expect(after.avulso).toBeGreaterThanOrEqual(before.avulso + 1)
    expect(after.todas).toBe(after.ecossistema + after.avulso + after.gratis + after['sem-plano'])
    expect(peopleFilterQuery(filter({ seg: 'avulso', pagina: '2' }))).toBe('seg=avulso&pagina=2')
  })

  it('online: sessão do HUB usada há pouco ou app renovando o token; parado há 20 min não conta', async () => {
    const tag = randomBytes(3).toString('hex')
    const ativo = await newUser(db, `on-hub-${tag}`)
    const parado = await newUser(db, `on-parado-${tag}`)
    const app = await newUser(db, `on-app-${tag}`)
    await db.sql`update zro.sessions set last_used_at = now() - interval '20 minutes' where user_id = ${parado.userId}`
    await db.sql`update zro.sessions set last_used_at = now() - interval '2 hours' where user_id = ${app.userId}`
    const clientId = `on-${tag}`
    await db.sql`insert into zro.oauth_clients (id, name, product_id, kind, redirect_uris) values (${clientId}, 'App online', 'synquei', 'public', ${['http://127.0.0.1/cb']})`
    await db.sql`insert into zro.app_accounts (user_id, client_id, product_id, last_login_at) values (${app.userId}, ${clientId}, 'synquei', now() - interval '3 hours')`
    const before = await sys(async (tx) => onlineNow(tx))
    await db.sql`insert into zro.oauth_refresh_tokens (token_hash, family_id, client_id, user_id, scopes, auth_time, family_started_at, expires_at)
                 values (${randomBytes(16).toString('hex')}, gen_random_uuid(), ${clientId}, ${app.userId}, ${['openid']}, now(), now(), now() + interval '1 day')`
    const after = await sys(async (tx) => onlineNow(tx))
    expect(after.apps).toBeGreaterThanOrEqual(before.apps + 1)
    expect(after.total).toBeLessThanOrEqual(after.hub + after.apps)

    const r = await sys(async (tx) => listPeople(tx, filter({ q: tag })))
    const on = Object.fromEntries(r.rows.map((x) => [x.id, x.online]))
    expect(on).toEqual({ [ativo.userId]: true, [parado.userId]: false, [app.userId]: true })
    const only = await sys(async (tx) => listPeople(tx, filter({ q: tag, f: 'online' })))
    expect(only.rows.map((x) => x.id).sort()).toEqual([ativo.userId, app.userId].sort())
    // Último acesso conta o app (token renovado agora), não só o HUB.
    expect(r.rows.find((x) => x.id === app.userId)!.lastSeenAt!.getTime()).toBeGreaterThan(Date.now() - 60_000)
    const byProduct = await sys(async (tx) => listPeople(tx, filter({ q: tag, produto: 'synquei' })))
    expect(byProduct.rows.map((x) => x.id)).toEqual([app.userId])

    await sys(async (tx) => suspendUser(tx, { userId: await admin(db), reason: 'teste' }, ativo.userId))
    const susp = await sys(async (tx) => listPeople(tx, filter({ q: tag, f: 'online' })))
    expect(susp.rows.map((x) => x.id)).toEqual([app.userId])
  })

  it('arquivos: só o que a pessoa catalogou nos projetos do HUB (manifesto importado por ela)', async () => {
    const o = await newOrgWithOwner(db, 'arquivos')
    const outro = await newUser(db, 'arquivos-outro')
    const [p] = await db.sql`insert into zro.projects (org_id, title, created_by) values (${o.orgId}, 'Projeto', ${o.userId}) returning id`
    const [m] = await db.sql`insert into zro.media_manifests (org_id, project_id, manifest_id, schema_version, source_app, status, payload, imported_by)
      values (${o.orgId}, ${p!.id as string}, ${'m-' + randomBytes(4).toString('hex')}, '1', 'sobedesce', 'valid', '{}', ${o.userId}) returning id`
    for (const [k, size] of [
      ['a', 1_500_000_000],
      ['b', 500_000_000],
    ] as const) {
      await db.sql`insert into zro.project_assets (org_id, project_id, asset_key, manifest_row_id, original_name, relative_path, size_bytes)
        values (${o.orgId}, ${p!.id as string}, ${k}, ${m!.id as string}, ${k + '.mov'}, ${k + '.mov'}, ${size})`
    }
    const d = (await sys(async (tx) => personDetail(tx, o.userId)))!
    expect(d.person.files).toEqual({ count: 2, bytes: 2_000_000_000 })
    const x = (await sys(async (tx) => personDetail(tx, outro.userId)))!
    expect(x.person.files).toEqual({ count: 0, bytes: 0 })
    const ov = await sys(async (tx) => consoleOverview(tx))
    expect(ov.files.count).toBeGreaterThanOrEqual(2)
    expect(ov.files.bytes).toBeGreaterThanOrEqual(2_000_000_000)
  })

  it('páginas: 2 por página, a terceira pessoa vai para a página 2', async () => {
    const tag = randomBytes(3).toString('hex')
    for (const i of [1, 2, 3]) await newUser(db, `pag-${i}-${tag}`)
    const p1 = await sys(async (tx) => listPeople(tx, filter({ q: tag, o: 'nome' }), 2))
    expect(p1.rows).toHaveLength(2)
    expect([p1.matched, p1.pages, p1.page]).toEqual([3, 2, 1])
    const p2 = await sys(async (tx) => listPeople(tx, filter({ q: tag, o: 'nome', pagina: '2' }), 2))
    expect(p2.rows.map((r) => r.email)).toEqual([expect.stringContaining('pag-3')])
    const p9 = await sys(async (tx) => listPeople(tx, filter({ q: tag, pagina: '9' }), 2))
    expect([p9.rows.length, p9.matched, p9.pages]).toEqual([0, 3, 2])
  })

  it('visão geral: pessoas por plano e por produto, créditos de IA e série de 30 dias', async () => {
    const o = await newOrgWithOwner(db, 'visao', { freePlan: true })
    const before = await sys(async (tx) => consoleOverview(tx))
    await db.sql`insert into zro.usage_events (org_id, user_id, metric, amount, idempotency_key, period_start)
                 values (${o.orgId}, ${o.userId}, 'zro.ai_credits', 7, ${'visao-' + randomBytes(4).toString('hex')}, date_trunc('month', now()))`
    const after = await sys(async (tx) => consoleOverview(tx))
    expect(after.series).toHaveLength(30)
    expect(after.ai.credits30).toBe(before.ai.credits30 + 7)
    expect(after.series.at(-1)!.aiCredits).toBeGreaterThanOrEqual(7)
    expect(after.plans.find((p) => p.name === 'Conta Absolute ZRO')!.people).toBeGreaterThanOrEqual(1)
    expect(after.products.map((p) => p.id)).toContain('synquei')
    expect(after.segments.todas).toBeGreaterThanOrEqual(after.accounts)
    expect(after.online.total).toBeGreaterThanOrEqual(1) // a sessão recém-criada conta
  })
})
