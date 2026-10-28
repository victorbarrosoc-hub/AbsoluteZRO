/**
 * freela.inventario/1 — o inventário que o próprio freela cadastra no Carro do Freela (fonte de verdade), para o
 * Maestro mostrar no perfil dele e na escala (docs/integration-contracts/maestro-carro-do-freela.md). Direção:
 * Carro do Freela → HUB (evento `freela.inventario.atualizado`) → Maestro. O freela é a conta Absolute ZRO (`sub`):
 * nada de CPF, e-mail ou telefone. Cada item tem `id` estável no Carro (o Maestro casa por ele). Ainda NÃO está no ar:
 * o Carro do Freela é um protótipo estático, sem banco.
 */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

export const CATEGORIAS_INVENTARIO_FREELA = ['camera', 'lente', 'audio', 'luz', 'drone', 'estabilizador', 'monitor', 'acessorio', 'outro'] as const

export const ItemInventarioFreelaSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/),
    categoria: z.enum(CATEGORIAS_INVENTARIO_FREELA),
    marca: z.string().min(1).max(60).nullable(),
    modelo: z.string().min(1).max(120),
    quantidade: z.number().int().min(1).max(999),
    observacao: z.string().max(500).nullable(),
    /** Diária de aluguel em centavos (opcional: o freela pode só listar o que leva). */
    diaria_cents: z.number().int().min(0).max(100_000_000_000).nullable(),
    ativo: z.boolean(),
    atualizado_em: IsoDate,
  })
  .strict()

export const FreelaInventarioSchema = z
  .object({
    contract: z.literal('freela.inventario/1'),
    /** O `sub` da conta Absolute ZRO do freela. */
    sub: Uuid,
    itens: z.array(ItemInventarioFreelaSchema).max(500),
    atualizado_em: IsoDate,
  })
  .strict()
  .refine((v) => new Set(v.itens.map((i) => i.id)).size === v.itens.length, { message: 'ids de item repetidos', path: ['itens'] })
export type FreelaInventario = z.infer<typeof FreelaInventarioSchema>
