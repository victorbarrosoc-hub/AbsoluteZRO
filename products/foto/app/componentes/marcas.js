// As marcas de uma foto: Estrelas, Marca (escolhida ou rejeitada), Ponto (etiqueta de cor) e Marcar, a régua com tudo
// isso para a barra de seleção e para a lupa. A cor é só o ponto; o resto é grafite ou branco.

import { cx, html, useEffect, useRef } from '../preact.js'
import { Icone } from '../icones.js'
import { CORES } from '../../src/biblioteca/catalogo.js'

const ESTRELA = html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z" /></svg>`
const plural = (n) => (n === 1 ? '1 estrela' : `${n} estrelas`)

/**
 * Estrelas. Sem `aoMudar`, só mostra (`compacta`: só as cheias, como na grade). Com `aoMudar`, cinco botões: tocar
 * na nota que já está tira as estrelas.
 */
export function Estrelas({ valor = 0, aoMudar, compacta = false, tamanho, classe }) {
  const ref = useRef(null)
  const anterior = useRef(valor)
  useEffect(() => {
    if (anterior.current === valor) return
    anterior.current = valor
    const el = ref.current
    if (!el) return
    el.setAttribute('data-acabou-de-mudar', '')
    const t = setTimeout(() => el.removeAttribute('data-acabou-de-mudar'), 600)
    return () => clearTimeout(t)
  }, [valor])
  const estilo = tamanho ? `--estrela:${tamanho}px` : undefined
  if (!aoMudar) {
    if (compacta && !valor) return null
    return html`<span class=${cx('estrelas', classe)} role="img" aria-label=${valor ? plural(valor) : 'Sem estrelas'} style=${estilo} ref=${ref}>
      ${Array.from({ length: compacta ? valor : 5 }, (_, i) => html`<span class="estrela" data-cheia=${i < valor ? '' : undefined} style=${`--i:${i}`}>${ESTRELA}</span>`)}
    </span>`
  }
  return html`<span class=${cx('estrelas', classe)} role="group" aria-label="Estrelas" style=${estilo} ref=${ref}>
    ${Array.from(
      { length: 5 },
      (_, i) =>
        html`<button type="button" class="estrela" data-cheia=${i < valor ? '' : undefined} style=${`--i:${i}`} aria-label=${plural(i + 1)} aria-pressed=${valor === i + 1 ? 'true' : 'false'} onClick=${() => aoMudar(valor === i + 1 ? 0 : i + 1)}>
          ${ESTRELA}
        </button>`,
    )}
  </span>`
}

/** O selo de escolhida ou rejeitada (nada quando a foto não tem marca). */
export function Marca({ marca, classe }) {
  if (marca !== 'escolhida' && marca !== 'rejeitada') return null
  return html`<span class=${cx('marca', classe)} data-marca=${marca} role="img" aria-label=${marca === 'escolhida' ? 'Escolhida' : 'Rejeitada'}><${Icone} nome=${marca === 'escolhida' ? 'ok' : 'x'} /></span>`
}

/** A etiqueta de cor: um ponto. */
export function Ponto({ cor, classe }) {
  if (!CORES.includes(cor)) return null
  return html`<span class=${cx('ponto', classe)} data-cor=${cor} role="img" aria-label=${`Cor: ${cor}`}></span>`
}

const TECLA_DA_COR = { vermelho: '6', amarelo: '7', verde: '8', azul: '9' }

/**
 * A régua de marcar: escolher, rejeitar, estrelas e cores, para as fotos em `fotos` (uma ou várias). Cada botão mostra
 * o estado quando todas as fotos concordam. As funções recebem o valor novo (null tira).
 */
export function Marcar({ fotos, aoMarcar, aoEstrelar, aoColorir, semCores = false, ladoDaDica = 'cima' }) {
  const todas = (campo, valor) => fotos.length > 0 && fotos.every((f) => f[campo] === valor)
  const escolhida = todas('marca', 'escolhida')
  const rejeitada = todas('marca', 'rejeitada')
  const estrelas = fotos.length && fotos.every((f) => f.estrelas === fotos[0].estrelas) ? fotos[0].estrelas : 0
  const cor = fotos.length && fotos.every((f) => f.cor === fotos[0].cor) ? fotos[0].cor : null
  return html`<div class="marcar" role="group" aria-label="Marcar">
    <button type="button" class="liso" aria-label="Escolher" aria-pressed=${escolhida ? 'true' : 'false'} data-dica="Escolher" data-tecla="P" data-dica-lado=${ladoDaDica} data-marcar="escolhida" onClick=${() => aoMarcar(escolhida ? null : 'escolhida')}>
      <${Icone} nome="ok" />
    </button>
    <button type="button" class="liso" aria-label="Rejeitar" aria-pressed=${rejeitada ? 'true' : 'false'} data-dica="Rejeitar" data-tecla="X" data-dica-lado=${ladoDaDica} data-marcar="rejeitada" onClick=${() => aoMarcar(rejeitada ? null : 'rejeitada')}>
      <${Icone} nome="x" />
    </button>
    <span class="separador" aria-hidden="true"></span>
    <${Estrelas} valor=${estrelas} aoMudar=${aoEstrelar} tamanho=${17} />
    ${semCores
      ? null
      : html`<span class="separador" aria-hidden="true"></span>
          <span class="marcar-cores" role="group" aria-label="Cor">
            ${CORES.map(
              (c) =>
                html`<button type="button" class="marcar-cor" aria-label=${c} aria-pressed=${cor === c ? 'true' : 'false'} data-dica=${c} data-tecla=${TECLA_DA_COR[c]} data-dica-lado=${ladoDaDica} onClick=${() => aoColorir(cor === c ? null : c)}>
                  <span class="ponto" data-cor=${c}></span>
                </button>`,
            )}
          </span>`}
  </div>`
}
