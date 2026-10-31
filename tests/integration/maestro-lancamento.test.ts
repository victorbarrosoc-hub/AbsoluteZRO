// Lançamento do Maestro (migration 0027, ADR 0027; fora do Beta na 0039, titular 30/10/2026): o gate abre para
// qualquer conta na web, na API e no login único; o grátis, o Completo e o Pro trazem o Maestro inteiro; o sinal da
// marca própria nunca vem do grátis; e rodar as migrations de novo não duplica nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkEntitlement, featureFlagsFor, productAccessFor, releaseAllows, releaseState } from '@zro/billing'
import { authorize, loadOidcClaims } from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { givePlan, newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)
const MIGRATION = readFileSync(new URL('../../infra/migrations/0027_maestro_lancamento.sql', import.meta.url), 'utf8')
const NO_AR = readFileSync(new URL('../../infra/migrations/0039_maestro_relay_no_ar.sql', import.meta.url), 'utf8')
const CANAIS = ['web', 'desktop', 'api', 'download', 'sso'] as const

describe('Maestro no ar (0027 + 0039)', () => {
  it('catálogo e gate: active, endereço público, released com web, api e sso abertos a qualquer um (computador e download ficam para depois)', async () => {
    const [p] = await db.sql`select stage, external_url, sso_start_url, description from zro.products where id = 'maestro'`
    expect(p).toMatchObject({
      stage: 'active',
      external_url: 'https://maestro.absolutezro.com',
      sso_start_url: 'https://maestro.absolutezro.com/api/zro/entrar',
    })
    expect(p!.description).toMatch(/^A gestão da sua produtora/)
    expect(p!.description).not.toMatch(/desenvolvimento|fechado/i)
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s.maestro).toMatchObject({ state: 'released', open: true, channels: { web: true, desktop: false, api: true, download: false, sso: true } })
    // o Relay também está no ar: site e, desde a 0042, o app de computador (sem API nem login único)
    const [r] = await db.sql`select stage from zro.products where id = 'relay'`
    expect(r).toMatchObject({ stage: 'active' })
    expect(s.relay).toMatchObject({ state: 'released', open: true, channels: { web: true, desktop: true, api: false, download: true, sso: false } })
    for (const ch of CANAIS) expect(await sys((tx) => releaseAllows(tx, 'maestro', null, ch)), ch).toBe(ch !== 'desktop' && ch !== 'download')
  })

  it('conta comum, só com o grátis e fora de qualquer lista: contratada, autorizada e no login único', async () => {
    const o = await newOrgWithOwner(db, 'maestro-lanc', { freePlan: true })
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    expect(access.find((a) => a.productId === 'maestro')).toMatchObject({ access: 'contracted', stage: 'active' })
    await expect(authorize(db, o.auth, { product: { id: 'maestro' } })).resolves.toMatchObject({ orgId: o.orgId })
    const c = await sys((tx) => checkEntitlement(tx, o.orgId, 'maestro', null, { who: { userId: o.userId, channel: 'sso' } }))
    expect(c.ok).toBe(true)
    const claims = await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    expect(claims.products).toContain('maestro')
    expect(claims.release.maestro).toBe('released')
    // os fechados continuam fechados (o Carro do Freela abriu na 0041)
    for (const id of ['nossom', 'ai-edit', 'finishing']) expect(claims.release[id], id).toBe('closed')
  })

  it('marca própria: o grátis e o Completo não dão o sinal; só o Pro v2 (rascunho) e o adicional trazem', async () => {
    const o = await newOrgWithOwner(db, 'maestro-lanc-marca', { freePlan: true })
    expect(await sys((tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).toEqual([])
    await givePlan(db, o.orgId, 'ciclo-do-o')
    expect(await sys((tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).toEqual([])
    const rows = await db.sql`
      select p.code, p.version, p.status, p.kind, pp.features, pp.limits
      from zro.plans p join zro.plan_products pp on pp.plan_id = p.id and pp.product_id = 'maestro' order by p.code, p.version`
    const by = Object.fromEntries(rows.map((r) => [`${r.code}@${r.version}`, r]))
    for (const k of ['conta-absolute-zro@2', 'ciclo-do-o@2', 'ciclo-do-o-anual@1', 'absolute-zro-pro@1', 'absolute-zro-pro-anual@1']) {
      expect(by[k], k).toMatchObject({ status: 'active', features: null })
      expect(by[k]!.limits, k).not.toHaveProperty(['maestro.marca_propria'])
      expect(Object.keys(by[k]!.limits as object), k).toEqual(['zro.ai_credits'])
    }
    expect(by['conta-absolute-zro@2']!.limits).toEqual({ 'zro.ai_credits': 50 })
    for (const k of ['absolute-zro-pro@2', 'absolute-zro-pro-anual@2']) {
      expect(by[k], k).toMatchObject({ status: 'draft', features: null, limits: { 'zro.ai_credits': 2000, 'maestro.marca_propria': 1 } })
    }
    for (const k of ['maestro-marca-propria@1', 'maestro-marca-propria-anual@1']) {
      expect(by[k], k).toMatchObject({ status: 'draft', features: [], limits: { 'maestro.marca_propria': 1 } })
    }
    // nenhum plano aposentado ou rascunho de outra coisa ganhou o Maestro
    expect(Object.keys(by).sort()).toEqual(
      [
        'absolute-zro-pro-anual@1',
        'absolute-zro-pro-anual@2',
        'absolute-zro-pro@1',
        'absolute-zro-pro@2',
        'ciclo-do-o-anual@1',
        'ciclo-do-o@2',
        'conta-absolute-zro@2',
        'maestro-marca-propria-anual@1',
        'maestro-marca-propria@1',
      ].sort(),
    )
  })

  it('backfill idempotente: conta de antes do lançamento ganha o Maestro uma vez; rodar a 0027 e a 0039 de novo não muda nada', async () => {
    const o = await newOrgWithOwner(db, 'maestro-lanc-antiga', { freePlan: true })
    // como uma conta criada antes da 0027: sem o entitlement do Maestro
    await sys((tx) => tx`delete from zro.entitlements where org_id = ${o.orgId} and product_id = 'maestro'`)
    const contar = async () => {
      const [r] = await db.sql`
        select (select count(*) from zro.entitlements where org_id = ${o.orgId} and product_id = 'maestro' and status = 'active')::int as ents,
               (select count(*) from zro.plan_products where product_id = 'maestro')::int as linhas,
               (select count(*) from zro.audit_logs where target_type = 'product' and target_id = 'maestro')::int as auditoria`
      return r!
    }
    const antes = await contar()
    expect(antes.ents).toBe(0)
    // na ordem do runner: a 0027 (volta ao Beta da época) e depois a 0039 (no ar)
    await db.sql.unsafe(MIGRATION)
    await db.sql.unsafe(NO_AR)
    const depois = await contar()
    // a ida e volta do estado deixa duas linhas de auditoria (0027 e 0039); o resto, só o entitlement novo
    expect(depois).toEqual({ ...antes, ents: 1, auditoria: antes.auditoria + 2 })
    const [p] = await db.sql`select stage from zro.products where id = 'maestro'`
    expect(p).toMatchObject({ stage: 'active' })
    // a 0039 sozinha, de novo: nada muda, nem auditoria
    await db.sql.unsafe(NO_AR)
    expect(await contar()).toEqual(depois)
    const [e] = await db.sql`select features, limits, source from zro.entitlements where org_id = ${o.orgId} and product_id = 'maestro' and status = 'active'`
    expect(e).toMatchObject({ features: null, limits: { 'zro.ai_credits': 50 }, source: 'subscription' })
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s.maestro).toMatchObject({ state: 'released', open: true })
  })
})
