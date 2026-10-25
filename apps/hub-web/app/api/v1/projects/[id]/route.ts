import { getProject } from '@zro/core'
import { route } from '@/lib/api'

export const GET = route<{ id: string }>(async ({ db, auth }, { id }) => {
  const { project, steps, documents, manifests, runs, events } = await getProject(db, auth, id)
  return { project, steps, documents, manifests, runs, events }
})
