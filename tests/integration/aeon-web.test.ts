// O AEON no ar na web (migration 0043; roteiro em docs/operations/lancamento-aeon.md): o gate abre para qualquer conta na
// web, na API e no login único, com o app de computador e o download ainda fechados; o catálogo descreve o editor de
// hoje; os planos não mudam (o AEON já estava no grátis, no Completo e no Pro); a página pública passa a divulgar; e
// rodar a migration de novo não duplica nada. Depois, a 0049 (titular, 01/11/2026) fechou o AEON de novo ao público:
// o catálogo e os planos ficam, o gate fecha (tests/integration/nao-lancados.test.ts cobre o resto).
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkEntitlement, productAccessFor, releaseAllows, releaseState, resetReleaseCache } from '@zro/billing'
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
const MIGRATION = readFileSync(new URL('../../infra/migrations/0043_aeon_web.sql', import.meta.url), 'utf8')
const FECHA = readFileSync(new URL('../../infra/migrations/0049_nao_lancados.sql', import.meta.url), 'utf8')
const ID = 'ai-edit'

describe('AEON no ar na web (0043)', () => {
  it('catálogo fica (active em aeon.absolutezro.com); o gate, depois da 0049, está fechado em todos os canais', async () => {
    const [p] = await db.sql`select stage, external_url, sso_start_url, description from zro.products where id = ${ID}`
    expect(p).toMatchObject({ stage: 'active', external_url: 'https://aeon.absolutezro.com', sso_start_url: 'https://aeon.absolutezro.com/api/zro/entrar' })
    expect(p!.description).toMatch(/^Editor de vídeo completo/)
    expect(p!.description).toMatch(/fluxo óptico/)
    expect(p!.description).not.toMatch(/em desenvolvimento|beta|protótipo/i)
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s[ID]).toMatchObject({ state: 'development', open: false, channels: { web: false, desktop: false, api: false, download: false, sso: false } })
    for (const ch of ['web', 'api', 'sso', 'desktop', 'download'] as const) expect(await sys((tx) => releaseAllows(tx, ID, null, ch)), ch).toBe(false)
    expect(divulgado({ state: s[ID]!.state, canais: s[ID]!.channels })).toBe(false)
  })

  it('planos: o grátis vigente, o Completo e o Pro trazem o AEON inteiro (nada muda nos planos)', async () => {
    const rows = await db.sql`
      select p.code, p.version from zro.plans p join zro.plan_products pp on pp.plan_id = p.id and pp.product_id = ${ID}
      where p.status = 'active' order by p.code, p.version`
    const codes = rows.map((r) => r.code)
    for (const c of ['conta-absolute-zro', 'ciclo-do-o', 'absolute-zro-pro']) expect(codes, c).toContain(c)
  })

  it('conta comum, só com o grátis e fora de qualquer lista: o AEON nem aparece, e o gate nega (0049)', async () => {
    const o = await newOrgWithOwner(db, 'aeon-web', { freePlan: true })
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    expect(access.find((a) => a.productId === ID)).toBeUndefined()
    await expect(authorize(db, o.auth, { product: { id: ID } })).rejects.toMatchObject({ code: 'product_closed' })
    const c = await sys((tx) => checkEntitlement(tx, o.orgId, ID, null, { who: { userId: o.userId, channel: 'sso' } }))
    expect(c.ok).toBe(false)
    const claims = await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    expect(claims.products).not.toContain(ID)
    for (const id of [ID, 'nossom', 'finishing']) expect(claims.release, id).not.toHaveProperty(id)
  })

  it('backfill idempotente: conta de antes do lançamento ganha o AEON uma vez; rodar a 0043 de novo não muda nada', async () => {
    const o = await newOrgWithOwner(db, 'aeon-web-antiga', { freePlan: true })
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
    await db.sql.unsafe(MIGRATION)
    const depois = await contar()
    expect(depois).toMatchObject({ ents: 1, linhas: antes.linhas })
    await db.sql.unsafe(MIGRATION)
    expect(await contar()).toEqual(depois)
    // a 0043 de novo reabriria o gate: a 0049 fecha de novo (e o banco volta ao estado de hoje para os outros testes)
    await db.sql.unsafe(FECHA)
    resetReleaseCache()
    expect((await sys((tx) => releaseState(tx, { fresh: true })))[ID]).toMatchObject({ state: 'development', open: false })
  })
})
