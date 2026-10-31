// Papéis do console (ADR 0034, migração 0046): admin vê tudo, Financeiro só a parte financeira, suporte lê; sem papel,
// nada. O servidor nega (requireConsole/requireCaixa, RLS e o banco); a atribuição é só de admin, nunca do próprio papel.
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authenticate, type Authenticated } from '@zro/auth'
import {
  AREAS_CONSOLE,
  areasDoPapel,
  caixasDoPapel,
  definirPapelDoConsole,
  inicioDoConsole,
  lerPapel,
  listarPapeisDoConsole,
  papelNoConsole,
  podeMudar,
  podeVer,
  requireCaixa,
  requireConsole,
  requirePlatformAdmin,
  type PapelConsole,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { newUser } from './helpers'

const fakeAuth = (platformRole: PapelConsole | null, emailVerified = true) =>
  ({
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'x@teste.local', displayName: 'X', platformRole, emailVerified },
    session: { activeOrgId: null },
  }) as unknown as Authenticated

describe('o que cada papel vê', () => {
  it('admin: todas as áreas; Financeiro: Planos, Custos e Correio; suporte: sem Custos, Laboratório, Papéis e Correio', () => {
    expect(areasDoPapel('admin')).toEqual([...AREAS_CONSOLE])
    expect(areasDoPapel('financeiro')).toEqual(['planos', 'custos', 'correio'])
    expect(areasDoPapel('support')).toEqual(['visao', 'pessoas', 'planos', 'lancamento', 'apps', 'denuncias'])
    expect(areasDoPapel(null)).toEqual([])
  })
  it('quem muda: Financeiro muda Planos, Custos e Correio; suporte só as denúncias', () => {
    for (const a of ['planos', 'custos', 'correio'] as const) expect(podeMudar('financeiro', a)).toBe(true)
    for (const a of AREAS_CONSOLE.filter((x) => !['planos', 'custos', 'correio'].includes(x))) expect(podeMudar('financeiro', a), a).toBe(false)
    expect(AREAS_CONSOLE.filter((a) => podeMudar('support', a))).toEqual(['denuncias'])
    expect(AREAS_CONSOLE.every((a) => podeMudar('admin', a))).toBe(true)
  })
  it('o console abre em Custos para o Financeiro e na Visão geral para os outros', () => {
    expect(inicioDoConsole('financeiro')).toBe('/admin/custos')
    expect(inicioDoConsole('admin')).toBe('/admin')
    expect(inicioDoConsole(null)).toBeNull()
  })
  it('e-mail sem confirmar = sem papel no console', () => {
    expect(papelNoConsole(fakeAuth('admin', false))).toBeNull()
    expect(papelNoConsole(null)).toBeNull()
  })
})

describe('o servidor nega', () => {
  it('requireConsole: cada área só para os papéis dela; o resto é 403 platform_role_required', () => {
    for (const papel of ['admin', 'support', 'financeiro', null] as const) {
      for (const area of AREAS_CONSOLE) {
        const op = () => requireConsole(fakeAuth(papel), area)
        if (podeVer(papel, area)) expect(op().papel).toBe(papel)
        else expect(op, `${papel} em ${area}`).toThrow(expect.objectContaining({ code: 'platform_role_required', status: 403 }))
      }
    }
    expect(() => requireConsole(null, 'custos')).toThrow(expect.objectContaining({ code: 'unauthenticated' }))
    expect(() => requireConsole(fakeAuth('financeiro', false), 'custos')).toThrow(expect.objectContaining({ code: 'email_not_verified' }))
    expect(() => requireConsole(fakeAuth('support'), 'planos', { mudar: true })).toThrow(expect.objectContaining({ code: 'platform_role_required' }))
  })
  it('as guardas antigas (requirePlatformAdmin) seguem fechadas para o Financeiro', () => {
    expect(() => requirePlatformAdmin(fakeAuth('financeiro'))).toThrow('Área restrita')
    expect(() => requirePlatformAdmin(fakeAuth('financeiro'), ['admin', 'support'])).toThrow('Área restrita')
  })
  it('caixas: admin as três, Financeiro só financeiro@, suporte e sem papel nenhuma', () => {
    expect(caixasDoPapel('admin').map((c) => c.endereco)).toEqual(['victor@absolutezro.com', 'contato@absolutezro.com', 'financeiro@absolutezro.com'])
    expect(caixasDoPapel('financeiro').map((c) => c.endereco)).toEqual(['financeiro@absolutezro.com'])
    expect(caixasDoPapel('support')).toEqual([])
    expect(requireCaixa(fakeAuth('financeiro'), 'financeiro').caixa.endereco).toBe('financeiro@absolutezro.com')
    for (const c of ['victor', 'contato', 'outra', '', null, '../financeiro'])
      expect(() => requireCaixa(fakeAuth('financeiro'), c), String(c)).toThrow(expect.objectContaining({ code: 'platform_role_required' }))
    for (const c of ['victor', 'contato', 'financeiro']) expect(requireCaixa(fakeAuth('admin'), c).caixa.id).toBe(c)
    expect(() => requireCaixa(fakeAuth('support'), 'contato')).toThrow(expect.objectContaining({ code: 'platform_role_required' }))
    expect(() => requireCaixa(fakeAuth(null), 'financeiro')).toThrow(expect.objectContaining({ code: 'platform_role_required' }))
  })
  it('papel do formulário: só os três, ou "nenhum" para tirar', () => {
    expect(lerPapel('financeiro')).toBe('financeiro')
    expect(lerPapel('nenhum')).toBeNull()
    expect(() => lerPapel('dono')).toThrow('Papel inválido')
  })
})

