// Componentes de base do sistema visual (app/foto.css): Controle, Segmentado, Pilulas, Chave, Menu, Vazio, Esqueleto,
// Progresso, Numero e Tecla. Todos funcionam pelo teclado, levam os papéis ARIA certos e têm alvo de toque de 44 px no
// celular (o ::before invisível do CSS). Nenhum anima por quadro no Preact: é CSS ou Web Animations.

import { cx, html, reduzirMovimento, useEffect, useLayoutEffect, useRef, useState } from '../preact.js'
import { Icone } from '../icones.js'

const MOLA = 'cubic-bezier(0.32, 0.72, 0, 1)'
const limitar = (v, min, max) => Math.max(min, Math.min(max, v))
const casasDe = (passo) => (String(passo).split('.')[1] || '').length

/** −1,5 · 0 · +0,35: número com vírgula, sinal de menos tipográfico e, nos controles de dois lados, o mais. */
export function formatarValor(v, { passo = 1, sinal = false } = {}) {
  const casas = casasDe(passo)
  const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  if (Number(v.toFixed(casas)) === 0) return t
  return `${v < 0 ? '−' : sinal ? '+' : ''}${t}`
}

/**
 * Controle (slider). O trilho acende do neutro até o valor, o neutro tem uma marca, o número é tabular.
 * Duplo clique volta ao neutro; ← → andam um passo e, com Shift, dez; a roda do mouse só mexe com Alt (para não
 * roubar a rolagem do painel).
 *
 * `aoMudar(valor, { final })`: `final: false` enquanto arrasta (prévia), `true` quando solta (é o que entra no desfazer).
 */
export function Controle({ rotulo, valor, min = -100, max = 100, passo = 1, neutro = 0, aoMudar, formato, desligado = false, linha = false, id, dica, classe }) {
  const proprio = useRef(`controle-${Math.random().toString(36).slice(2, 9)}`).current
  const nome = id || proprio
  const v = limitar(Number(valor) || 0, min, max)
  const fracao = (x) => (max === min ? 0 : (limitar(x, min, max) - min) / (max - min))
  const texto = formato ? formato(v) : formatarValor(v, { passo, sinal: min < neutro })
  const arredondar = (x) => Number((Math.round(limitar(x, min, max) / passo) * passo).toFixed(casasDe(passo) + 2))
  const mudar = (x, final) => aoMudar?.(arredondar(x), { final })

  const tecla = (e) => {
    const direcao = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]
    if (!direcao) return
    e.preventDefault()
    e.stopPropagation()
    mudar(v + direcao * passo * (e.shiftKey ? 10 : 1), true)
  }
  const roda = (e) => {
    if (!e.altKey || desligado) return
    e.preventDefault()
    mudar(v + (e.deltaY < 0 || e.deltaX > 0 ? 1 : -1) * passo * (e.shiftKey ? 10 : 1), true)
  }
  return html`<div
    class=${cx('controle', linha && 'controle--linha', classe)}
    data-mexido=${v !== neutro ? '' : undefined}
    style=${`--de:${Math.min(fracao(neutro), fracao(v))};--ate:${Math.max(fracao(neutro), fracao(v))};--neutro:${fracao(neutro)}`}
    title=${dica}
  >
    <label class="controle-rotulo" for=${nome}>${rotulo}</label>
    <output class="controle-valor" for=${nome}>${texto}</output>
    <div class="controle-trilho">
      <input
        type="range"
        id=${nome}
        min=${min}
        max=${max}
        step=${passo}
        value=${v}
        disabled=${desligado}
        aria-valuetext=${texto}
        onInput=${(e) => mudar(Number(e.currentTarget.value), false)}
        onChange=${(e) => mudar(Number(e.currentTarget.value), true)}
        onDblClick=${() => !desligado && mudar(neutro, true)}
        onKeyDown=${tecla}
        onWheel=${roda}
      />
    </div>
  </div>`
}

