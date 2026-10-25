import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap public">
      <aside className="auth-art" aria-hidden="false">
        <Wordmark />
        <p className="zro-serif" style={{ fontSize: '1.6rem', color: '#e6e6e6' }}>
          Toda história começa do zero.
        </p>
      </aside>
      <main id="conteudo" className="auth-panel">
        <div className="auth-box">{children}</div>
      </main>
    </div>
  )
}
