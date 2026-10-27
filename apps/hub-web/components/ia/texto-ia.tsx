import { Fragment, type ReactNode } from 'react'

/**
 * A resposta da IA em blocos simples: parágrafos, listas (- ou 1.) e **negrito**. Monta elementos React (nada de HTML
 * vindo do modelo).
 */
export function TextoIa({ texto }: { texto: string }) {
  const blocos: ReactNode[] = []
  let lista: { ordenada: boolean; itens: string[] } | null = null
  let paragrafo: string[] = []
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push(<p key={blocos.length}>{inline(paragrafo.join(' '))}</p>)
    paragrafo = []
  }
  const fecharLista = () => {
    if (!lista) return
    const Tag = lista.ordenada ? 'ol' : 'ul'
    blocos.push(
      <Tag key={blocos.length}>
        {lista.itens.map((t, i) => (
          <li key={i}>{inline(t)}</li>
        ))}
      </Tag>,
    )
    lista = null
  }
  for (const linha of texto.split('\n')) {
    const l = linha.trim()
    const item = /^(?:[-•*]\s+|(\d+)[.)]\s+)(.*)$/.exec(l)
    if (!l) {
      fecharParagrafo()
      fecharLista()
    } else if (item) {
      fecharParagrafo()
      const ordenada = !!item[1]
      if (lista && lista.ordenada !== ordenada) fecharLista()
      lista ??= { ordenada, itens: [] }
      lista.itens.push(item[2] ?? '')
    } else if (/^#{1,4}\s+/.test(l)) {
      fecharParagrafo()
      fecharLista()
      blocos.push(
        <p key={blocos.length} className="ia-texto__titulo">
          {inline(l.replace(/^#{1,4}\s+/, ''))}
        </p>,
      )
    } else {
      fecharLista()
      paragrafo.push(l)
    }
  }
  fecharParagrafo()
  fecharLista()
  return <div className="ia-texto">{blocos}</div>
}

function inline(t: string): ReactNode {
  return t
    .split(/(\*\*[^*]+\*\*)/g)
    .map((parte, i) =>
      parte.startsWith('**') && parte.endsWith('**') && parte.length > 4 ? <strong key={i}>{parte.slice(2, -2)}</strong> : <Fragment key={i}>{parte}</Fragment>,
    )
}
