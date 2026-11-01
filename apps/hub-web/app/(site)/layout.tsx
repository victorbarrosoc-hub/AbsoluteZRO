import Link from 'next/link'
import type { Viewport } from 'next'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { LinkIntencao, Transicao } from '@/components/movimento'
import { ThemeToggle } from '@/components/theme-toggle'
import { getAuth } from '@/lib/session'

// No iPhone a página vai até a borda de cima: a cápsula desce pela safe area e a faixa atrás dela cobre a barra de
// status, para nada da página aparecer entre o relógio e o topo enquanto rola (globals.css, .capsule-wrap).
export const viewport: Viewport = { viewportFit: 'cover' }

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth()
  return (
    <div className="public">
      <div className="public-glow" aria-hidden="true" />
      <header className="capsule-wrap">
        <div className="capsule">
          <Wordmark />
          <nav aria-label="Principal" className="capsule__links">
            <LinkIntencao href="/#ciclo">Ciclo do O</LinkIntencao>
            <LinkIntencao href="/#ecossistema">Ferramentas</LinkIntencao>
            <LinkIntencao href="/baixar" transitionTypes={['z-frente']}>
              Downloads
            </LinkIntencao>
            <LinkIntencao href="/planos" transitionTypes={['z-frente']}>
              Planos
            </LinkIntencao>
          </nav>
          <div className="capsule__cta">
            <ThemeToggle />
            {auth ? (
              <Link className="zro-btn zro-btn--primary zro-btn--small" href="/inicio">
                Abrir o HUB
              </Link>
            ) : (
              <>
                {/* Entrar em vidro claro e Criar conta em vidro escuro, também no celular (pedido do titular, 01/11/2026) */}
                <Link className="glass-btn glass-btn--small capsule__login" href="/entrar">
                  Entrar
                </Link>
                <Link className="glass-btn glass-btn--ink glass-btn--small capsule__criar" href="/criar-conta">
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="conteudo" className="public-main">
        <Transicao>{children}</Transicao>
      </main>
      <footer className="public-footer">
        <Wordmark height={18} />
        <nav aria-label="Rodapé" className="public-footer__nav">
          <Link href="/#ciclo">Ciclo do O</Link>
          <Link href="/#ecossistema">Ferramentas</Link>
          <Link href="/baixar">Downloads</Link>
          <Link href="/planos">Planos</Link>
          <Link href="/entrar">Entrar</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
          <a href="mailto:contato@absolutezro.com">Contato</a>
        </nav>
        <span>© {new Date().getFullYear()} Absolute ZRO</span>
      </footer>
    </div>
  )
}
