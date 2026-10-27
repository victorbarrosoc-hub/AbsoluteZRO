import type { Viewport } from 'next'
import type { ReactNode } from 'react'
import { AberturaApp } from '@/components/abertura-app'

// No iPhone, o app aberto pela Tela de Início ocupa a tela toda: a barra de abas desce até a borda (safe area).
export const viewport: Viewport = { viewportFit: 'cover' }

/**
 * Painel do app Absolute ZRO (/app): no computador (Electron) e no celular (app da Tela de Início), tela cheia, sem o
 * menu do site nem o do HUB. No celular a barra lateral vira a barra de abas embaixo, como num app do iPhone.
 */
export default function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <main id="conteudo" className="painel-raiz">
      <AberturaApp />
      {children}
    </main>
  )
}
