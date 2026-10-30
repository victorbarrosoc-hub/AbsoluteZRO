import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@zro/core'
import { ChaveAusente } from '@/components/admin/z-lab/chave-ausente'
import { LabAbas } from '@/components/admin/z-lab/abas'
import { LabTestar } from '@/components/admin/z-lab/testar'
import { estadoDaTela } from '@/lib/ia/lab/estado'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Laboratório da Z · Console', robots: { index: false, follow: false } }

/** Testar a Z nova: conversa por texto e por voz, anexos e comparação, sempre com a configuração do rascunho. */
export default async function Laboratorio({ searchParams }: { searchParams: Promise<{ comparar?: string }> }) {
  const auth = await getAuth()
  if (auth?.user.platformRole !== 'admin' || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin'])
  const estado = await estadoDaTela(db(), auth)
  const { comparar } = await searchParams
  const n = Number(comparar)
  const compararCom = Number.isInteger(n) && estado.versoes.some((v) => v.numero === n) ? n : null
  return (
    <div className="page adm-page zl">
      <LabAbas atual="testar" />
      {estado.chaves.claude ? <LabTestar estado={estado} compararCom={compararCom} /> : <ChaveAusente estado={estado} />}
    </div>
  )
}