/**
 * A marca que desliza até o item ativo (segmentado e dock): mede o item e escreve --x e --l no recipiente. A primeira
 * posição entra sem deslizar; depois, com mola (CSS). Refaz ao redimensionar e quando as fontes chegam.
 */
export function usarMarca(refRecipiente, seletorAtivo, deps) {
  useLayoutEffect(() => {
    const caixa = refRecipiente.current
    if (!caixa) return
    const marca = caixa.querySelector('[data-marca-desliza]')
    const medir = () => {
      const ativo = caixa.querySelector(seletorAtivo)
      if (!marca) return
      if (!ativo || !ativo.offsetWidth) {
        marca.removeAttribute('data-pronta')
        return
      }
      caixa.style.setProperty('--x', `${ativo.offsetLeft}px`)
      caixa.style.setProperty('--l', `${ativo.offsetWidth}px`)
      if (!marca.hasAttribute('data-pronta')) {
        marca.setAttribute('data-pronta', '')
        requestAnimationFrame(() => requestAnimationFrame(() => marca.setAttribute('data-viva', '')))
      }
    }
    medir()
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null
    obs?.observe(caixa)
    document.fonts?.ready.then(medir)
    return () => obs?.disconnect()
  }, deps)
}

/** Setas num grupo de opções (roving tabindex): ← → ↑ ↓, Home e End movem o foco e escolhem. */
function setasDoGrupo(e, valores, atual, escolher) {
  const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  let i = valores.indexOf(atual)
  if (passo) i = (i + passo + valores.length) % valores.length
  else if (e.key === 'Home') i = 0
  else if (e.key === 'End') i = valores.length - 1
  else return
  e.preventDefault()
  e.stopPropagation()
  escolher(valores[i])
  e.currentTarget.parentElement?.querySelectorAll('[role="radio"]')[i]?.focus()
}

/**
 * Segmentado: uma escolha entre poucas. `opcoes`: [{ valor, rotulo, icone?, dica? }]. Radiogroup com setas.
 */
export function Segmentado({ opcoes, valor, aoMudar, rotulo, classe }) {
  const ref = useRef(null)
  usarMarca(ref, '[aria-checked="true"]', [valor, opcoes.length])
  const valores = opcoes.map((o) => o.valor)
  return html`<div class=${cx('segmentado', classe)} role="radiogroup" aria-label=${rotulo} ref=${ref}>
    <span class="segmentado-marca" data-marca-desliza aria-hidden="true"></span>
    ${opcoes.map(
      (o) =>
        html`<button
          type="button"
          role="radio"
          aria-checked=${o.valor === valor ? 'true' : 'false'}
          aria-label=${o.icone && !o.mostrarRotulo ? o.rotulo : undefined}
          tabindex=${o.valor === valor || (valor == null && o === opcoes[0]) ? 0 : -1}
          title=${o.dica}
          onClick=${() => o.valor !== valor && aoMudar?.(o.valor)}
          onKeyDown=${(e) => setasDoGrupo(e, valores, valor, (x) => aoMudar?.(x))}
        >
          ${o.icone ? html`<${Icone} nome=${o.icone} />` : null}${!o.icone || o.mostrarRotulo ? o.rotulo : null}
        </button>`,
    )}
  </div>`
}

/**
 * Pílulas de filtro com contagem. `opcoes`: [{ valor, rotulo, contagem?, cor?, icone?, dica? }].
 * Uma só (padrão): tocar na ativa volta a nenhuma (`aoMudar(null)`). `multiplo`: `valor` é lista.
 * `rola`: uma linha que rola de lado (celular) em vez de quebrar.
 */
