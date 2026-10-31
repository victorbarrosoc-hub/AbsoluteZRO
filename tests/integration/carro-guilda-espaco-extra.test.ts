// "Espaço extra na guilda" (migration 0043, fase 2 do lançamento): adicional individual do Carro do Freela, +5 vagas na
// guilda de quem assina, no molde do "Maestro com a sua marca" (0025). Nasce em RASCUNHO (não é vendido, fora da vitrine
// e do checkout) e só vale como sinal `carro-do-freela.guilda_espaco_extra` no entitlement do Carro; o adicional sozinho
// não dá acesso ao Carro. Rodar a migration de novo não muda nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { featureFlagsFor, productAccessFor } from '@zro/billing'
import { loadOidcClaims } from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { giveLimits, givePlan, newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)
const MIGRATION = readFileSync(new URL('../../infra/migrations/0043_carro_guilda_espaco_extra.sql', import.meta.url), 'utf8')
const SINAL = 'carro-do-freela.guilda_espaco_extra'
const CODIGO = 'carro-guilda-espaco-extra'

const contar = async () => {
  const [r] = await db.sql`
    select (select count(*) from zro.plans where code = ${CODIGO})::int as planos,
           (select count(*) from zro.plan_products pp join zro.plans p on p.id = pp.plan_id where p.code = ${CODIGO})::int as linhas,
           (select count(*) from zro.product_features where product_id = 'carro-do-freela' and feature_key = 'guilda_espaco_extra')::int as recursos`
  return r!
}

describe('Espaço extra na guilda (0043)', () => {
  it('o plano existe como RASCUNHO: adicional individual, R$ 14,90/mês, +5 vagas só no Carro, sem ferramenta', async () => {
    const [p] =
      await db.sql`select code, version, name, kind, status, price_cents, currency, billing_interval, trial_days from zro.plans where code = ${CODIGO}`
    expect(p).toMatchObject({
      version: 1,
      name: 'Espaço extra na guilda',
      kind: 'individual',
      status: 'draft',
      price_cents: 1490,
      currency: 'BRL',
      billing_interval: 'month',
      trial_days: 0,
    })
    const rows =
      await db.sql`select pp.product_id, pp.features, pp.limits from zro.plan_products pp join zro.plans p on p.id = pp.plan_id where p.code = ${CODIGO}`
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ product_id: 'carro-do-freela', features: [], limits: { [SINAL]: 5 } })
    const [f] = await db.sql`select metric from zro.product_features where product_id = 'carro-do-freela' and feature_key = 'guilda_espaco_extra'`
    expect(f).toMatchObject({ metric: null })
  })

  it('rascunho não é vendido: fora da vitrine (planos ativos) e do checkout', async () => {
    const ativos = await db.sql`select code from zro.plans where status = 'active'`
    expect(ativos.map((r) => r.code)).not.toContain(CODIGO)
    const publicados = await db.sql`select p.code from zro.plans p where p.status <> 'draft' and p.code = ${CODIGO}`
    expect(publicados).toHaveLength(0)
  })

  it('o HUB se recusa a conceder o rascunho como plano: só planos ativos são vendidos ou concedidos', async () => {
    const o = await newOrgWithOwner(db, 'guilda-extra-rascunho', { freePlan: true })
    await expect(givePlan(db, o.orgId, CODIGO)).rejects.toThrow(/Só planos ativos/)
    expect(await sys((tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).not.toContain(SINAL)
  })

  it('o sinal chega ao app pela claim zro_features quando o titular concede (o mesmo caminho do console); o grátis não o traz', async () => {
    const o = await newOrgWithOwner(db, 'guilda-extra', { freePlan: true })
    expect(await sys((tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).not.toContain(SINAL)
    expect((await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))).features).not.toContain(SINAL)
    await giveLimits(db, o.orgId, 'carro-do-freela', { [SINAL]: 5 })
    expect(await sys((tx) => featureFlagsFor(tx, o.orgId, { userId: o.userId }))).toContain(SINAL)
    expect((await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))).features).toContain(SINAL)
    const acesso = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    expect(acesso.find((a) => a.productId === 'carro-do-freela')).toMatchObject({ access: 'contracted' })
  })

  it('idempotente: aplicar a 0043 de novo não cria plano, linha nem recurso', async () => {
    const antes = await contar()
    expect(antes).toEqual({ planos: 1, linhas: 1, recursos: 1 })
    await db.sql.unsafe(MIGRATION)
    await db.sql.unsafe(MIGRATION)
    expect(await contar()).toEqual(antes)
  })
})
