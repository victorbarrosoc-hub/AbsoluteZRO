// ZERA · o anel (mapa radial do disco). Cada fatia é um <circle> com traço tracejado: um traço só, do tamanho da
// fatia, deslocado até o ângulo dela. Assim a animação de entrada é só transição de CSS (stroke-dasharray), sem
// redesenhar quadro a quadro. A fatia sob o ponteiro é achada pela conta (raio e ângulo), não pelo traço.
'use strict'

window.Z = window.Z || {}

const NS = 'http://www.w3.org/2000/svg'
const C = 300 // centro do viewBox 600×600
// anéis: raio de dentro e de fora (o círculo do meio é o botão .centro, por cima)
const NIVEIS = [
  [96, 160],
  [164, 208],
  [212, 242],
  [246, 266],
]
const VOLTA = 1000 // pathLength: a volta inteira vale 1000
const MISTURA = [100, 76, 58, 44]

Z.Anel = class Anel {
  constructor(svg, { aoPassar, aoClicar }) {
    this.svg = svg
    this.aoPassar = aoPassar
    this.aoClicar = aoClicar
    this.fatias = []
    this.porNivel = []
    this.ativa = null
    this.g = null
    svg.addEventListener('pointermove', (e) => this.passar(this.achar(e)))
    svg.addEventListener('pointerleave', () => this.passar(null))
    svg.addEventListener('click', (e) => {
      const f = this.achar(e)
      if (f) this.aoClicar(f)
    })
  }

  get reduzir() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  /** Monta as fatias de `dados` ({id, n, b, k, p, f: [...]}) e desenha. `animar`: 'dentro' | 'fora' | 'nova' | false. */
  async desenhar(dados, animar = 'nova') {
    if (animar && (animar === 'dentro' || animar === 'fora') && this.g && !this.reduzir) {
      this.svg.classList.add(animar === 'dentro' ? 'saindo-dentro' : 'saindo-fora')
      await new Promise((r) => setTimeout(r, 260))
    }
    this.svg.classList.remove('saindo-dentro', 'saindo-fora', 'foco')
    this.fatias = []
    this.porNivel = NIVEIS.map(() => [])
    const total = Math.max(1, dados.b)
    const montar = (no, ini, nivel, pai) => {
      let a = ini
      for (const f of no.f || []) {
        const tam = f.b / total
        const fatia = { ...f, nivel, ini: a, tam, pai, outros: f.id === null }
        const idx = this.fatias.push(fatia) - 1
        this.porNivel[nivel].push(fatia)
        fatia.idx = idx
        if (nivel + 1 < NIVEIS.length && f.f) montar(f, a, nivel + 1, idx)
        a += tam
      }
    }
    montar(dados, 0, 0, -1)

    const g = document.createElementNS(NS, 'g')
    g.setAttribute('transform', `rotate(-90 ${C} ${C})`)
    // trilho de fundo do primeiro anel
    const trilho = document.createElementNS(NS, 'circle')
    trilho.setAttribute('cx', C)
    trilho.setAttribute('cy', C)
    trilho.setAttribute('r', (NIVEIS[0][0] + NIVEIS[0][1]) / 2)
    trilho.setAttribute('stroke-width', NIVEIS[0][1] - NIVEIS[0][0])
    trilho.style.stroke = 'var(--trilho)'
    trilho.style.opacity = '0.6'
    g.appendChild(trilho)

    const novos = []
    this.fatias.forEach((f, i) => {
      const [ri, re] = NIVEIS[f.nivel]
      const r = (ri + re) / 2
      const folga = (1.6 / (2 * Math.PI * r)) * VOLTA
      const tam = f.tam * VOLTA - folga
      if (tam <= 0.4) return
      const el = document.createElementNS(NS, 'circle')
      el.setAttribute('cx', C)
      el.setAttribute('cy', C)
      el.setAttribute('r', r)
      el.setAttribute('pathLength', VOLTA)
      el.setAttribute('stroke-width', re - ri)
      el.setAttribute('class', 'fatia')
      el.style.stroke = f.outros ? 'var(--k-resto)' : `color-mix(in oklab, var(--k${f.k}) ${MISTURA[f.nivel]}%, var(--mistura))`
      el.style.strokeDashoffset = String(-f.ini * VOLTA)
      f.el = el
      f.alvo = `${tam} ${VOLTA}`
      if (animar && !this.reduzir) {
        el.style.strokeDasharray = `0 ${VOLTA}`
        el.style.transitionDelay = `${f.nivel * 70 + Math.min(i, 24) * 10}ms`
      } else {
        el.style.strokeDasharray = f.alvo
      }
      novos.push(f)
      g.appendChild(el)
    })
    if (this.g) this.g.remove()
    this.g = g
    this.svg.appendChild(g)
    if (animar && !this.reduzir) {
      // dois quadros: o navegador precisa ver o "0" antes do valor final para animar
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          for (const f of novos) f.el.style.strokeDasharray = f.alvo
        }),
      )
    }
    this.ativa = null
  }

  /** A fatia sob o ponteiro, pela posição (raio → anel, ângulo → fatia). */
  achar(e) {
    const m = this.svg.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const dx = p.x - C
    const dy = p.y - C
    const r = Math.hypot(dx, dy)
    const nivel = NIVEIS.findIndex(([ri, re]) => r >= ri - 2 && r <= re + 2)
    if (nivel < 0) return null
    let a = (Math.atan2(dy, dx) + Math.PI / 2) / (2 * Math.PI)
    if (a < 0) a += 1
    return this.porNivel[nivel].find((f) => a >= f.ini && a < f.ini + f.tam && f.el) || null
  }

  passar(f) {
    if (f === this.ativa) return
    this.ativa = f
    this.marcar(f ? [f] : [])
    this.aoPassar(f)
  }

  /** Acende as fatias (e os ancestrais); o resto apaga. Lista vazia: tudo aceso. */
  marcar(lista) {
    for (const f of this.fatias) f.el && f.el.classList.remove('ativa', 'ancestral')
    if (!lista.length) {
      this.svg.classList.remove('foco')
      return
    }
    this.svg.classList.add('foco')
    for (const f of lista) {
      if (!f.el) continue
      f.el.classList.add('ativa')
      let p = f.pai
      while (p >= 0) {
        const anc = this.fatias[p]
        if (anc.el) anc.el.classList.add('ancestral')
        p = anc.pai
      }
    }
  }

  destacarId(id) {
    const f = this.fatias.find((x) => x.id === id && x.nivel === 0)
    this.marcar(f ? [f] : [])
    return f || null
  }

  destacarTipo(k) {
    this.marcar(k === null ? [] : this.fatias.filter((f) => !f.outros && f.k === k))
  }
}
