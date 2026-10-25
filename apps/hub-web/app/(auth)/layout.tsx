import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap public">
      <div className="auth-eclipse" aria-hidden="true" />
      <header className="auth-top">
        <Wordmark />
        <ThemeToggle />
      </header>
      <main id="conteudo" className="auth-panel">
        <div className="auth-box zro-card zro-card--glass">{children}</div>
        <p className="auth-tag">Toda história começa do zero.</p>
      </main>
    </div>
  )
}
