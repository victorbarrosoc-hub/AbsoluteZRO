// Sons originais da Absolute ZRO (migração 0049): o banco padrão da aba Sons. Catálogo por categoria com as versões (a
// melhor primeiro), o arquivo de cada versão, só com conta; leitura para todo o papel zro_app e escrita só do sistema.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { Authenticated } from '@zro/auth'
import { baixarSomZro, listarSonsZro } from '@zro/core'
import { PG, pgErrorCode, type Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newOrgWithOwner } from './helpers'

let db: Database
let pessoa: Authenticated
let ctx: { userId: string; orgId: string }
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

beforeAll(async () => {
  db = testDatabase()
  const o = await newOrgWithOwner(db, 'sons-zro')
  ctx = { userId: o.userId, orgId: o.orgId }
  pessoa = { user: { id: o.userId }, session: { activeOrgId: o.orgId } } as unknown as Authenticated
  await db.sql`delete from zro.sons_zro where som in ('teste-boom-grave', 'teste-whoosh-curto')`
  const linhas = [
    ['teste-boom-grave-v1', 'teste-boom-grave', 'Impactos', 2, 'Boom grave', 1, false, 2.5, Buffer.from([1, 2, 3])],
    ['teste-boom-grave-v2', 'teste-boom-grave', 'Impactos', 2, 'Boom grave', 2, true, 1.8, Buffer.from([4, 5])],
    ['teste-whoosh-curto-v1', 'teste-whoosh-curto', 'Whooshes e Transições', 1, 'Whoosh curto', 1, true, null, Buffer.from([6])],
  ] as const
  for (const [id, som, categoria, ordem, titulo, versao, melhor, duracao, audio] of linhas)
    await db.sql`insert into zro.sons_zro (id, som, categoria, ordem, titulo, versao, melhor, duracao, audio, sha256)
                 values (${id}, ${som}, ${categoria}, ${ordem}, ${titulo}, ${versao}, ${melhor}, ${duracao}, ${audio}, ${sha(audio)})`
})
afterAll(async () => {
  await db.sql`delete from zro.sons_zro where som in ('teste-boom-grave', 'teste-whoosh-curto')`
  await db.close()
})

describe('sons originais da Absolute ZRO', () => {
  it('catálogo: categorias na ordem do pack e cada som com as versões, a melhor primeiro, sem o áudio', async () => {
    const r = await listarSonsZro(db, pessoa)
    const meus = r.sons.filter((s) => s.id.startsWith('teste-'))
    expect(meus).toEqual([
      {
        id: 'teste-whoosh-curto',
        origem: 'zro',
        titulo: 'Whoosh curto',
        categoria: 'Whooshes e Transições',
        versoes: [{ id: 'teste-whoosh-curto-v1', versao: 1, duracao: null, bytes: 1, formato: 'mp3', melhor: true }],
      },
      {
        id: 'teste-boom-grave',
        origem: 'zro',
        titulo: 'Boom grave',
        categoria: 'Impactos',
        versoes: [
          { id: 'teste-boom-grave-v2', versao: 2, duracao: 1.8, bytes: 2, formato: 'mp3', melhor: true },
          { id: 'teste-boom-grave-v1', versao: 1, duracao: 2.5, bytes: 3, formato: 'mp3', melhor: false },
        ],
      },
    ])
    const nomes = r.categorias.map((c) => c.nome)
    expect(nomes.indexOf('Whooshes e Transições')).toBeLessThan(nomes.indexOf('Impactos'))
    expect(JSON.stringify(r)).not.toContain('audio')
  })

  it('arquivo: os bytes com o tipo, o id e a ETag; id inválido ou que não existe é recusado', async () => {
    const r = await baixarSomZro(db, pessoa, 'teste-boom-grave-v2')
    expect(r.headers.get('content-type')).toBe('audio/mpeg')
    expect(r.headers.get('x-zro-som-id')).toBe('teste-boom-grave-v2')
    expect(decodeURIComponent(r.headers.get('x-zro-som-titulo')!)).toBe('Boom grave 2')
    expect(r.headers.get('etag')).toBe(`"${sha(Buffer.from([4, 5]))}"`)
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([4, 5]))
    await expect(baixarSomZro(db, pessoa, '../x')).rejects.toMatchObject({ status: 422 })
    await expect(baixarSomZro(db, pessoa, 'nao-existe-v9')).rejects.toMatchObject({ status: 404 })
  })

  it('sem conta: 401 antes de ler o banco', async () => {
    await expect(listarSonsZro(db, null)).rejects.toMatchObject({ status: 401 })
    await expect(baixarSomZro(db, null, 'teste-boom-grave-v2')).rejects.toMatchObject({ status: 401 })
  })

  it('RLS: o papel zro_app lê, mas não escreve nem apaga', async () => {
    const [l] = await db.asUser(ctx, (tx) => tx`select count(*)::int as n from zro.sons_zro where som = 'teste-boom-grave'`)
    expect(l!.n).toBe(2)
    const escrita = await db.asUser(ctx, (tx) => tx`update zro.sons_zro set titulo = 'x' where som = 'teste-boom-grave'`).catch((e) => e)
    expect(pgErrorCode(escrita)).toBe(PG.insufficientPrivilege)
    const apagar = await db.asUser(ctx, (tx) => tx`delete from zro.sons_zro where som = 'teste-boom-grave'`).catch((e) => e)
    expect(pgErrorCode(apagar)).toBe(PG.insufficientPrivilege)
    const inserir = await db
      .asUser(
        ctx,
        (tx) =>
          tx`insert into zro.sons_zro (id, som, categoria, ordem, titulo, versao, audio, sha256) values ('a-b-c', 'a-b', 'x', 1, 'x', 1, '\\x01', ${'0'.repeat(64)})`,
      )
      .catch((e) => e)
    expect(pgErrorCode(inserir)).toBe(PG.insufficientPrivilege)
  })
})
