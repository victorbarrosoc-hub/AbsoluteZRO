// O inventário do freela (Carro do Freela → HUB → Maestro): registrado e desligado. Nada roteia nem roda, e as rotas
// ativas somadas às desligadas continuam sem ciclo.
import { describe, expect, it } from 'vitest'
import { findEventCycle } from '@zro/core'
import { DISABLED_ROUTES, HANDLER_EMITS, HANDLERS, maestroFreelaInventario, ROUTES } from '../src/index'

describe('freela.inventario.atualizado (desligado)', () => {
  it('fica fora das rotas e dos handlers do worker', () => {
    expect(ROUTES['freela.inventario.atualizado']).toBeUndefined()
    expect(HANDLERS[maestroFreelaInventario.name]).toBeUndefined()
    expect(DISABLED_ROUTES['freela.inventario.atualizado']?.[0]).toMatchObject({ handler: 'maestro.freela-inventario', productId: 'maestro' })
  })

  it('não emite nada e as rotas, somadas às desligadas, não têm ciclo', () => {
    expect(maestroFreelaInventario.emits).toEqual([])
    expect(findEventCycle({ ...ROUTES, ...DISABLED_ROUTES }, HANDLER_EMITS)).toBeNull()
  })

  it('se alguém chamar, falha de vez dizendo que não está ligado', async () => {
    await expect(maestroFreelaInventario.run({} as never)).rejects.toThrow(/não está ligado/)
  })
})
