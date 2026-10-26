import { importSobedesceDelivery } from '@zro/integrations'
import { DomainError } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'

/**
 * Registra uma entrega conferida pelo SOBEDESCE. Corpo: { entrega: "<conteúdo do comprovante sobedesce.entrega/1>" }.
 * Publica delivery.ready v2. Exige entitlement sobedesce:manifest_import e quota sobedesce.manifest_imports.
 */
export const POST = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    const body = (await readJson(req)) as { entrega?: unknown }
    if (typeof body.entrega !== 'string') throw new DomainError('invalid_input', 'Envie entrega (o conteúdo do comprovante, em texto).')
    const r = await importSobedesceDelivery(db, auth, { projectId: id, entrega: body.entrega })
    return json(r, r.duplicate ? 200 : 201)
  },
  { mutation: true },
)
