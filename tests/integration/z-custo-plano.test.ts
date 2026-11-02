// A Z dos clientes: modelo por plano, custo real de cada resposta em z_lab_uso, teto diário em dólar (ADR 0040, migração
// 0056). O Claude é simulado (nada chama a Anthropic): o `responder` é trocado por uma função que preenche o uso.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Authenticated } from '@zro/auth'
import { recomputeEntitlements, type Nivel, type NivelDoApp } from '@zro/billing'
import {
  concluirTurno,
  conferirTetoDosClientes,
  custoIaUsd,
  IA_MODELOS,
  IA_PRECOS,
  iniciarTurno,
  lerGastoDosClientes,
  modeloDoNivel,
  nivelDaZ,
  tetosDosClientes,
  Z_MODELO_POR_NIVEL,
  Z_TETO_MSG_GLOBAL,
  Z_TETO_MSG_USUARIO,
  Z_TETO_PADRAO,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { executarTurno, type EventoDoTurno, type Responder } from '../../apps/hub-web/lib/ia/turno-producao'
import { modeloDoTurno } from '../../apps/hub-web/lib/ia/modelo'
import { admin, expectCode, giveLimits, givePlan, newOrgWithOwner, newUser, planId } from './helpers'

vi.mock('server-only', () => ({}))

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())
afterEach(() => {
  delete process.env.Z_TETO_USUARIO_DIA_USD
  delete process.env.Z_TETO_GLOBAL_DIA_USD
})

const USO = { entrada: 1000, saida: 200, cache: 500 }

/** Um Claude simulado: usa o modelo do plano e preenche o acumulador, como o `responder` de verdade. */
const claudeOk =
  (texto = 'Tudo certo por aqui.'): Responder =>
  async (_db, turno, _emitir, _signal, opcoes) => {
    const uso = opcoes!.uso!
    uso.modelo = modeloDoTurno(turno)
    Object.assign(uso, USO)
    return { texto, uso }
  }

/** O stream cai depois de gastar tokens: o uso já está no acumulador, mas não há resposta. */
const claudeQueCai: Responder = async (_db, turno, _emitir, _signal, opcoes) => {
  const uso = opcoes!.uso!
  uso.modelo = modeloDoTurno(turno)
  uso.entrada = 800
  uso.saida = 50
  throw new Error('stream abortado')
}

async function rodar(auth: Authenticated, resp: Responder, texto = 'Como estão os projetos?', banco: Database = db) {
  const turno = await iniciarTurno(db, auth, { texto })
  const eventos: EventoDoTurno[] = []
  await executarTurno(banco, turno, (e) => eventos.push(e as EventoDoTurno), undefined, resp)
  return { turno, eventos }
}

const linhas = (perguntaId: string) => db.sql`select * from zro.z_lab_uso where chave = ${`claude:${perguntaId}`}`
const eventosDeUso = (orgId: string, perguntaId: string) =>
  db.sql`select amount from zro.usage_events where org_id = ${orgId} and idempotency_key = ${`ia:${perguntaId}`}`

async function contaAntiga(label: string) {
  const o = await newOrgWithOwner(db, label)
  const free = await planId(db, 'conta-absolute-zro', 2)
  await db.asSystem('teste', async (tx) => {
    await tx`update zro.users set created_at = '2026-10-01' where id = ${o.userId}`
    await tx`insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
             values (${o.orgId}, ${free}, 'active', '2026-10-01', 'free', ${'free-' + o.orgId}, now())`
    await recomputeEntitlements(tx, o.orgId)
  })
  return o
}

