/**
 * Gera os JSON Schemas dos contratos em docs/integration-contracts/schemas (npm run contracts:export).
 * O teste packages/media-contracts/test/schemas.test.ts falha se o arquivo commitado divergir do código.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { EVENT_PAYLOADS, EventEnvelopeSchema } from './events'
import { FreelaInventarioSchema } from './freela'
import { CarroCrewSchema, CarroJobSchema, TpeasyBackupSchema } from './handoffs'
import { ZroMediaManifestSchema } from './manifest'
import { OrganizationPlanSchema } from './organization'
import { DriveDownloadSchema, PreparoSchema } from './preparo'
import { ProjectCreateSchema, ZroProjectSchema } from './project'
import { TimelineRefSchema } from './timeline'

export const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/integration-contracts/schemas')

export function buildSchemas(): Record<string, unknown> {
  const s = (schema: z.ZodType, id: string, title: string) => ({
    $id: `https://absolutezro.local/schemas/${id}.json`,
    title,
    ...z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }),
  })
  const out: Record<string, unknown> = {
    'zro-project.v1': s(ZroProjectSchema, 'zro-project.v1', 'ZroProject v1'),
    'zro-project-create.v1': s(ProjectCreateSchema, 'zro-project-create.v1', 'Criar projeto v1'),
    'zro-media-manifest.v1': s(ZroMediaManifestSchema, 'zro-media-manifest.v1', 'ZroMediaManifest v1.0'),
    'zro-organization-plan.v1': s(OrganizationPlanSchema, 'zro-organization-plan.v1', 'Prévia de organização (Synquei) v1'),
    'zro-timeline-ref.v0': s(TimelineRefSchema, 'zro-timeline-ref.v0', 'Referência de timeline v0.1'),
    'zro-event-envelope.v1': s(EventEnvelopeSchema, 'zro-event-envelope.v1', 'Envelope de evento v1'),
    'carro-do-freela.job.v1': s(CarroJobSchema, 'carro-do-freela.job.v1', 'Job do Carro do Freela v1'),
    'carro-do-freela.crew.v1': s(CarroCrewSchema, 'carro-do-freela.crew.v1', 'Equipe escalada num job do Carro do Freela v1'),
    'tpeasy.backup.v1': s(TpeasyBackupSchema, 'tpeasy.backup.v1', 'Backup do TPeasy v1'),
    'sobedesce.descarga-drive.v2': s(
      DriveDownloadSchema,
      'sobedesce.descarga-drive.v2',
      'Download do Drive conferido (SOBEDESCE, linha v2 do descargas.jsonl)',
    ),
    'synquei.preparo.v1': s(PreparoSchema, 'synquei.preparo.v1', 'Recibo de preparo do Synquei v1'),
    'freela.inventario.v1': s(FreelaInventarioSchema, 'freela.inventario.v1', 'Inventário do freela (Carro do Freela → Maestro) v1'),
  }
  for (const [type, versions] of Object.entries(EVENT_PAYLOADS)) {
    for (const [v, schema] of Object.entries(versions as Record<string, z.ZodType>)) {
      out[`event.${type}.v${v}`] = s(schema, `event.${type}.v${v}`, `Payload de ${type} v${v}`)
    }
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const [name, schema] of Object.entries(buildSchemas()))
    fs.writeFileSync(path.join(OUT_DIR, `${name}.schema.json`), JSON.stringify(schema, null, 2) + '\n')
  console.log(`schemas em ${OUT_DIR}`)
}
