import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@zro/core'
import { LabAbas } from '@/components/admin/z-lab/abas'
import { LabConfigurar } from '@/components/admin/z-lab/configurar'
import { estadoDaTela } from '@/lib/ia/lab/estado'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Configurar a Z · Console', robots: { index: false, follow: false } }

/** Configurar a Z: personalidade, regras, plataformas, conhecimento, voz, modelo, teto, versões e liberação. */
export default async function Configurar() {
  const auth = await getAuth()
  if (auth?.user.platformRole !== 'admin' || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin'])
  const estado = await estadoDaTela(db(), auth)
  return (
    <div className="page adm-page zl">
      <LabAbas atual="configurar" />
      <LabConfigurar estado={estado} />
    </div>
  )
}
