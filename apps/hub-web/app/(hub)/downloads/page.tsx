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
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId, { channel: 'download' })),
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
          new Set(access.filter((a) => a.release.allowed).map((a) => a.productId)),
          (id) => ({ contratada: byId.get(id)?.access === 'contracted', liberado: byId.get(id)?.access === 'contracted' }),
          // no ar na web sem o app de computador (o Maestro): mostra como abrir, sem "Em desenvolvimento"
          { naWeb: new Set(access.filter((a) => a.release.open && a.release.channels.web).map((a) => a.productId)) },
        )}
      />
    </div>
  )
}
