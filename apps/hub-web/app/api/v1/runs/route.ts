import { listRuns } from '@zro/core'
import { route } from '@/lib/api'

export const GET = route(async ({ db, auth, req }) => {
  const { runs } = await listRuns(db, auth, { status: new URL(req.url).searchParams.get('status') ?? undefined })
  return { runs }
})
