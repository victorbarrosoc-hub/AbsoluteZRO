import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MaestroRoteiroSchema } from '../src'

// O exemplo é gerado pelo código do Maestro (products/maestro/tests/roteiro-saidas.test.mts confere byte a byte), então
// este teste liga as duas pontas: o que o Maestro gera passa no contrato.
const EXEMPLO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/integration-contracts/exemplos/maestro.roteiro.v1.json')
const exemplo = () => JSON.parse(fs.readFileSync(EXEMPLO, 'utf8'))

describe('maestro.roteiro/1', () => {
  it('aceita o arquivo que o Maestro gera', () => {
    const r = MaestroRoteiroSchema.safeParse(exemplo())
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
  })

  it('recusa campo a mais (dado pessoal), contrato de outra versão e hash fora da forma', () => {
    expect(MaestroRoteiroSchema.safeParse({ ...exemplo(), email: 'x@exemplo.com' }).success).toBe(false)
    expect(MaestroRoteiroSchema.safeParse({ ...exemplo(), contract: 'maestro.roteiro/2' }).success).toBe(false)
    const e = exemplo()
    e.origem.sha256 = 'abc'
    expect(MaestroRoteiroSchema.safeParse(e).success).toBe(false)
    const p = exemplo()
    p.pessoas[0].telefone = '11999990000'
    expect(MaestroRoteiroSchema.safeParse(p).success).toBe(false)
  })

  it('recusa nota interna e observação (não saem do Maestro), id repetido, pessoa fora do elenco e cena fora de ordem', () => {
    const nota = exemplo()
    nota.cenas[0].blocos.push({ id: 'n1', tipo: 'nota', texto: 'interna', inicio_seg: 0, fim_seg: 0, duracao_digitada_seg: null })
    expect(MaestroRoteiroSchema.safeParse(nota).success).toBe(false)
    const repetido = exemplo()
    repetido.cenas[1].blocos[0].id = repetido.cenas[0].blocos[0].id
    expect(MaestroRoteiroSchema.safeParse(repetido).success).toBe(false)
    const fora = exemplo()
    const fala = fora.cenas[0].blocos.find((b: { tipo: string }) => b.tipo === 'fala')
    fala.pessoa_id = 'ninguem'
    expect(MaestroRoteiroSchema.safeParse(fora).success).toBe(false)
    const ordem = exemplo()
    ordem.cenas[0].numero = 2
    expect(MaestroRoteiroSchema.safeParse(ordem).success).toBe(false)
    const tempo = exemplo()
    tempo.cenas[0].blocos[0].fim_seg = -1
    expect(MaestroRoteiroSchema.safeParse(tempo).success).toBe(false)
  })
})
