// A Z no Rift com a chave do HUB (caminho A, 01/11/2026): só servidor a servidor com o cliente confidencial do Rift,
// só contas da lista que já entraram no Rift, teto do dia (sem teto = bloqueado; passou = bloqueado), uso idempotente,
// e a tela do Rift só recebe ações que sabe aplicar.
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { authenticateAppClient, grantConsent, registerClient } from '@zro/auth'
import { conferirTetoDoSistema, liberadosDoRift, pedidoDaZNoRift, registrarUsoDoSistema } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, expectCode, newUser } from './helpers'

vi.mock('server-only', () => ({}))

let db: Database
let rift: { clientId: string; clientSecret: string | null }
let outro: { clientId: string; clientSecret: string | null }
let tetoAntes: string | null = null
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`
const basic = (c: { clientId: string; clientSecret: string | null }) => `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
const teto = (v: number | null) => db.asSystem('teste', (tx) => tx`update zro.z_lab_config set teto_diario_usd = ${v} where id`)

async function cliente(nome: string) {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: rid(nome),
      name: nome,
      productId: null,
      kind: 'confidential',
      redirectUris: ['https://rift.teste/cb'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
}

beforeAll(async () => {
  db = testDatabase()
  rift = await cliente('rift')
  outro = await cliente('outro')
  const [c] = await db.asSystem('teste', (tx) => tx`select teto_diario_usd::text as t from zro.z_lab_config where id`)
  tetoAntes = (c?.t as string | null) ?? null
})
afterAll(async () => {
  await db.asSystem('teste', (tx) => tx`update zro.z_lab_config set teto_diario_usd = ${tetoAntes} where id`)
  await db.close()
})

describe('Z no Rift: quem pode', () => {
  it('lista vazia = ninguém; vírgulas e espaços são tolerados', () => {
    expect(liberadosDoRift(undefined)).toEqual([])
    expect(liberadosDoRift(' a , ,b ')).toEqual(['a', 'b'])
  })

  it('só o cliente do Rift, só quem está na lista e já entrou no Rift, com teto definido', async () => {
    const ana = await newUser(db, 'rift-ana')
    const beto = await newUser(db, 'rift-beto')
    const app = (await authenticateAppClient(db, basic(rift)))!
    const app2 = (await authenticateAppClient(db, basic(outro)))!
    const opts = { cliente: rift.clientId, liberados: [ana.userId] }
    const corpo = { sub: ana.userId, pedido: 'anima o título', cena: { v: 2, camadas: [] } }
    await teto(10)

    await expectCode(pedidoDaZNoRift(db, app2, corpo, opts), 'action_not_allowed')
    await expectCode(pedidoDaZNoRift(db, app, corpo, { ...opts, liberados: [] }), 'action_not_allowed')
    // na lista, mas nunca entrou no Rift (sem consentimento)
    await expectCode(pedidoDaZNoRift(db, app, corpo, opts), 'action_not_allowed')
    await db.asSystem('teste', (tx) => grantConsent(tx, ana.userId, rift.clientId, ['openid']))
    await db.asSystem('teste', (tx) => grantConsent(tx, beto.userId, rift.clientId, ['openid']))
    // Beto entrou no Rift mas não está na lista
    await expectCode(pedidoDaZNoRift(db, app, { ...corpo, sub: beto.userId }, opts), 'action_not_allowed')

    const ok = await pedidoDaZNoRift(db, app, corpo, opts)
    expect(ok).toEqual({ userId: ana.userId, pedido: 'anima o título', cena: JSON.stringify(corpo.cena) })

    await expectCode(pedidoDaZNoRift(db, app, { ...corpo, pedido: '   ' }, opts), 'invalid_input')
    await expectCode(pedidoDaZNoRift(db, app, { ...corpo, sub: 'nao-e-uuid' }, opts), 'invalid_input')
    await expectCode(pedidoDaZNoRift(db, app, { ...corpo, cena: { t: 'x'.repeat(61_000) } }, opts), 'invalid_input')

    // conta desativada perde a Z
    await db.asSystem('teste', (tx) => tx`update zro.users set status = 'suspended' where id = ${ana.userId}`)
    await expectCode(pedidoDaZNoRift(db, app, corpo, opts), 'action_not_allowed')
    await db.asSystem('teste', (tx) => tx`update zro.users set status = 'active' where id = ${ana.userId}`)
  })
})

describe('Z no Rift: teto e uso', () => {
  it('sem teto = bloqueado; passou do teto = bloqueado; o uso conta uma vez só', async () => {
    const eva = await newUser(db, 'rift-eva')
    await teto(null)
    await expectCode(conferirTetoDoSistema(db), 'quota_not_configured')
    await teto(500)
    const chave = `claude:rift-${randomBytes(6).toString('hex')}`
    const uso = { servico: 'claude' as const, modelo: 'claude-opus-5-5', tokensEntrada: 10, tokensSaida: 5, custoUsd: 1, chave }
    expect(await registrarUsoDoSistema(db, eva.userId, uso)).toBe(true)
    expect(await registrarUsoDoSistema(db, eva.userId, uso)).toBe(false)
    const g = await conferirTetoDoSistema(db)
    expect(g.hoje).toBeGreaterThanOrEqual(1)
    await teto(0.5)
    await expectCode(conferirTetoDoSistema(db), 'quota_exceeded')
    await expectCode(registrarUsoDoSistema(db, eva.userId, { ...uso, chave: 'ruim' }), 'invalid_input')
  })
})

describe('Z no Rift: ações que a tela sabe aplicar', () => {
  it('limpa valores, corta textos e descarta o desconhecido', async () => {
    const { acaoDoRift } = await import('../../apps/hub-web/lib/ia/rift')
    expect(acaoDoRift('aplicar_movimento', { camada: 'c1', movimento: 'quicar', duracao: 9 })).toEqual({
      tipo: 'aplicar_movimento',
      camada: 'c1',
      movimento: 'quicar',
      duracao: 3,
    })
    expect(acaoDoRift('aplicar_movimento', { camada: 'c1', movimento: 'voar' })).toBeNull()
    const aj = acaoDoRift('ajustar_camada', { camada: 'c1', valores: { x: 50, hack: 1, y: 'a' }, cor: 'red', texto: 'x'.repeat(900) })!
    expect(aj.valores).toEqual({ x: 50 })
    expect(aj.cor).toBeUndefined()
    expect((aj.texto as string).length).toBe(500)
    expect(acaoDoRift('adicionar_camada', { tipo: 'video' })).toBeNull()
    expect(acaoDoRift('apagar_camada', { camada: 'c2' })).toEqual({ tipo: 'apagar_camada', camada: 'c2' })
    expect(acaoDoRift('gerar_motion', { camada: 'c3', prompt: 'slow zoom' })).toEqual({ tipo: 'gerar_motion', camada: 'c3', prompt: 'slow zoom' })
    expect(acaoDoRift('rodar_comando', { camada: 'c1' })).toBeNull()
    expect(acaoDoRift('apagar_camada', null)).toBeNull()
  })
})
