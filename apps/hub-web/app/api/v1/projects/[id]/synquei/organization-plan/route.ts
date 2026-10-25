import { previewOrganizationPlan } from '@zro/integrations'
import { readJson, route } from '@/lib/api'

/** Prévia de organização do Synquei (dry-run). Sem entitlement synquei: 403 entitlement_required. */
export const POST = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    const body = (await readJson(req, 2_000)) as { manifest_row_id?: string }
    return previewOrganizationPlan(db, auth, { projectId: id, manifestRowId: String(body.manifest_row_id ?? '') })
  },
  { mutation: true },
)
