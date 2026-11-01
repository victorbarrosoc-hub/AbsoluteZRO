import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { releaseState } from '@zro/billing'
import { db } from '@/lib/session'

export const metadata: Metadata = { title: 'Absolute ZRO', robots: { index: false, follow: false } }

/**
 * /em-desenvolvimento/<produto>: endereço antigo da porta fechada (ADR 0023), que os sites dos produtos ainda podem
 * usar. Não mostra mais nome nem ícone de app (titular, 01/11/2026: app não lançado não aparece em lugar nenhum):
 * produto aberto ao público vai para o HUB; qualquer outro vai para a página inicial, sem dizer nada do app.
 */
export default async function Page({ params }: { params: Promise<{ produto: string }> }) {
  const { produto } = await params
  if (!/^[a-z0-9-]{1,40}$/.test(produto)) notFound()
  const aberto = await db().asSystem('site: porta fechada', async (tx) => (await releaseState(tx))[produto]?.open ?? false)
  redirect(aberto ? '/inicio' : '/')
}
