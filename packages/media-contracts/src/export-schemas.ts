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
import { TpeasyLeituraSchema } from './tpeasy'
import { OrganizationPlanSchema } from './organization'
import {
  AppPedidoEntradaSchema,
  AppPedidoRespostaSchema,
  DriveCompartilharEntradaSchema,
  DriveCompartilharRespostaSchema,
  DriveListarEntradaSchema,
  DriveListarRespostaSchema,
  DriveMiniaturaEntradaSchema,
  DriveMiniaturaRespostaSchema,
  DrivePastaCriarEntradaSchema,
  DrivePastaCriarRespostaSchema,
  DriveRecolherEntradaSchema,
  DriveRecolherRespostaSchema,
  DriveTokenEntradaSchema,
  DriveTokenRespostaSchema,
} from './ponte'
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
    'tpeasy.leituras.v1': s(TpeasyLeituraSchema, 'tpeasy.leituras.v1', 'Leitura no TPeasy (uma linha do registro de leituras) v1'),
    'sobedesce.descarga-drive.v2': s(
      DriveDownloadSchema,
      'sobedesce.descarga-drive.v2',
      'Download do Drive conferido (SOBEDESCE, linha v2 do descargas.jsonl)',
    ),
    'synquei.preparo.v1': s(PreparoSchema, 'synquei.preparo.v1', 'Recibo de preparo do Synquei v1'),
    'freela.inventario.v1': s(FreelaInventarioSchema, 'freela.inventario.v1', 'Inventário do freela (Carro do Freela → Maestro) v1'),
  }
  // Ponte Maestro → SOBEDESCE pelo HUB (docs/integration-contracts/maestro-sobedesce.md).
  const ponte: [string, z.ZodType, string][] = [
    ['zro.app-pedido.entrada.v1', AppPedidoEntradaSchema, 'Ponte entre apps: pedido ao HUB v1'],
    ['zro.app-pedido.resposta.v1', AppPedidoRespostaSchema, 'Ponte entre apps: pedido assinado pelo HUB v1'],
    ['sobedesce.drive-listar.entrada.v1', DriveListarEntradaSchema, 'SOBEDESCE drive.listar: corpo v1'],
    ['sobedesce.drive-listar.resposta.v1', DriveListarRespostaSchema, 'SOBEDESCE drive.listar: resposta v1'],
    ['sobedesce.drive-miniatura.entrada.v1', DriveMiniaturaEntradaSchema, 'SOBEDESCE drive.miniatura: corpo v1'],
    ['sobedesce.drive-miniatura.resposta.v1', DriveMiniaturaRespostaSchema, 'SOBEDESCE drive.miniatura: resposta v1'],
    ['sobedesce.drive-pasta-criar.entrada.v1', DrivePastaCriarEntradaSchema, 'SOBEDESCE drive.pasta.criar: corpo v1'],
    ['sobedesce.drive-pasta-criar.resposta.v1', DrivePastaCriarRespostaSchema, 'SOBEDESCE drive.pasta.criar: resposta v1'],
    ['sobedesce.drive-compartilhar.entrada.v1', DriveCompartilharEntradaSchema, 'SOBEDESCE drive.compartilhar_revisao: corpo v1'],
    ['sobedesce.drive-compartilhar.resposta.v1', DriveCompartilharRespostaSchema, 'SOBEDESCE drive.compartilhar_revisao: resposta v1'],
    ['sobedesce.drive-recolher.entrada.v1', DriveRecolherEntradaSchema, 'SOBEDESCE drive.recolher_revisao: corpo v1'],
    ['sobedesce.drive-recolher.resposta.v1', DriveRecolherRespostaSchema, 'SOBEDESCE drive.recolher_revisao: resposta v1'],
    ['sobedesce.drive-token.entrada.v1', DriveTokenEntradaSchema, 'SOBEDESCE drive.token: corpo v1'],
    ['sobedesce.drive-token.resposta.v1', DriveTokenRespostaSchema, 'SOBEDESCE drive.token: resposta v1'],
  ]
  for (const [id, schema, title] of ponte) out[id] = s(schema, id, title)
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
