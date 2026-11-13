// O palco da Revelar: a foto sobre o fundo neutro escuro (nos dois temas), no canvas da sessão. Aqui moram os gestos
// (arrastar ampliada, roda e pinça para o zoom, duplo toque alterna encaixar e 100%), a divisória do antes/depois, o
// retângulo do corte, a régua, o conta-gotas e os estados: a miniatura borrada na hora, a prévia embutida chegando,
// a revelação; o arquivo que não abre; o original fora de alcance; nenhuma foto.
//
// Quem cria as sessões é a tela (index.js); o palco só entrega os canvas (`refs`) e conta o que a pessoa fez.

import { cx, html, useEffect, useLayoutEffect, useRef, useState } from '../../preact.js'
import { Vazio } from '../../componentes/base.js'
import { Icone } from './icones.js'

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

/** O retângulo do corte, com as quatro alças e a grade dos terços. `corte` em frações do quadro; `razao` = l/a em px. */
function Corte({ corte, razao, caixa, aoMudar }) {
  const g = useRef(null)
  const c = corte ?? { x: 0, y: 0, l: 1, a: 1 }
  const descer = (e, alca) => {
    if (e.button) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    g.current = { alca, x: e.clientX, y: e.clientY, c: { ...c }, id: e.pointerId }
  }
  const andar = (e) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    const dx = (e.clientX - s.x) / caixa.cw
    const dy = (e.clientY - s.y) / caixa.ch
    let { x, y, l, a } = s.c
    if (s.alca === 'mover') {
      x = limitar(x + dx, 0, 1 - l)
      y = limitar(y + dy, 0, 1 - a)
    } else {
      // o canto oposto fica parado
      const esq = s.alca.includes('e')
      const cima = s.alca.includes('c')
      const fx = esq ? x + l : x
      const fy = cima ? y + a : y
      const px = limitar((esq ? x : x + l) + dx, 0, 1)
      const py = limitar((cima ? y : y + a) + dy, 0, 1)
      l = Math.max(0.05, Math.abs(px - fx))
      a = Math.max(0.05, Math.abs(py - fy))
      if (razao) {
        // razão em px: (l·cw) / (a·ch) = razao; vale a dimensão que andou mais
        const kw = caixa.cw / caixa.ch / razao
        if (l * kw > a) a = l * kw
        else l = a / kw
        const maxL = esq ? fx : 1 - fx
        const maxA = cima ? fy : 1 - fy
        const k = Math.min(1, maxL / l, maxA / a)
        l *= k
        a *= k
      }
      x = esq ? fx - l : fx
      y = cima ? fy - a : fy
    }
    aoMudar({ x, y, l, a }, false)
  }
  const subir = (e) => {
    if (!g.current || g.current.id !== e.pointerId) return
    g.current = null
    aoMudar(c, true)
  }
  const tecla = (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!d) return
    e.preventDefault()
    e.stopPropagation()
    const k = e.shiftKey ? 0.05 : 0.005
    aoMudar({ ...c, x: limitar(c.x + d[0] * k, 0, 1 - c.l), y: limitar(c.y + d[1] * k, 0, 1 - c.a) }, true)
  }
  const estilo = `left:${c.x * 100}%;top:${c.y * 100}%;width:${c.l * 100}%;height:${c.a * 100}%`
  return html`<div class="corte" onPointerMove=${andar} onPointerUp=${subir} onPointerCancel=${subir}>
    <div
      class="corte-caixa"
      style=${estilo}
      tabindex="0"
      role="group"
      aria-label="Corte: arraste para mover, setas para ajustar"
      onPointerDown=${(e) => descer(e, 'mover')}
      onKeyDown=${tecla}
    >
      <span class="corte-terco" style="left:33.33%"></span><span class="corte-terco" style="left:66.66%"></span>
      <span class="corte-terco corte-terco--h" style="top:33.33%"></span><span class="corte-terco corte-terco--h" style="top:66.66%"></span>
      ${['ec', 'dc', 'eb', 'db'].map((alca) => html`<span class=${`corte-alca corte-alca--${alca}`} data-alca=${alca} onPointerDown=${(e) => descer(e, alca)}></span>`)}
    </div>
  </div>`
}

/**
 * `refs`: { canvas, antes, avisos } (useRef da tela). `caixa`: onde o canvas está ({ esq, topo, cw, ch } em px de CSS,
 * dentro do visor). `estado`: { fase, erro, miniatura, nivel }. `modo`: null | 'gota' | 'corte' | 'regua'.
 */
