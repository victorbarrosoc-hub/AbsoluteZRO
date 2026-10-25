import { z } from 'zod'

export const IsoDate = z.iso.datetime({ offset: true })
export const Uuid = z.uuid()

/** Caminho relativo seguro: sem raiz, sem "..", sem barra invertida. */
export const RelativePath = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && !p.split('/').includes('..'), {
    message: 'caminho precisa ser relativo e sem ".."',
  })

/** URI lógico de destino. Nunca URL pública (com ou sem segredo). */
export const LogicalUri = z
  .string()
  .regex(/^zro-dest:\/\/[^\s]+$/, 'use zro-dest://<destino>/<caminho>')
  .max(2048)

export const ProductId = z.enum(['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'ai-edit', 'nossom', 'finishing'])
export type ProductId = z.infer<typeof ProductId>
