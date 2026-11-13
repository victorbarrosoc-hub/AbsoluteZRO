// Tonalização: uma roda por vez (sombras, meios, altas, global), com a bolinha que se arrasta (ângulo = matiz, distância
// do centro = saturação), a luz da zona embaixo e, para todas, mistura e equilíbrio. As três pastilhas mostram a cor
// de cada zona sem precisar trocar. Setas: ← → giram o matiz, ↑ ↓ mudam a saturação (Shift: dez vezes); duplo clique zera.

import { cx, html, useRef, useState } from '../../preact.js'
import { Segmentado } from '../../componentes/base.js'
import { CONTROLES, ZONAS, normalizar } from '../../../src/motor/ajustes.js'
import { Ajuste } from './controle.js'

const NOMES = { sombras: 'Sombras', meios: 'Meios', altas: 'Altas', global: 'Global' }
const R = 92
const corDa = (z) => (z.saturacao ? `hsl(${Math.round(z.matiz)} ${Math.round(30 + z.saturacao * 0.5)}% 55%)` : 'transparent')

export function Rodas({ ajustes, aoMudar }) {
  const [zona, definirZona] = useState('meios')
  const roda = useRef(null)
  const arrasto = useRef(null)
  const a = normalizar(ajustes)
  const z = a.tonalizacao[zona]

  const gravar = (mudanca, opcoes) => {
    const b = normalizar(a)
    b.tonalizacao[zona] = { ...b.tonalizacao[zona], ...mudanca }
    aoMudar(b, { rotulo: `Tonalização · ${NOMES[zona].toLowerCase()}`, ...opcoes })
  }
  const doPonto = (e) => {
    const r = roda.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const raio = r.width / 2
    const matiz = (((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360).toFixed(0)
    const saturacao = Math.min(100, (Math.hypot(dx, dy) / raio) * 100)
    return { matiz: Number(matiz), saturacao: Math.round(saturacao) }
  }
  const descer = (e) => {
    if (e.button) return
    e.preventDefault()
    arrasto.current = e.pointerId
    roda.current.setPointerCapture?.(e.pointerId)
    gravar(doPonto(e), { final: false })
  }
  const andar = (e) => arrasto.current === e.pointerId && gravar(doPonto(e), { final: false })
  const subir = (e) => {
    if (arrasto.current !== e.pointerId) return
    arrasto.current = null
    gravar(doPonto(e), { final: true })
  }
  const tecla = (e) => {
    const k = e.shiftKey ? 10 : 1
    const m = { ArrowLeft: [k, 0], ArrowRight: [-k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key]
    if (!m) return
    e.preventDefault()
    e.stopPropagation()
    gravar({ matiz: (z.matiz + m[0] + 360) % 360, saturacao: Math.max(0, Math.min(100, z.saturacao + m[1])) }, { final: true })
  }

  const t = (z.matiz * Math.PI) / 180
  const px = Math.cos(t) * (z.saturacao / 100) * R
  const py = -Math.sin(t) * (z.saturacao / 100) * R
  const lu = CONTROLES['tonalizacao.mistura']
  const eq = CONTROLES['tonalizacao.equilibrio']
  return html`<div class="rodas">
    <${Segmentado}
      rotulo="Zona"
      valor=${zona}
      aoMudar=${definirZona}
      opcoes=${ZONAS.map((nome) => ({ valor: nome, rotulo: NOMES[nome] }))}
      classe="rodas-zonas"
    />
    <div class="rodas-pastilhas" aria-hidden="true">
      ${ZONAS.map((nome) => html`<span class=${cx(nome === zona && 'ativa')} style=${`--c:${corDa(a.tonalizacao[nome])}`}></span>`)}
    </div>
    <div
      ref=${roda}
      class="roda"
      role="slider"
      tabindex="0"
      aria-label=${`Cor das ${NOMES[zona].toLowerCase()}`}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${z.saturacao}
      aria-valuetext=${z.saturacao ? `matiz ${Math.round(z.matiz)}°, saturação ${Math.round(z.saturacao)}` : 'sem cor'}
      onPointerDown=${descer}
      onPointerMove=${andar}
      onPointerUp=${subir}
      onPointerCancel=${subir}
      onKeyDown=${tecla}
      onDblClick=${() => gravar({ matiz: 0, saturacao: 0 }, { final: true })}
    >
      <span class="roda-bolinha" style=${`transform:translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`}></span>
    </div>
    <div class="controles">
      <${Ajuste}
        caminho=${`tonalizacao.${zona}.luz`}
        rotulo="Luz"
        valor=${z.luz}
        min=${-100}
        max=${100}
        aoMudar=${(v, o) => gravar({ luz: v }, o)}
      />
      ${[
        ['tonalizacao.mistura', lu],
        ['tonalizacao.equilibrio', eq],
      ].map(
        ([caminho, c]) => html`<${Ajuste}
          key=${caminho}
          caminho=${caminho}
          rotulo=${c.rotulo}
          valor=${a.tonalizacao[caminho.split('.')[1]]}
          min=${c.min}
          max=${c.max}
          passo=${c.passo}
          neutro=${c.neutro}
          aoMudar=${(v, o) => {
            const b = normalizar(a)
            b.tonalizacao[caminho.split('.')[1]] = v
            aoMudar(b, { ...o, rotulo: c.rotulo })
          }}
        />`,
      )}
    </div>
  </div>`
}
