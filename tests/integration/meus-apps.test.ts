// Central única de instalação (ADR 0035): o que cada conta vê e baixa na central "Absolute ZRO", conferido no servidor.
// Hoje todo app de computador está no plano grátis (uso livre); `usoLivre: new Set()` simula o app pago.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { releaseClaimsFor, resetReleaseCache } from '@zro/billing'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { limparCacheApps } from '../../apps/hub-web/lib/desktop-apps'
import { acessoAoDownload, liberadosParaBaixar, meusApps, produtosDeUsoLivre } from '../../apps/hub-web/lib/meus-apps'
import { allowRelease, expectCode, givePlan, newOrgWithOwner, refresh } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(async () => {
  resetReleaseCache()
  await db.close()
})
beforeEach(() => limparCacheApps())

const SHA = `sha256:${'a'.repeat(64)}`
const SOBE = 'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/sobedesce-versao-de-teste'
const EXE = 'SOBEDESCE-0.2.0-b1100-windows-setup.exe'
const github = (async (url: string | URL | Request) => {
  if (String(url) === SOBE)
    return Response.json({
      assets: [{ name: EXE, url: 'https://api.github.com/x', browser_download_url: `https://github.com/x/${EXE}`, size: 900, digest: SHA }],
    })
  return new Response('{}', { status: 404 })
}) as typeof fetch
const PAGO = { usoLivre: new Set<string>(), fetch: github, env: {} }

const liberados = async (userId: string | null) =>
  new Set(
    Object.entries(await db.asSystem('teste', (tx) => releaseClaimsFor(tx, userId, 'download')))
      .filter(([, c]) => c !== 'closed')
      .map(([id]) => id),
  )

