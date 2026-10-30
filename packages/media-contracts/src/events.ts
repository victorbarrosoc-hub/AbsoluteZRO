/**
 * Contratos de eventos versionados (PRD §7.3). Envelope comum + payload mínimo por tipo e versão.
 * O payload leva IDs e resumos, nunca mídia, áudio, URL assinada ou dado pessoal desnecessário.
 */
import { z } from 'zod'
import { IsoDate, ProductId, Uuid } from './common'
import { FreelaInventarioSchema } from './freela'

export const EventEnvelopeSchema = z.object({
  event_id: Uuid,
  event_type: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/),
  schema_version: z.number().int().positive(),
  project_id: Uuid.nullable(),
  organization_id: Uuid,
  producer: z.string().regex(/^[a-z0-9-]+(:[a-z0-9_.-]+)?$/),
  occurred_at: IsoDate,
  correlation_id: Uuid,
  causation_id: Uuid.nullable(),
  idempotency_key: z.string().min(8).max(200),
  payload: z.record(z.string(), z.unknown()),
})
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>

const ManifestRef = z.object({
  manifest_row_id: Uuid,
  manifest_id: z.string(),
  assets: z.number().int().nonnegative(),
  status: z.enum(['valid', 'valid_with_warnings', 'invalid']),
})

/** Registro dos tipos conhecidos. Um tipo novo ou um payload novo = nova entrada (ou nova versão). */
export const EVENT_PAYLOADS = {
  'job.created': { 1: z.object({ product: z.literal('carro-do-freela'), external_job_id: z.string().max(200), title: z.string().max(160) }) },
  'script.ready': { 1: z.object({ document_id: Uuid, version: z.number().int().positive(), title: z.string().max(200) }) },
  // Criação F8 (30/10/2026): uma versão salva do roteiro do Maestro foi entregue na caixa de entrada do TPeasy pelo HUB
  // (zro.app_entregas, migração 0040). Registro do que saiu, sem o texto; o TPeasy lê a caixa (não há handler: o HUB
  // não processa roteiro). idempotency_key = app.entrega:<entrega_id> (reenviar a mesma versão não gera outro).
  'script.version.sent': {
    1: z.object({
      origem: z.literal('maestro'),
      roteiro_id: Uuid,
      versao: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      titulo: z.string().max(200),
      destino: z.literal('tpeasy'),
      entrega_id: Uuid,
    }),
  },
  'ingest.started': { 1: z.object({ source: z.literal('sobedesce'), operation_id: z.string() }) },
  'ingest.completed': { 1: ManifestRef },
  'ingest.failed': { 1: ManifestRef.extend({ reason: z.string().max(300) }) },
  'media.manifest.ready': { 1: ManifestRef },
  'media.sync.completed': { 1: z.object({ source: z.literal('synquei'), sync_map_ref: z.string().max(300) }) },
  'edit.selects.ready': { 1: z.object({ source: z.literal('ai-edit'), selects_ref: z.string().max(300) }) },
  'edit.timeline.ready': {
    1: z.object({
      source: z.enum(['ai-edit', 'synquei', 'manual']),
      timeline_ref: z.string().max(300),
      format: z.enum(['otio', 'fcpxml', 'xmeml', 'edl', 'aaf']),
    }),
  },
  'audio.mix.ready': { 1: z.object({ source: z.literal('nossom'), mix_ref: z.string().max(300) }) },
  'finishing.qc.completed': { 1: z.object({ source: z.literal('finishing'), qc_ref: z.string().max(300), passed: z.boolean() }) },
  'delivery.ready': {
    1: z.object({ source: z.literal('finishing'), package_ref: z.string().max(300) }),
    // v2: a pasta de entrega subiu para o Drive pelo SOBEDESCE com o MD5 de cada arquivo conferido (comprovante
    // sobedesce.entrega/1). Só existe entrega conferida: sem MD5 em todos os arquivos, não há evento.
    2: z.object({
      source: z.enum(['finishing', 'sobedesce']),
      package_ref: z.string().max(300),
      files: z.number().int().positive(),
      bytes: z.number().int().nonnegative(),
      checksum: z.literal('md5'),
      verified: z.literal(true),
      folder_url: z
        .string()
        .max(300)
        .regex(/^https:\/\/drive\.google\.com\/drive\/(u\/\d+\/)?folders\/[\w-]+(\?[\w=&.-]*)?$/),
    }),
  },
  // O inventário do próprio freela, publicado pelo Carro do Freela e consumido pelo Maestro (freela.inventario/1).
  // Registrado e testado, mas ainda NÃO publicado por ninguém: o Carro do Freela não tem banco (rota desligada em
  // @zro/integrations, DISABLED_ROUTES).
  'freela.inventario.atualizado': { 1: z.object({ source: z.literal('carro-do-freela'), inventario: FreelaInventarioSchema }) },
} as const satisfies Record<string, Record<number, z.ZodType>>

export type EventType = keyof typeof EVENT_PAYLOADS

export function isKnownEventType(t: string): t is EventType {
  return Object.prototype.hasOwnProperty.call(EVENT_PAYLOADS, t)
}

export function validateEventPayload(type: string, version: number, payload: unknown): { ok: true } | { ok: false; message: string } {
  if (!isKnownEventType(type)) return { ok: false, message: `tipo de evento desconhecido: ${type}` }
  const schema = (EVENT_PAYLOADS[type] as Record<number, z.ZodType>)[version]
  if (!schema) return { ok: false, message: `versão ${version} não existe para ${type}` }
  const r = schema.safeParse(payload)
  return r.success ? { ok: true } : { ok: false, message: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

/** Qual produto produz cada tipo (para o diagrama e para checar ciclos). */
export const EVENT_PRODUCER: Record<EventType, z.infer<typeof ProductId> | 'hub'> = {
  'job.created': 'carro-do-freela',
  'script.ready': 'tpeasy',
  'script.version.sent': 'maestro',
  'ingest.started': 'sobedesce',
  'ingest.completed': 'sobedesce',
  'ingest.failed': 'sobedesce',
  'media.manifest.ready': 'sobedesce',
  'media.sync.completed': 'synquei',
  'edit.selects.ready': 'ai-edit',
  'edit.timeline.ready': 'ai-edit',
  'audio.mix.ready': 'nossom',
  'finishing.qc.completed': 'finishing',
  'delivery.ready': 'finishing',
  'freela.inventario.atualizado': 'carro-do-freela',
}
