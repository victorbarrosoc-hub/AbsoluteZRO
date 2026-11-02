// O ciclo do plano na Higgsfield pelo extrato (o `balance` só traz saldo e plano): renovação, franquia, pacotes,
// gasto com devolução, virada de mês e o medidor do cartão em /conexoes. Tudo puro, com lançamentos de mentira.
import { describe, expect, it } from 'vitest'
import { gastoDesde, lancamentoHiggsfield, maisUmMes, medidorHiggsfield, resumoDoCiclo, type LancamentoHiggsfield } from '../src/index'

const l = (created_at: string, action: string, credits: number, display_name = 'Kling 3.0'): LancamentoHiggsfield =>
  lancamentoHiggsfield({ created_at, action, credits, display_name })!

// mais novo primeiro, como a Higgsfield manda
const extrato = [
  l('2026-11-01T12:00:00Z', 'refund', 20, 'Kling 3.0'),
  l('2026-11-01T11:00:00Z', 'spend', -300, 'Kling 3.0'),
  l('2026-10-25T09:00:00Z', 'grant', 200, 'Credit Package'),
  l('2026-10-20T08:00:00Z', 'deduct', -5, 'Ajuste'),
  l('2026-10-18T17:00:15Z', 'grant', 600, 'Subscription Credits'),
  l('2026-10-10T10:00:00Z', 'grant', 200, 'Credit Package'),
  l('2026-10-10T09:00:00Z', 'spend', -90),
  l('2026-09-18T17:00:12Z', 'grant', 600, 'Subscription Credits'),
]
const agora = new Date('2026-11-02T15:00:00Z')

