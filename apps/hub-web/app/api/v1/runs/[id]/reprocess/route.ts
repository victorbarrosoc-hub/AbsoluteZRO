import { reprocessRun } from '@zro/core'
import { HANDLERS } from '@zro/integrations'
import { json, route } from '@/lib/api'
import { drainQueueAfterResponse } from '@/lib/queue'

export const POST = route<{ id: string }>(
  async ({ db, auth }, { id }) => {
    const r = await reprocessRun(db, auth, id, HANDLERS)
    drainQueueAfterResponse()
    return json(r, r.created ? 201 : 200)
  },
  { mutation: true },
)