export function Pilulas({ opcoes, valor, aoMudar, rotulo, multiplo = false, rola = false, classe }) {
  const ativos = valor == null ? [] : Array.isArray(valor) ? valor : [valor]
  const tocar = (v) => {
    if (!multiplo) return aoMudar?.(ativos.includes(v) ? null : v)
    const novo = ativos.includes(v) ? ativos.filter((x) => x !== v) : [...ativos, v]
    aoMudar?.(novo.length ? novo : null)
  }
  return html`<div class=${cx('pilulas', rola && 'pilulas--rola', classe)} role="group" aria-label=${rotulo}>
    ${opcoes.map(
      (o) =>
        html`<button type="button" class="pilula" aria-pressed=${ativos.includes(o.valor) ? 'true' : 'false'} title=${o.dica} data-valor=${String(o.valor)} onClick=${() => tocar(o.valor)}>
          ${o.cor ? html`<span class="ponto" data-cor=${o.cor} aria-hidden="true"></span>` : null}${o.icone ? html`<${Icone} nome=${o.icone} />` : null}${o.rotulo}${o.contagem != null
            ? html`<span class="pilula-n"><${Numero} valor=${o.contagem} /></span>`
            : null}
        </button>`,
    )}
  </div>`
}

/** Chave (liga/desliga): um checkbox de verdade com papel de switch. */
export function Chave({ ligada, aoMudar, rotulo, desligada = false, classe }) {
  return html`<label class=${cx('chave', classe)}>
    <input type="checkbox" role="switch" checked=${!!ligada} disabled=${desligada} onChange=${(e) => aoMudar?.(e.currentTarget.checked)} />
    <span>${rotulo}</span>
  </label>`
}

/**
 * Menu: um botão que abre uma lista de ações. `itens`: { rotulo, aoEscolher, icone?, detalhe?, perigo?, marcado?, href? }
 * | { divisa: true } | { titulo }. ↑ ↓ andam, Esc fecha e devolve o foco, clique fora fecha.
 * `gatilho` é o conteúdo do botão; `classeBotao` o estilo dele (padrão: liso).
 */
export function Menu({ gatilho, rotulo, itens, lado = 'esquerda', classeBotao = 'liso', dica, classe, aoAbrir }) {
  const [aberto, definir] = useState(false)
  const ref = useRef(null)
  const fechar = (devolver = false) => {
    definir(false)
    if (devolver) ref.current?.querySelector('button')?.focus()
  }
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => !ref.current?.contains(e.target) && fechar()
    document.addEventListener('pointerdown', fora, true)
    ref.current?.querySelector('.menu-lista [role^="menuitem"]')?.focus()
    return () => document.removeEventListener('pointerdown', fora, true)
  }, [aberto])
  const tecla = (e) => {
    if (!aberto) return
    const lista = [...(ref.current?.querySelectorAll('.menu-lista [role^="menuitem"]') || [])]
    const i = lista.indexOf(document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fechar(true)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      lista[(i + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length]?.focus()
    } else if (e.key === 'Tab') fechar()
    else if (e.key.length === 1) e.stopPropagation() // a letra não vira atalho da tela com o menu aberto
  }
  return html`<span class=${cx('menu', classe)} ref=${ref} onKeyDown=${tecla}>
    <button
      type="button"
      class=${classeBotao}
      aria-haspopup="menu"
      aria-expanded=${aberto ? 'true' : 'false'}
      aria-label=${rotulo}
      data-dica=${dica}
      onClick=${() => {
        if (!aberto) aoAbrir?.()
        definir(!aberto)
      }}
    >
      ${gatilho}
    </button>
    ${aberto
      ? html`<div class="menu-lista" role="menu" data-lado=${lado} aria-label=${rotulo}>
          ${itens.filter(Boolean).map((it) => {
            if (it.divisa) return html`<div class="menu-divisa" role="separator"></div>`
            if (it.titulo) return html`<div class="menu-titulo">${it.titulo}</div>`
            const dentro = html`${it.icone ? html`<${Icone} nome=${it.icone} />` : null}<span>${it.rotulo}</span>${it.detalhe ? html`<small>${it.detalhe}</small>` : null}`
            const papel = it.marcado == null ? 'menuitem' : 'menuitemradio'
            const escolher = () => {
              fechar(true)
              it.aoEscolher?.()
            }
            return it.href
              ? html`<a class="menu-item" role=${papel} href=${it.href} target=${it.externo ? '_blank' : undefined} rel=${it.externo ? 'noopener' : undefined} tabindex="-1" onClick=${() => fechar()}>${dentro}</a>`
              : html`<button type="button" class=${cx('menu-item', it.perigo && 'menu-item--perigo')} role=${papel} aria-checked=${it.marcado == null ? undefined : it.marcado ? 'true' : 'false'} tabindex="-1" onClick=${escolher}>
                  ${dentro}
                </button>`
          })}
        </div>`
      : null}
  </span>`
}

