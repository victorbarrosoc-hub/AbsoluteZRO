import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { releaseState } from '@zro/billing'
import { EmDesenvolvimento } from '@/components/em-desenvolvimento'
import { db } from '@/lib/session'

export const metadata: Metadata = { title: 'Em desenvolvimento', robots: { index: false, follow: false } }

/**
 * /em-desenvolvimento/<produto>: a porta fechada de um app da família (ADR 0023). Pública (os sites dos produtos e o
 * HUB mandam para cá); produto que não existe → 404; produto já aberto ao público → o HUB.
 */
export default async function Page({ params }: { params: Promise<{ produto: string }> }) {
  const { produto } = await params
  if (!/^[a-z0-9-]{1,40}$/.test(produto)) notFound()
  const info = await db().asSystem('site: em desenvolvimento', async (tx) => {
    const [p] = await tx`select id, name from zro.products where id = ${produto}`
    if (!p) return null
    const states = await releaseState(tx)
    return { id: p.id as string, nome: p.name as string, open: states[p.id as string]?.open ?? false }
  })
  if (!info) notFound()
  if (info.open) redirect('/inicio')
  return <EmDesenvolvimento produto={info} />
}
