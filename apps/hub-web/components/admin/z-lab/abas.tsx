import Link from 'next/link'

/** Cabeçalho do laboratório: o título curto e o seletor Testar · Configurar (uma ideia por tela). */
export function LabAbas({ atual }: { atual: 'testar' | 'configurar' }) {
  return (
    <header className="adm-head adm-head--row zl-head">
      <div>
        <h1>
          <span className="zl-head__fino">Laboratório da </span>Z
        </h1>
        <p>{atual === 'testar' ? 'A Z nova, só para você, antes dos clientes.' : 'Cada versão salva fica guardada. Os clientes não veem nada.'}</p>
      </div>
      <nav className="zl-abas" aria-label="Laboratório">
        <Link href="/admin/laboratorio" aria-current={atual === 'testar' ? 'page' : undefined}>
          Testar
        </Link>
        <Link href="/admin/laboratorio/configurar" aria-current={atual === 'configurar' ? 'page' : undefined}>
          Configurar
        </Link>
      </nav>
    </header>
  )
}
