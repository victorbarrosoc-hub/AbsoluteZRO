import Link from 'next/link'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { getAuth } from '@/lib/session'

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth()
  return (
    <div className="public">
      <header className="public-header">
        <Wordmark />
        <nav aria-label="Principal">
          <Link href="/#ciclo">Ciclo do O</Link>
          <Link href="/#ferramentas">Ferramentas</Link>
          <Link href="/planos">Planos</Link>
          {auth ? (
            <Link className="zro-btn zro-btn--primary zro-btn--small" href="/inicio">
              Abrir o HUB
            </Link>
          ) : (
            <>
              <Link href="/entrar">Entrar</Link>
              <Link className="zro-btn zro-btn--primary zro-btn--small" href="/criar-conta">
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </header>
      <main id="conteudo" className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} Absolute ZRO</span>
        <span>Da oportunidade à entrega. Um só fluxo.</span>
      </footer>
    </div>
  )
}
