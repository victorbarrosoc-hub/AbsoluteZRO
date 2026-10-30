// Laboratório da Z (migração 0036, ADR 0033): só o admin da plataforma (403 para o resto, suporte inclusive), RLS das
// tabelas z_*, teto por dia (sem teto = bloqueado; passou = bloqueado), uso idempotente, versões imutáveis, restaurar,
// publicar só com a trava ligada e confirmação, a Z dos clientes lendo só a versão publicada, recursos por plano,
// conhecimento, escuta ao vivo limitada ao tempo real e auditoria de cada mudança.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Authenticated } from '@zro/auth'
import {
  abrirEscuta,
  adicionarConhecimento,
  adminDoLab,
  arquivarConhecimento,
  conferirTeto,
  configDaVersao,
  definirTeto,
  despublicar,
  estadoDoLab,
  fecharEscuta,
  gastoDoLab,
  mudarRecurso,
  publicarVersao,
  rascunhoDoLab,
  recursoDaZLiberado,
  registrarUso,
  restaurarVersao,
  salvarRascunho,
  salvarVersao,
  textosDoConhecimento,
  Z_IDENTIDADE_LAB,
  Z_IDENTIDADE_PADRAO,
  zConfigPadrao,
  zConfigPublicada,
  type ZConfig,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { expectCode, givePlan, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
let admin: { userId: string; token: string; auth: Authenticated }
let comum: Awaited<ReturnType<typeof newOrgWithOwner>>
let suporte: { userId: string; token: string; auth: Authenticated }

async function comPapel(label: string, papel: 'admin' | 'support') {
  const u = await newUser(db, label)
  await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = ${papel} where id = ${u.userId}`)
  return { ...u, auth: await refresh(db, u.token) }
}

beforeAll(async () => {
  db = testDatabase()
  admin = await comPapel('z-lab-admin', 'admin')
  suporte = await comPapel('z-lab-suporte', 'support')
  comum = await newOrgWithOwner(db, 'z-lab-cliente')
})

afterAll(async () => {
  await db.close()
})

const TABELAS = ['z_lab_config', 'z_lab_uso', 'z_conhecimento', 'z_versoes', 'z_rascunho', 'z_publicacao', 'z_recursos'] as const

describe('Laboratório da Z: quem pode', () => {
  it('quem não é admin da plataforma recebe 403 em tudo (suporte também)', async () => {
    for (const quem of [comum.auth, suporte.auth]) {
      const ops: Promise<unknown>[] = [
        estadoDoLab(db, quem),
        gastoDoLab(db, quem),
        rascunhoDoLab(db, quem),
        salvarRascunho(db, quem, zConfigPadrao()),
        salvarVersao(db, quem, { nota: 'x' }),
        restaurarVersao(db, quem, 1),
        configDaVersao(db, quem, 1),
        publicarVersao(db, quem, 1, { confirmar: 'publicar' }),
        despublicar(db, quem, { confirmar: 'padrao' }),
        definirTeto(db, quem, { teto: 100 }),
        conferirTeto(db, quem),
        mudarRecurso(db, quem, 'voz', { ligado: true, planos: [], confirmar: true }),
        adicionarConhecimento(db, quem, { titulo: 'x', texto: 'y' }),
        arquivarConhecimento(db, quem, '00000000-0000-4000-8000-000000000000'),
        textosDoConhecimento(db, quem, ['00000000-0000-4000-8000-000000000000']),
        fecharEscuta(db, quem, { sessao: '00000000-0000-4000-8000-000000000000', segundos: 1 }),
      ]
      for (const op of ops) {
        const e = await expectCode(op, 'platform_role_required')
        expect(e.status).toBe(403)
      }
    }
    expect(() => adminDoLab(null)).toThrow()
  })

  it('RLS: fora da administração ninguém vê nem grava uma linha, mesmo sem a checagem do servidor', async () => {
    await definirTeto(db, admin.auth, { teto: 50 })
    await registrarUso(db, adminDoLab(admin.auth), { servico: 'claude', custoUsd: 0.01, chave: 'claude:rls-teste-1' })
    for (const quem of [
      { userId: comum.userId, orgId: comum.orgId },
      { userId: suporte.userId, orgId: null },
    ]) {
      for (const t of TABELAS) {
        const rows = await db.asUser(quem, (tx) => tx.unsafe(`select * from zro.${t}`))
        expect(rows.length, t).toBe(0)
      }
      await expect(
        db.asUser(quem, (tx) => tx`insert into zro.z_lab_uso (user_id, servico, custo_usd, chave) values (${quem.userId}, 'voz', 0, 'voz:invasao-1234')`),
      ).rejects.toMatchObject({ code: '42501' })
      await expect(
        db.asUser(quem, (tx) => tx`insert into zro.z_versoes (numero, nota, config, criada_por) values (999, 'x', '{}'::jsonb, ${quem.userId})`),
      ).rejects.toMatchObject({ code: '42501' })
      const mudou = await db.asUser(quem, (tx) => tx`update zro.z_lab_config set teto_diario_usd = 9999, atualizado_por = ${quem.userId} returning id`)
      expect(mudou.length).toBe(0)
      const ligou = await db.asUser(quem, (tx) => tx`update zro.z_recursos set ligado = true, atualizado_por = ${quem.userId} returning recurso`)
      expect(ligou.length).toBe(0)
      // O que ela pode: perguntar à função dos clientes, que só devolve a versão publicada (nenhuma agora).
      expect(await db.asUser(quem, zConfigPublicada)).toBeNull()
    }
    // O admin vê.
    const [c] = await db.asUser({ userId: admin.userId, orgId: null }, (tx) => tx`select teto_diario_usd::float8 as t from zro.z_lab_config`)
    expect(c!.t).toBe(50)
    // Admin não grava em nome de outra pessoa.
    await expect(
      db.asUser(
        { userId: admin.userId, orgId: null },
        (tx) => tx`insert into zro.z_lab_uso (user_id, servico, custo_usd, chave) values (${comum.userId}, 'voz', 0, 'voz:outra-pessoa-1')`,
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('Laboratório da Z: teto e uso', () => {
  it('sem teto = bloqueado; com teto, conta o uso uma vez só e bloqueia ao passar', async () => {
    await definirTeto(db, admin.auth, { teto: null })
    await expectCode(conferirTeto(db, admin.auth), 'quota_not_configured')
    await definirTeto(db, admin.auth, { teto: 0.05 })
    const antes = (await gastoDoLab(db, admin.auth)).hoje
    const a = await conferirTeto(db, admin.auth, 0.001)
    expect(await registrarUso(db, a, { servico: 'voz', modelo: 'eleven_flash_v2_5', caracteres: 100, custoUsd: 0.004, chave: 'voz:idem-chave-1' })).toBe(true)
    // A mesma chamada de novo (rede repetiu): não conta outra vez.
    expect(await registrarUso(db, a, { servico: 'voz', modelo: 'eleven_flash_v2_5', caracteres: 100, custoUsd: 0.004, chave: 'voz:idem-chave-1' })).toBe(false)
    const g = await gastoDoLab(db, admin.auth)
    expect(g.hoje - antes).toBeCloseTo(0.004, 6)
    expect(g.porServico.voz).toBeGreaterThanOrEqual(0.004)
    // Passa do teto: bloqueia até subir o teto.
    const e = await expectCode(conferirTeto(db, admin.auth, 1), 'quota_exceeded')
    expect(e.status).toBe(429)
    await registrarUso(db, a, { servico: 'claude', custoUsd: 0.05, chave: 'claude:estoura-o-teto' })
    await expectCode(conferirTeto(db, admin.auth), 'quota_exceeded')
    await definirTeto(db, admin.auth, { teto: 100 })
    await expect(conferirTeto(db, admin.auth)).resolves.toMatchObject({ userId: admin.userId })
    await expectCode(definirTeto(db, admin.auth, { teto: -1 }), 'invalid_input')
    await expectCode(registrarUso(db, a, { servico: 'voz', custoUsd: 0, chave: 'sem formato' }), 'invalid_input')
  })

  it('escuta ao vivo: abre com custo zero e fecha pelo menor entre o relato e o tempo real', async () => {
    const a = adminDoLab(admin.auth)
    const sessao = '7d1f2c3a-1111-4222-8333-944455556666'
    await abrirEscuta(db, a, sessao)
    // O navegador diz 600 s, mas a sessão abriu agora: conta no máximo o tempo real (+2 s de folga).
    const r = await fecharEscuta(db, admin.auth, { sessao, segundos: 600 })
    expect(r.segundos).toBeLessThan(5)
    expect(r.custoUsd).toBeLessThan(0.001)
    await expectCode(fecharEscuta(db, admin.auth, { sessao, segundos: 1 }), 'not_found')
  })
})

describe('Laboratório da Z: rascunho, versões e publicação', () => {
  it('o primeiro rascunho é a Z de hoje com a personalidade feminina proposta', async () => {
    const r = await rascunhoDoLab(db, admin.auth)
    expect(r.identidade).toBe(Z_IDENTIDADE_LAB)
    expect(r.identidade).toMatch(/fiquei curiosa/)
    expect(r.regras.length).toBeGreaterThan(50)
    expect(r.modelo).toEqual({ id: 'claude-opus-5-5', resposta: 'media' })
    expect(Z_IDENTIDADE_PADRAO).toMatch(/feminino/)
  })

  it('salva, numera, não deixa mudar versão, restaura, compara e só publica com a trava e a confirmação', async () => {
    const base = await rascunhoDoLab(db, admin.auth)
    const k = await adicionarConhecimento(db, admin.auth, { titulo: 'Planos', texto: 'O plano Estúdio custa R$ 99 por mês.' })
    const v1cfg: ZConfig = { ...base, identidade: `${base.identidade} Versão um.`, conhecimento: [k.id], apps: { maestro: 'Fale do funil primeiro.' } }
    await salvarRascunho(db, admin.auth, v1cfg)
    const v1 = await salvarVersao(db, admin.auth, { nota: 'Primeira' })
    await salvarRascunho(db, admin.auth, { ...v1cfg, identidade: 'Outra Z.' })
    const v2 = await salvarVersao(db, admin.auth, { nota: 'Segunda' })
    expect(v2.numero).toBe(v1.numero + 1)
    await expectCode(salvarVersao(db, admin.auth, { nota: '  ' }), 'invalid_input')
    await expectCode(salvarRascunho(db, admin.auth, { ...v1cfg, identidade: '' }), 'invalid_input')
    await expectCode(salvarRascunho(db, admin.auth, { ...v1cfg, extra: 1 }), 'invalid_input')
    await expectCode(salvarRascunho(db, admin.auth, { ...v1cfg, conhecimento: ['00000000-0000-4000-8000-000000000000'] }), 'invalid_input')

    // Imutável: nem o dono das tabelas edita ou apaga.
    await expect(db.asSystem('teste', (tx) => tx`update zro.z_versoes set nota = 'mexi' where numero = ${v1.numero}`)).rejects.toThrow(/imutável/)
    await expect(db.asSystem('teste', (tx) => tx`delete from zro.z_versoes where numero = ${v1.numero}`)).rejects.toThrow(/imutável/)

    expect((await configDaVersao(db, admin.auth, v1.numero)).identidade).toMatch(/Versão um\.$/)
    expect((await rascunhoDoLab(db, admin.auth)).identidade).toBe('Outra Z.')
    const restaurado = await restaurarVersao(db, admin.auth, v1.numero)
    expect(restaurado.identidade).toMatch(/Versão um\.$/)
    expect((await estadoDoLab(db, admin.auth)).baseVersao).toBe(v1.numero)
    await expectCode(restaurarVersao(db, admin.auth, 9999), 'not_found')

    // Publicar: desligado por padrão (403), e a Z dos clientes segue o padrão do código.
    const e = await expectCode(publicarVersao(db, admin.auth, v1.numero, { confirmar: 'publicar' }), 'action_not_allowed')
    expect(e.status).toBe(403)
    expect(await db.asUser({ userId: comum.userId, orgId: comum.orgId }, zConfigPublicada)).toBeNull()

    // Ligar a trava pede confirmação explícita.
    await expectCode(mudarRecurso(db, admin.auth, 'publicar_config', { ligado: true, planos: [] }), 'invalid_input')
    await mudarRecurso(db, admin.auth, 'publicar_config', { ligado: true, planos: [], confirmar: true })
    await expectCode(publicarVersao(db, admin.auth, v1.numero, {}), 'invalid_input')
    await publicarVersao(db, admin.auth, v1.numero, { confirmar: 'publicar' })

    // A Z dos clientes lê a versão publicada (com o texto de referência), nunca o rascunho.
    await salvarRascunho(db, admin.auth, { ...v1cfg, identidade: 'Rascunho secreto.' })
    const pub = await db.asUser({ userId: comum.userId, orgId: comum.orgId }, zConfigPublicada)
    expect(pub?.versao).toBe(v1.numero)
    expect(pub?.identidade).toMatch(/Versão um\.$/)
    expect(pub?.conhecimento_textos).toEqual([{ titulo: 'Planos', texto: 'O plano Estúdio custa R$ 99 por mês.' }])
    expect(pub?.apps.maestro).toBe('Fale do funil primeiro.')

    // Arquivar o texto não muda a versão publicada.
    await arquivarConhecimento(db, admin.auth, k.id)
    expect((await rascunhoDoLab(db, admin.auth)).conhecimento).toEqual([])
    expect((await db.asUser({ userId: comum.userId, orgId: comum.orgId }, zConfigPublicada))?.conhecimento_textos).toHaveLength(1)

    // Desligou a trava: os clientes voltam na hora para o padrão.
    await mudarRecurso(db, admin.auth, 'publicar_config', { ligado: false, planos: [], confirmar: true })
    expect(await db.asUser({ userId: comum.userId, orgId: comum.orgId }, zConfigPublicada)).toBeNull()
    await expectCode(despublicar(db, admin.auth, {}), 'invalid_input')
    await despublicar(db, admin.auth, { confirmar: 'padrao' })
    expect((await estadoDoLab(db, admin.auth)).publicada).toBeNull()

    const logs = await db.sql`select action from zro.audit_logs where actor_user_id = ${admin.userId} and action like 'z_lab.%' order by id`
    const acoes = logs.map((l) => l.action as string)
    for (const a of [
      'z_lab.teto',
      'z_lab.rascunho',
      'z_lab.versao_salva',
      'z_lab.versao_restaurada',
      'z_lab.recurso',
      'z_lab.versao_publicada',
      'z_lab.conhecimento_adicionado',
      'z_lab.conhecimento_arquivado',
      'z_lab.publicacao_removida',
    ])
      expect(acoes, a).toContain(a)
  })
})

describe('Laboratório da Z: recursos por plano', () => {
  it('tudo nasce desligado; ligado vale só para os planos da lista, com assinatura viva', async () => {
    const estado = await estadoDoLab(db, admin.auth)
    expect(estado.recursos.map((r) => [r.recurso, r.ligado])).toEqual([
      ['voz', false],
      ['ditado', false],
      ['anexos', false],
      ['publicar_config', false],
    ])
    const org = await newOrgWithOwner(db, 'z-lab-plano')
    await givePlan(db, org.orgId, 'ciclo-do-o')
    const [plano] = await db.sql`select code from zro.plans where code = 'ciclo-do-o' limit 1`
    expect(plano).toBeTruthy()
    const liberado = () => db.asUser({ userId: org.userId, orgId: org.orgId }, (tx) => recursoDaZLiberado(tx, 'voz', org.orgId))
    expect(await liberado()).toBe(false)
    await expectCode(mudarRecurso(db, admin.auth, 'voz', { ligado: true, planos: ['nao-existe'], confirmar: true }), 'invalid_input')
    await expectCode(mudarRecurso(db, admin.auth, 'teletransporte', { ligado: true, planos: [], confirmar: true }), 'not_found')
    await mudarRecurso(db, admin.auth, 'voz', { ligado: true, planos: ['ciclo-do-o'], confirmar: true })
    expect(await liberado()).toBe(true)
    // Outra organização sem o plano: não.
    expect(await db.asUser({ userId: comum.userId, orgId: comum.orgId }, (tx) => recursoDaZLiberado(tx, 'voz', comum.orgId))).toBe(false)
    await mudarRecurso(db, admin.auth, 'voz', { ligado: false, planos: [], confirmar: true })
    expect(await liberado()).toBe(false)
  })
})
