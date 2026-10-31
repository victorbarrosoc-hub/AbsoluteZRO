// Velocidade no Inspector: a curva do clipe para arrastar (como o gráfico de velocidade do DaVinci e do Premiere, com
// as curvas prontas do CapCut e o "aplicar em vários takes" e "salvar meu estilo" do Hélice Ramps). Escala em log: 10%
// embaixo, 800% em cima, 100% marcado (é onde o som toca). Arrastar mostra ao vivo na prévia; soltar grava uma ação
// só no desfazer. Dois cliques criam ponto; Delete apaga; setas ajustam o ponto com o teclado.

import { CURVAS, V_MAX, V_MIN, avaliar, limparPontos, manterDuracao, saidaDoClipe } from '../src/velocidade.js'

const W = 300
const H = 132
const TOPO = 14
const BASE = H - 8
const LOG_MAX = Math.log2(V_MAX)
const LOG_MIN = Math.log2(V_MIN)
const yDe = (v) => TOPO + ((LOG_MAX - Math.log2(v)) / (LOG_MAX - LOG_MIN)) * (BASE - TOPO)
const vDe = (y) => 2 ** (LOG_MAX - ((Math.min(BASE, Math.max(TOPO, y)) - TOPO) / (BASE - TOPO)) * (LOG_MAX - LOG_MIN))
const pct = (v) => `${Math.round(v * 100)}%`
const CHAVE_ESTILO = 'aeon-meu-estilo'
const NS = 'http://www.w3.org/2000/svg'

function lerEstilo() {
  try {
    return limparPontos(JSON.parse(localStorage.getItem(CHAVE_ESTILO) || 'null'))
  } catch {
    return null
  }
}

/**
 * caixa: onde montar. obter(): { p, clipe } (o clipe selecionado). previa(pontos): mostra sem gravar. gravar(pontos,
 * rotulo, todos): grava uma ação (todos = todos os clipes da linha). fps(): quadros por segundo do projeto.
 */
