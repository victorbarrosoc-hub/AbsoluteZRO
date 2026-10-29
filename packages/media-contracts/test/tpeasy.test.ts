// tpeasy.leituras/1: as linhas vêm do código real do TPeasy (products/tpeasy/app/js/leituras.js), não de cópia à mão.
import { describe, expect, it } from 'vitest'
import { parseTpeasyLeituras, TpeasyLeituraSchema } from '../src'

type Bloco = { i: number | null; nome: string | null } | null
type Leituras = {
  comecar: (o: { roteiro: unknown; agora: number; fusoMin: number; bip?: boolean; contagem?: number; bloco?: Bloco }) => unknown
  passarBloco: (l: unknown, b: Bloco, agora: number) => unknown
  terminar: (l: unknown, o: { agora: number; completo?: boolean }) => Record<string, unknown> | null
  paraJsonl: (lista: unknown[]) => string
}
const tp = async () => (await import(new URL('../../../products/tpeasy/app/js/leituras.js', import.meta.url).href)) as Leituras

const P = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'
const T0 = Date.UTC(2026, 9, 29, 17, 3, 12, 345)

async function linha(fusoMin = -180) {
  const L = await tp()
  const l = L.comecar({ roteiro: { id: `zro-${P}`, title: 'Lançamento', zro: { versao: 2 } }, agora: T0, fusoMin, bip: true, contagem: 3 })
  L.passarBloco(l, { i: 0, nome: 'Gancho' }, T0 + 500)
  L.passarBloco(l, { i: 1, nome: 'Oferta' }, T0 + 9_000)
  return L.terminar(l, { agora: T0 + 15_000, completo: true })!
}

describe('tpeasy.leituras/1', () => {
  it('a linha que o TPeasy grava passa no contrato', async () => {
    const l = await linha()
    expect(TpeasyLeituraSchema.safeParse(l).success).toBe(true)
    expect(TpeasyLeituraSchema.safeParse(await linha(330)).success).toBe(true)
  })

  it('recusa campo a mais, tempo fora de ordem, bloco depois do fim e versão sem projeto', async () => {
    const l = await linha()
    const blocos = l.blocos as { i: number | null; nome: string | null; em_ms: number }[]
    const ruins = [
      { ...l, email: 'lia@produtora.com' },
      { ...l, blocos: [blocos[0], blocos[2], blocos[1]] },
      { ...l, blocos: [...blocos, { i: 2, nome: 'Fim', em_ms: 16_000 }] },
      { ...l, duracao_ms: 14_000 },
      { ...l, roteiro: { ...(l.roteiro as object), projeto: null } },
      { ...l, blocos: [{ i: 0, nome: null, em_ms: 0 }] },
    ]
    for (const r of ruins) expect(TpeasyLeituraSchema.safeParse(r).success).toBe(false)
  })

  it('o arquivo JSONL: linha ruim não derruba as outras', async () => {
    const L = await tp()
    const texto = L.paraJsonl([await linha(), await linha()]) + 'não é json\n{"contrato":"tpeasy.leituras/1"}\n'
    const r = parseTpeasyLeituras(texto)
    expect(r.leituras).toHaveLength(2)
    expect(r.invalidas).toEqual([3, 4])
  })
})