describe('o ciclo da Higgsfield', () => {
  it('começa no último crédito de assinatura e renova um mês depois, com franquia, pacotes e gasto do ciclo', () => {
    expect(resumoDoCiclo(extrato, agora)).toEqual({
      inicioCiclo: new Date('2026-10-18T17:00:15Z'),
      renovaEm: new Date('2026-11-18T17:00:15Z'),
      franquia: 600,
      extras: 200, // o pacote de 10/10 é do ciclo anterior
      gastoNoCiclo: 285, // 300 + 5 − 20 de devolução; os 90 de 10/10 ficam de fora
    })
    // a ordem do extrato não importa
    expect(resumoDoCiclo([...extrato].reverse(), agora)?.inicioCiclo).toEqual(new Date('2026-10-18T17:00:15Z'))
  })

  it('sem crédito de assinatura no extrato: sem ciclo (nada de renovação inventada)', () => {
    expect(resumoDoCiclo([], agora)).toBeNull()
    expect(resumoDoCiclo([l('2026-10-25T09:00:00Z', 'grant', 200, 'Credit Package'), l('2026-10-26T09:00:00Z', 'spend', -10)], agora)).toBeNull()
    // "Subscription Credits" só vale como crédito (grant)
    expect(resumoDoCiclo([l('2026-10-18T17:00:15Z', 'spend', -600, 'Subscription Credits')], agora)).toBeNull()
  })

  it('a data passou sem crédito novo: mostra o ciclo sem data de renovação', () => {
    const r = resumoDoCiclo(extrato, new Date('2026-11-19T09:00:00Z'))
    expect(r).toMatchObject({ inicioCiclo: new Date('2026-10-18T17:00:15Z'), renovaEm: null, franquia: 600 })
    // o crédito novo chegou: ciclo novo, pacote antigo fica de fora
    const novo = [l('2026-11-18T17:00:20Z', 'grant', 600, 'Subscription Credits'), ...extrato]
    expect(resumoDoCiclo(novo, new Date('2026-11-19T09:00:00Z'))).toMatchObject({
      inicioCiclo: new Date('2026-11-18T17:00:20Z'),
      renovaEm: new Date('2026-12-18T17:00:20Z'),
      extras: 0,
      gastoNoCiclo: 0,
    })
  })

  it('virada de mês e de ano: mesmo dia e hora, e o fim do mês cai no último dia do mês seguinte', () => {
    expect(maisUmMes(new Date('2026-12-15T17:00:00Z')).toISOString()).toBe('2027-01-15T17:00:00.000Z')
    expect(maisUmMes(new Date('2026-01-31T10:30:00Z')).toISOString()).toBe('2026-02-28T10:30:00.000Z')
    expect(maisUmMes(new Date('2028-01-31T10:30:00Z')).toISOString()).toBe('2028-02-29T10:30:00.000Z')
    expect(maisUmMes(new Date('2026-03-31T23:59:59Z')).toISOString()).toBe('2026-04-30T23:59:59.000Z')
    const dez = resumoDoCiclo([l('2026-12-31T03:00:00Z', 'grant', 600, 'Subscription Credits')], new Date('2027-01-10T00:00:00Z'))
    expect(dez?.renovaEm?.toISOString()).toBe('2027-01-31T03:00:00.000Z')
  })

  it('gasto pelo valor, com o sinal que vier; devolução desconta e nunca fica negativo', () => {
    const desde = new Date('2026-11-01T03:00:00Z')
    expect(gastoDesde(extrato, desde)).toBe(280)
    expect(gastoDesde([l('2026-11-01T12:00:00Z', 'spend', 12.5), l('2026-11-01T13:00:00Z', 'deduct', -0.25)], desde)).toBe(12.75)
    expect(gastoDesde([l('2026-11-01T12:00:00Z', 'refund', 40)], desde)).toBe(0)
    expect(gastoDesde([l('2026-11-01T12:00:00Z', 'grant', 600, 'Subscription Credits')], desde)).toBe(0)
  })

  it('lançamento sem data ou sem número fica de fora', () => {
    expect(lancamentoHiggsfield(null)).toBeNull()
    expect(lancamentoHiggsfield({ created_at: 'ontem', action: 'spend', credits: -1 })).toBeNull()
    expect(lancamentoHiggsfield({ created_at: '2026-11-01T00:00:00Z', action: 'spend' })).toBeNull()
    expect(lancamentoHiggsfield({ created_at: '2026-11-01T00:00:00Z', action: 'GRANT', credits: '600', display_name: ' Subscription Credits ' })).toEqual({
      nome: 'Subscription Credits',
      acao: 'grant',
      creditos: 600,
      em: new Date('2026-11-01T00:00:00Z'),
    })
  })
})

describe('o medidor do cartão', () => {
  const ciclo = resumoDoCiclo(extrato, agora)
  it('o disponível sobre franquia + pacotes do ciclo, com a parte dos apps dentro do gasto', () => {
    const m = medidorHiggsfield({ creditos: 65.41, ciclo, usoApps: 0 })
    expect(m).toMatchObject({ total: 800, noCiclo: true, apps: 0 })
    expect(m.disponivel).toBeCloseTo(65.41 / 800)
    expect(medidorHiggsfield({ creditos: 400, ciclo, usoApps: 100 })).toEqual({ total: 800, noCiclo: true, disponivel: 0.5, apps: 0.125 })
    // os apps nunca passam do que foi gasto; saldo acima do ciclo enche a barra
    expect(medidorHiggsfield({ creditos: 700, ciclo, usoApps: 500 })).toMatchObject({ disponivel: 0.875, apps: 0.125 })
    expect(medidorHiggsfield({ creditos: 950, ciclo, usoApps: 10 })).toMatchObject({ disponivel: 1, apps: 0 })
  })

  it('sem ciclo, cai no saldo puro (disponível + o que os apps usaram no mês)', () => {
    expect(medidorHiggsfield({ creditos: 120, ciclo: null, usoApps: 30 })).toEqual({ total: 150, noCiclo: false, disponivel: 0.8, apps: 0.2 })
    expect(medidorHiggsfield({ creditos: 0, ciclo: null, usoApps: 0 })).toEqual({ total: 0, noCiclo: false, disponivel: 0, apps: 0 })
  })
})
