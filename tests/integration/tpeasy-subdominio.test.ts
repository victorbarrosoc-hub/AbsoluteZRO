// TPeasy em tpeasy.absolutezro.com (migration 0045): o catálogo abre o subdomínio (já pelo login único) e o cliente
// `tpeasy-web` ganha o retorno novo sem perder o antigo (tpeasy.vercel.app continua valendo). Rodar de novo não muda nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const MIGRATION = readFileSync(new URL('../../infra/migrations/0045_tpeasy_subdominio.sql', import.meta.url), 'utf8')
const ANTIGO = 'https://tpeasy.vercel.app/api/zro/callback'
const NOVO = 'https://tpeasy.absolutezro.com/api/zro/callback'

describe('TPeasy no subdomínio da Absolute ZRO (0045)', () => {
  it('catálogo: Abrir vai para tpeasy.absolutezro.com, pelo início do login único', async () => {
    const [p] = await db.sql`select external_url, sso_start_url from zro.products where id = 'tpeasy'`
    expect(p).toEqual({ external_url: 'https://tpeasy.absolutezro.com', sso_start_url: 'https://tpeasy.absolutezro.com/api/zro/entrar' })
  })

  it('cliente tpeasy-web: acrescenta o retorno do subdomínio, mantém o antigo e não duplica', async () => {
    // o cliente é cadastrado pelo console; no banco de teste ele nasce aqui, como estava antes da 0045
    await db.sql`delete from zro.oauth_clients where id = 'tpeasy-web'`
    await db.sql`insert into zro.oauth_clients (id, name, product_id, kind, redirect_uris)
                 values ('tpeasy-web', 'TPeasy', 'tpeasy', 'public', ${[ANTIGO]})`
    await db.sql.unsafe(MIGRATION)
    await db.sql.unsafe(MIGRATION)
    const [c] = await db.sql`select redirect_uris from zro.oauth_clients where id = 'tpeasy-web'`
    expect(c!.redirect_uris).toEqual([ANTIGO, NOVO])
    const [p] = await db.sql`select external_url from zro.products where id = 'tpeasy'`
    expect(p!.external_url).toBe('https://tpeasy.absolutezro.com')
    await db.sql`delete from zro.oauth_clients where id = 'tpeasy-web'`
  })

  it('sem o cliente cadastrado, a migração não cria nada', async () => {
    await db.sql.unsafe(MIGRATION)
    const r = await db.sql`select id from zro.oauth_clients where id = 'tpeasy-web'`
    expect(r).toHaveLength(0)
  })
})
