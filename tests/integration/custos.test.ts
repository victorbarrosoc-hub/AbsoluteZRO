// Custos do ecossistema (ADR 0028): a conta do mês e do ano (anual ÷ 12, por uso à parte, duas moedas), a projeção de
// 12 meses, o ponto de equilíbrio com os planos publicados, as recomendações por regra, o formulário, a planilha e, no
// banco, os itens iniciais, o isolamento (zro_app não lê nem grava) e a auditoria de cada mudança.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  apagarCusto,
  atualizarDolar,
  converterMoeda,
  custosCsv,
  dadosFinanceiros,
  lerConfigCustos,
  lerFormularioConfig,
  lerFormularioCotacao,
  lerFormularioCusto,
  listarCustos,
  mensalDoItem,
  nomeDoCusto,
  meses12,
  planosAVenda,
  pontoDeEquilibrio,
  recomendacoes,
  resumoCustos,
  salvarConfig,
  salvarCotacaoManual,
  salvarCusto,
  somarDinheiro,
  usarCotacaoAutomatica,
  type Custo,
  type CustosConfig,
} from '@zro/core'
import { getDatabase, type Database } from '@zro/db'
import { TEST_DATABASE_URL, testDatabase } from '@zro/db/testing'
import { admin, expectCode, newOrgWithOwner, newUser } from './helpers'

const HOJE = '2026-10-29'
const SEM_CONFIG: CustosConfig = {
  cotacao: null,
  cotacaoEm: null,
  cotacaoFonte: null,
  cotacaoModo: 'auto',
  cotacaoManual: null,
  cotacaoManualEm: null,
  cotacaoAuto: null,
  cotacaoAutoEm: null,
  cotacaoAutoBuscadaEm: null,
  cotacaoAutoErro: null,
  cotacaoAutoErroEm: null,
  metaReceitaMensal: null,
  metaAssinantes: null,
  dataAlvo: null,
}

let n = 0
function custo(p: Partial<Custo>): Custo {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    fornecedor: `F${n}`,
    item: `Item ${n}`,
    categoria: 'outros',
    plano: null,
    valor: 0,
    moeda: 'USD',
    periodicidade: 'mensal',
    estado: 'ativo',
    gatilho: null,
    comecaEm: null,
    terminaEm: null,
    link: null,
    observacao: null,
    conferidoEm: null,
    aConferir: false,
    produtos: [],
    cobraUso: false,
    tetoMensal: null,
    valorAnual: null,
    atualizadoEm: new Date().toISOString(),
    ...p,
  }
}

