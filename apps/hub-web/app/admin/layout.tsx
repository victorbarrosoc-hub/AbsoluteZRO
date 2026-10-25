import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { requirePageAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Console isolado: só papel de plataforma. Para quem não tem, a rota não existe (404). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await requirePageAuth()
  if (!auth.user.platformRole || !auth.user.emailVerified) notFound()
  return (
    <div className="public">
      <header className="public-header">
        <Wordmark href="/inicio" />
        <nav aria-label="Administração">
          <span className="zro-eyebrow">Console da plataforma · {auth.user.platformRole}</span>
          <Link href="/inicio">Voltar ao HUB</Link>
          <ThemeToggle />
        </nav>
      </header>
      <main id="conteudo" className="public-main">
        {children}
      </main>
    </div>
  )
}