describe('mapa nível → modelo', () => {
  it('zero → Haiku; órbita, absoluto e indefinido → Sonnet', () => {
    expect(modeloDoNivel('zero')).toBe('claude-haiku-5-5')
    expect(modeloDoNivel('orbita')).toBe('claude-sonnet-5-5')
    expect(modeloDoNivel('absoluto')).toBe('claude-sonnet-5-5')
    for (const v of [null, undefined, '', 'platina', 'constructor', '__proto__']) expect(modeloDoNivel(v)).toBe('claude-sonnet-5-5')
    expect(Z_MODELO_POR_NIVEL).toEqual({ zero: IA_MODELOS.haiku, orbita: IA_MODELOS.sonnet, absoluto: IA_MODELOS.sonnet })
  })

  it('legado (absoluto), teste (absoluto) e concessão seguem o nível que o banco devolveu', () => {
    const l = (productId: string, nivel: Nivel, origem: NivelDoApp['origem']): NivelDoApp => ({ productId, nivel, origem, ate: null })
    expect(modeloDoNivel(nivelDaZ([l('maestro', 'absoluto', 'legado')], null).nivel)).toBe(IA_MODELOS.sonnet)
    expect(modeloDoNivel(nivelDaZ([l('maestro', 'absoluto', 'teste')], null).nivel)).toBe(IA_MODELOS.sonnet)
    expect(modeloDoNivel(nivelDaZ([l('maestro', 'zero', 'concessao')], null).nivel)).toBe(IA_MODELOS.haiku)
    expect(modeloDoNivel(nivelDaZ([], null).nivel)).toBe(IA_MODELOS.sonnet) // indefinido
  })

  it('no HUB vale o maior nível entre os apps; dentro de um app, o nível dele; sem linha do app, o maior', () => {
    const l = (productId: string, nivel: Nivel): NivelDoApp => ({ productId, nivel, origem: 'avulso', ate: null })
    const niveis = [l('maestro', 'absoluto'), l('synquei', 'zero'), l('relay', 'orbita')]
    expect(nivelDaZ(niveis, null).nivel).toBe('absoluto')
    expect(nivelDaZ(niveis, 'synquei').nivel).toBe('zero')
    expect(nivelDaZ(niveis, 'relay').nivel).toBe('orbita')
    expect(nivelDaZ(niveis, 'sobedesce').nivel).toBe('absoluto') // app sem linha: o maior
    expect(nivelDaZ(niveis, 'synquei').produto).toBe('synquei')
  })

  it('a tabela de preços tem Haiku 5.5 e Sonnet 5.5 corretos, e o id com data usa o preço do prefixo', () => {
    expect(IA_PRECOS['claude-haiku-5-5']).toEqual({ entrada: 0.1, saida: 0.5, cache: 0.01 })
    expect(IA_PRECOS['claude-sonnet-5-5']).toEqual({ entrada: 2, saida: 10, cache: 0.2 })
    expect(custoIaUsd('claude-sonnet-5-5', { entrada: 1_000_000, saida: 0, cache: 0 })).toBeCloseTo(2)
    expect(custoIaUsd('claude-haiku-5-5-20261001', { entrada: 1_000_000, saida: 1_000_000, cache: 0 })).toBeCloseTo(0.6)
    expect(custoIaUsd('modelo-desconhecido', { entrada: 1_000_000, saida: 0, cache: 0 })).toBeCloseTo(4) // preço do Opus, o mais caro
  })
})

