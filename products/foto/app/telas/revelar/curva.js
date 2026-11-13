// A curva: a de pontos (luz, R, G, B) editada arrastando no gráfico, e a paramétrica de 4 regiões nos controles.
// Tocar na curva cria um ponto; arrastar move; duplo clique (ou arrastar para fora) tira; as pontas só sobem e descem.
// Setas movem o ponto em foco (Shift: dez vezes mais). O desenho é a mesma curva do motor (criarCurvaDePontos).

import { cx, html, useRef, useState } from '../../preact.js'
import { Segmentado } from '../../componentes/base.js'
import { CONTROLES, normalizar } from '../../../src/motor/ajustes.js'
import { criarCurvaDePontos, criarParametrica } from '../../../src/motor/ponto.js'
import { Ajuste } from './controle.js'

const CANAIS = [
  { valor: 'luz', rotulo: 'Luz' },
  { valor: 'r', rotulo: 'R' },
  { valor: 'g', rotulo: 'G' },
  { valor: 'b', rotulo: 'B' },
]
const LADO = 240
const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

function caminho(f) {
  let d = ''
  for (let i = 0; i <= 64; i++) {
    const x = i / 64
    d += `${i ? 'L' : 'M'}${(x * LADO).toFixed(1)} ${((1 - limitar(f(x), 0, 1)) * LADO).toFixed(1)}`
  }
  return d
}

