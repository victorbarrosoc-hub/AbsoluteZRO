// Aviso "Atualização disponível" na barra lateral, acima dos medidores. Não bloqueia nada: as transferências seguem.
// Na barra fica só uma pílula discreta; o cartão abre ao lado, num balão. Desde 01/11/2026 quem atualiza é a central
// Absolute ZRO: o cartão tem "Atualizar na Absolute ZRO" (abre a central; sem ela, a página de baixar) e "Depois"
// (esconde este build; Ajustes continua mostrando).
import { html, useRef, useState } from '/vendor/preact-htm.js'
import { cx, useDismiss } from '../lib/ui.js'
import { balaoAoLado } from './balao.js'
import { useStore } from '../lib/store.js'
import { atualizarNaCentral, dismissUpdate } from '../lib/versao.js'
import { Icon } from './icons.js'
import { Button } from './common.js'

export function UpdateCard({ onDepois, onAbrir } = {}) {
  const v = useStore((s) => s.versao)
  if (!v?.nova) return null
  const depois = () => {
    onDepois?.()
    dismissUpdate()
  }
  const abrir = () => {
    onAbrir?.()
    atualizarNaCentral()
  }
  return html`<section class="update-card" aria-labelledby="update-title">
    <div class="update-head">
      <span class="update-mark" aria-hidden="true"><${Icon} name="arrow-down" size=${12} strokeWidth=${2.2} /></span>
      <b id="update-title">Atualização disponível</b>
    </div>
    <div class="update-actions">
      <${Button} size="sm" variant="primary" onClick=${abrir}>Atualizar na Absolute ZRO</${Button}>
      <${Button} size="sm" variant="ghost" onClick=${depois}>Depois</${Button}>
    </div>
  </section>`
}

/** A pílula da barra lateral; o clique abre o cartão num balão ao lado da barra. */
export function UpdatePill() {
  const v = useStore((s) => s.versao)
  const [pos, setPos] = useState(null)
  const caixa = useRef(null)
  useDismiss(caixa, () => setPos(null), !!pos)
  if (!v?.nova) return null
  const abrir = (e) => setPos(pos ? null : balaoAoLado(e.currentTarget))
  return html`<div class="update-pilula-caixa" ref=${caixa}>
    <button
      type="button"
      class=${cx('update-pilula', pos && 'is-open')}
      aria-haspopup="dialog"
      aria-expanded=${pos ? 'true' : 'false'}
      title=${`Build ${v.ultima?.build ?? ''}`.trim()}
      onClick=${abrir}
    >
      <span class="update-ponto" aria-hidden="true"></span>
      <span class="update-pilula-txt">Atualização disponível</span>
      <${Icon} name="chevron-right" size=${13} />
    </button>
    ${pos
      ? html`<div class="balao update-balao" role="dialog" aria-label="Atualização disponível" style=${pos}>
          <${UpdateCard} onDepois=${() => setPos(null)} onAbrir=${() => setPos(null)} />
        </div>`
      : null}
  </div>`
}
