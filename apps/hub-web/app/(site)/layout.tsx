import Link from 'next/link'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { getAuth } from '@/lib/session'

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth()
  return (
    <div className="public">
      <div className="public-glow" aria-hidden="true" />
      <header className="capsule-wrap">
        <div className="capsule">
          <Wordmark />
          <nav aria-label="Principal" className="capsule__links">
            <Link href="/#ciclo">Ciclo do O</Link>
            <Link href="/#ferramentas">Ferramentas</Link>
            <Link href="/planos">Planos</Link>
          </nav>
          <div className="capsule__cta">
            <ThemeToggle />
            {auth ? (
              <Link className="zro-btn zro-btn--primary zro-btn--small" href="/inicio">
                Abrir o HUB
              </Link>
            ) : (
              <>
                <Link className="capsule__login" href="/entrar">
                  Entrar
                </Link>
                <Link className="zro-btn zro-btn--primary zro-btn--small" href="/criar-conta">
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="conteudo" className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <Wordmark height={18} />
        <span>Da oportunidade à entrega. Um só fluxo.</span>
        <span>© {new Date().getFullYear()} Absolute ZRO</span>
      </footer>
    </div>
  )
}
