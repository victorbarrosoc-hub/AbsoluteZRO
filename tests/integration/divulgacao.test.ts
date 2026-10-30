// O que as páginas públicas divulgam (titular, 30/10/2026: "AEON, REVELA E NOSSOM não estão funcionando no ecossistema
// ainda, não pode divulgar … Quando for pro ar, aí divulga"; "Maestro e Relay no ar"). A regra sai do gate de
// lançamento (apps/hub-web/lib/divulgacao.ts), sem lista à mão: abrir o gate faz o produto aparecer sozinho.
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

async function divulgados() {
  const s = await sys((tx) => releaseState(tx, { fresh: true }))
  return Object.values(s)
    .filter((r) => divulgado({ state: r.state, canais: r.channels }))
    .map((r) => r.productId)
    .sort()
}

describe('divulgação nas páginas públicas', () => {
  it('só as ferramentas no ar: Maestro, SOBEDESCE, Synquei, TPeasy e Relay; AEON, Revela, NOSSOM e Carro do Freela fora', async () => {
    const ids = await divulgados()
    expect(ids).toEqual(expect.arrayContaining(['maestro', 'relay', 'sobedesce', 'synquei', 'tpeasy']))
    for (const id of ['ai-edit', 'finishing', 'nossom', 'carro-do-freela']) expect(ids, id).not.toContain(id)
  })

  it('a regra: estado aberto e canal web ou download aberto; beta fechado, lista de acesso ou canal só de API não divulgam', () => {
    const canais = (web: boolean, download: boolean) => ({ web, download })
    expect(divulgado({ state: 'released', canais: canais(true, false) })).toBe(true)
    expect(divulgado({ state: 'public_beta', canais: canais(false, true) })).toBe(true)
    expect(divulgado({ state: 'released', canais: canais(false, false) })).toBe(false)
    for (const state of ['development', 'internal_beta', 'private_beta', 'retired']) expect(divulgado({ state, canais: canais(true, true) }), state).toBe(false)
  })

  it('quando for pro ar, aparece: abrir o gate do NOSSOM na web o divulga; voltar a fechar o tira', async () => {
    // numa transação desfeita no fim: o banco de teste fica como as migrations deixaram
    await db.sql
      .begin(async (sql) => {
        await sql`insert into zro.product_release (product_id, state, web, note) values ('nossom', 'released', true, 'teste de divulgação')
                  on conflict (product_id) do update set state = 'released', web = true`
        const r = (await releaseState(sql as unknown as Tx, { fresh: true })).nossom!
        expect(divulgado({ state: r.state, canais: r.channels })).toBe(true)
        throw new Error('desfaz')
      })
      .catch((e: Error) => {
        if (e.message !== 'desfaz') throw e
      })
    expect(await divulgados()).not.toContain('nossom')
  })
})