describe('conta do mês e do ano', () => {
  it('mensal entra inteiro, anual ÷ 12, por uso fica fora', () => {
    expect(mensalDoItem({ valor: 200, periodicidade: 'mensal' })).toBe(200)
    expect(mensalDoItem({ valor: 99, periodicidade: 'anual' })).toBeCloseTo(8.25)
    expect(mensalDoItem({ valor: 50, periodicidade: 'por_uso' })).toBe(0)
  })

  it('converte com a cotação; zero não precisa dela; sem cotação vira null', () => {
    expect(converterMoeda(10, 'USD', 'BRL', 5.5)).toBeCloseTo(55)
    expect(converterMoeda(55, 'BRL', 'USD', 5.5)).toBeCloseTo(10)
    expect(converterMoeda(0, 'BRL', 'USD', null)).toBe(0)
    expect(converterMoeda(10, 'USD', 'BRL', null)).toBeNull()
    expect(somarDinheiro([{ valor: 10, moeda: 'USD' }], null)).toEqual({ usd: 10, brl: null })
    expect(
      somarDinheiro(
        [
          { valor: 10, moeda: 'USD' },
          { valor: 11, moeda: 'BRL' },
        ],
        5.5,
      ),
    ).toEqual({ usd: 12, brl: 66 })
  })

  it('resumo: só o vigente conta; por uso aparece como "+ uso"; gráficos na moeda base', () => {
    const itens = [
      custo({ fornecedor: 'Anthropic', categoria: 'ia', valor: 200 }),
      custo({ fornecedor: 'Apple', categoria: 'lojas', valor: 99, periodicidade: 'anual' }),
      custo({ fornecedor: 'Vercel', categoria: 'hospedagem', valor: 20, cobraUso: true }),
      custo({ fornecedor: 'API', categoria: 'ia', periodicidade: 'por_uso' }),
      custo({ fornecedor: 'Supabase', valor: 25, estado: 'futuro', gatilho: 'Quando sair do grátis' }),
      custo({ fornecedor: 'Velho', valor: 10, terminaEm: '2026-09-30' }),
      custo({ fornecedor: 'Pausa', valor: 10, estado: 'pausado' }),
      custo({ fornecedor: 'Resend', valor: 0, moeda: 'BRL', aConferir: true }),
    ]
    const r = resumoCustos(itens, { cotacao: null }, HOJE)
    expect(r.base).toBe('USD')
    expect(r.mensal.usd).toBeCloseTo(228.25)
    expect(r.mensal.brl).toBeNull()
    expect(r.anual.usd).toBeCloseTo(2739)
    expect(r.uso.map((u) => u.nome)).toEqual(['Vercel · Item 3', 'API · Item 4'])
    expect(r.aConferir).toBe(1)
    expect(r.categorias.map((c) => c.categoria)).toEqual(['ia', 'hospedagem', 'lojas'])
    expect(r.fornecedores[0]).toEqual({ fornecedor: 'Anthropic', valor: 200 })
    expect(r.semData.map((s) => s.nome)).toEqual(['Supabase · Item 5'])

    const comCotacao = resumoCustos(itens, { cotacao: 5 }, HOJE)
    expect(comCotacao.base).toBe('BRL')
    expect(comCotacao.mensal.brl).toBeCloseTo(1141.25)
    expect(comCotacao.anual.brl).toBeCloseTo(13695)
  })

  it('nome sem repetir o fornecedor', () => {
    expect(nomeDoCusto({ fornecedor: 'Apple', item: 'Apple Developer Program' })).toBe('Apple Developer Program')
    expect(nomeDoCusto({ fornecedor: 'Vercel', item: 'Pro' })).toBe('Vercel · Pro')
  })

  it('item em reais sem cotação fica fora dos gráficos e é contado', () => {
    const r = resumoCustos([custo({ valor: 30, moeda: 'BRL' }), custo({ valor: 10 })], { cotacao: null }, HOJE)
    expect(r.mensal).toEqual({ usd: null, brl: null })
    expect(r.semCotacao).toBe(1)
    expect(r.fornecedores).toHaveLength(1)
  })

  it('projeção de 12 meses empilha ativo, previsto e futuro pelo mês estimado', () => {
    expect(meses12(HOJE).map((m) => m.mes)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
      '2027-09',
    ])
    expect(meses12('2026-12-31')[1]).toEqual({ mes: '2027-01', inicio: '2027-01-01', fim: '2027-01-31' })
    const p = resumoCustos(
      [
        custo({ valor: 100 }),
        custo({ valor: 25, estado: 'futuro', comecaEm: '2027-01-15' }),
        custo({ valor: 120, periodicidade: 'anual', estado: 'previsto', comecaEm: '2026-11-01', terminaEm: '2027-02-28' }),
        custo({ valor: 50, estado: 'futuro' }), // sem data: fora
      ],
      { cotacao: null },
      HOJE,
    ).projecao
    expect(p[0]).toEqual({ mes: '2026-10', ativo: 100, previsto: 0, futuro: 0 })
    expect(p[1]).toEqual({ mes: '2026-11', ativo: 100, previsto: 10, futuro: 0 })
    expect(p[3]).toEqual({ mes: '2027-01', ativo: 100, previsto: 10, futuro: 25 })
    expect(p[5]).toEqual({ mes: '2027-03', ativo: 100, previsto: 0, futuro: 25 })
  })
})