export function montarVelocidade(caixa, { obter, previa, gravar, fps }) {
  const sec = document.createElement('div')
  sec.className = 'insp-velocidade'
  sec.innerHTML = `<div class="vel-cabeca"><span class="insp-rotulo">Velocidade</span><output class="vel-resumo"></output></div>
<svg class="vel-curva" viewBox="0 0 ${W} ${H}" role="group" aria-label="Curva de velocidade do clipe. Dois cliques criam um ponto."></svg>
<div class="vel-curvas" role="group" aria-label="Curvas prontas"></div>
<div class="vel-acoes"><button type="button" class="ficha" data-acao="manter" title="A mesma forma, sem mudar o tempo do clipe na linha">Manter duração</button><button type="button" class="ficha" data-acao="todos" title="A mesma curva em todos os clipes da linha">Aplicar em todos</button><button type="button" class="ficha" data-acao="salvar" title="Guarda esta curva como Meu estilo">Salvar meu estilo</button></div>
<p class="vel-dica">Som só em 100%. Dois cliques criam ponto; Delete apaga.</p>`
  caixa.append(sec)
  const svg = sec.querySelector('svg')
  const chips = sec.querySelector('.vel-curvas')
  let pontos = null
  let arrasto = null
  let focado = -1

  const atuais = () => pontos || [[0, 1], [1, 1]]

  function desenharChips() {
    const estilo = lerEstilo()
    const opcoes = [{ id: 'normal', nome: '100%', dica: 'Velocidade normal, com som.', pontos: null }, ...(estilo ? [{ id: 'meu', nome: 'Meu estilo', dica: 'A curva que você salvou.', pontos: estilo }] : []), ...CURVAS]
    chips.replaceChildren(
      ...opcoes.map((o) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'ficha'
        b.textContent = o.nome
        b.title = o.dica
        const igual = JSON.stringify(limparPontos(o.pontos)) === JSON.stringify(pontos)
        b.setAttribute('aria-pressed', String(igual))
        b.onclick = () => gravar(limparPontos(o.pontos), `velocidade · ${o.nome}`)
        return b
      }),
    )
  }

  function desenharCurva() {
    const ps = atuais()
    const el = (tag, attrs, pai = svg) => {
      const e = document.createElementNS(NS, tag)
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
      pai.append(e)
      return e
    }
    svg.replaceChildren()
    // grade em log: 800, 400, 200, 100 (o som), 50, 25, 10
    for (const v of [8, 4, 2, 1, 0.5, 0.25, 0.1]) {
      el('line', { x1: 0, x2: W, y1: yDe(v), y2: yDe(v), class: v === 1 ? 'vel-grade vel-cem' : 'vel-grade' })
      el('text', { x: W - 2, y: yDe(v) - 3, class: 'vel-rotulo', 'text-anchor': 'end' }).textContent = pct(v)
    }
    // a curva, desenhada pela mesma conta dos degraus (src/velocidade.js)
    let d = ''
    for (let k = 0; k <= 120; k++) {
      const x = k / 120
      d += `${k ? 'L' : 'M'}${(x * W).toFixed(1)} ${yDe(avaliar(pontos, x)).toFixed(1)}`
    }
    el('path', { d: `${d}L${W} ${BASE}L0 ${BASE}Z`, class: 'vel-area' })
    el('path', { d, class: 'vel-linha' })
    ps.forEach(([x, v], i) => {
      const c = el('circle', { cx: x * W, cy: yDe(v), r: 6, class: 'vel-ponto', tabindex: 0, role: 'slider', 'aria-label': `Ponto ${i + 1}`, 'aria-valuetext': `${pct(v)} em ${Math.round(x * 100)}% do clipe`, 'aria-valuemin': V_MIN * 100, 'aria-valuemax': V_MAX * 100, 'aria-valuenow': Math.round(v * 100) })
      c.dataset.i = i
      if (i === focado) requestAnimationFrame(() => c.focus())
    })
  }

  function desenharResumo() {
    const { clipe } = obter()
    const out = sec.querySelector('.vel-resumo')
    if (!clipe || !pontos) return (out.textContent = '100%')
    const f = fps()
    const antes = (clipe.fim - clipe.ini) / f
    const depois = saidaDoClipe({ ...clipe, velocidade: { pontos } }) / f
    const seg = (s) => `${s.toFixed(1).replace('.', ',')} s`
    out.textContent = `${seg(antes)} → ${seg(depois)}`
  }

  function mostrar(novos) {
    pontos = novos
    desenharCurva()
    desenharResumo()
    desenharChips()
    sec.querySelector('[data-acao="manter"]').disabled = !pontos
  }

  // ───────── arrastar, criar e apagar pontos ─────────
  const noSvg = (e) => {
    const r = svg.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  function mover(i, x, v) {
    const ps = atuais().map((p) => p.slice())
    const ultimo = ps.length - 1
    // pontas ficam em 0 e 1; os do meio não passam dos vizinhos
    if (i > 0 && i < ultimo) ps[i][0] = Math.min(ps[i + 1][0] - 0.02, Math.max(ps[i - 1][0] + 0.02, x))
    ps[i][1] = Math.min(V_MAX, Math.max(V_MIN, v))
    return ps
  }
  svg.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.vel-ponto')
    if (!c || e.button !== 0) return
    e.preventDefault()
    svg.setPointerCapture(e.pointerId)
    focado = Number(c.dataset.i)
    arrasto = { i: focado }
  })
  svg.addEventListener('pointermove', (e) => {
    if (!arrasto) return
    const { x, y } = noSvg(e)
    const ps = mover(arrasto.i, x / W, vDe(y))
    pontos = ps
    arrasto.pontos = ps
    desenharCurva()
    desenharResumo()
    previa(limparPontos(ps))
  })
  const soltar = () => {
    if (!arrasto) return
    const ps = arrasto.pontos
    arrasto = null
    if (ps) gravar(limparPontos(ps), 'velocidade')
  }
  svg.addEventListener('pointerup', soltar)
  svg.addEventListener('pointercancel', soltar)
  svg.addEventListener('dblclick', (e) => {
    if (e.target.closest('.vel-ponto')) return
    const { x, y } = noSvg(e)
    const ps = [...atuais(), [x / W, vDe(y)]].sort((a, b) => a[0] - b[0])
    focado = ps.findIndex((p) => p[0] === x / W)
    gravar(limparPontos(ps), 'ponto de velocidade')
  })
  svg.addEventListener('keydown', (e) => {
    const c = e.target.closest('.vel-ponto')
    if (!c) return
    const i = Number(c.dataset.i)
    const ps = atuais()
    const [x, v] = ps[i]
    let novos = null
    if (e.key === 'ArrowUp') novos = mover(i, x, v * 1.1)
    else if (e.key === 'ArrowDown') novos = mover(i, x, v / 1.1)
    else if (e.key === 'ArrowRight') novos = mover(i, x + 0.02, v)
    else if (e.key === 'ArrowLeft') novos = mover(i, x - 0.02, v)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && i > 0 && i < ps.length - 1) {
      novos = ps.filter((_, k) => k !== i)
      focado = Math.max(0, i - 1)
    }
    if (!novos) return
    e.preventDefault()
    e.stopPropagation()
    if (focado < 0) focado = i
    gravar(limparPontos(novos), 'velocidade')
  })

  sec.querySelector('[data-acao="manter"]').onclick = () => pontos && gravar(manterDuracao(pontos), 'velocidade · manter duração')
  sec.querySelector('[data-acao="todos"]').onclick = () => gravar(pontos, 'velocidade em todos os clipes', true)
  sec.querySelector('[data-acao="salvar"]').onclick = (e) => {
    try {
      localStorage.setItem(CHAVE_ESTILO, JSON.stringify(pontos))
      e.currentTarget.textContent = 'Salvo'
      setTimeout(() => (e.currentTarget.textContent = 'Salvar meu estilo'), 1400)
    } catch {}
    desenharChips()
  }

  return {
    el: sec,
    /** Mostra a curva do clipe selecionado (chamado a cada mudança do projeto). */
    desenhar(clipe) {
      if (arrasto) return
      mostrar(limparPontos(clipe?.velocidade?.pontos) || null)
    },
  }
}
