import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getAuth } from '@/lib/session'
import '../custos/custos.css'
import './lab.css'

export const dynamic = 'force-dynamic'

/**
 * Laboratório da Z (ADR 0033): só o papel admin da plataforma (o suporte não vê). Para qualquer outra pessoa a rota não
 * existe (404). As páginas conferem de novo por conta própria (no Next, layout e página renderizam em paralelo).
 */
export default async function LaboratorioLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth()
  if (auth?.user.platformRole !== 'admin' || !auth.user.emailVerified) notFound()
  return children
}
