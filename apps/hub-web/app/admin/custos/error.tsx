'use client'
/** Erro nos custos: o console continua de pé (barra lateral), só esta tela pede para tentar de novo. */
export default function ErroCustos({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Custo do ecossistema</h1>
        <p>Não deu para carregar agora. Nada foi alterado.</p>
      </header>
      <button className="glass-btn glass-btn--ink" type="button" onClick={reset} style={{ justifySelf: 'start' }}>
        Tentar de novo
      </button>
    </div>
  )
}
