import type { Metadata } from 'next'
import { productAccessFor } from '@zro/billing'
import { authorize } from '@zro/core'
import { Pill } from '@zro/ui'
import { DownloadCatalog, DownloadsIntro } from '@/components/download-catalog'
import { OsHint } from '@/components/os-hint'
import { disponibilidade } from '@/lib/hub-desktop-release'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Downloads' }

export default async function Downloads() {
  const auth = await requireOrgPage()
  const actor = await authorize(db(), auth)
  const [access, hub] = await Promise.all([
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId)),
    disponibilidade(),
  ])
  const byId = new Map(access.map((a) => [a.productId, a]))
  return (
    <div className="page dl-page">
      <OsHint />
      <DownloadsIntro heading="h1" hub={hub} />
      <DownloadCatalog
        products={access.map((a) => ({ id: a.productId, name: a.name, role: a.roleInFlow, provisional: a.provisionalName }))}
        accessPill={(id) => (byId.get(id)?.access === 'contracted' ? <Pill tone="ok">Contratada</Pill> : null)}
      />
    </div>
  )
}
