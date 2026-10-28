import { describe, expect, it } from 'vitest'
import { EVENT_PRODUCER, FreelaInventarioSchema, validateEventPayload } from '../src'

const SUB = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  categoria: 'camera',
  marca: 'Sony',
  modelo: 'FX3',
  quantidade: 1,
  observacao: null,
  diaria_cents: 30000,
  ativo: true,
  atualizado_em: '2026-10-28T12:00:00Z',
  ...extra,
})
const inv = (itens: unknown[], extra: Record<string, unknown> = {}) => ({
  contract: 'freela.inventario/1',
  sub: SUB,
  itens,
  atualizado_em: '2026-10-28T12:00:00Z',
  ...extra,
})

describe('freela.inventario/1', () => {
  it('aceita o inventário do freela pelo sub', () => {
    expect(FreelaInventarioSchema.safeParse(inv([item('cam-1'), item('drone-1', { categoria: 'drone', diaria_cents: null })])).success).toBe(true)
    expect(FreelaInventarioSchema.safeParse(inv([])).success).toBe(true)
  })

  it('recusa dado pessoal, sub que não é conta, categoria fora da lista e id repetido', () => {
    expect(FreelaInventarioSchema.safeParse(inv([item('a')], { email: 'freela@exemplo.com' })).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a')], { cpf: '000.000.000-00' })).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a', { telefone: '11999990000' })])).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a')], { sub: 'freela@exemplo.com' })).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a', { categoria: 'carro' })])).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a'), item('a')])).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a b')])).success).toBe(false)
    expect(FreelaInventarioSchema.safeParse(inv([item('a', { quantidade: 0 })])).success).toBe(false)
  })

  it('o evento freela.inventario.atualizado é do Carro do Freela e leva o inventário', () => {
    expect(EVENT_PRODUCER['freela.inventario.atualizado']).toBe('carro-do-freela')
    expect(validateEventPayload('freela.inventario.atualizado', 1, { source: 'carro-do-freela', inventario: inv([item('a')]) })).toEqual({ ok: true })
    expect(validateEventPayload('freela.inventario.atualizado', 1, { source: 'maestro', inventario: inv([item('a')]) }).ok).toBe(false)
  })
})
