import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Conta excluída', robots: { index: false } }

/** Fim da exclusão da conta: a sessão já saiu; só a volta para a home. */
export default function ContaExcluida() {
  return (
    <>
      <div className="stack">
        <h1>Conta excluída.</h1>
        <p className="zro-mute">Obrigado por ter passado por aqui.</p>
      </div>
      <Link className="zro-btn zro-btn--primary" href="/">
        Voltar para o início
      </Link>
    </>
  )
}
