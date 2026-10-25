import { productAccessFor } from '@zro/billing'
import { authorize } from '@zro/core'
import { route } from '@/lib/api'

export const GET = route(async ({ db, auth }) => {
  const actor = await authorize(db, auth)
  const products = await db.asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId))
  return { organization_id: actor.orgId, role: actor.role, products }
})
