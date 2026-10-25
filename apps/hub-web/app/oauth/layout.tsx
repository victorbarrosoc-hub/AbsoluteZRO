import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'

export const dynamic = 'force-dynamic'

export default function OAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap public">
      <div className="auth-eclipse" aria-hidden="true" />
      <header className="auth-top">
        <Wordmark />
        <ThemeToggle />
      </header>
      <main id="conteudo" className="auth-panel">
        <div className="auth-box zro-card zro-card--glass">{children}</div>
        <p className="auth-tag">Uma conta. Todas as ferramentas.</p>
      </main>
    </div>
  )
}
