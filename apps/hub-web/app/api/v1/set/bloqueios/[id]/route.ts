import { desbloquearSet, ESCOPO_SET } from '@zro/core'
import { route } from '@/lib/api'

/** DELETE /api/v1/set/bloqueios/{id} — desbloqueia a pessoa {id} (o contato não volta sozinho). */
export const DELETE = route<{ id: string }>(
  async ({ db, auth }, { id }) => {
    await desbloquearSet(db, auth, id)
    return new Response(null, { status: 204 })
  },
  { bearer: ESCOPO_SET, mutation: true },
)
