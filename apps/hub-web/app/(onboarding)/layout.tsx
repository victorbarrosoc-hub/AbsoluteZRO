import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <header className="public-header">
        <Wordmark href="/" />
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
