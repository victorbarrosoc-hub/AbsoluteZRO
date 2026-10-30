// App de computador do Relay e do Carro do Freela (migration 0042, pedido do titular, 30/10/2026): abre os canais `desktop` e
// `download` só para esses dois produtos, sem mexer em estado, web, api, sso nem no Maestro; idempotente e sem auditoria nova.
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
const MIGRATION = readFileSync(new URL('../../infra/migrations/0042_relay_carro_desktop.sql', import.meta.url), 'utf8')

describe('app de computador do Relay e do Carro do Freela (0042)', () => {
  it('desktop e download abertos só para os dois; o resto do gate fica como estava e o Maestro continua sem o computador', async () => {
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    expect(s.relay).toMatchObject({ state: 'released', open: true, channels: { web: true, desktop: true, api: false, download: true, sso: false } })
    expect(s['carro-do-freela']).toMatchObject({ state: 'released', open: true, channels: { web: true, desktop: true, api: true, download: true, sso: true } })
    expect(s.maestro!.channels).toMatchObject({ desktop: false, download: false })
    for (const id of ['ai-edit', 'finishing', 'nossom']) expect(s[id]!.open, id).toBe(false)
    // continuam divulgados (a página pública /baixar lista pelo gate)
    for (const id of ['relay', 'carro-do-freela']) expect(divulgado({ state: s[id]!.state, canais: s[id]!.channels }), id).toBe(true)
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
