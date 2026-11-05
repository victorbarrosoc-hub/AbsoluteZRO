// O rádio do set dentro do HUB (ADR 0042; absolutezro.com/radio, com a conta e o banco do HUB). Aqui: as cópias geradas
// de products/radio batem byte a byte; o gate (conta comum não passa, admin e a lista de acesso passam); e as regras do
// núcleo rodando como `radio_app` no schema `radio`, com o isolamento entre pessoas pelo RLS.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newOrgWithOwner } from './helpers'

vi.mock('server-only', () => ({}))

const RAIZ = path.resolve(__dirname, '../..')
const MIGRACOES_RADIO = path.join(RAIZ, 'products/radio/db/migrations')

let db: Database
let radio: typeof import('../../apps/hub-web/lib/radio')
let nucleo: typeof import('../../apps/hub-web/lib/radio/nucleo')

/** O schema do rádio no banco de teste, como em produção: papel radio_app e as migrações de products/radio. */
async function montarRadio() {
  const [tem] = await db.sql`select to_regclass('radio.migracoes') is not null as ok`
  if (tem?.ok) return
  await db.sql.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'radio_app') then create role radio_app nologin; end if; end $$;
    create schema if not exists radio;
    create table if not exists radio.migracoes (nome text primary key, sha text not null, aplicada timestamptz not null default now());`)
  for (const f of readdirSync(MIGRACOES_RADIO).sort()) await db.sql.unsafe(readFileSync(path.join(MIGRACOES_RADIO, f), 'utf8'))
  await db.sql.unsafe(readFileSync(path.join(RAIZ, 'infra/migrations/0059_radio_no_hub.sql'), 'utf8'))
}

beforeAll(async () => {
  db = testDatabase()
  await montarRadio()
  radio = await import('../../apps/hub-web/lib/radio')
  nucleo = await import('../../apps/hub-web/lib/radio/nucleo')
})
afterAll(() => db.close())

describe('cópias do rádio no HUB', () => {
  it('nucleo.ts e arquivos.ts são os gerados de products/radio (rode products/radio/scripts/para-o-hub.mjs)', async () => {
    const { gerar } = await import('../../products/radio/scripts/para-o-hub.mjs')
    const { nucleo: n, arquivos } = gerar()
    expect(readFileSync(path.join(RAIZ, 'apps/hub-web/lib/radio/nucleo.ts'), 'utf8')).toBe(n)
    expect(readFileSync(path.join(RAIZ, 'apps/hub-web/lib/radio/arquivos.ts'), 'utf8')).toBe(arquivos)
  })

  it('nada do rádio em public/ (só a fonte Figtree, que é da marca)', () => {
    const publicos = readdirSync(path.join(RAIZ, 'apps/hub-web/public'), { recursive: true }).map(String)
    expect(publicos.filter((f) => /radio|r[aá]dio/i.test(f))).toEqual([])
  })
})

describe('rádio do set no HUB', () => {
  const admin = (userId: string) =>
    db.sql`update zro.users set platform_role = 'admin', email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`

  it('gate: conta comum não passa; admin e a lista de acesso passam', async () => {
    const comum = await newOrgWithOwner(db, 'rd-comum', { freePlan: true })
    expect(await radio.acessoAoRadio(db, comum.auth)).toBeNull()
    expect(await radio.acessoAoRadio(db, null)).toBeNull()
    const chefe = await newOrgWithOwner(db, 'rd-chefe', { freePlan: true })
    await admin(chefe.userId)
    const a = await radio.acessoAoRadio(db, { ...chefe.auth, user: { ...chefe.auth.user, platformRole: 'admin' } })
    expect(a?.userId).toBe(chefe.userId)
    const testadora = await newOrgWithOwner(db, 'rd-teste', { freePlan: true })
    await db.sql`insert into zro.product_release_access (product_id, user_id, kind, channels, reason) values ('radio', ${testadora.userId}, 'tester', array['web'], 'teste do rádio')`
    expect((await radio.acessoAoRadio(db, testadora.auth))?.userId).toBe(testadora.userId)
  })

  it('diária pelo HUB: criar, entrar pelo código, presença, aviso só da Direção e isolamento pelo RLS', async () => {
    const ana = (await newOrgWithOwner(db, 'rd-ana', { freePlan: true })).userId
    const bia = (await newOrgWithOwner(db, 'rd-bia', { freePlan: true })).userId
    const caio = (await newOrgWithOwner(db, 'rd-caio', { freePlan: true })).userId
    const P = { ana: { sub: ana, nome: 'Ana' }, bia: { sub: bia, nome: 'Bia' }, caio: { sub: caio, nome: 'Caio' } }
    const como = <T>(p: { sub: string }, fn: Parameters<typeof radio.noRadio<T>>[2]) => radio.noRadio(db, p.sub, fn)

    const c = await como(P.ana, (tx) => nucleo.mudarDiarias(tx, P.ana, { acao: 'criar', nome: 'Comercial' }))
    expect(c.status).toBe(201)
    const d = (c.corpo as { diaria: { id: string; codigo: string } }).diaria
    expect((await como(P.bia, (tx) => nucleo.listarDiarias(tx, P.bia))).corpo).toEqual({ ok: true, diarias: [] })
    expect((await como(P.bia, (tx) => nucleo.mudarDiarias(tx, P.bia, { acao: 'entrar', codigo: d.codigo }))).status).toBe(200)

    await como(P.ana, (tx) => nucleo.bater(tx, P.ana, { diaria: d.id, peer: 'a'.repeat(24) }))
    const bb = await como(P.bia, (tx) => nucleo.bater(tx, P.bia, { diaria: d.id, peer: 'b'.repeat(24) }))
    expect((bb.corpo as { pessoas: { nome: string }[] }).pessoas.map((x) => x.nome)).toEqual(['Ana', 'Bia'])
    expect((await como(P.caio, (tx) => nucleo.bater(tx, P.caio, { diaria: d.id, peer: 'c'.repeat(24) }))).status).toBe(403)

    expect((await como(P.ana, (tx) => nucleo.avisar(tx, P.ana, { diaria: d.id, tipo: 'acao' }))).status).toBe(201)
    expect((await como(P.bia, (tx) => nucleo.avisar(tx, P.bia, { diaria: d.id, tipo: 'corta' }))).status).toBe(403)

    // como radio_app: quem está fora não lê nada; ninguém vira dono por update
    expect(await como(P.caio, (tx) => tx`select * from radio.diarias`)).toHaveLength(0)
    expect(await como(P.caio, (tx) => tx`select * from radio.membros`)).toHaveLength(0)
    await expect(como(P.bia, (tx) => tx`update radio.membros set papel = 'dono' where user_sub = ${bia}`)).rejects.toThrow(/permission denied/)
    const [papel] = await como(P.ana, (tx) => tx`select current_user as u`)
    expect(papel?.u).toBe('radio_app')
  })
})
