'use client'
/** Erro no laboratório: o console continua de pé, só esta tela pede para tentar de novo. Nada foi gasto nem alterado. */
export default function ErroLaboratorio({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Laboratório da Z</h1>
        <p>Não deu para abrir agora. Nada foi alterado.</p>
      </header>
      <button className="glass-btn glass-btn--ink" type="button" onClick={reset} style={{ justifySelf: 'start' }}>
        Tentar de novo
      </button>
    </div>
  )
}