describe('custo de cada resposta em z_lab_uso', () => {
  it('uma resposta cria 1 linha em z_lab_uso e 1 evento em usage_events; repetir a mesma pergunta não duplica', async () => {
    const o = await newOrgWithOwner(db, 'custo-zero', { freePlan: true })
    const { turno, eventos } = await rodar(o.auth, claudeOk())
    expect(turno.plano).toMatchObject({ nivel: 'zero', origem: 'zero', produto: null })
    expect(eventos.at(-1)).toMatchObject({ tipo: 'fim', creditos: 1 })

    const [uso, ...resto] = await linhas(turno.perguntaId)
    expect(resto).toHaveLength(0)
    expect(uso).toMatchObject({
      user_id: o.userId,
      org_id: o.orgId,
      servico: 'claude',
      modelo: IA_MODELOS.haiku,
      nivel: 'zero',
      origem: 'chat',
      produto: null,
      tokens_entrada: 1000,
      tokens_saida: 200,
      tokens_cache: 500,
    })
    expect(Number(uso!.custo_usd)).toBeCloseTo(custoIaUsd(IA_MODELOS.haiku, USO), 6)
    expect(await eventosDeUso(o.orgId, turno.perguntaId)).toHaveLength(1)

    // a mesma pergunta de novo (nova tentativa de concluir, ou o finally depois do fim): nada duplica
    await concluirTurno(db, turno, 'De novo.', { modelo: IA_MODELOS.haiku, ...USO })
    await executarTurno(db, turno, () => undefined, undefined, claudeOk())
    expect(await linhas(turno.perguntaId)).toHaveLength(1)
    expect(await eventosDeUso(o.orgId, turno.perguntaId)).toHaveLength(1)
  })

  it('órbita, absoluto e legado respondem com o Sonnet; a plataforma de origem e o nível ficam na linha', async () => {
    const orbita = await newOrgWithOwner(db, 'custo-orbita')
    await givePlan(db, orbita.orgId, 'orbita')
    const absoluto = await newOrgWithOwner(db, 'custo-absoluto')
    await givePlan(db, absoluto.orgId, 'absoluto')
    const legado = await contaAntiga('custo-legado')

    for (const [o, nivel, origem] of [
      [orbita, 'orbita', 'assinatura'],
      [absoluto, 'absoluto', 'assinatura'],
      [legado, 'absoluto', 'legado'],
    ] as const) {
      const { turno } = await rodar(o.auth, claudeOk())
      expect(turno.plano).toMatchObject({ nivel, origem })
      const [uso] = await linhas(turno.perguntaId)
      expect(uso).toMatchObject({ modelo: IA_MODELOS.sonnet, nivel, origem: 'chat' })
      expect(Number(uso!.custo_usd)).toBeCloseTo(custoIaUsd(IA_MODELOS.sonnet, USO), 6)
    }

    // dentro de um app a Z vale o nível dele; a plataforma de origem vai junto
    const viaApp: Authenticated = { ...orbita.auth, session: { ...orbita.auth.session, app: { clientId: 'maestro-web', productId: 'maestro' } } }
    const { turno } = await rodar(viaApp, claudeOk())
    expect(turno.plano).toMatchObject({ nivel: 'orbita', produto: 'maestro' })
    expect((await linhas(turno.perguntaId))[0]).toMatchObject({ produto: 'maestro', nivel: 'orbita' })
  })

  it('erro no meio ainda registra o gasto (e não gasta o crédito nem guarda resposta)', async () => {
    const o = await newOrgWithOwner(db, 'custo-erro', { freePlan: true })
    const { turno, eventos } = await rodar(o.auth, claudeQueCai)
    expect(eventos.at(-1)).toMatchObject({ tipo: 'erro' })
    const [uso, ...resto] = await linhas(turno.perguntaId)
    expect(resto).toHaveLength(0)
    expect(uso).toMatchObject({ modelo: IA_MODELOS.haiku, tokens_entrada: 800, tokens_saida: 50, origem: 'chat' })
    expect(await eventosDeUso(o.orgId, turno.perguntaId)).toHaveLength(0)
    const respostas = await db.sql`select 1 from zro.ia_mensagens where conversa_id = ${turno.conversa.id} and papel = 'assistant'`
    expect(respostas).toHaveLength(0)
    // sem token nenhum, não há o que registrar
    const vazio = await rodar(o.auth, async () => {
      throw new Error('falhou antes de gastar')
    })
    expect(await linhas(vazio.turno.perguntaId)).toHaveLength(0)
  })

  it('falha ao registrar o custo não derruba a resposta', async () => {
    const o = await newOrgWithOwner(db, 'custo-falha', { freePlan: true })
    const quebrado = new Proxy(db, {
      get(alvo, chave) {
        if (chave === 'asSystem')
          return (rotulo: string, fn: never) => (rotulo.startsWith('z: uso') ? Promise.reject(new Error('banco fora do ar')) : alvo.asSystem(rotulo, fn))
        const v = Reflect.get(alvo, chave)
        return typeof v === 'function' ? v.bind(alvo) : v
      },
    })
    const { turno, eventos } = await rodar(o.auth, claudeOk('Resposta que precisa chegar.'), 'Oi', quebrado)
    expect(eventos.at(-1)).toMatchObject({ tipo: 'fim', creditos: 1 })
    expect(await linhas(turno.perguntaId)).toHaveLength(0)
    const [m] = await db.sql`select texto from zro.ia_mensagens where conversa_id = ${turno.conversa.id} and papel = 'assistant'`
    expect(m!.texto).toBe('Resposta que precisa chegar.')
  })
})

