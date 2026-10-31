// Lançamento do Carro do Freela (migration 0041; checklist em docs/operations/lancamento-carro.md): o gate abre para
// qualquer conta na web, na API e no login único (app de computador e download abriram na 0042); o catálogo sai do Beta e vai
// para o subdomínio; os planos não mudam (o Carro já estava no grátis, no Completo, no Pro e nos avulsos); a página
// pública passa a divulgar; e rodar a migration de novo não duplica nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkEntitlement, productAccessFor, releaseAllows, releaseState } from '@zro/billing'
import { authorize, loadOidcClaims } from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { divulgado } from '../../apps/hub-web/lib/divulgacao'
import { newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)
const MIGRATION = readFileSync(new URL('../../infra/migrations/0041_carro_lancamento.sql', import.meta.url), 'utf8')
const DESKTOP = readFileSync(new URL('../../infra/migrations/0042_relay_carro_desktop.sql', import.meta.url), 'utf8')
const CANAIS = ['web', 'desktop', 'api', 'download', 'sso'] as const
const ID = 'carro-do-freela'

describe('Carro do Freela no ar (0041)', () => {
  it('catálogo e gate: active, no subdomínio, released com web, api e sso abertos a qualquer um; computador e download fechados', async () => {
    const [p] = await db.sql`select stage, external_url, sso_start_url, description from zro.products where id = ${ID}`
    expect(p).toMatchObject({
      stage: 'active',
      external_url: 'https://carro.absolutezro.com',
      sso_start_url: 'https://carro.absolutezro.com/api/zro/entrar',
    })
    expect(p!.description).toMatch(/^A agenda do audiovisual/)
    expect(p!.description).not.toMatch(/protótipo|simulad|beta|grátis|de graça/i)
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s[ID]).toMatchObject({ state: 'released', open: true, channels: { web: true, desktop: true, api: true, download: true, sso: true } })
    // desktop e download abriram na 0042 (app de computador); a 0041 sozinha os deixava fechados
    for (const ch of CANAIS) expect(await sys((tx) => releaseAllows(tx, ID, null, ch)), ch).toBe(true)
    expect(divulgado({ state: s[ID]!.state, canais: s[ID]!.channels })).toBe(true)
  })

  it('planos: o mesmo modelo do Maestro e do Relay — o grátis vigente, o Completo, o Pro e os avulsos trazem o Carro inteiro', async () => {
    const rows = await db.sql`
      select p.code, p.version, p.status, pp.features, pp.limits
      from zro.plans p join zro.plan_products pp on pp.plan_id = p.id and pp.product_id = ${ID}
      where p.status = 'active' order by p.code, p.version`
    const by = Object.fromEntries(rows.map((r) => [`${r.code}@${r.version}`, r]))
    for (const k of [
      'conta-absolute-zro@2',
      'ciclo-do-o@2',
      'ciclo-do-o-anual@1',
      'absolute-zro-pro@1',
      'absolute-zro-pro-anual@1',
      'individual-carro-do-freela@2',
      'individual-carro-do-freela-anual@1',
    ]) {
      expect(by[k], k).toBeDefined()
      expect(by[k]!.features, k).toBeNull()
    }
    expect((by['conta-absolute-zro@2']!.limits as Record<string, number>)['zro.ai_credits']).toBe(50)
  })

  it('conta comum, só com o grátis e fora de qualquer lista: contratada, autorizada e no login único', async () => {
    const o = await newOrgWithOwner(db, 'carro-lanc', { freePlan: true })
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    expect(access.find((a) => a.productId === ID)).toMatchObject({ access: 'contracted', stage: 'active' })
    await expect(authorize(db, o.auth, { product: { id: ID } })).resolves.toMatchObject({ orgId: o.orgId })
    const c = await sys((tx) => checkEntitlement(tx, o.orgId, ID, null, { who: { userId: o.userId, channel: 'sso' } }))
    expect(c.ok).toBe(true)
    const claims = await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    expect(claims.products).toContain(ID)
    expect(claims.release[ID]).toBe('released')
    for (const id of ['nossom', 'finishing']) expect(claims.release[id], id).toBe('closed')
    // o AEON está no ar na web (0043)
    expect(claims.release['ai-edit']).toBe('released')
  })

  it('backfill idempotente: conta de antes do lançamento ganha o Carro uma vez; rodar a 0041 de novo não muda nada', async () => {
    const o = await newOrgWithOwner(db, 'carro-lanc-antiga', { freePlan: true })
    await sys((tx) => tx`delete from zro.entitlements where org_id = ${o.orgId} and product_id = ${ID}`)
    const contar = async () => {
      const [r] = await db.sql`
        select (select count(*) from zro.entitlements where org_id = ${o.orgId} and product_id = ${ID} and status = 'active')::int as ents,
               (select count(*) from zro.plan_products where product_id = ${ID})::int as linhas,
               (select count(*) from zro.audit_logs where target_type = 'product' and target_id = ${ID})::int as auditoria`
      return r!
    }
    const antes = await contar()
    expect(antes.ents).toBe(0)
    // na ordem do runner: a 0041 (que fecha o computador, como era no lançamento) e a 0042 (que o abre)
    await db.sql.unsafe(MIGRATION)
    await db.sql.unsafe(DESKTOP)
    const depois = await contar()
    expect(depois).toMatchObject({ ents: 1, linhas: antes.linhas })
    // a 0042 sozinha, de novo: nada muda, nem auditoria
    await db.sql.unsafe(DESKTOP)
    expect(await contar()).toEqual(depois)
    const [e] = await db.sql`select features, limits, source from zro.entitlements where org_id = ${o.orgId} and product_id = ${ID} and status = 'active'`
    expect(e).toMatchObject({ features: null, limits: { 'zro.ai_credits': 50 }, source: 'subscription' })
  })
})
