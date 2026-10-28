// 0020: o plano grátis traz 50 créditos de IA por mês (decisão do titular, 28/10/2026).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

describe('créditos de IA no plano grátis', () => {
  it('conta nova no grátis nasce com 50 créditos de IA por mês', async () => {
    const o = await newOrgWithOwner(db, 'creditos-gratis', { freePlan: true })
    const [r] = await db.asSystem(
      'teste',
      (tx) => tx`
      select max((e.limits ->> 'zro.ai_credits')::bigint)::int as lim
      from zro.entitlements e where e.org_id = ${o.orgId} and e.status = 'active'`,
    )
    expect(r?.lim).toBe(50)
  })
})
