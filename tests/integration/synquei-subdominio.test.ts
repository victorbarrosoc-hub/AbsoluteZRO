// Synquei em synquei.absolutezro.com (migration 0051): o catálogo abre o subdomínio (já pelo login único) e o cliente
// `synquei-web` ganha o retorno novo sem perder o antigo (o app do celular instalado em synquei.vercel.app continua
// entrando). O cliente do computador (`synquei-desktop`) não muda. Rodar de novo não muda nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const MIGRATION = readFileSync(new URL('../../infra/migrations/0051_synquei_subdominio.sql', import.meta.url), 'utf8')
const ANTIGO = 'https://synquei.vercel.app/api/zro/callback'
const NOVO = 'https://synquei.absolutezro.com/api/zro/callback'

describe('Synquei no subdomínio da Absolute ZRO (0051)', () => {
  it('catálogo: Abrir vai para synquei.absolutezro.com, pelo início do login único', async () => {
    const [p] = await db.sql`select external_url, sso_start_url from zro.products where id = 'synquei'`
    expect(p).toEqual({ external_url: 'https://synquei.absolutezro.com', sso_start_url: 'https://synquei.absolutezro.com/api/zro/entrar' })
  })

  it('cliente synquei-web: acrescenta o retorno do subdomínio, mantém o antigo e não duplica; o do computador não muda', async () => {
    // os clientes são cadastrados pelo console; no banco de teste eles nascem aqui, como estavam antes da 0051
    await db.sql`delete from zro.oauth_clients where id in ('synquei-web', 'synquei-desktop')`
    await db.sql`insert into zro.oauth_clients (id, name, product_id, kind, redirect_uris)
                 values ('synquei-web', 'Synquei', 'synquei', 'public', ${[ANTIGO]}),
                        ('synquei-desktop', 'Synquei no computador', 'synquei', 'public', ${['http://127.0.0.1/callback']})`
    await db.sql.unsafe(MIGRATION)
    await db.sql.unsafe(MIGRATION)
    const [c] = await db.sql`select redirect_uris from zro.oauth_clients where id = 'synquei-web'`
    expect(c!.redirect_uris).toEqual([ANTIGO, NOVO])
    const [d] = await db.sql`select redirect_uris from zro.oauth_clients where id = 'synquei-desktop'`
    expect(d!.redirect_uris).toEqual(['http://127.0.0.1/callback'])
    await db.sql`delete from zro.oauth_clients where id in ('synquei-web', 'synquei-desktop')`
  })

  it('sem o cliente cadastrado, a migração não cria nada', async () => {
    await db.sql.unsafe(MIGRATION)
    const r = await db.sql`select id from zro.oauth_clients where id = 'synquei-web'`
    expect(r).toHaveLength(0)
  })
})
