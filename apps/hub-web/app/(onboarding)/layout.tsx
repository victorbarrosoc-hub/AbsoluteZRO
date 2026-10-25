import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <header className="public-header">
        <Wordmark href="/" />
        <ThemeToggle />
      </header>
      <main id="conteudo" className="public-main" style={{ maxWidth: 640 }}>
        {children}
      </main>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} Absolute ZRO</span>
      </footer>
    </div>
  )
}