describe('teto diário em dólar', () => {
  it('padrão conservador e leitura do ambiente: ausente ou inválido usa o padrão, 0 bloqueia', () => {
    expect(tetosDosClientes({})).toEqual(Z_TETO_PADRAO)
    expect(tetosDosClientes({ Z_TETO_USUARIO_DIA_USD: 'abc', Z_TETO_GLOBAL_DIA_USD: '-3' })).toEqual(Z_TETO_PADRAO)
    expect(tetosDosClientes({ Z_TETO_USUARIO_DIA_USD: '0.5', Z_TETO_GLOBAL_DIA_USD: '0' })).toEqual({ usuarioDiaUsd: 0.5, globalDiaUsd: 0 })
    expect(Z_TETO_PADRAO).toEqual({ usuarioDiaUsd: 1, globalDiaUsd: 20 })
  })

  it('por pessoa: chegou ao teto, a próxima pergunta nem começa; outra pessoa segue; o crédito não é gasto', async () => {
    const a = await newOrgWithOwner(db, 'teto-a', { freePlan: true })
    const b = await newOrgWithOwner(db, 'teto-b', { freePlan: true })
    process.env.Z_TETO_USUARIO_DIA_USD = '0.0003' // uma resposta do Haiku (US$ 0,000205) cabe; duas chegam ao teto
    const { turno } = await rodar(a.auth, claudeOk())
    expect(custoIaUsd(IA_MODELOS.haiku, USO)).toBeLessThan(0.0003)
    await rodar(a.auth, claudeOk())
    await expect(conferirTetoDosClientes(db, a.userId)).rejects.toMatchObject({
      code: 'quota_exceeded',
      message: Z_TETO_MSG_USUARIO,
      status: 429,
      details: { teto: 'usuario' },
    })
    const antes = await db.sql`select used from zro.quotas where org_id = ${a.orgId} and metric = 'zro.ai_credits'`
    await expectCode(iniciarTurno(db, a.auth, { texto: 'mais uma' }), 'quota_exceeded')
    const conversas = await db.sql`select 1 from zro.ia_conversas where org_id = ${a.orgId}`
    expect(conversas).toHaveLength(2) // a terceira pergunta não criou conversa
    const depois = await db.sql`select used from zro.quotas where org_id = ${a.orgId} and metric = 'zro.ai_credits'`
    expect(depois[0]!.used).toEqual(antes[0]!.used)
    expect(turno.plano?.nivel).toBe('zero')
    // outra pessoa não é afetada
    await iniciarTurno(db, b.auth, { texto: 'Oi' })
  })

  it('global: bate para todo mundo, com mensagem humana; sem limite configurado vale o padrão (não "sem teto")', async () => {
    const o = await newOrgWithOwner(db, 'teto-global', { freePlan: true })
    process.env.Z_TETO_GLOBAL_DIA_USD = '0'
    await expect(iniciarTurno(db, o.auth, { texto: 'Oi' })).rejects.toMatchObject({
      code: 'quota_exceeded',
      message: Z_TETO_MSG_GLOBAL,
      details: { teto: 'global' },
    })
    delete process.env.Z_TETO_GLOBAL_DIA_USD
    await iniciarTurno(db, o.auth, { texto: 'Oi' })
  })

  it('o chat não come o teto do Laboratório, e a franquia por créditos e as recargas seguem valendo', async () => {
    const [antes] = await db.sql`select coalesce(sum(custo_usd), 0)::float8 as c from zro.z_lab_uso where origem is distinct from 'chat'`
    const o = await newOrgWithOwner(db, 'teto-lab')
    await giveLimits(db, o.orgId, 'tpeasy', { 'zro.ai_credits': 1 })
    await rodar(o.auth, claudeOk())
    // franquia de 1 acabou: a próxima é barrada pela franquia (não pelo teto em dólar)
    await expectCode(iniciarTurno(db, o.auth, { texto: 'outra' }), 'quota_exceeded')
    const { lerGastoDoLab } = await import('@zro/core')
    const lab = await db.asSystem('teste', (tx) => lerGastoDoLab(tx))
    expect(lab.mes).toBeGreaterThanOrEqual(0)
    const [depois] = await db.sql`select coalesce(sum(custo_usd), 0)::float8 as c from zro.z_lab_uso where origem is distinct from 'chat'`
    expect(depois!.c).toBeCloseTo(antes!.c as number, 6)
  })
})

