import { importSobedesceManifest } from '@zro/integrations'
import { DomainError } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'

/**
 * Importa uma descarga do SOBEDESCE. Corpo: { descargas: "<conteúdo do descargas.jsonl>", descarga_id?, destinations: [{ id, label, reports: [{ name, text }] }] }.
 * Exige entitlement sobedesce:manifest_import e quota sobedesce.manifest_imports.
 */
export const POST = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    const body = (await readJson(req)) as { descargas?: unknown; descarga_id?: unknown; destinations?: unknown }
    if (typeof body.descargas !== 'string' || !Array.isArray(body.destinations))
      throw new DomainError('invalid_input', 'Envie descargas (texto) e destinations (lista).')
    const r = await importSobedesceManifest(db, auth, {
      projectId: id,
      descargas: body.descargas,
      descargaId: typeof body.descarga_id === 'string' ? body.descarga_id : undefined,
      destinations: body.destinations as never,
    })
    return json(r, r.duplicate ? 200 : 201)
  },
  { mutation: true },
)