describe('ponto de equilíbrio', () => {
  const planos = planosAVenda([
    { name: 'Absolute ZRO Completo', kind: 'bundle', price_cents: 14990, currency: 'BRL', billing_interval: 'month' },
    { name: 'Absolute ZRO Completo', kind: 'bundle', price_cents: 149900, currency: 'BRL', billing_interval: 'year' },
    { name: 'Absolute ZRO Pro', kind: 'bundle', price_cents: 29990, currency: 'BRL', billing_interval: 'month' },
    { name: 'Synquei', kind: 'individual', price_cents: 5990, currency: 'BRL', billing_interval: 'month' },
    { name: 'TPeasy', kind: 'individual', price_cents: 5990, currency: 'BRL', billing_interval: 'month' },
    { name: 'Só anual', kind: 'bundle', price_cents: 120000, currency: 'BRL', billing_interval: 'year' },
    { name: 'Grátis', kind: 'free', price_cents: null, currency: null, billing_interval: null },
  ])

  it('um plano por nome, mensal primeiro; anual sozinho entra ÷ 12', () => {
    expect(planos).toEqual([
      { nome: 'Avulso (1 app)', tipo: 'individual', precoMensal: 59.9 },
      { nome: 'Só anual', tipo: 'bundle', precoMensal: 100 },
      { nome: 'Absolute ZRO Completo', tipo: 'bundle', precoMensal: 149.9 },
      { nome: 'Absolute ZRO Pro', tipo: 'bundle', precoMensal: 299.9 },
    ])
  })

  it('assinantes para cobrir o mês arredondam para cima; sem cotação, null', () => {
    const e = pontoDeEquilibrio(1331, planos)
    expect(e.map((p) => p.assinantes)).toEqual([23, 14, 9, 5])
    expect(pontoDeEquilibrio(299.9, planos).at(-1)!.assinantes).toBe(1)
    expect(pontoDeEquilibrio(0, planos)[0]!.assinantes).toBe(0)
    expect(pontoDeEquilibrio(null, planos)[0]!.assinantes).toBeNull()
  })
})

