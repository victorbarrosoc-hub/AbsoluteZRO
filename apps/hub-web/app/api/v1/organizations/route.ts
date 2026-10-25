import { createOrganization, listMyOrganizations } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

export const GET = route(async ({ db, auth }) => ({ organizations: await listMyOrganizations(db, auth) }))

export const POST = route(
  async ({ db, auth, req }) => {
    const body = (await readJson(req, 10_000)) as { name?: string; kind?: 'person' | 'team' | 'company' }
    return json(await createOrganization(db, auth, { name: String(body.name ?? ''), kind: body.kind }), 201)
  },
  { mutation: true },
)
