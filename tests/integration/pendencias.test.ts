// Balão do menu: só conta o que a pessoa pode resolver, na organização ativa e pelo papel (RLS).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pendencias } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newOrgWithOwner, newUser } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

describe('pendências do menu', () => {
  it('conta etapas que pedem revisão só da organização ativa, e o e-mail a confirmar', async () => {
    const o = await newOrgWithOwner(db, 'pend')
    const outra = await newOrgWithOwner(db, 'pend-outra')
    await db.asSystem('teste', async (tx) => {
      const [p] = await tx`insert into zro.projects (org_id, title, created_by) values (${o.orgId}, 'Clipe', ${o.userId}) returning id`
      await tx`insert into zro.project_steps (project_id, org_id, step_key, state) values (${p!.id}, ${o.orgId}, 'sobedesce', 'needs_review'), (${p!.id}, ${o.orgId}, 'synquei', 'failed')`
    })
    expect(await pendencias(db, o.auth)).toEqual({ '/projetos': 2 })
    expect(await pendencias(db, outra.auth)).toEqual({})
    const semEmail = await newUser(db, 'pend-email', { verified: false })
    expect((await pendencias(db, semEmail.auth))['/perfil']).toBe(1)
  })
})
