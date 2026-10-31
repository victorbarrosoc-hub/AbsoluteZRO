// A Sede da guilda do Carro do Freela (migration 0044, fase 2 do lançamento): a FUNDAÇÃO (uma vez, só quem funda paga)
// e o pacote de +15 lugares, no molde do "Espaço extra na guilda" (0043). Os dois nascem em RASCUNHO (fora da vitrine,
// do checkout e do pedido de plano; o HUB recusa conceder) e só valem como sinal no entitlement do Carro, sem dar acesso
// ao Carro por si só. Lacuna honesta: o catálogo não tem cobrança única, então a fundação fica com billing_interval
// null ("a definir") e nada a vende. Rodar a migration de novo não muda nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { featureFlagsFor, productAccessFor } from '@zro/billing'
import { loadOidcClaims, requestPlanChange } from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { giveLimits, givePlan, newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)
const MIGRATION = readFileSync(new URL('../../infra/migrations/0044_carro_sede_planos.sql', import.meta.url), 'utf8')
const PLANOS = {
  'carro-guilda-fundacao': { sinal: 'carro-do-freela.guilda_fundacao', limite: 1 },
  'carro-guilda-espaco-extra-15': { sinal: 'carro-do-freela.guilda_espaco_extra_15', limite: 15 },
} as const
const CODIGOS = Object.keys(PLANOS)

const contar = async () => {
  const [r] = await db.sql`
    select (select count(*) from zro.plans where code = any(${CODIGOS}))::int as planos,
           (select count(*) from zro.plan_products pp join zro.plans p on p.id = pp.plan_id where p.code = any(${CODIGOS}))::int as linhas,
           (select count(*) from zro.product_features where product_id = 'carro-do-freela' and feature_key in ('guilda_fundacao', 'guilda_espaco_extra_15'))::int as recursos`
  return r!
}

describe('A Sede da guilda: fundação e +15 lugares (0044)', () => {
  it('a fundação existe como RASCUNHO: R$ 189, sem periodicidade (cobrança única ainda não existe no HUB), só sinal no Carro', async () => {
    const [p] =
      await db.sql`select name, kind, status, price_cents, currency, billing_interval, description from zro.plans where code = 'carro-guilda-fundacao'`
    expect(p).toMatchObject({ name: 'Fundação da sede', kind: 'individual', status: 'draft', price_cents: 18900, currency: 'BRL', billing_interval: null })
    expect(p!.description).toMatch(/uma vez/)
    const [x] = await db.sql`select name, status, price_cents, billing_interval from zro.plans where code = 'carro-guilda-espaco-extra-15'`
    expect(x).toMatchObject({ name: 'Mais 15 lugares na guilda', status: 'draft', price_cents: 3490, billing_interval: 'month' })
    for (const [code, { sinal, limite }] of Object.entries(PLANOS)) {
      const rows =
        await db.sql`select pp.product_id, pp.features, pp.limits from zro.plan_products pp join zro.plans p on p.id = pp.plan_id where p.code = ${code}`
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ product_id: 'carro-do-freela', features: [], limits: { [sinal]: limite } })
    }
  })

  it('rascunho não é vendido nem pedido: fora dos planos ativos, o HUB recusa conceder e o pedido de plano recusa', async () => {
    const ativos = await db.sql`select code from zro.plans where status = 'active'`
    for (const c of CODIGOS) expect(ativos.map((r) => r.code)).not.toContain(c)
    const o = await newOrgWithOwner(db, 'sede-rascunho', { freePlan: true })
    for (const c of CODIGOS) await expect(givePlan(db, o.orgId, c)).rejects.toThrow(/Só planos ativos/)
    const [p] = await db.sql`select id from zro.plans where code = 'carro-guilda-fundacao'`
    await expect(requestPlanChange(db, o.auth, { kind: 'upgrade', planId: p!.id as string })).rejects.toThrow(/plano disponível/)
    const flags = await sys((tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))
    for (const { sinal } of Object.values(PLANOS)) expect(flags).not.toContain(sinal)
  })

  it('o sinal chega ao app pela claim zro_features quando o titular concede (o mesmo caminho do console)', async () => {
    const o = await newOrgWithOwner(db, 'sede-sinal', { freePlan: true })
    await giveLimits(db, o.orgId, 'carro-do-freela', { 'carro-do-freela.guilda_fundacao': 1, 'carro-do-freela.guilda_espaco_extra_15': 15 })
    const claims = await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    expect(claims.features).toContain('carro-do-freela.guilda_fundacao')
    expect(claims.features).toContain('carro-do-freela.guilda_espaco_extra_15')
    const acesso = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    expect(acesso.find((a) => a.productId === 'carro-do-freela')).toMatchObject({ access: 'contracted' })
  })

  it('idempotente: aplicar a 0044 de novo não cria plano, linha nem recurso', async () => {
    const antes = await contar()
    expect(antes).toEqual({ planos: 2, linhas: 2, recursos: 2 })
    await db.sql.unsafe(MIGRATION)
    await db.sql.unsafe(MIGRATION)
    expect(await contar()).toEqual(antes)
  })
})
