import type { ReactNode } from 'react'

/** Painel do app Absolute ZRO para computador (/app): tela cheia, sem o menu do site nem o do HUB. */
export default function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <main id="conteudo" className="painel-raiz">
      {children}
    </main>
  )
}