/**
 * Estado vazio: ícone, título curto (fino × pesado) e, no máximo, uma linha de apoio e as ações.
 * `titulo`: texto, ou [fino, pesado].
 */
export function Vazio({ icone, titulo, apoio, children, classe }) {
  const [fino, pesado] = Array.isArray(titulo) ? titulo : [null, titulo]
  return html`<div class=${cx('vazio', classe)}>
    ${icone ? html`<span class="vazio-icone"><${Icone} nome=${icone} /></span>` : null}
    <h2>${fino ? html`<span class="fino">${fino} </span>` : null}<span class="pesado">${pesado}</span></h2>
    ${apoio ? html`<div class="apoio">${apoio}</div>` : null}
    ${children ? html`<div class="vazio-acoes">${children}</div>` : null}
  </div>`
}

/** Esqueleto: a forma do que vai chegar. */
export function Esqueleto({ largura, altura, raio, classe }) {
  const medida = (v) => (typeof v === 'number' ? `${v}px` : v)
  return html`<span class=${cx('esqueleto', classe)} aria-hidden="true" style=${`width:${medida(largura) ?? '100%'};height:${medida(altura) ?? '1em'};${raio != null ? `border-radius:${medida(raio)}` : ''}`}></span>`
}

/** Barra de progresso discreta. `valor`: 0..1, ou null enquanto não se sabe (corre de lado). */
export function Progresso({ valor, rotulo, classe }) {
  const p = valor == null ? null : limitar(valor, 0, 1)
  return html`<div
    class=${cx('progresso', classe)}
    role="progressbar"
    aria-label=${rotulo}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow=${p == null ? undefined : Math.round(p * 100)}
    data-indeterminado=${p == null ? '' : undefined}
    style=${`--p:${p ?? 0}`}
  ></div>`
}

/** O anel de progresso (cabe no topo, ao lado do nome do trabalho). */
export function ProgressoAnel({ valor, rotulo }) {
  const p = limitar(valor ?? 0, 0, 1)
  return html`<svg class="progresso-anel" viewBox="0 0 20 20" role="progressbar" aria-label=${rotulo} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(p * 100)} style=${`--p:${p}`}>
    <circle class="trilho" cx="10" cy="10" r="7.5" />
    <circle class="feito" cx="10" cy="10" r="7.5" pathLength="100" />
  </svg>`
}

const milhar = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n ?? ''))

/**
 * Número que anima: quando o valor muda, o novo sobe do desfoque (Web Animations; nada com reduzir movimento).
 * O texto de verdade está sempre no elemento, então leitor de tela e teste leem o valor certo.
 */
export function Numero({ valor, formato = milhar, classe }) {
  const ref = useRef(null)
  const anterior = useRef(valor)
  useEffect(() => {
    if (anterior.current === valor) return
    const sobe = typeof valor === 'number' && typeof anterior.current === 'number' ? valor >= anterior.current : true
    anterior.current = valor
    if (reduzirMovimento() || !ref.current?.animate) return
    ref.current.animate(
      [
        { transform: `translateY(${sobe ? 45 : -45}%)`, opacity: 0, filter: 'blur(3px)' },
        { transform: 'none', opacity: 1, filter: 'blur(0)' },
      ],
      { duration: 320, easing: MOLA },
    )
  }, [valor])
  return html`<span class=${cx('numero', classe)} ref=${ref}>${formato(valor)}</span>`
}

/** Uma tecla do teclado, como nos atalhos. */
export const Tecla = ({ children }) => html`<kbd class="tecla">${children}</kbd>`
