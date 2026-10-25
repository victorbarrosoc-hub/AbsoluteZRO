import { createProject, listProjects } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

export const GET = route(async ({ db, auth, req }) => {
  const url = new URL(req.url)
  const { projects } = await listProjects(db, auth, { status: url.searchParams.get('status') ?? undefined, q: url.searchParams.get('q') ?? undefined })
  return { projects }
})

export const POST = route(async ({ db, auth, req }) => json({ id: await createProject(db, auth, await readJson(req, 100_000)) }, 201), { mutation: true })
