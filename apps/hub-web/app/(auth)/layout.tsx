import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap public">
      {/* A paisagem da marca (o símbolo em metal sobre a rocha, a mesma do topo do site) atrás de tudo, com um véu. */}
      <div className="auth-fundo" aria-hidden="true">
        <picture>
          <source media="(max-width: 700px)" srcSet="/brand/home-paisagem-sm.webp" />
          <img src="/brand/home-paisagem.webp" alt="" width={2400} height={1357} fetchPriority="high" />
        </picture>
      </div>
      <header className="auth-top">
        <Wordmark />
        <ThemeToggle />
      </header>
      <main id="conteudo" className="auth-panel">
        <div className="auth-box zro-card zro-card--glass">{children}</div>
        <p className="auth-tag">O futuro começa do zero.</p>
      </main>
    </div>
  )
}
