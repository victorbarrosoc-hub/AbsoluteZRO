// Console › Apps › SOBEDESCE (titular, 31/10/2026): o Drive inteiro é ligado e desligado no HUB. O HUB confere o papel
// (ler: admin e suporte; mudar: só admin, com motivo), assina o pedido com a ação certa e audita; contra um SOBEDESCE
// falso (sem rede de verdade). A regra das vagas fica no SOBEDESCE (products/sobedesce/web/tests/zro-console-drive).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setIssuer, type Authenticated } from '@zro/auth'
import { CONSOLE_DRIVE_LER, CONSOLE_DRIVE_MUDAR, lerAcessoDrive, mudarAcessoDrive, type DriveConfig, type PapelConsole } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newUser } from './helpers'

let db: Database
let servidor: http.Server
let cfg: DriveConfig
const pedidos: { caminho: string; acao: unknown; sub: unknown; corpo: Record<string, unknown> }[] = []
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: {} }

const VAGAS = { limite: 90, usadas: 3, liberadasSemUso: 1, livres: 86 }
let adminId = ''
let suporteId = ''
const auth = (id: string, platformRole: PapelConsole | null) =>
  ({
    user: { id, email: `${id}@teste.local`, displayName: 'X', platformRole, emailVerified: true },
    session: { activeOrgId: null },
  }) as unknown as Authenticated

beforeAll(async () => {
  db = testDatabase()
  setIssuer('https://hub.teste.absolutezro.local')
  adminId = (await newUser(db, 'adm-sd')).userId
  suporteId = (await newUser(db, 'sup-sd')).userId
  servidor = http.createServer(async (req, res) => {
    let texto = ''
    for await (const p of req) texto += p
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
    const dados = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}') as Record<string, unknown>
    pedidos.push({ caminho: req.url ?? '', acao: dados.zro_pedido, sub: dados.sub, corpo: JSON.parse(texto || '{}') as Record<string, unknown> })
    res.writeHead(resposta.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(resposta.corpo))
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  cfg = { base: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, clientId: 'sobedesce-web' }
})
afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()))
  await db.close()
})

describe('quem vê e quem muda', () => {
  it('sem papel: recusado antes de chamar o SOBEDESCE', async () => {
    const antes = pedidos.length
    await expect(lerAcessoDrive(db, auth(adminId, null), cfg)).rejects.toMatchObject({ code: 'platform_role_required' })
    await expect(lerAcessoDrive(db, auth(adminId, 'financeiro'), cfg)).rejects.toMatchObject({ code: 'platform_role_required' })
    expect(pedidos.length).toBe(antes)
  })
  it('suporte lê, mas não muda', async () => {
    resposta = {
      status: 200,
      corpo: { vagas: VAGAS, pessoas: [{ id: 'u1', nome: 'Ana', email: 'ana@x.com', acessoTotal: true, usouVaga: true, zroSub: null, drives: [] }] },
    }
    const p = await lerAcessoDrive(db, auth(suporteId, 'support'), cfg)
    expect(p.vagas).toEqual(VAGAS)
    expect(pedidos.at(-1)).toMatchObject({ caminho: '/api/zro/console/drive', acao: CONSOLE_DRIVE_LER, sub: suporteId })
    const antes = pedidos.length
    await expect(mudarAcessoDrive(db, auth(suporteId, 'support'), { usuarioId: 'u1', ligar: false, reason: 'teste' }, cfg)).rejects.toMatchObject({
      code: 'platform_role_required',
    })
    expect(pedidos.length).toBe(antes)
  })
})

describe('mudar (admin)', () => {
  it('sem motivo ou com id ruim: recusado sem chamar', async () => {
    const antes = pedidos.length
    await expect(mudarAcessoDrive(db, auth(adminId, 'admin'), { usuarioId: 'u1', ligar: true, reason: '  ' }, cfg)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(mudarAcessoDrive(db, auth(adminId, 'admin'), { usuarioId: '../x', ligar: true, reason: 'ok' }, cfg)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    expect(pedidos.length).toBe(antes)
  })
  it('liga com a ação de mudar, em nome do admin, e audita', async () => {
    resposta = { status: 200, corpo: { ok: true, acessoTotal: true, vagas: VAGAS } }
    const r = await mudarAcessoDrive(db, auth(adminId, 'admin'), { usuarioId: 'u2', ligar: true, reason: 'cliente com acervo grande' }, cfg)
    expect(r).toEqual({ acessoTotal: true, vagas: VAGAS })
    expect(pedidos.at(-1)).toMatchObject({
      caminho: '/api/zro/console/drive/acesso',
      acao: CONSOLE_DRIVE_MUDAR,
      sub: adminId,
      corpo: { usuarioId: 'u2', ligar: true },
    })
    const [a] = await db.asSystem(
      'teste',
      (tx) =>
        tx`select actor_kind, action, metadata from zro.audit_logs where actor_user_id = ${adminId} and target_id = 'u2' order by created_at desc limit 1`,
    )
    expect(a).toMatchObject({ actor_kind: 'admin', action: 'sobedesce.drive_total.ligar', metadata: { reason: 'cliente com acervo grande', resultado: 'ok' } })
  })
  it('sem vaga e conta sumida viram mensagem clara (e ficam na auditoria)', async () => {
    resposta = { status: 409, corpo: { erro: 'sem_vaga', mensagem: 'cheio' } }
    await expect(mudarAcessoDrive(db, auth(adminId, 'admin'), { usuarioId: 'u3', ligar: true, reason: 'x' }, cfg)).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
    resposta = { status: 404, corpo: { erro: 'nao_encontrada' } }
    await expect(mudarAcessoDrive(db, auth(adminId, 'admin'), { usuarioId: 'u4', ligar: true, reason: 'x' }, cfg)).rejects.toMatchObject({ code: 'not_found' })
    const linhas = await db.asSystem(
      'teste',
      (tx) =>
        tx`select target_id, metadata->>'resultado' as r from zro.audit_logs where actor_user_id = ${adminId} and target_id in ('u3', 'u4') order by target_id`,
    )
    expect(linhas.map((l) => [l.target_id, l.r])).toEqual([
      ['u3', 'sem_vaga'],
      ['u4', 'nao_encontrada'],
    ])
  })
  it('SOBEDESCE fora do ar: erro de indisponível, nunca "ligado"', async () => {
    await expect(lerAcessoDrive(db, auth(adminId, 'admin'), { ...cfg, base: 'http://127.0.0.1:1' })).rejects.toMatchObject({ code: 'upstream_unavailable' })
  })
})

describe('emissor certo em produção', () => {
  it('página e ação do console só chamam o SOBEDESCE pelo módulo que define o emissor (lib/oidc)', () => {
    const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), 'apps/hub-web', p), 'utf8')
    expect(ler('lib/sobedesce-console.ts')).toMatch(/import '\.\/oidc'/)
    for (const p of ['app/admin/apps/sobedesce/page.tsx', 'lib/actions/admin.ts']) {
      const s = ler(p)
      expect(s, p).not.toMatch(/\b(lerAcessoDrive|mudarAcessoDrive)\(/)
      expect(s, p).toMatch(/sobedesce-console'/)
    }
  })
})
