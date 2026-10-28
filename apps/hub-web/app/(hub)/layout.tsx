import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { avatarVersion, listMyOrganizations, pendencias } from '@zro/core'
import type { NavMode } from '@/components/nav'
import { Shell } from '@/components/shell'
import { familiaPara } from '@/lib/data/catalog'
import { db, requireOrgPage } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function HubLayout({ children }: { children: ReactNode }) {
  const auth = await requireOrgPage()
  // A família no menu: lançados ou liberados para esta pessoa (ADR 0023), com o site oficial do catálogo.
  const [orgs, avatar, jar, pend, familia] = await Promise.all([
    listMyOrganizations(db(), auth),
    avatarVersion(db(), auth),
    cookies(),
    pendencias(db(), auth),
    familiaPara(auth.user.id),
  ])
  const saved = jar.get('zro_nav')?.value
  const nav: NavMode = saved === 'rail' || saved === 'full' ? saved : 'auto'
  return (
    <Shell auth={auth} orgs={orgs} nav={nav} avatar={avatar} pendencias={pend} familia={familia}>
      {children}
    </Shell>
  )
}