export function Curva({ ajustes, aoMudar }) {
  const [canal, definirCanal] = useState('luz')
  const [foco, definirFoco] = useState(null)
  const svg = useRef(null)
  const arrasto = useRef(null)
  const a = normalizar(ajustes)
  const pontos = a.curva.pontos[canal]

  const gravar = (novos, final, rotulo = 'Curva') => {
    const b = normalizar(a)
    b.curva.pontos[canal] = novos
    aoMudar(b, { final, rotulo })
  }
  const posicao = (e) => {
    const r = svg.current.getBoundingClientRect()
    return [limitar((e.clientX - r.left) / r.width, 0, 1), limitar(1 - (e.clientY - r.top) / r.height, 0, 1), (e.clientY - r.top) / r.height]
  }
  const mover = (lista, i, x, y) => {
    const novos = lista.map((p) => [...p])
    const ponta = i === 0 || i === lista.length - 1
    const nx = ponta ? lista[i][0] : limitar(x, lista[i - 1][0] + 0.02, lista[i + 1][0] - 0.02)
    novos[i] = [Number(nx.toFixed(4)), Number(limitar(y, 0, 1).toFixed(4))]
    return novos
  }

  const descer = (e) => {
    if (e.button) return
    e.preventDefault()
    const [x, y] = posicao(e)
    let i = Number(e.target.closest('[data-ponto]')?.dataset.ponto ?? -1)
    let lista = pontos
    if (i < 0) {
      // cria o ponto em cima da curva, no x tocado
      if (lista.length >= 16) return
      const f = criarCurvaDePontos(lista)
      i = lista.findIndex((p) => p[0] > x)
      if (i <= 0) return
      lista = [...lista.slice(0, i), [Number(x.toFixed(4)), Number(limitar(f(x), 0, 1).toFixed(4))], ...lista.slice(i)]
      gravar(lista, false)
    }
    arrasto.current = { i, lista, id: e.pointerId, saiu: false }
    definirFoco(i)
    svg.current.setPointerCapture?.(e.pointerId)
    // o y do toque vale já (o ponto pula para o dedo)
    if (i > 0 && i < lista.length - 1) gravar(mover(lista, i, x, y), false)
  }
  const andar = (e) => {
    const g = arrasto.current
    if (!g || g.id !== e.pointerId) return
    const [x, y, yCru] = posicao(e)
    const ponta = g.i === 0 || g.i === g.lista.length - 1
    // arrastar para fora do gráfico tira o ponto (menos as pontas)
    g.saiu = !ponta && (yCru < -0.12 || yCru > 1.12)
    if (g.saiu) return gravar(g.lista.filter((_, k) => k !== g.i), false)
    g.lista = mover(g.lista, g.i, x, y)
    gravar(g.lista, false)
  }
  const subir = (e) => {
    const g = arrasto.current
    if (!g || g.id !== e.pointerId) return
    arrasto.current = null
    if (g.saiu) {
      definirFoco(null)
      return gravar(g.lista.filter((_, k) => k !== g.i), true, 'Ponto da curva')
    }
    gravar(g.lista, true)
  }
  const tirar = (i) => {
    if (i <= 0 || i >= pontos.length - 1) return
    definirFoco(null)
    gravar(
      pontos.filter((_, k) => k !== i),
      true,
      'Ponto da curva',
    )
  }
  const tecla = (e, i) => {
    const d = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      return tirar(i)
    }
    if (!d) return
    e.preventDefault()
    e.stopPropagation()
    const k = e.shiftKey ? 0.05 : 0.005
    gravar(mover(pontos, i, pontos[i][0] + d[0] * k, pontos[i][1] + d[1] * k), true)
  }

  const f = criarCurvaDePontos(pontos)
  const param = canal === 'luz' ? criarParametrica(a.curva) : null
  const reta = pontos.length === 2 && pontos[0][1] === 0 && pontos[1][1] === 1
  return html`<div class="curva" data-canal=${canal}>
    <${Segmentado} rotulo="Canal da curva" opcoes=${CANAIS} valor=${canal} aoMudar=${(v) => (definirCanal(v), definirFoco(null))} classe="curva-canais" />
    <svg
      ref=${svg}
      class="curva-grafico"
      viewBox=${`-8 -8 ${LADO + 16} ${LADO + 16}`}
      role="group"
      aria-label=${`Curva de pontos (${CANAIS.find((c) => c.valor === canal).rotulo}). Toque para criar um ponto, arraste para mover.`}
      onPointerDown=${descer}
      onPointerMove=${andar}
      onPointerUp=${subir}
      onPointerCancel=${subir}
    >
      <rect class="curva-fundo" x="0" y="0" width=${LADO} height=${LADO} rx="6" />
      ${[1, 2, 3].map(
        (k) => html`<path class="curva-grade" d=${`M${(k * LADO) / 4} 0V${LADO}M0 ${(k * LADO) / 4}H${LADO}`} />`,
      )}
      <path class="curva-diagonal" d=${`M0 ${LADO}L${LADO} 0`} />
      ${param ? html`<path class="curva-parametrica" d=${caminho(param)} />` : null}
      <path class=${cx('curva-linha', reta && 'curva-linha--reta')} d=${caminho(f)} />
      ${pontos.map(
        ([x, y], i) => html`<g
          class=${cx('curva-ponto', foco === i && 'curva-ponto--foco')}
          data-ponto=${i}
          transform=${`translate(${x * LADO} ${(1 - y) * LADO})`}
          tabindex="0"
          role="slider"
          aria-label=${`Ponto ${i + 1}`}
          aria-valuemin="0"
          aria-valuemax="255"
          aria-valuenow=${Math.round(y * 255)}
          aria-valuetext=${`entrada ${Math.round(x * 255)}, saída ${Math.round(y * 255)}`}
          onFocus=${() => definirFoco(i)}
          onKeyDown=${(e) => tecla(e, i)}
          onDblClick=${() => tirar(i)}
        >
          <circle class="curva-alvo" r="14" />
          <circle class="curva-bolinha" r="5" />
        </g>`,
      )}
    </svg>
    ${
      canal === 'luz'
        ? html`<div class="controles">
            ${['curva.altas', 'curva.claros', 'curva.escuros', 'curva.sombras'].map((caminho) => {
              const c = CONTROLES[caminho]
              return html`<${Ajuste}
                key=${caminho}
                caminho=${caminho}
                rotulo=${c.rotulo}
                valor=${a.curva[caminho.split('.')[1]]}
                min=${c.min}
                max=${c.max}
                passo=${c.passo}
                neutro=${c.neutro}
                aoMudar=${(v, o) => {
                  const b = normalizar(a)
                  b.curva[caminho.split('.')[1]] = v
                  aoMudar(b, { ...o, rotulo: c.rotulo })
                }}
              />`
            })}
          </div>`
        : null
    }
  </div>`
}
