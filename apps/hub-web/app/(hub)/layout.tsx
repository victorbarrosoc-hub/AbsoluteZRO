import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { avatarVersion, listMyOrganizations, pendencias } from '@zro/core'
import type { NavMode } from '@/components/nav'
import { Shell } from '@/components/shell'
import { db, requireOrgPage } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function HubLayout({ children }: { children: ReactNode }) {
  const auth = await requireOrgPage()
  const [orgs, avatar, jar, pend] = await Promise.all([listMyOrganizations(db(), auth), avatarVersion(db(), auth), cookies(), pendencias(db(), auth)])
  const saved = jar.get('zro_nav')?.value
  const nav: NavMode = saved === 'rail' || saved === 'full' ? saved : 'auto'
  return (
    <Shell auth={auth} orgs={orgs} nav={nav} avatar={avatar} pendencias={pend}>
      {children}
    </Shell>
  )
}
