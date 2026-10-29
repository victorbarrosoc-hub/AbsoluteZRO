// Barra lateral translúcida: marca, navegação (com contador ao vivo), a família Absolute ZRO (uma linha que abre um
// balão), a pílula de versão nova, medidores ↓/↑ e a conta. Tudo cabe numa janela de 576 px de altura (1280×720 no
// Windows com 125%), sem rolagem dentro da barra.
import { html, useMemo, useRef, useState } from '/vendor/preact-htm.js'
import { useStore, activeCount, setActiveAccount } from '../lib/store.js'
import { navigate } from '../lib/router.js'
import { bytes, count } from '../lib/format.js'
import { cx, useDismiss } from '../lib/ui.js'
import { Icon, Wordmark } from './icons.js'
import { Avatar } from './common.js'
import { LevelMeter } from './meter.js'
import { useAbout } from './drive-data.js'
import { UpdatePill } from './versao.js'
import { balaoAoLado } from './balao.js'
import { openExternal } from '../lib/desktop.js'

// O que se usa todo dia em cima; Dispositivos e Ajustes embaixo. Frames e Cartões com item próprio (não ficam escondidos).
const NAV = [
  // a Z, a IA da Absolute ZRO: o primeiro item e a tela de entrada (pedido do titular, 27/10/2026)
  { id: 'z', label: 'Z', icon: 'z', title: 'A Z, a IA da Absolute ZRO' },
  { id: 'painel', label: 'Início', icon: 'home' },
  { id: 'transferencias', label: 'Transferências', icon: 'transfers' },
  { id: 'drive', label: 'Drive', icon: 'cloud' },
  { id: 'referencias', label: 'Referências', icon: 'bookmark' },
  { id: 'frames', label: 'Frames', icon: 'frames' },
  { id: 'cartoes', label: 'Cartões', icon: 'sdcard' },
  { id: 'comparar', label: 'Comparar', icon: 'compare' },
]
const NAV_BAIXO = [
  { id: 'computadores', label: 'Dispositivos', icon: 'laptop' },
  { id: 'ajustes', label: 'Ajustes', icon: 'sliders' },
]

// Os outros apps da Absolute ZRO, cada um com o próprio ícone (cópias em public/familia/). Abrem no navegador do
// sistema: no Electron pela ponte, no navegador numa aba nova; a janela do app nunca sai do SOBEDESCE.
const FAMILIA = [
  { href: 'https://absolutezro.com', nome: 'Absolute ZRO', img: '/familia/absolute-zro.png' },
  { href: 'https://synquei.absolutezro.com', nome: 'Synquei', img: '/familia/synquei.svg' },
  { href: 'https://tpeasy.vercel.app', nome: 'TPEasy', img: '/familia/tpeasy.svg' },
]

/**
 * Os apps da família numa linha só ("Absolute ZRO", ícone de grade); o clique abre a lista num
 * balão ao lado da barra. Antes era uma lista própria que, em janela baixa (Windows com 125%), virava uma faixa
 * minúscula com rolagem.
 */
function Familia() {
  const [pos, setPos] = useState(null)
  const caixa = useRef(null)
  useDismiss(caixa, () => setPos(null), !!pos)
  return html`<div class="nav nav-familia" ref=${caixa}>
    <button
      type="button"
      class=${cx('nav-item nav-familia-botao', pos && 'is-open')}
      aria-haspopup="menu"
      aria-expanded=${pos ? 'true' : 'false'}
      aria-label="Apps da Absolute ZRO"
      title="Apps da Absolute ZRO"
      onClick=${(e) => setPos(pos ? null : balaoAoLado(e.currentTarget))}
    >
      <${Icon} name="grid" size=${17} />
      <span class="nav-familia-txt">Absolute ZRO</span>
      <${Icon} name="chevron-right" size=${14} class="nav-familia-seta" />
    </button>
    ${pos
      ? html`<div class="menu balao familia-balao" role="menu" aria-label="Apps da Absolute ZRO" style=${pos}>
          ${FAMILIA.map(
            (f) => html`<a
              href=${f.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              class="menu-item"
              onClick=${(e) => {
                e.preventDefault()
                setPos(null)
                openExternal(f.href)
              }}
            >
              <img class="nav-app" src=${f.img} alt="" width="20" height="20" draggable="false" />
              <span class="menu-item-text">${f.nome}</span>
              <${Icon} name="external" size=${13} />
            </a>`,
          )}
        </div>`
      : null}
  </div>`
}

function NavBadge() {
  const transfers = useStore((s) => s.transfers)
  const n = useMemo(() => activeCount(transfers), [transfers])
  if (!n) return null
  return html`<span class="nav-badge" aria-label=${`${n} em andamento`}>${n > 999 ? '999+' : count(n)}</span>`
}

/** Referências sendo salvas agora (downloads do yt-dlp e envios). */
function RefBadge() {
  const ref = useStore((s) => s.referencias)
  const n = useMemo(() => (ref?.trabalhos || []).filter((t) => ['na_fila', 'baixando', 'enviando', 'concluindo'].includes(t.fase)).length, [ref])
  if (!n) return null
  return html`<span class="nav-badge" aria-label=${`${n} salvando`}>${count(n)}</span>`
}

