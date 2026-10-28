import { Fragment, type ReactNode } from 'react'

/**
 * A resposta da IA em blocos simples: parágrafos, listas (- ou 1.), **negrito** e links como botões. Monta elementos React (nada de HTML
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

// Links viram botões (pedido do titular, 27/10/2026: nada de endereço cru na tela). Só https; o que é do próprio site
// abre aqui, o resto em outra aba. Endereço solto no texto vira um botão "Abrir".
const PEDACO = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s)]+)/g

function Botao({ href, children }: { href: string; children: ReactNode }) {
  const aqui = typeof location !== 'undefined' && href.startsWith(location.origin)
  return (
    <a className="ia-texto__botao" href={href} {...(aqui ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
      {children}
    </a>
  )
}

function inline(t: string): ReactNode {
  return t
    .replace(/\s*·\s*(?=\[)/g, ' ')
    .split(PEDACO)
    .map((parte, i) => {
      if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) return <strong key={i}>{parte.slice(2, -2)}</strong>
      const link = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(parte)
      if (link)
        return (
          <Botao key={i} href={link[2]!}>
            {link[1]}
          </Botao>
        )
      if (/^https:\/\/\S+$/.test(parte))
        return (
          <Botao key={i} href={parte}>
            Abrir
          </Botao>
        )
      return <Fragment key={i}>{parte}</Fragment>
    })
}
