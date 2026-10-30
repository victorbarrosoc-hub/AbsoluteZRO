/** O pedido de um turno do Laboratório da Z (o navegador manda o histórico inteiro; nada fica guardado). */
import { DomainError } from '@zro/observability'
import { z } from 'zod'
import { Z_APPS, Z_MODELOS, Z_VOZ_MODELOS } from './z-lab'

const ARQUIVO = /^file_[A-Za-z0-9_-]{6,80}$/
const ZLabAnexoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('imagem'), arquivo: z.string().regex(ARQUIVO), nome: z.string().max(120) }),
  z.object({ tipo: z.literal('pdf'), arquivo: z.string().regex(ARQUIVO), nome: z.string().max(120) }),
  z.object({
    tipo: z.literal('texto'),
    nome: z.string().max(120),
    texto: z.string().min(1).max(150_000),
    origem: z.enum(['docx', 'xlsx', 'pptx', 'texto', 'audio', 'video']),
    cortado: z.boolean().optional(),
  }),
])
export type ZLabAnexo = z.infer<typeof ZLabAnexoSchema>

const ZLabPedidoSchema = z.object({
  versao: z.union([z.literal('rascunho'), z.literal('padrao'), z.number().int().positive()]),
  modelo: z.enum(Z_MODELOS.map((m) => m.id) as [string, ...string[]]).nullish(),
  plataforma: z.enum(Z_APPS.map((a) => a.id) as [string, ...string[]]).nullish(),
  voz: z.boolean().optional(),
  historico: z
    .array(
      z.object({
        papel: z.enum(['user', 'assistant']),
        texto: z.string().max(40_000),
        anexos: z.array(ZLabAnexoSchema).max(12).optional(),
      }),
    )
    .min(1)
    .max(40),
})
export type ZLabPedido = z.infer<typeof ZLabPedidoSchema>

/** Um trecho da resposta para virar fala (o navegador manda frase por frase, para a voz começar logo). */
const ZFalaSchema = z.object({
  texto: z.string().trim().min(1).max(1200),
  voz: z.string().regex(/^[A-Za-z0-9]{8,40}$/),
  modelo: z.enum(Z_VOZ_MODELOS.map((m) => m.id) as [string, ...string[]]),
  velocidade: z.number().min(0.7).max(1.2),
  estabilidade: z.number().min(0).max(1),
  anterior: z.string().max(600).nullish(),
  chave: z.string().regex(/^[A-Za-z0-9-]{8,80}$/),
})
export type ZPedidoDeFala = z.infer<typeof ZFalaSchema>

export function lerPedidoDeFala(raw: unknown): ZPedidoDeFala {
  const p = ZFalaSchema.safeParse(raw)
  if (!p.success) throw new DomainError('invalid_input', 'Pedido de fala inválido.')
  return p.data
}

/** Texto anexado somado na conversa (o corpo do pedido também tem limite de tamanho na rota). */
export const Z_LAB_TEXTO_ANEXADO_MAX = 400_000

export function lerPedidoDoLab(raw: unknown): ZLabPedido {
  const p = ZLabPedidoSchema.safeParse(raw)
  if (!p.success) throw new DomainError('invalid_input', p.error.issues[0]?.message ?? 'Pedido inválido.')
  const ultimo = p.data.historico[p.data.historico.length - 1]!
  if (ultimo.papel !== 'user' || (!ultimo.texto.trim() && !ultimo.anexos?.length)) throw new DomainError('invalid_input', 'Escreva alguma coisa ou anexe um arquivo.')
  const textos = p.data.historico.flatMap((m) => m.anexos ?? []).reduce((n, a) => n + (a.tipo === 'texto' ? a.texto.length : 0), 0)
  if (textos > Z_LAB_TEXTO_ANEXADO_MAX) throw new DomainError('invalid_input', 'Texto anexado demais nesta conversa. Comece uma nova.')
  return p.data
}