function Meters() {
  const stats = useStore((s) => s.stats)
  const conn = useStore((s) => s.conn)
  const max = useMemo(() => {
    let m = 0
    for (const p of stats.history || []) m = Math.max(m, p.down || 0, p.up || 0)
    return Math.max(m, stats.down?.speed || 0, stats.up?.speed || 0, 5e6)
  }, [stats])
  return html`<div class="meters" aria-label="Velocidade agora">
    ${conn === 'lost' ? html`<div class="conn-lost" role="status"><span class="pulse"></span>Reconectando ao motor…</div>` : null}
    <${LevelMeter} dir="down" speed=${stats.down?.speed || 0} max=${max} />
    <${LevelMeter} dir="up" speed=${stats.up?.speed || 0} max=${max} />
  </div>`
}

function AccountMenu({ accounts, active, onClose }) {
  const ref = useRef(null)
  useDismiss(ref, onClose)
  const about = useAbout(active?.id)
  const q = about?.quota
  const frac = q?.limit ? Math.min(1, (q.usage || 0) / q.limit) : null
  return html`<div class="menu account-menu" role="menu" ref=${ref}>
    ${active
      ? html`<div class="menu-head">
          <${Avatar} name=${active.name} email=${active.email} photoUrl=${active.photoUrl} size=${36} />
          <div class="menu-head-text">
            <b>${active.name || active.email}</b>
            <span>${active.email}</span>
          </div>
        </div>
        ${frac != null
          ? html`<div class="menu-quota">
              <span class="quota-bar"><i style=${`width:${(frac * 100).toFixed(1)}%`}></i></span>
              <span class="sub">${bytes(q.usage)} de ${bytes(q.limit)} no Drive</span>
            </div>`
          : null}`
      : null}
    ${accounts.length > 1
      ? html`<div class="menu-sep"></div>
          <div class="menu-label">Trocar de conta</div>
          ${accounts.map(
            (a) => html`<button
              type="button"
              role="menuitemradio"
              aria-checked=${a.id === active?.id ? 'true' : 'false'}
              class="menu-item"
              onClick=${() => {
                setActiveAccount(a.id)
                // cada conta tem seu próprio Drive: volta para a raiz
                if (location.hash.startsWith('#/drive/')) navigate('drive')
                onClose()
              }}
            >
              <${Avatar} name=${a.name} email=${a.email} photoUrl=${a.photoUrl} size=${22} />
              <span class="menu-item-text">${a.email}</span>
              ${a.source === 'nuvem' ? html`<span class="menu-item-tag" title="Da conta SOBEDESCE"><${Icon} name="cloud" size=${13} /></span>` : null}
              ${a.id === active?.id ? html`<${Icon} name="check" size=${14} />` : null}
              ${a.status === 'reauth' ? html`<${Icon} name="warning" size=${14} class="tone-warning" />` : null}
            </button>`,
          )}`
      : null}
    <div class="menu-sep"></div>
    <button type="button" class="menu-item" role="menuitem" onClick=${() => { navigate('ajustes/contas'); onClose() }}><${Icon} name="cloud" size=${15} /><span class="menu-item-text">Conta e Drives</span></button>
    <button type="button" class="menu-item" role="menuitem" onClick=${() => { navigate('ajustes'); onClose() }}><${Icon} name="sliders" size=${15} /><span class="menu-item-text">Ajustes</span></button>
  </div>`
}

function AccountChip() {
  const accounts = useStore((s) => s.accounts)
  const activeId = useStore((s) => s.activeAccountId)
  const [open, setOpen] = useState(false)
  const active = accounts.find((a) => a.id === activeId) || accounts[0]
  if (!active) return null
  return html`<div class="account">
    ${open ? html`<${AccountMenu} accounts=${accounts} active=${active} onClose=${() => setOpen(false)} />` : null}
    <button type="button" class=${cx('account-chip', open && 'is-open')} aria-haspopup="menu" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      <${Avatar} name=${active.name} email=${active.email} photoUrl=${active.photoUrl} size=${28} />
      <span class="account-text">
        <b>${active.name || (active.email || '').split('@')[0]}</b>
        <span>${active.email}</span>
      </span>
      ${active.status === 'reauth' ? html`<${Icon} name="warning" size=${14} class="tone-warning" />` : html`<${Icon} name="chevron-updown" size=${14} />`}
    </button>
  </div>`
}

function NavItem({ n, current }) {
  const on = current === n.id || n.tambem?.includes(current)
  return html`<a href=${`#/${n.id}`} class=${cx('nav-item', on && 'is-on')} aria-current=${on ? 'page' : undefined} title=${n.title}>
    <${Icon} name=${n.icon} size=${17} />
    <span>${n.label}</span>
    ${n.id === 'transferencias' ? html`<${NavBadge} />` : null}
    ${n.id === 'referencias' ? html`<${RefBadge} />` : null}
  </a>`
}

export function Sidebar({ current }) {
  return html`<aside class="sidebar">
    <div class="sidebar-brand"><a href="#/z" aria-label="SOBEDESCE — início"><${Wordmark} size=${22} /></a></div>
    <nav class="nav" aria-label="Principal">
      ${NAV.map((n) => html`<${NavItem} n=${n} current=${current} />`)}
    </nav>
    <${Familia} />
    <nav class="nav nav-baixo" aria-label="Dispositivos e ajustes">
      ${NAV_BAIXO.map((n) => html`<${NavItem} n=${n} current=${current} />`)}
    </nav>
    <div class="sidebar-foot">
      <${UpdatePill} />
      <${Meters} />
      <${AccountChip} />
    </div>
  </aside>`
}
