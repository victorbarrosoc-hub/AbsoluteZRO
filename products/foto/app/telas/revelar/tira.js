// A tira de fotos embaixo do palco: as escolhidas primeiro (ou a seleção que veio da Decupar), a foto em foco
// destacada e centralizada. Só os cartões perto da vista existem no DOM (mil fotos não viram mil nós); a miniatura é
// pedida só para o que aparece. Tocar troca a foto; ← → também (no teclado da tela).

import { cx, html, memo, useEffect, useLayoutEffect, useRef, useState } from '../../preact.js'
import { usarFoto, usarMiniatura } from '../../estado.js'

const PASSO = 64 // largura de um cartão (56) + o vão (8)
const FOLGA = 12

const Cartao = memo(function Cartao({ loja, id, emFoco, x, aoEscolher }) {
  const url = usarMiniatura(loja, id)
  const { foto } = usarFoto(loja, id)
  useEffect(() => {
    if (!url) loja.miniaturas.pedir(id)
  }, [id, url])
  const mexida = !!foto?.ajustes
  return html`<button
    type="button"
    class=${cx('rv-tira-foto', emFoco && 'rv-tira-foto--foco')}
    style=${`transform:translateX(${x}px)`}
    aria-label=${foto?.nome ?? 'Foto'}
    aria-current=${emFoco ? 'true' : undefined}
    data-id=${id}
    onClick=${() => aoEscolher(id)}
  >
    ${url ? html`<img src=${url} alt="" draggable="false" />` : html`<span class="rv-tira-vazia"></span>`}
    ${foto?.marca === 'escolhida' ? html`<span class="rv-tira-marca" aria-hidden="true"></span>` : null}
    ${mexida ? html`<span class="rv-tira-mexida" title="Revelada" aria-hidden="true"></span>` : null}
  </button>`
})

export function Tira({ loja, ids, foco, aoEscolher }) {
  const caixa = useRef(null)
  const [vista, definirVista] = useState({ de: 0, ate: 40 })
  const i = Math.max(0, ids.indexOf(foco))

  const medir = () => {
    const el = caixa.current
    if (!el) return
    const de = Math.max(0, Math.floor(el.scrollLeft / PASSO) - FOLGA)
    const ate = Math.min(ids.length, Math.ceil((el.scrollLeft + el.clientWidth) / PASSO) + FOLGA)
    definirVista((v) => (v.de === de && v.ate === ate ? v : { de, ate }))
  }
  // a foto em foco fica no meio da tira
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const alvo = i * PASSO + PASSO / 2 - el.clientWidth / 2
    const longe = Math.abs(el.scrollLeft - alvo) > el.clientWidth
    el.scrollTo({ left: Math.max(0, alvo), behavior: longe || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    medir()
  }, [i, ids.length])
  useEffect(() => {
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null
    obs?.observe(caixa.current)
    return () => obs?.disconnect()
  }, [ids.length])

  if (ids.length < 2) return null
  const lista = []
  for (let k = vista.de; k < Math.min(vista.ate, ids.length); k++) lista.push(k)
  return html`<nav class="rv-tira" aria-label="Fotos" ref=${caixa} onScroll=${medir}>
    <div class="rv-tira-trilho" style=${`width:${ids.length * PASSO + 16}px`}>
      ${lista.map((k) => html`<${Cartao} key=${ids[k]} loja=${loja} id=${ids[k]} emFoco=${ids[k] === foco} x=${k * PASSO} aoEscolher=${aoEscolher} />`)}
    </div>
  </nav>`
}
