// Balão: um botão que abre um quadro pequeno com qualquer conteúdo (um controle, duas linhas e um botão), preso a ele.
// Esc fecha e devolve o foco ao botão; clique fora fecha. Para lista de ações, use o Menu.
//
//   <${Balao} gatilho=${'Meta'} rotulo="Quero cerca de" lado="direita">…<//>
//   `children` pode ser uma função (fechar) => vnode, para o conteúdo fechar o balão.

import { cx, html, useLayoutEffect, useRef, useState } from '../preact.js'

export function Balao({ gatilho, rotulo, lado = 'esquerda', classeBotao = 'liso', dica, classe, children, aoAbrir, pressionado }) {
  const [aberto, definir] = useState(false)
  const ref = useRef(null)
  const fechar = (devolver = false) => {
    definir(false)
    if (devolver) ref.current?.querySelector('button')?.focus()
  }
  useLayoutEffect(() => {
    if (!aberto) return
    const fora = (e) => !ref.current?.contains(e.target) && fechar()
    document.addEventListener('pointerdown', fora, true)
    ref.current?.querySelector('.balao-quadro input, .balao-quadro button')?.focus()
    return () => document.removeEventListener('pointerdown', fora, true)
  }, [aberto])
  const tecla = (e) => {
    if (!aberto) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fechar(true)
    } else if (e.key.length === 1 || e.key.startsWith('Arrow')) e.stopPropagation() // o conteúdo é de quem digita, não da tela
  }
  return html`<span class=${cx('balao', classe)} ref=${ref} onKeyDown=${tecla}>
    <button
      type="button"
      class=${classeBotao}
      aria-haspopup="dialog"
      aria-expanded=${aberto ? 'true' : 'false'}
      aria-pressed=${pressionado == null ? undefined : pressionado ? 'true' : 'false'}
      aria-label=${typeof gatilho === 'string' ? undefined : rotulo}
      data-dica=${dica}
      onClick=${() => {
        if (!aberto) aoAbrir?.()
        definir(!aberto)
      }}
    >
      ${gatilho}
    </button>
    ${
      aberto
        ? html`<div class="balao-quadro" role="dialog" aria-label=${rotulo} data-lado=${lado}>
          ${typeof children === 'function' ? children(() => fechar(true)) : children}
        </div>`
        : null
    }
  </span>`
}