describe('recomendações por regra', () => {
  const dados = {
    planos: [{ nome: 'Absolute ZRO Completo', tipo: 'bundle', precoMensal: 149.9 }],
    receita: { assinantes: 0, mensalBRL: 0 },
    contasAtivas: 4,
  }
  it('anual mais barato, sem teto, a conferir, por conta, sem receita e próximos gatilhos', () => {
    const itens = [
      custo({ fornecedor: 'Vercel', item: 'Pro', valor: 20, cobraUso: true, valorAnual: 200, aConferir: true }),
      custo({ fornecedor: 'Anthropic', item: 'API', periodicidade: 'por_uso', tetoMensal: 50 }),
      custo({ fornecedor: 'Supabase', item: 'Pro', valor: 25, estado: 'futuro', gatilho: 'Quando o banco sair do plano grátis' }),
      custo({ fornecedor: 'Apple', item: 'Dev', valor: 99, periodicidade: 'anual', estado: 'futuro', comecaEm: '2027-01-01' }),
      custo({ fornecedor: 'Velho', item: 'X', valor: 1, conferidoEm: '2026-01-01' }),
    ]
    const resumo = resumoCustos(itens, { cotacao: 5 }, HOJE)
    const r = recomendacoes({ custos: itens, resumo, config: { ...SEM_CONFIG, cotacao: 5, cotacaoEm: HOJE, cotacaoFonte: 'bcb' }, dados, hoje: HOJE })
    const t = Object.fromEntries(r.map((x) => [x.id.replace(/-[0-9a-f-]{36}$/, ''), x]))
    expect(t.anual!.titulo).toBe('Vercel · Pro: no anual, economiza US$ 40 por ano')
    expect(t['sem-teto']!.titulo).toBe('1 item cobra por uso sem teto')
    expect(t['sem-teto']!.detalhe).toContain('Vercel · Pro')
    expect(t['sem-teto']!.detalhe).not.toContain('Anthropic')
    expect(t['a-conferir']!.titulo).toBe('1 item a conferir')
    expect(t['conferencia-antiga']!.detalhe).toBe('Velho · X')
    // (20 + 1) × 5 = R$ 105 por mês ÷ 4 contas
    expect(t['por-conta']!.titulo).toBe('R$ 26,25 por conta ativa por mês')
    expect(t['sem-receita']!.detalhe).toBe('O custo sai do caixa. 1 assinante do Absolute ZRO Completo cobre o mês.')
    const gatilhos = r.filter((x) => x.id.startsWith('gatilho-')).map((x) => x.titulo)
    expect(gatilhos).toEqual(['Apple · Dev · US$ 99/ano', 'Supabase · Pro · US$ 25/mês'])
    expect(r.find((x) => x.titulo.startsWith('Apple'))!.detalhe).toBe('Entra a partir de jan/27.')
    expect(r.find((x) => x.titulo.startsWith('Supabase'))!.detalhe).toBe('Entra quando o banco sair do plano grátis.')
  })

  it('receita abaixo do custo e cotação que falta', () => {
    const itens = [custo({ valor: 100, moeda: 'BRL' }), custo({ valor: 10 })]
    const semCot = recomendacoes({ custos: itens, resumo: resumoCustos(itens, { cotacao: null }, HOJE), config: SEM_CONFIG, dados, hoje: HOJE })
    expect(semCot.some((x) => x.id === 'cotacao')).toBe(true)
    const pago = { ...dados, receita: { assinantes: 1, mensalBRL: 59.9 } }
    const r = recomendacoes({
      custos: itens,
      resumo: resumoCustos(itens, { cotacao: 5 }, HOJE),
      config: { ...SEM_CONFIG, cotacao: 5 },
      dados: pago,
      hoje: HOJE,
    })
    expect(r.find((x) => x.id === 'abaixo-do-custo')!.titulo).toBe('Receita cobre 39% do custo')
  })
})

