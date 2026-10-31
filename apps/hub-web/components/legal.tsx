import type { ReactNode } from 'react'

export const LEGAL_ATUALIZADO = '31 de outubro de 2026'

/** Moldura das páginas legais (privacidade e termos): título curto, data e seções em coluna de leitura. */
export function Legal({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="section section--page legal" aria-labelledby={id}>
      <div className="section__head">
        <p className="zro-eyebrow">Absolute ZRO</p>
        <h1 id={id} className="display-2 atitle">
          <span className="atitle__bold">{titulo}</span>
        </h1>
        <p>Atualizado em {LEGAL_ATUALIZADO}.</p>
      </div>
      <div className="legal__corpo">{children}</div>
    </section>
  )
}

export function LegalSecao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="legal__secao">
      <h2>{titulo}</h2>
      {children}
    </section>
  )
}