describe('isolamento e painel', () => {
  it('pessoa comum não lê nem grava z_lab_uso pelo papel da aplicação; a administração lê', async () => {
    const o = await newOrgWithOwner(db, 'iso-uso', { freePlan: true })
    const { turno } = await rodar(o.auth, claudeOk())
    const dono = { userId: o.userId, orgId: o.orgId }
    expect(await db.asUser(dono, (tx) => tx`select id from zro.z_lab_uso`)).toHaveLength(0)
    await expect(
      db.asUser(
        dono,
        (tx) =>
          tx`insert into zro.z_lab_uso (user_id, servico, custo_usd, chave, origem) values (${o.userId}, 'claude', 1, ${'claude:forjado-' + turno.perguntaId}, 'chat')`,
      ),
    ).rejects.toThrow()
    const adm = await admin(db)
    const vistas = await db.asUser({ userId: adm, orgId: null }, (tx) => tx`select id from zro.z_lab_uso where chave = ${`claude:${turno.perguntaId}`}`)
    expect(vistas).toHaveLength(1)
  })

  it('o console soma o gasto real por modelo e por nível', async () => {
    const o = await newOrgWithOwner(db, 'painel', { freePlan: true })
    const p = await newOrgWithOwner(db, 'painel-orbita')
    await givePlan(db, p.orgId, 'orbita')
    await rodar(o.auth, claudeOk())
    await rodar(p.auth, claudeOk())
    const g = await db.asSystem('teste', (tx) => lerGastoDosClientes(tx))
    expect(g.respostasMes).toBeGreaterThanOrEqual(2)
    expect(g.mes).toBeGreaterThan(0)
    expect(g.hoje).toBeGreaterThan(0)
    const modelo = (m: string) => g.porModelo.find((x) => x.modelo === m)
    expect(modelo(IA_MODELOS.haiku)!.respostas).toBeGreaterThanOrEqual(1)
    expect(modelo(IA_MODELOS.sonnet)!.respostas).toBeGreaterThanOrEqual(1)
    expect(g.porNivel.find((x) => x.nivel === 'zero')!.respostas).toBeGreaterThanOrEqual(1)
    expect(g.porNivel.find((x) => x.nivel === 'orbita')!.respostas).toBeGreaterThanOrEqual(1)
    expect(g.porModelo.reduce((n, x) => n + x.custo, 0)).toBeCloseTo(g.mes, 6)
  })

  it('administração da plataforma: nível Absoluto, modelo Sonnet quando não há versão publicada', async () => {
    const u = await newUser(db, 'adm-z')
    await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = 'admin' where id = ${u.userId}`)
    const o = await newOrgWithOwner(db, 'adm-z-org')
    await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = 'admin' where id = ${o.userId}`)
    const { authenticate } = await import('@zro/auth')
    await givePlan(db, o.orgId, 'absoluto')
    const auth = (await authenticate(db, o.token))!
    const { turno } = await rodar(auth, claudeOk())
    expect(turno.plano).toMatchObject({ nivel: 'absoluto', origem: 'admin' })
    expect(modeloDoTurno(turno)).toBe(IA_MODELOS.sonnet)
  })
})
