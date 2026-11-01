import type { Metadata } from 'next'
import { productAccessFor } from '@zro/billing'
import { authorize } from '@zro/core'
import { appsParaBaixar, DownloadsIntro } from '@/components/download-catalog'
import { DownloadPicker } from '@/components/download-picker'
import { InstalarHub } from '@/components/instalar-hub'
import { OsHint } from '@/components/os-hint'
import { ehAdmin } from '@/lib/downloads'
import { disponibilidade } from '@/lib/hub-desktop-release'
import { direitosDesktop } from '@/lib/meus-apps'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Downloads' }

/**
 * Downloads dentro do HUB: o download da Absolute ZRO e os apps. Dentro do app de computador, cada cartão instala pela
 * central; o que a conta pode instalar vem de `direitosDesktop` (gate + plano, no servidor; ADR 0049).
 */
export default async function Downloads() {
  const auth = await requireOrgPage()
  const actor = await authorize(db(), auth)
  const admin = ehAdmin(auth)
  const [access, hub, direitos] = await Promise.all([
    db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId, { channel: 'download' })),
    disponibilidade(),
    direitosDesktop(db(), actor, { admin }),
  ])
  const byId = new Map(access.map((a) => [a.productId, a]))
  const direito = new Map(direitos.map((d) => [d.id, d.direito]))
  return (
    <div className="page dl-page">
      <OsHint />
      <DownloadsIntro heading="h1" hub={hub} />
      <InstalarHub />
      <DownloadPicker
        apps={appsParaBaixar(
          access.map((a) => ({ id: a.productId, name: a.name, role: a.roleInFlow })),
          new Set(access.filter((a) => a.release.allowed || admin).map((a) => a.productId)),
          (id) => ({ contratada: byId.get(id)?.access === 'contracted', liberado: direito.get(id) === 'liberado' }),
          // no ar na web sem o app de computador: mostra como abrir, sem "Em desenvolvimento". AEON, Revela, NOSSOM e
          // Rift Motion só para admin de plataforma (titular, 01/11/2026)
          { naWeb: new Set(access.filter((a) => a.release.open && a.release.channels.web).map((a) => a.productId)), admin },
        )}
      />
    </div>
  )
}
