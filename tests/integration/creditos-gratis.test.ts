// 0020: o plano grátis trazia 50 créditos de IA por mês; desde a 0055 a conta nova nasce no Zero, com 10 mensagens da Z
// (quem já tinha os 50 continua com eles: planos-b.test.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newOrgWithOwner } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

describe('mensagens da Z no plano grátis', () => {
  it('conta nova no Zero nasce com 10 mensagens da Z por mês', async () => {
    const o = await newOrgWithOwner(db, 'creditos-gratis', { freePlan: true })
    const [r] = await db.asSystem(
      'teste',
      (tx) => tx`
      select max((e.limits ->> 'zro.ai_credits')::bigint)::int as lim
      from zro.entitlements e where e.org_id = ${o.orgId} and e.status = 'active'`,
    )
    expect(r?.lim).toBe(10)
  })
})