describe('meus apps (GET /api/v1/desktop/meus-apps)', () => {
  it('sem sessão: 401, nada da lista', async () => {
    await expectCode(meusApps(db, null, PAGO), 'unauthenticated')
  })

  it('conta sem o produto: não vê para instalar (bloqueado com o plano que inclui) e não baixa', async () => {
    const o = await newOrgWithOwner(db, 'sem-produto')
    const r = await meusApps(db, o.auth, PAGO)
    expect(r.versao).toBe(2)
    expect(r.apps.map((a) => a.id)).not.toContain('sobedesce')
    const b = r.bloqueados.find((x) => x.id === 'sobedesce')!
    expect(b).toMatchObject({ nome: 'SOBEDESCE', plano: 'Absolute ZRO Completo', planos: 'https://absolutezro.com/planos', mac: { bundle: 'SOBEDESCE.app' } })
    expect(JSON.stringify(b)).not.toContain('sha256')
    const lib = await liberados(o.userId)
    expect(await acessoAoDownload(db, o.auth, 'sobedesce', EXE, lib, PAGO)).toBe('sem-direito')
    expect(await acessoAoDownload(db, o.auth, 'sobedesce', 'mac', lib, PAGO)).toBe('sem-direito')
    expect(await acessoAoDownload(db, null, 'sobedesce', EXE, await liberados(null), PAGO)).toBe('entrar')
    // o aviso de versão nova dos apps já instalados continua público (só o gate)
    expect(await acessoAoDownload(db, null, 'sobedesce', 'versao.json', await liberados(null), PAGO)).toBe('ok')
  })

  it('conta com o produto no plano: vê com versão, arquivo e SHA-256, e baixa', async () => {
    const o = await newOrgWithOwner(db, 'com-produto')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    const r = await meusApps(db, o.auth, PAGO)
    const s = r.apps.find((a) => a.id === 'sobedesce')!
    expect(s.windows?.arquivo).toMatchObject({ arquivo: EXE, versao: '0.2.0', build: 1100, sha256: 'a'.repeat(64), tamanho: 900 })
    expect(r.bloqueados.map((b) => b.id)).not.toContain('sobedesce')
    expect(await acessoAoDownload(db, o.auth, 'sobedesce', EXE, await liberados(o.userId), PAGO)).toBe('ok')
  })

  it('plano cancelado: o app volta a bloqueado e o instalador não baixa (nada é apagado; a central só não atualiza)', async () => {
    const o = await newOrgWithOwner(db, 'cancelado')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    expect((await meusApps(db, o.auth, PAGO)).apps.map((a) => a.id)).toContain('sobedesce')
    await db.asSystem('teste: plano acabou', (tx) => tx`update zro.entitlements set status = 'revoked' where org_id = ${o.orgId}`)
    const r = await meusApps(db, o.auth, PAGO)
    expect(r.apps.map((a) => a.id)).not.toContain('sobedesce')
    expect(r.bloqueados.map((b) => b.id)).toContain('sobedesce')
    expect(await acessoAoDownload(db, o.auth, 'sobedesce', EXE, await liberados(o.userId), PAGO)).toBe('sem-direito')
  })

  it('gate fechado bloqueia mesmo com o plano: nem na lista, nem bloqueado, nem download', async () => {
    const o = await newOrgWithOwner(db, 'gate')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    const r = await meusApps(db, o.auth, PAGO)
    expect([...r.apps, ...r.bloqueados].map((a) => a.id)).not.toContain('nossom')
    expect(await acessoAoDownload(db, o.auth, 'nossom', 'NOSSOM-0.2.2-win-x64.exe', await liberados(o.userId), PAGO)).toBe('fechado')
  })

  it('não lançados (AEON, Revela, NOSSOM, Rift Motion): só admin de plataforma, nem com a lista de acesso do gate', async () => {
    const o = await newOrgWithOwner(db, 'tester')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    await allowRelease(db, 'nossom', o.userId)
    const r = await meusApps(db, o.auth, PAGO)
    for (const id of ['nossom', 'rift-motion', 'ai-edit', 'finishing'])
      expect(
        [...r.apps, ...r.bloqueados].map((a) => a.id),
        id,
      ).not.toContain(id)
    expect(await acessoAoDownload(db, o.auth, 'nossom', 'NOSSOM-0.2.2-win-x64.exe', await liberados(o.userId), PAGO)).toBe('fechado')
    expect(await acessoAoDownload(db, o.auth, 'rift-motion', 'mac', await liberados(o.userId), PAGO)).toBe('fechado')
  })

  it('admin de plataforma: vê e instala tudo, inclusive o que não está lançado nem no plano', async () => {
    const o = await newOrgWithOwner(db, 'admin-central')
    await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = 'admin' where id = ${o.userId}`)
    const auth = await refresh(db, o.token)
    const r = await meusApps(db, auth, PAGO)
    expect(r.apps.map((a) => a.id)).toEqual(expect.arrayContaining(['sobedesce', 'nossom', 'maestro', 'rift-motion']))
    expect(r.bloqueados).toEqual([])
    const lib = liberadosParaBaixar(auth, await liberados(o.userId))
    expect(await acessoAoDownload(db, auth, 'nossom', 'NOSSOM-0.2.2-win-x64.exe', lib, PAGO)).toBe('ok')
    expect(await acessoAoDownload(db, auth, 'sobedesce', EXE, lib, PAGO)).toBe('ok')
    // suporte não é admin
    await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = 'support' where id = ${o.userId}`)
    expect((await meusApps(db, await refresh(db, o.token), PAGO)).apps.map((a) => a.id)).not.toContain('nossom')
  })

  it('uso livre (plano grátis vigente): toda conta instala e baixa, sem sessão também, como antes', async () => {
    const livres = await db.asSystem('teste', (tx) => produtosDeUsoLivre(tx))
    for (const id of ['sobedesce', 'synquei', 'maestro', 'relay', 'carro-do-freela', 'tpeasy']) expect(livres.has(id), id).toBe(true)
    const o = await newOrgWithOwner(db, 'livre')
    const r = await meusApps(db, o.auth, { fetch: github, env: {} })
    expect(r.apps.map((a) => a.id)).toContain('sobedesce')
    expect(r.bloqueados).toEqual([])
    expect(await acessoAoDownload(db, null, 'sobedesce', EXE, await liberados(null))).toBe('ok')
  })
})