describe('cada tela e rota do console confere por conta própria', () => {
  const ROOT = path.resolve(import.meta.dirname, '../..')
  const arquivos = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? arquivos(path.join(dir, e.name)) : /^(page\.tsx|route\.ts|layout\.tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []))
  const GUARDA = /requireConsole|requireCaixa|requirePlatformAdmin|adminDoLab|platformRole !== 'admin'/
  it('/admin e /api/v1/admin/correio: toda página, layout e rota tem guarda de papel', () => {
    const lista = [...arquivos(path.join(ROOT, 'apps/hub-web/app/admin')), ...arquivos(path.join(ROOT, 'apps/hub-web/app/api/v1/admin/correio'))]
    expect(lista.length).toBeGreaterThan(20)
    const sem = lista.filter((f) => !GUARDA.test(fs.readFileSync(f, 'utf8')) && !/podeVer|papelNoConsole/.test(fs.readFileSync(f, 'utf8')))
    expect(sem.map((f) => path.relative(ROOT, f))).toEqual([])
  })
  it('as telas que o Financeiro não vê respondem 404 (podeVer antes de qualquer consulta)', () => {
    for (const [arq, area] of [
      ['apps/hub-web/app/admin/page.tsx', 'visao'],
      ['apps/hub-web/app/admin/pessoas/page.tsx', 'pessoas'],
      ['apps/hub-web/app/admin/pessoas/[id]/page.tsx', 'pessoas'],
      ['apps/hub-web/app/admin/apps/page.tsx', 'apps'],
      ['apps/hub-web/app/admin/lancamento/page.tsx', 'lancamento'],
      ['apps/hub-web/app/admin/denuncias/page.tsx', 'denuncias'],
      ['apps/hub-web/app/admin/papeis/page.tsx', 'papeis'],
      ['apps/hub-web/app/admin/correio/page.tsx', 'correio'],
      ['apps/hub-web/app/admin/custos/page.tsx', 'custos'],
      ['apps/hub-web/app/admin/planos/page.tsx', 'planos'],
    ] as const) {
      const s = fs.readFileSync(path.join(ROOT, arq), 'utf8')
      expect(s, arq).toMatch(new RegExp(`podeVer\\((papelNoConsole\\(auth\\)|papel), '${area}'\\)\\) notFound\\(\\)`))
    }
  })
})