describe('formulário e planilha', () => {
  const base = { fornecedor: 'Vercel', item: 'Pro', categoria: 'hospedagem', valor: '1.234,5', moeda: 'USD', periodicidade: 'mensal', estado: 'ativo' }
  it('lê números brasileiros, datas e apps conhecidos', () => {
    const c = lerFormularioCusto({ ...base, produtos: 'synquei, maestro', comecaEm: '2026-11-01', cobraUso: 'on', valorAnual: '200' }, ['synquei', 'maestro'])
    expect(c.valor).toBe(1234.5)
    expect(c.produtos).toEqual(['synquei', 'maestro'])
    expect(c.cobraUso).toBe(true)
    expect(c.valorAnual).toBe(200)
    expect(lerFormularioCusto({ ...base, periodicidade: 'anual', cobraUso: 'on', valorAnual: '200' }).valorAnual).toBeNull()
  })

  it('recusa o que não fecha', () => {
    expect(() => lerFormularioCusto({ ...base, fornecedor: ' ' })).toThrow('Informe o fornecedor.')
    expect(() => lerFormularioCusto({ ...base, categoria: 'x' })).toThrow('Categoria')
    expect(() => lerFormularioCusto({ ...base, valor: '-3' })).toThrow('Valor')
    expect(() => lerFormularioCusto({ ...base, link: 'http://x' })).toThrow('https://')
    expect(() => lerFormularioCusto({ ...base, produtos: 'outro' }, ['synquei'])).toThrow('App desconhecido')
    expect(() => lerFormularioCusto({ ...base, comecaEm: '2026-11-01', terminaEm: '2026-10-01' })).toThrow('Termina antes')
    expect(lerFormularioConfig({ cotacao: '5,4321', metaAssinantes: '100', dataAlvo: '2027-06-30' })).toEqual({
      metaReceitaMensal: null,
      metaAssinantes: 100,
      dataAlvo: '2027-06-30',
    })
    expect(() => lerFormularioCotacao({ cotacao: '0' }, HOJE)).toThrow('Cotação')
    expect(() => lerFormularioCotacao({ cotacao: '' }, HOJE)).toThrow('Cotação')
    expect(() => lerFormularioCotacao({ cotacao: '5,1', cotacaoEm: '2026-10-30' }, HOJE)).toThrow('futuro')
    expect(lerFormularioCotacao({ cotacao: '5,4321' }, HOJE)).toEqual({ valor: 5.4321, em: HOJE })
  })

  it('planilha com BOM, cabeçalho, R$ convertido e sem fórmula', () => {
    const csv = custosCsv([custo({ fornecedor: '=HYPERLINK("x")', item: 'A, B', valor: 10 })], { cotacao: 5 })
    expect(csv.startsWith('﻿Fornecedor,Item,Categoria')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")","A, B",Outros,,10.00,USD,Mensal,10.00,50.00,Ativo`)
  })
})

describe('no banco', () => {
  let db: Database
  let adminId: string
  beforeAll(async () => {
    db = testDatabase()
    adminId = await admin(db)
  })
  afterAll(() => db.close())

  it('a migration traz os itens que o titular listou, sem número inventado', async () => {
    const custos = await db.asSystem('teste', (tx) => listarCustos(tx))
    const por = (f: string, i: string) => custos.find((c) => c.fornecedor === f && c.item === i)!
    expect(custos.length).toBeGreaterThanOrEqual(12)
    expect(por('Anthropic', 'Claude (desenvolvimento)')).toMatchObject({ valor: 200, moeda: 'USD', periodicidade: 'mensal', estado: 'ativo', aConferir: false })
    expect(por('Anthropic', 'API da Z')).toMatchObject({ valor: 0, periodicidade: 'por_uso', aConferir: true })
    expect(por('Vercel', 'Hospedagem do HUB e dos apps')).toMatchObject({ valor: 20, cobraUso: true, aConferir: true })
    expect(por('ElevenLabs', 'Voz e ditado')).toMatchObject({ valor: 22, plano: 'Creator' })
    expect(por('Supabase', 'Banco de dados')).toMatchObject({ valor: 25, estado: 'futuro', gatilho: 'Quando o banco sair do plano grátis' })
    expect(por('Apple', 'Apple Developer Program')).toMatchObject({ valor: 99, periodicidade: 'anual', estado: 'futuro' })
    expect(por('Google', 'Avaliação de segurança CASA')).toMatchObject({ valor: 0, estado: 'futuro', aConferir: true, produtos: ['sobedesce'] })
    expect(custos.every((c) => c.conferidoEm === '2026-10-29')).toBe(true)
    const cfg = await db.asSystem('teste', (tx) => lerConfigCustos(tx))
    expect(cfg).toEqual(SEM_CONFIG)
    // Ativos hoje: 200 + 20 + 22 (US$); o resto é zero, futuro ou por uso.
    expect(resumoCustos(custos, cfg, HOJE).mensal.usd).toBe(242)
  })

  it('zro_app não lê nem grava custos (isolamento)', async () => {
    const pessoa = await newOrgWithOwner(db, 'custos-rls')
    const ctx = { userId: pessoa.userId, orgId: pessoa.orgId }
    for (const q of [
      (tx: Parameters<Parameters<Database['asUser']>[1]>[0]) => tx`select id from zro.custos`,
      (tx: Parameters<Parameters<Database['asUser']>[1]>[0]) => tx`select * from zro.custos_config`,
      (tx: Parameters<Parameters<Database['asUser']>[1]>[0]) =>
        tx`insert into zro.custos (fornecedor, item, categoria, periodicidade, estado) values ('x', 'y', 'outros', 'mensal', 'ativo')`,
      (tx: Parameters<Parameters<Database['asUser']>[1]>[0]) => tx`update zro.custos set valor = 0`,
      (tx: Parameters<Parameters<Database['asUser']>[1]>[0]) => tx`delete from zro.custos`,
      (tx: Parameters<Parameters<Database['asUser']>[1]>[0]) => tx`update zro.custos_config set cotacao_usd_brl = 1`,
    ]) {
      await expect(db.asUser(ctx, q)).rejects.toMatchObject({ code: '42501' })
    }
    // Mesmo um admin da plataforma, como usuário comum (asUser), não enxerga: só o console, como sistema.
    await expect(db.asUser({ userId: adminId, orgId: null }, (tx) => tx`select id from zro.custos`)).rejects.toMatchObject({ code: '42501' })
  })

  it('criar, alterar, apagar e configurar ficam na auditoria (quem e o quê)', async () => {
    const ator = { userId: adminId }
    const dados = lerFormularioCusto({
      fornecedor: 'Teste',
      item: 'Auditoria',
      categoria: 'outros',
      valor: '10',
      moeda: 'BRL',
      periodicidade: 'mensal',
      estado: 'ativo',
    })
    const { id } = await db.asSystem('teste', (tx) => salvarCusto(tx, ator, dados))
    await expectCode(
      db.asSystem('teste', (tx) => salvarCusto(tx, ator, dados)),
      'conflict',
    )
    await db.asSystem('teste', (tx) => salvarCusto(tx, ator, { ...dados, valor: 12, observacao: 'nova' }, id))
    await db.asSystem('teste', (tx) => salvarCusto(tx, ator, { ...dados, valor: 12, observacao: 'nova' }, id)) // nada mudou: sem linha nova
    await db.asSystem('teste', (tx) => apagarCusto(tx, ator, id))
    await expectCode(
      db.asSystem('teste', (tx) => apagarCusto(tx, ator, id)),
      'not_found',
    )
    await db.asSystem('teste', (tx) => salvarConfig(tx, ator, { ...SEM_CONFIG, metaAssinantes: 50 }))
    expect(await db.asSystem('teste', (tx) => lerConfigCustos(tx))).toMatchObject({ cotacao: null, metaAssinantes: 50 })

    const logs = await db.sql`
      select action, actor_user_id, actor_kind, target_id, metadata from zro.audit_logs
      where action like 'admin.custo%' and actor_user_id = ${adminId} order by id`
    expect(logs.map((l) => l.action)).toEqual(['admin.custo_criado', 'admin.custo_alterado', 'admin.custo_apagado', 'admin.custos_config_alterada'])
    expect(logs.every((l) => l.actor_kind === 'admin')).toBe(true)
    expect(logs[1]!.metadata).toMatchObject({ item: 'Auditoria', campos: ['valor', 'observacao'], valor: { de: 10, para: 12 } })
    expect(JSON.stringify(logs[1]!.metadata)).not.toContain('nova')
    expect(logs[3]!.metadata).toEqual({ metaAssinantes: { de: null, para: 50 } })
    await db.asSystem('teste', (tx) => salvarConfig(tx, ator, SEM_CONFIG))
  })

  it('receita e assinantes vêm só de assinatura paga ativa; planos do banco', async () => {
    const antes = await db.asSystem('teste', (tx) => dadosFinanceiros(tx))
    expect(antes.planos.map((p) => p.nome)).toEqual(expect.arrayContaining(['Avulso (1 app)', 'Absolute ZRO Completo', 'Absolute ZRO Pro']))
    expect(antes.planos.find((p) => p.nome === 'Absolute ZRO Completo')!.precoMensal).toBe(149.9)
    const org = await newOrgWithOwner(db, 'custos-receita')
    const [plano] = await db.sql`select id from zro.plans where code = 'ciclo-do-o' and status = 'active' order by version desc limit 1`
    await db.sql`insert into zro.subscriptions (org_id, plan_id, status, provider) values (${org.orgId}, ${plano!.id}, 'active', 'manual')`
    expect((await db.asSystem('teste', (tx) => dadosFinanceiros(tx))).receita.assinantes).toBe(antes.receita.assinantes) // manual não é receita
    await db.sql`insert into zro.subscriptions (org_id, plan_id, status, provider) values (${org.orgId}, ${plano!.id}, 'active', 'stripe')`
    const depois = await db.asSystem('teste', (tx) => dadosFinanceiros(tx))
    expect(depois.receita.assinantes).toBe(antes.receita.assinantes + 1)
    expect(depois.receita.mensalBRL).toBeCloseTo(antes.receita.mensalBRL + 149.9)
    expect(depois.contasAtivas).toBeGreaterThan(0)
    await db.sql`delete from zro.subscriptions where org_id = ${org.orgId} and provider in ('manual', 'stripe')`
  })

  it('dólar automático: grava a PTAX, falha mantém o último valor, valor manual e volta ao automático na auditoria', async () => {
    // Banco Central falso: 28/10 tem PTAX; depois sai do ar.
    let fora = false
    const bcb = http.createServer((req, res) => {
      if (fora) return void res.writeHead(500).end()
      const dia = decodeURIComponent(req.url ?? '').match(/'(\d{2}-\d{2}-\d{4})'/)?.[1]
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ value: dia === '10-28-2026' ? [{ cotacaoVenda: 5.342, dataHoraCotacao: '2026-10-28 13:05:31.600' }] : [] }))
    })
    await new Promise<void>((ok) => bcb.listen(0, '127.0.0.1', ok))
    const base = `http://127.0.0.1:${(bcb.address() as AddressInfo).port}`
    const ator = { userId: adminId }
    const ler = () => db.asSystem('teste', (tx) => lerConfigCustos(tx))
    try {
      // 29/10 às 12 h em Fortaleza: a PTAX do dia ainda não saiu, vale a de 28/10.
      const r = await atualizarDolar(db, { base, agora: new Date('2026-10-29T15:00:00Z') })
      expect(r).toMatchObject({ ok: true, cotacao: { venda: 5.342, data: '2026-10-28' } })
      expect(await ler()).toMatchObject({ cotacao: 5.342, cotacaoEm: '2026-10-28', cotacaoFonte: 'bcb', cotacaoModo: 'auto', cotacaoAutoErro: null })
      // Busca recente: sem forçar, a página não pede de novo.
      expect(await atualizarDolar(db, { base })).toEqual({ ok: true, pulado: true })

      // Banco Central fora do ar: o último valor continua, com a data dele, e a falha fica anotada.
      fora = true
      const f = await atualizarDolar(db, { base, forcar: true })
      expect(f.ok).toBe(false)
      const cfg = await ler()
      expect(cfg).toMatchObject({ cotacao: 5.342, cotacaoEm: '2026-10-28', cotacaoFonte: 'bcb' })
      expect(cfg.cotacaoAutoErro).toContain('500')
      expect(cfg.cotacaoAutoErroEm).not.toBeNull()

      // "Usar valor manual": vale o digitado; o automático segue guardado.
      await db.asSystem('teste', (tx) => salvarCotacaoManual(tx, ator, { valor: 5.5, em: '2026-10-29' }))
      await db.asSystem('teste', (tx) => salvarCotacaoManual(tx, ator, { valor: 5.5, em: '2026-10-29' })) // igual: sem linha nova
      expect(await ler()).toMatchObject({ cotacao: 5.5, cotacaoEm: '2026-10-29', cotacaoFonte: 'manual', cotacaoModo: 'manual', cotacaoAuto: 5.342 })
      // O agendamento não passa por cima do manual.
      fora = false
      await atualizarDolar(db, { base, forcar: true, agora: new Date('2026-10-29T15:00:00Z') })
      expect(await ler()).toMatchObject({ cotacao: 5.5, cotacaoFonte: 'manual', cotacaoAutoErro: null })
      // "Voltar ao automático".
      await db.asSystem('teste', (tx) => usarCotacaoAutomatica(tx, ator))
      await db.asSystem('teste', (tx) => usarCotacaoAutomatica(tx, ator)) // já está: sem linha nova
      expect(await ler()).toMatchObject({ cotacao: 5.342, cotacaoFonte: 'bcb', cotacaoModo: 'auto', cotacaoManual: 5.5 })

      const logs = await db.sql`
        select action, actor_kind, metadata from zro.audit_logs
        where action like 'admin.custos_cotacao%' and actor_user_id = ${adminId} order by id`
      expect(logs.map((l) => l.action)).toEqual(['admin.custos_cotacao_manual', 'admin.custos_cotacao_automatica'])
      expect(logs[0]!.metadata).toMatchObject({ de: { modo: 'auto', cotacao: 5.342, fonte: 'bcb' }, para: { modo: 'manual', cotacao: 5.5, em: '2026-10-29' } })
      expect(logs[1]!.metadata).toMatchObject({ de: { modo: 'manual', cotacao: 5.5 }, para: { modo: 'auto', cotacao: 5.342 } })

      // O agendamento de verdade (rota), com o segredo certo, grava pelo banco do HUB.
      process.env.CRON_SECRET = 'segredo-de-teste'
      process.env.ZRO_PTAX_URL = base
      process.env.DATABASE_URL ||= TEST_DATABASE_URL
      const { GET } = await import('../../apps/hub-web/app/api/cron/dolar/route')
      const res = await GET(new Request('http://hub/api/cron/dolar', { headers: { authorization: 'Bearer segredo-de-teste' } }))
      // Hoje de verdade: o falso só tem 28/10, então pode responder 502 (dez dias vazios) ou 200 se 28/10 couber.
      expect([200, 502]).toContain(res.status)
      fora = true
      const caiu = await GET(new Request('http://hub/api/cron/dolar', { headers: { authorization: 'Bearer segredo-de-teste' } }))
      expect(caiu.status).toBe(502)
      expect(await ler()).toMatchObject({ cotacao: 5.342, cotacaoFonte: 'bcb' })
    } finally {
      delete process.env.CRON_SECRET
      delete process.env.ZRO_PTAX_URL
      await getDatabase()
        .close()
        .catch(() => {})
      bcb.closeAllConnections()
      await new Promise<void>((ok) => bcb.close(() => ok()))
      // Volta ao estado de fábrica (os outros testes contam com a configuração vazia).
      await db.sql`update zro.custos_config set cotacao_usd_brl = null, cotacao_em = null, cotacao_modo = 'auto', cotacao_auto = null,
        cotacao_auto_em = null, cotacao_auto_fonte = null, cotacao_auto_buscada_em = null, cotacao_auto_erro = null, cotacao_auto_erro_em = null`
    }
  })

  it('zro_app continua sem ver nem gravar o dólar automático', async () => {
    const pessoa = await newOrgWithOwner(db, 'custos-dolar-rls')
    await expect(db.asUser({ userId: pessoa.userId, orgId: pessoa.orgId }, (tx) => tx`select cotacao_auto from zro.custos_config`)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      db.asUser({ userId: pessoa.userId, orgId: pessoa.orgId }, (tx) => tx`update zro.custos_config set cotacao_modo = 'manual'`),
    ).rejects.toMatchObject({ code: '42501' })
    // Valor automático sem data/fonte não entra nem pelo sistema.
    await expect(db.sql`update zro.custos_config set cotacao_auto = 5`).rejects.toMatchObject({ code: '23514' })
  })

  it('pessoa comum não chega às funções do console (requirePlatformAdmin)', async () => {
    const { requirePlatformAdmin } = await import('@zro/core')
    const u = await newUser(db, 'custos-comum')
    expect(() => requirePlatformAdmin(u.auth)).toThrow('Área restrita')
  })
})
