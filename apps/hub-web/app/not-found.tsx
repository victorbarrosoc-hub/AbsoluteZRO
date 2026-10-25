import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="conteudo" className="public" style={{ placeItems: 'center', display: 'grid', padding: 24 }}>
      <div className="stack" style={{ textAlign: 'center' }}>
        <p className="zro-eyebrow">404</p>
        <h1>Não encontramos isso.</h1>
        <p className="zro-mute">A página não existe ou você não tem acesso a ela.</p>
        <Link className="zro-btn zro-btn--primary" href="/inicio">
          Voltar ao HUB
        </Link>
      </div>
    </main>
  )
}
