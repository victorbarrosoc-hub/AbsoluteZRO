// Os apps não lançados (migração 0049; decisão do titular, 01/11/2026): AEON (`ai-edit`), Revela (`finishing`), NOSSOM
// (`nossom`) e Rift Motion (`rift-motion`) não aparecem para o público em lugar nenhum, nem como "Em desenvolvimento".
// No ar: Maestro, Carro do Freela, Synquei, SOBEDESCE, Relay e TPeasy. O papel de plataforma admin vê e usa tudo.
// Aqui: o gate, o que uma conta comum e um admin veem (catálogo, claims, entregas, Z, selos, conexões), a presença do Set
// mascarada como "Absolute ZRO" e a migração rodando de novo sem mudar nada.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { productAccessFor, releaseAllows, releaseClaimsFor, releaseState, releaseVisibleFor, resetReleaseCache } from '@zro/billing'
import { authorize, estadoSet, loadOidcClaims, meuPerfil, retratoDoEcossistema, trocarArroba } from '@zro/core'
import type { Database, Tx } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { divulgado } from '../../apps/hub-web/lib/divulgacao'
import { expectCode, newOrgWithOwner, refresh } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const sys = <T>(fn: (tx: Tx) => Promise<T>) => db.asSystem('teste', fn)
const NAO_LANCADOS = ['ai-edit', 'finishing', 'nossom']
const NO_AR = ['maestro', 'carro-do-freela', 'synquei', 'sobedesce', 'relay', 'tpeasy']
const CANAIS = ['web', 'desktop', 'api', 'download', 'sso'] as const
const MIGRATION = readFileSync(new URL('../../infra/migrations/0049_nao_lancados.sql', import.meta.url), 'utf8')

async function tornarAdmin(userId: string) {
  await db.sql`update zro.users set platform_role = 'admin', email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`
}

describe('gate (0049)', () => {
  it('não lançados fechados em todos os canais; os seis no ar seguem abertos e divulgados', async () => {
    const s = await sys((tx) => releaseState(tx, { fresh: true }))
    for (const id of NAO_LANCADOS) {
      expect(s[id], id).toMatchObject({ state: 'development', open: false })
      expect(Object.values(s[id]!.channels).some(Boolean), id).toBe(false)
      expect(divulgado({ state: s[id]!.state, canais: s[id]!.channels }), id).toBe(false)
      for (const ch of CANAIS) expect(await sys((tx) => releaseAllows(tx, id, null, ch)), `${id} ${ch}`).toBe(false)
    }
    for (const id of NO_AR) expect(divulgado({ state: s[id]!.state, canais: s[id]!.channels }), id).toBe(true)
    expect([...(await sys((tx) => releaseVisibleFor(tx, null)))].sort()).toEqual([...NO_AR].sort())
  })

  it('rodar a 0049 de novo não muda o gate nem gera auditoria nova; dados (catálogo, planos, entitlements) ficam', async () => {
    const contar = async () => {
      const [r] = await db.sql`
        select (select count(*) from zro.audit_logs where target_type = 'product' and target_id = any (${NAO_LANCADOS}))::int as auditoria,
               (select count(*) from zro.products where id = any (${NAO_LANCADOS}))::int as produtos,
               (select count(*) from zro.plan_products where product_id = any (${NAO_LANCADOS}))::int as planos`
      return r!
    }
    const antes = await contar()
    await db.sql.unsafe(MIGRATION)
    expect(await contar()).toEqual(antes)
    expect(antes.produtos).toBe(3)
    expect(antes.planos).toBeGreaterThan(0)
    resetReleaseCache()
  })
})

describe('conta comum × admin da plataforma', () => {
  it('conta comum: não vê nem acessa (catálogo, claims, autorização, Z)', async () => {
    const o = await newOrgWithOwner(db, 'nl-comum', { freePlan: true })
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId))
    for (const id of NAO_LANCADOS)
      expect(
        access.find((a) => a.productId === id),
        id,
      ).toBeUndefined()
    for (const id of NO_AR)
      expect(
        access.find((a) => a.productId === id),
        id,
      ).toBeTruthy()
    const claims = await sys((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    for (const id of NAO_LANCADOS) {
      expect(claims.release, id).not.toHaveProperty(id)
      expect(claims.products, id).not.toContain(id)
      await expectCode(authorize(db, o.auth, { product: { id } }), 'product_closed')
      await expectCode(authorize(db, o.auth, { release: { productId: id, channel: 'download' } }), 'product_closed')
    }
    const actor = await authorize(db, o.auth)
    const retrato = await retratoDoEcossistema(db, actor, null)
    const texto = JSON.stringify(retrato)
    for (const nome of ['AEON', 'Revela', 'NOSSOM', 'Quasar', 'ai-edit', 'finishing', 'nossom']) expect(texto, nome).not.toContain(nome)
  })

  it('admin da plataforma: vê e acessa tudo, em todos os canais (web, computador e download inclusive)', async () => {
    const o = await newOrgWithOwner(db, 'nl-admin', { freePlan: true })
    await tornarAdmin(o.userId)
    const auth = await refresh(db, o.token)
    for (const id of NAO_LANCADOS) for (const ch of CANAIS) expect(await sys((tx) => releaseAllows(tx, id, o.userId, ch)), `${id} ${ch}`).toBe(true)
    const access = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => productAccessFor(tx, o.orgId, { channel: 'download' }))
    for (const id of NAO_LANCADOS) expect(access.find((a) => a.productId === id)?.release, id).toMatchObject({ allowed: true })
    const claims = await sys((tx) => releaseClaimsFor(tx, o.userId, 'sso'))
    for (const id of NAO_LANCADOS) expect(claims[id], id).toBe('allowed')
    await expect(authorize(db, auth, { release: { productId: 'nossom', channel: 'desktop' } })).resolves.toBeTruthy()
    expect(await sys((tx) => releaseVisibleFor(tx, o.userId))).toEqual(new Set([...NO_AR, ...NAO_LANCADOS]))
  })
})

