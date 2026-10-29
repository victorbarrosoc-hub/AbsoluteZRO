'use client'
/**
 * O Set (ADR 0032) na central: a pílula discreta na barra de cima e a página /set. Os dois são o `<zro-set>`
 * (public/set/v1/zro-set.js), o mesmo que os apps carregam; aqui ele fala direto com /api/v1/set pela sessão do HUB.
 */
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

const SCRIPT = '/set/v1/zro-set.js'

type ZroSetElement = HTMLElement
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'zro-set': React.DetailedHTMLProps<React.HTMLAttributes<ZroSetElement>, ZroSetElement> & {
        api?: string
        modo?: 'botao' | 'pagina'
        tema?: 'claro' | 'escuro' | 'auto'
        projeto?: string
        abrir?: string
      }
    }
  }
}

function useScript() {
  useEffect(() => {
    if (customElements.get('zro-set') || document.querySelector(`script[src="${SCRIPT}"]`)) return
    const s = document.createElement('script')
    s.type = 'module'
    s.src = SCRIPT
    document.head.append(s)
  }, [])
}

/** A pílula na barra de cima: quem está online e o balão das não lidas. */
export function SetNaBarra() {
  useScript()
  return <zro-set api="/api/v1/set" className="topbar__set" />
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A página /set: a lista e a conversa lado a lado. `?projeto=<id>` abre a conversa do projeto, `?pessoa=<id>` a direta,
 * `?ajustes` os contatos e a privacidade. Lido aqui (e não só no servidor): a navegação pelo link do projeto chega sem
 * recarregar; a chave remonta o painel quando o pedido muda.
 */
export function SetPagina() {
  useScript()
  const sp = useSearchParams()
  const projeto = sp.get('projeto')
  const pessoa = sp.get('pessoa')
  const abrir =
    projeto && UUID.test(projeto) ? `projeto:${projeto}` : pessoa && UUID.test(pessoa) ? `pessoa:${pessoa}` : sp.has('ajustes') ? 'ajustes' : undefined
  return <zro-set key={abrir ?? ''} api="/api/v1/set" modo="pagina" abrir={abrir} />
}
