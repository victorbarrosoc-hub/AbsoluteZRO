import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { papelNoConsole, podeVer } from '@zro/core'
import { getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Custos: admin e Financeiro (o suporte não vê). A checagem fica aqui, fora do esqueleto de carregamento, para a rota
 * responder 404 de verdade; a página confere de novo por conta própria.
 */
export default async function CustosLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth()
  if (!auth || !podeVer(papelNoConsole(auth), 'custos')) notFound()
  return children
}
