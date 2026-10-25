import type { ReactNode } from 'react'
import { listMyOrganizations } from '@zro/core'
import { Shell } from '@/components/shell'
import { db, requireOrgPage } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function HubLayout({ children }: { children: ReactNode }) {
  const auth = await requireOrgPage()
  const orgs = await listMyOrganizations(db(), auth)
  return (
    <Shell auth={auth} orgs={orgs}>
      {children}
    </Shell>
  )
}
