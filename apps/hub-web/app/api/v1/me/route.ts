import { listMyOrganizations, requireUser } from '@zro/core'
import { route } from '@/lib/api'

export const GET = route(async ({ db, auth }) => {
  requireUser(auth)
  return {
    user: { id: auth!.user.id, email: auth!.user.email, display_name: auth!.user.displayName, email_verified: auth!.user.emailVerified },
    active_organization_id: auth!.session.activeOrgId,
    organizations: await listMyOrganizations(db, auth),
  }
})
