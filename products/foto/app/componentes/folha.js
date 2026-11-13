// Folha: a janela modal do app (um <dialog> de verdade: foco preso, Esc fecha, leitor de tela anuncia). No celular
// sobe de baixo. FolhaAtalhos mostra o mapa de teclas (tecla ?).

import { cx, html, useEffect, useRef } from '../preact.js'
import { Icone } from '../icones.js'
import { Tecla } from './base.js'
import { ATALHOS } from '../../src/biblioteca/catalogo.js'

/**
 * `aberta` manda; `aoFechar()` é chamado no Esc, no X e no clique fora. O conteúdo só existe enquanto está aberta.
 * `largura`: em px (padrão 520).
 */
export function Folha({ aberta, aoFechar, titulo, largura, classe, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    else if (!aberta && d.open) d.close()
  }, [aberta])
  const [fino, pesado] = Array.isArray(titulo) ? titulo : [null, titulo]
  return html`<dialog
    ref=${ref}
    class=${cx('folha', classe)}
    style=${largura ? `--folha-l:${largura}px` : undefined}
    aria-label=${Array.isArray(titulo) ? titulo.join(' ') : titulo}
    onCancel=${(e) => {
      e.preventDefault()
      aoFechar?.()
    }}
    onClose=${() => aberta && aoFechar?.()}
    onClick=${(e) => e.target === ref.current && aoFechar?.()}
    onKeyDown=${(e) => e.key !== 'Escape' && e.stopPropagation()}
  >
    ${
      aberta
        ? html`<header class="folha-topo">
            <h2>${fino ? html`<span class="fino">${fino} </span>` : null}<span class="pesado">${pesado}</span></h2>
            <button type="button" class="liso" aria-label="Fechar" onClick=${() => aoFechar?.()}><${Icone} nome="x" /></button>
          </header>
          <div class="folha-corpo">${children}</div>`
        : null
    }
  </dialog>`
}

const noMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
const comoSeLe = (tecla) => (!noMac() && tecla === '⌘' ? 'Ctrl' : !noMac() && tecla === '⇧' ? 'Shift' : tecla)

/** O mapa de teclas, do contrato (src/biblioteca/catalogo.js). `extras`: mais linhas [{ grupo, teclas, rotulo }]. */
export function FolhaAtalhos({ aberta, aoFechar, extras = [] }) {
  const grupos = new Map()
  for (const a of [...ATALHOS, ...extras]) {
    if (!grupos.has(a.grupo)) grupos.set(a.grupo, [])
    grupos.get(a.grupo).push(a)
  }
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Atalhos', 'do teclado.']} largura=${880} classe="folha-atalhos">
    <div class="atalhos">
      ${[...grupos].map(
        ([nome, lista]) =>
          html`<section>
            <h3>${nome}</h3>
            ${lista.map(
              (a) =>
                html`<div class="atalho">
                  <span>${a.rotulo}</span>
                  <span class="atalho-teclas">
                    ${a.teclas.map((t) => (t === '–' ? html`<span aria-hidden="true">–</span>` : html`<${Tecla}>${comoSeLe(t)}<//>`))}
                    ${a.ou ? html`<span>ou</span>${a.ou.map((t) => html`<${Tecla}>${comoSeLe(t)}<//>`)}` : null}
                  </span>
                </div>`,
            )}
          </section>`,
      )}
    </div>
  <//>`
}