describe('Set: presença em app não lançado sai como "Absolute ZRO"', () => {
  it('quem vê não é admin: "Absolute ZRO"; admin vê o nome; app no ar aparece pelo nome para todos', async () => {
    const titular = await newOrgWithOwner(db, 'nl-titular')
    const colega = await newOrgWithOwner(db, 'nl-colega')
    const chefe = await newOrgWithOwner(db, 'nl-chefe')
    await db.sql`update zro.users set display_name = 'Titular' where id = ${titular.userId}`
    for (const p of [colega, chefe]) {
      await db.sql`insert into zro.memberships (org_id, user_id, role) values (${titular.orgId}, ${p.userId}, 'editor')`
      await db.sql`update zro.sessions set active_org_id = ${titular.orgId} where user_id = ${p.userId}`
    }
    await tornarAdmin(chefe.userId)
    const colegaAuth = await refresh(db, colega.token)
    const chefeAuth = await refresh(db, chefe.token)
    const presenca = (app: string) =>
      db.sql`insert into zro.set_presenca (user_id, app, estado, visto_em) values (${titular.userId}, ${app}, 'ativo', now())
             on conflict (user_id, app) do update set estado = 'ativo', visto_em = now()`
    const naLista = async (auth: typeof colegaAuth) => (await estadoSet(db, auth)).pessoas.find((x) => x.id === titular.userId)

    await presenca('nossom')
    const visto = await naLista(colegaAuth)
    expect(visto).toMatchObject({ estado: 'online', app: { id: 'hub', nome: 'Absolute ZRO' } })
    expect(JSON.stringify(await estadoSet(db, colegaAuth))).not.toMatch(/nossom|NOSSOM|Quasar/)
    expect(await naLista(chefeAuth)).toMatchObject({ estado: 'online', app: { id: 'nossom', nome: 'Quasar Audio Lab' } })
    // o mesmo vale direto no banco (o que a API do Set de cada app lê)
    const [linha] = await db.asUser(
      { userId: colega.userId, orgId: titular.orgId },
      (tx) => tx`select app, app_nome from zro.set_pessoas(200) where user_id = ${titular.userId}`,
    )
    expect(linha).toEqual({ app: 'hub', app_nome: 'Absolute ZRO' })

    await db.sql`delete from zro.set_presenca where user_id = ${titular.userId}`
    await presenca('ai-edit')
    expect(await naLista(colegaAuth)).toMatchObject({ app: { id: 'hub', nome: 'Absolute ZRO' } })
    await db.sql`delete from zro.set_presenca where user_id = ${titular.userId}`
    await presenca('maestro')
    expect(await naLista(colegaAuth)).toMatchObject({ app: { id: 'maestro', nome: 'Maestro' } })
    // app que nem existe no catálogo também sai como a central
    await db.sql`delete from zro.set_presenca where user_id = ${titular.userId}`
    await presenca('app-inventado')
    expect(await naLista(colegaAuth)).toMatchObject({ app: { id: 'hub', nome: 'Absolute ZRO' } })
  })
})

describe('perfil: selo de app não lançado não aparece', () => {
  it('"Usa Quasar" some para quem vê e para a própria pessoa (não admin); o admin vê', async () => {
    const dono = await newOrgWithOwner(db, 'nl-selo')
    const outro = await newOrgWithOwner(db, 'nl-selo-outro')
    const chefe = await newOrgWithOwner(db, 'nl-selo-chefe')
    await tornarAdmin(chefe.userId)
    const arroba = `nlselo${Date.now().toString(36)}`
    await trocarArroba(db, dono.auth, arroba)
    for (const produto of ['nossom', 'sobedesce']) {
      const id = `nl-${produto}-${Date.now().toString(36)}`
      await db.sql`insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, trusted)
                   values (${id}, ${produto}, ${produto}, 'confidential', 'x', array['https://app.teste/cb'], true)`
      await db.sql`insert into zro.app_accounts (user_id, client_id, product_id) values (${dono.userId}, ${id}, ${produto})`
    }
    await db.sql`update zro.perfis set selos = array['nossom', 'sobedesce'], visivel = true where user_id = ${dono.userId}`
    const meu = await meuPerfil(db, await refresh(db, dono.token))
    expect(meu.selos.map((s) => s.produto)).not.toContain('nossom')
    expect(meu.apps.map((a) => a.produto)).not.toContain('nossom')
    const [visto] = await db.asUser(
      { userId: outro.userId, orgId: outro.orgId },
      (tx) => tx`select zro.selos_efetivos(${dono.userId}::uuid, array['nossom', 'sobedesce']) as s`,
    )
    expect(visto!.s).not.toContain('nossom')
    const [doAdmin] = await db.asUser(
      { userId: chefe.userId, orgId: chefe.orgId },
      (tx) => tx`select zro.selos_efetivos(${dono.userId}::uuid, array['nossom', 'sobedesce']) as s`,
    )
    expect(doAdmin!.s).toContain('nossom')
  })
})
