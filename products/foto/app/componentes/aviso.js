// Aviso: a mensagem curta que sobe embaixo e some sozinha, com "Desfazer" quando a ação tem volta.
//   avisar('3 fotos rejeitadas', { desfazer: () => catalogo.desfazer() })
// Um por vez (o novo toma o lugar do anterior). O <Avisos /> mora na casca; role="status" para o leitor de tela.

import { html, useEffect, useState } from '../preact.js'

let atual = null
let relogio = null
const ouvintes = new Set()
const publicar = () => ouvintes.forEach((f) => f(atual))

/** Fecha o aviso que está na tela (com a saída animada). */
export function fecharAviso() {
  clearTimeout(relogio)
  if (!atual || atual.saindo) return
  atual = { ...atual, saindo: true }
  publicar()
  relogio = setTimeout(() => {
    atual = null
    publicar()
  }, 240)
}

/**
 * Mostra um aviso. `desfazer`: função chamada pelo botão (o aviso fecha em seguida). `rotulo`: o texto do botão.
 * `duracao` em ms (padrão 5 s; com desfazer, 7 s). Devolve a função que fecha.
 */
export function avisar(texto, { desfazer, rotulo = 'Desfazer', duracao } = {}) {
  clearTimeout(relogio)
  atual = { chave: Date.now() + Math.random(), texto, desfazer, rotulo }
  publicar()
  relogio = setTimeout(fecharAviso, duracao ?? (desfazer ? 7000 : 5000))
  return fecharAviso
}

export function Avisos() {
  const [aviso, definir] = useState(atual)
  useEffect(() => {
    ouvintes.add(definir)
    return () => ouvintes.delete(definir)
  }, [])
  return html`<div class="avisos" role="status" aria-live="polite">
    ${
      aviso
        ? html`<div class="aviso" key=${aviso.chave} data-saindo=${aviso.saindo ? '' : undefined}>
          <span>${aviso.texto}</span>
          ${
            aviso.desfazer
              ? html`<button
                type="button"
                onClick=${() => {
                  aviso.desfazer()
                  fecharAviso()
                }}
              >
                ${aviso.rotulo}
              </button>`
              : null
          }
        </div>`
        : null
    }
  </div>`
}
