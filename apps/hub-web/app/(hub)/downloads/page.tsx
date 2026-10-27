import type { Metadata } from 'next'
import { productAccessFor } from '@zro/billing'
import { authorize } from '@zro/core'
import { appsParaBaixar, DownloadsIntro } from '@/components/download-catalog'
import { DownloadPicker } from '@/components/download-picker'
import { InstalarHub } from '@/components/instalar-hub'
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
      <InstalarHub />
      <DownloadPicker
        apps={appsParaBaixar(
          access.map((a) => ({ id: a.productId, name: a.name, role: a.roleInFlow })),
          (id) => ({ contratada: byId.get(id)?.access === 'contracted', liberado: byId.get(id)?.access === 'contracted' }),
        )}
      />
    </div>
  )
}