describe('banco: papel guardado em zro.users.platform_role', () => {
  let db: Database
  beforeAll(() => {
    db = testDatabase()
  })
  afterAll(() => db.close())

  const dar = (userId: string, papel: string | null) => db.asSystem('teste', (tx) => tx`update zro.users set platform_role = ${papel} where id = ${userId}`)

  it('0046: aceita financeiro, recusa papel inventado; a sessão traz o papel', async () => {
    const u = await newUser(db, 'fin')
    await dar(u.userId, 'financeiro')
    expect((await authenticate(db, u.token))!.user.platformRole).toBe('financeiro')
    await expect(dar(u.userId, 'dono')).rejects.toThrow(/users_platform_role_check/)
  })

  it('isolamento: ninguém se promove pelo papel zro_app (RLS e privilégio de coluna)', async () => {
    const u = await newUser(db, 'quer-ser-admin')
    await expect(db.asUser({ userId: u.userId, orgId: null }, (tx) => tx`update zro.users set platform_role = 'admin' where id = ${u.userId}`)).rejects.toThrow(
      /permission denied/,
    )
    await dar(u.userId, 'financeiro')
    await expect(db.asUser({ userId: u.userId, orgId: null }, (tx) => tx`update zro.users set platform_role = 'admin' where id = ${u.userId}`)).rejects.toThrow(
      /permission denied/,
    )
    const [r] = await db.sql`select platform_role from zro.users where id = ${u.userId}`
    expect(r!.platform_role).toBe('financeiro')
  })

  it('isolamento: o Financeiro não é admin para o RLS (Laboratório da Z segue fechado)', async () => {
    const u = await newUser(db, 'fin-lab')
    await dar(u.userId, 'financeiro')
    const [r] = await db.asUser(
      { userId: u.userId, orgId: null },
      (tx) => tx`select zro.is_platform_admin() as admin, (select count(*)::int from zro.z_lab_config) as n`,
    )
    expect(r).toEqual({ admin: false, n: 0 })
    await dar(u.userId, 'admin')
    const [a] = await db.asUser(
      { userId: u.userId, orgId: null },
      (tx) => tx`select zro.is_platform_admin() as admin, (select count(*)::int from zro.z_lab_config) as n`,
    )
    expect(a).toEqual({ admin: true, n: 1 })
  })

  it('só admin atribui; nunca o próprio papel; conta precisa de e-mail confirmado; tudo na auditoria', async () => {
    const admin = await newUser(db, 'admin-papeis')
    await dar(admin.userId, 'admin')
    const alvo = await newUser(db, 'vai-ser-fin')
    const fin = await newUser(db, 'ja-e-fin')
    await dar(fin.userId, 'financeiro')
    const semEmail = await newUser(db, 'sem-email', { verified: false })

    const r = await db.asSystem('t', (tx) => definirPapelDoConsole(tx, admin, { email: alvo.email.toUpperCase() }, 'financeiro'))
    expect(r).toMatchObject({ de: null, para: 'financeiro', mudou: true })
    expect((await authenticate(db, alvo.token))!.user.platformRole).toBe('financeiro')
    expect((await db.asSystem('t', (tx) => definirPapelDoConsole(tx, admin, { userId: alvo.userId }, 'financeiro'))).mudou).toBe(false)

    // Financeiro (ou suporte) não atribui, nem a si mesmo
    await expect(db.asSystem('t', (tx) => definirPapelDoConsole(tx, fin, { userId: fin.userId }, 'admin'))).rejects.toMatchObject({
      code: 'platform_role_required',
    })
    await expect(db.asSystem('t', (tx) => definirPapelDoConsole(tx, alvo, { email: semEmail.email }, 'financeiro'))).rejects.toMatchObject({
      code: 'platform_role_required',
    })
    // nem o admin muda o próprio papel
    await expect(db.asSystem('t', (tx) => definirPapelDoConsole(tx, admin, { userId: admin.userId }, null))).rejects.toMatchObject({
      code: 'action_not_allowed',
    })
    await expect(db.asSystem('t', (tx) => definirPapelDoConsole(tx, admin, { email: semEmail.email }, 'financeiro'))).rejects.toMatchObject({
      code: 'conflict',
    })
    await expect(db.asSystem('t', (tx) => definirPapelDoConsole(tx, admin, { email: 'ninguem@teste.local' }, 'financeiro'))).rejects.toMatchObject({
      code: 'not_found',
    })

    const lista = await db.asSystem('t', (tx) => listarPapeisDoConsole(tx))
    expect(lista.find((p) => p.userId === alvo.userId)).toMatchObject({ papel: 'financeiro', emailConfirmado: true })

    await db.asSystem('t', (tx) => definirPapelDoConsole(tx, admin, { userId: alvo.userId }, null))
    expect((await authenticate(db, alvo.token))!.user.platformRole).toBeNull()
    const logs =
      await db.sql`select action, actor_kind, metadata from zro.audit_logs where target_id = ${alvo.userId} and action like 'admin.papel_console_%' order by id`
    expect(logs.map((l) => [l.action, l.actor_kind, l.metadata])).toEqual([
      ['admin.papel_console_definido', 'admin', { de: null, para: 'financeiro' }],
      ['admin.papel_console_removido', 'admin', { de: 'financeiro', para: null }],
    ])
  })
})
