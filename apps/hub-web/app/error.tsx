'use client'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="public" style={{ placeItems: 'center', display: 'grid', padding: 24 }}>
      <div className="stack" style={{ textAlign: 'center' }}>
        <p className="zro-eyebrow">Erro</p>
        <h1>Algo deu errado do nosso lado.</h1>
        <p className="zro-mute">Nada foi apagado. Tente de novo; se continuar, fale com o suporte.</p>
        <button className="zro-btn zro-btn--primary" onClick={reset} type="button">
          Tentar de novo
        </button>
      </div>
    </main>
  )
}