export function Palco({
  refs,
  caixa,
  estado,
  comparar,
  aoComparar,
  avisos,
  avisosJs,
  antesJs,
  modo,
  corte,
  razao,
  aoCorte,
  aoRegua,
  aoGota,
  aoArrastar,
  aoZoom,
  aoAlternarZoom,
  aoVisor,
  ampliada,
  aoAbrirFotos,
  aoReligar,
  children,
}) {
  const visor = useRef(null)
  const gesto = useRef(null)
  const toques = useRef(new Map())
  const [linha, definirLinha] = useState(null)
  const [arrastando, definirArrastando] = useState(false)

  // o tamanho do visor (px de CSS): a tela precisa dele para as contas do zoom
  useLayoutEffect(() => {
    const el = visor.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      aoVisor({ W: r.width, H: r.height })
    }
    medir()
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null
    obs?.observe(el)
    return () => obs?.disconnect()
  }, [])

  const local = (e) => {
    const r = visor.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const naFoto = (p) => ({ fx: (p.x - caixa.esq) / caixa.cw, fy: (p.y - caixa.topo) / caixa.ch })

  const descer = (e) => {
    if (e.button || !caixa) return
    const p = local(e)
    toques.current.set(e.pointerId, p)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (modo === 'regua') {
      gesto.current = { tipo: 'regua', de: p, id: e.pointerId }
      definirLinha({ de: p, ate: p })
      return
    }
    if (modo === 'gota') {
      const { fx, fy } = naFoto(p)
      if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) aoGota(fx, fy)
      return
    }
    if (toques.current.size === 2) {
      const [a, b] = [...toques.current.values()]
      gesto.current = { tipo: 'pinca', d: Math.hypot(a.x - b.x, a.y - b.y), ultima: Math.hypot(a.x - b.x, a.y - b.y) }
      return
    }
    if (ampliada) {
      gesto.current = { tipo: 'arrastar', ultimo: p, id: e.pointerId }
      definirArrastando(true)
    }
  }
  const andar = (e) => {
    if (!toques.current.has(e.pointerId)) return
    const p = local(e)
    toques.current.set(e.pointerId, p)
    const g = gesto.current
    if (!g) return
    if (g.tipo === 'regua' && g.id === e.pointerId) definirLinha({ de: g.de, ate: p })
    else if (g.tipo === 'arrastar' && g.id === e.pointerId) {
      aoArrastar(p.x - g.ultimo.x, p.y - g.ultimo.y)
      g.ultimo = p
    } else if (g.tipo === 'pinca' && toques.current.size >= 2) {
      const [a, b] = [...toques.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      aoZoom(d / g.ultima, (a.x + b.x) / 2, (a.y + b.y) / 2)
      g.ultima = d
    }
  }
  const subir = (e) => {
    toques.current.delete(e.pointerId)
    const g = gesto.current
    if (g?.tipo === 'regua' && g.id === e.pointerId) {
      const p = local(e)
      const dx = p.x - g.de.x
      const dy = p.y - g.de.y
      definirLinha(null)
      if (Math.hypot(dx, dy) > 24) aoRegua(dx, dy)
    }
    if (!toques.current.size) {
      gesto.current = null
      definirArrastando(false)
    }
  }
  const roda = (e) => {
    if (!caixa || modo === 'corte') return
    e.preventDefault()
    const p = local(e)
    // trackpad (pinça vira roda com Ctrl) anda em passos pequenos; a roda do mouse, em degraus
    const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))
    aoZoom(k, p.x, p.y)
  }
  useEffect(() => {
    const el = visor.current
    if (!el) return
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  })

  // a divisória do antes/depois
  const divisoria = useRef(null)
  const moverDivisoria = (e) => {
    if (!caixa) return
    const p = local(e)
    aoComparar(limitar((p.x - caixa.esq) / caixa.cw, 0, 1))
  }

  const { fase, erro } = estado
  const vazio = fase === 'vazio' || fase === 'sem-original' || fase === 'erro'
  const posicaoCanvas = caixa ? `left:${caixa.esq}px;top:${caixa.topo}px;width:${caixa.cw}px;height:${caixa.ch}px` : 'display:none'
  return html`<div class=${cx('palco-revelar palco', `fase-${fase}`, ampliada && 'ampliada', arrastando && 'arrastando', modo && `modo-${modo}`)}>
    <div class="palco-area">
      ${
        estado.miniatura && (fase === 'abrindo' || fase === 'previa')
          ? html`<div class="rv-camada"><img class="palco-miniatura" src=${estado.miniatura} alt="" aria-hidden="true" style=${caixa ? posicaoCanvas : undefined} /></div>`
          : null
      }
      <div class="rv-visor rv-visor--antes" hidden=${!antesJs || !comparar}><canvas ref=${refs.antes} class="palco-canvas" aria-hidden="true"></canvas></div>
      <div
        class="rv-visor"
        ref=${visor}
        style=${antesJs && comparar != null ? `--corte-antes:${comparar * 100}%` : undefined}
        data-com-antes=${antesJs && comparar != null ? '' : undefined}
        onPointerDown=${descer}
        onPointerMove=${andar}
        onPointerUp=${subir}
        onPointerCancel=${subir}
        onDblClick=${(e) => {
          if (modo || !caixa) return
          const p = local(e)
          aoAlternarZoom(p.x, p.y)
        }}
      >
        <canvas ref=${refs.canvas} class="palco-canvas" role="img" aria-label="A foto revelada"></canvas>
      </div>
      <div class="rv-camada">
      ${
        caixa && !vazio
          ? html`<div class="palco-sobre" style=${posicaoCanvas}>
              <canvas ref=${refs.avisos} class="palco-avisos" hidden=${!(avisos && avisosJs)} aria-hidden="true"></canvas>
              ${
                comparar != null
                  ? html`<div class="divisoria" style=${`left:${comparar * 100}%`} ref=${divisoria}>
                      <span class="divisoria-rotulo divisoria-rotulo--antes" aria-hidden="true">Antes</span>
                      <span class="divisoria-rotulo divisoria-rotulo--depois" aria-hidden="true">Depois</span>
                      <button
                        type="button"
                        class="divisoria-puxador toque"
                        role="slider"
                        aria-label="Divisória entre antes e depois"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow=${Math.round(comparar * 100)}
                        onPointerDown=${(e) => {
                          e.stopPropagation()
                          e.currentTarget.setPointerCapture?.(e.pointerId)
                        }}
                        onPointerMove=${(e) => e.currentTarget.hasPointerCapture?.(e.pointerId) && moverDivisoria(e)}
                        onKeyDown=${(e) => {
                          const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
                          if (!d) return
                          e.preventDefault()
                          e.stopPropagation()
                          aoComparar(limitar(comparar + d * (e.shiftKey ? 0.1 : 0.02), 0, 1))
                        }}
                      ></button>
                    </div>`
                  : null
              }
              ${modo === 'corte' ? html`<${Corte} corte=${corte} razao=${razao} caixa=${caixa} aoMudar=${aoCorte} />` : null}
            </div>`
          : null
      }
      ${
        linha
          ? html`<svg class="regua-linha" aria-hidden="true"><line x1=${linha.de.x} y1=${linha.de.y} x2=${linha.ate.x} y2=${linha.ate.y} /></svg>`
          : null
      }
      </div>
      ${
        fase === 'vazio'
          ? html`<div class="palco-vazio"><${Vazio} icone="fotos" titulo=${['Nenhuma foto', 'em foco.']} apoio="Escolha uma na Decupar ou abra fotos.">
              <button type="button" class="vidro vidro--tinta" onClick=${aoAbrirFotos}>Abrir fotos</button>
            <//></div>`
          : fase === 'sem-original'
            ? html`<div class="palco-vazio"><${Vazio} icone="ligar" titulo=${['O original', 'está longe.']} apoio="Ligue a pasta de novo para revelar.">
                <button type="button" class="vidro vidro--tinta" onClick=${aoReligar}>Ligar a pasta</button>
              <//></div>`
            : fase === 'erro'
              ? html`<div class="palco-vazio" role="alert"><${Vazio} icone="aviso" titulo=${['Não deu', 'para abrir.']} apoio=${erro?.mensagem}>
                  ${erro?.oQueFazer ? html`<span class="apoio palco-dica">${erro.oQueFazer}</span>` : null}
                <//></div>`
              : null
      }
      ${modo === 'gota' && !vazio ? html`<div class="palco-dica-modo" role="status"><${Icone} nome="gota" />Toque num ponto que deveria ser cinza.</div>` : null}
      ${modo === 'regua' && !vazio ? html`<div class="palco-dica-modo" role="status"><${Icone} nome="regua" />Trace uma linha que deveria ser reta.</div>` : null}
    </div>
    ${children}
  </div>`
}
