import { switchOrganization } from '@zro/core'
import { readJson, route } from '@/lib/api'

/** O cliente sugere o id; o vínculo é conferido no servidor. */
export const POST = route(
  async ({ db, auth, req }) => {
    const body = (await readJson(req, 2_000)) as { organization_id?: string }
    await switchOrganization(db, auth, String(body.organization_id ?? ''))
    return { ok: true, active_organization_id: body.organization_id }
  },
  { mutation: true },
)
