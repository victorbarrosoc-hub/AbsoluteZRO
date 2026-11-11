// App de computador do RADION na central (migration 0064, titular, 07/11/2026): abre os canais `desktop` e `download` só
// para o `radio`, sem mexer no estado nem nos canais web, api e sso da 0062; idempotente e sem auditoria nova.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { releaseState, resetReleaseCache } from '@zro/billing'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { divulgado } from '../../apps/hub-web/lib/divulgacao'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(async () => {
  resetReleaseCache()
  await db.close()
})

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)
const MIGRATION = readFileSync(new URL('../../infra/migrations/0064_radion_computador.sql', import.meta.url), 'utf8')

describe('app de computador do RADION (0064)', () => {
  it('desktop e download abertos para o RADION, com web, api e sso como a 0062 deixou; os não lançados seguem fechados', async () => {
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s.radio).toMatchObject({ state: 'released', open: true, channels: { web: true, desktop: true, api: true, download: true, sso: true } })
    for (const id of ['finishing', 'nossom', 'rift-motion']) expect(s[id]!.open, id).toBe(false)
    expect(divulgado({ state: s.radio!.state, canais: s.radio!.channels })).toBe(true)
  })

  it('idempotente: rodar de novo não muda nada nem gera auditoria', async () => {
    const contar = async () => {
      const [r] = await db.sql`select (select count(*) from zro.audit_logs)::int as auditoria,
                                      (select count(*) from zro.product_release where desktop and download)::int as abertos`
      return r!
    }
    const antes = await contar()
    await db.sql.unsafe(MIGRATION)
    expect(await contar()).toEqual(antes)
  })
})
