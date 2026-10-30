// O Set da Absolute ZRO (ADR 0032 de lá, 30/10/2026) no app do celular: quem da equipe e dos contatos está online, em
// qual app, e as conversas (diretas e do projeto). É a entrada em comum de todas as plataformas: aqui, um botão ao lado
// da Z no topo (SetBotao, main.js), porque a barra de baixo fica só com a tarefa (no máximo cinco abas no iPhone). Não
// troca de tela: abre a folha do <zro-set modo="folha"> publicado pela Absolute ZRO (tela cheia no iPhone),
// vestida com as cores do app (app.css, --zro-set-*) e no tema dele (data-theme; sem escolha, o do aparelho). Ele fala
// com /api/zro/set, no próprio site, que acrescenta o token da conta no servidor (web/src/lib/zro/set.ts); o celular
// nunca vê token. O botão só aparece depois que o Set respondeu (conta ligada à Absolute ZRO com o escopo zro.set).
// No modo Wi-Fi não há abas nem Set (lá o celular não tem conta).
import { html, useEffect, useState } from '../vendor/preact-htm.js'
import { LAN } from '../lib/config.js'
import { useApp } from '../lib/state.js'
import { cx } from './ui.js'

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'
// Com conta SOBEDESCE neste aparelho (com ou sem Drive pronto); sem conta, o Set nem pergunta.
const COM_CONTA = new Set(['noDrive', 'choose', 'reconnect', 'signedIn'])

// Um <zro-set> só para o app inteiro (a barra redesenha à vontade), e quem quer saber dele.
let el = null
let estado = { visivel: false, novidades: 0, online: 0, aberto: false }
const ouvintes = new Set()
const mudar = (m) => {
  estado = { ...estado, ...m }
  for (const f of ouvintes) f(estado)
}

function temaDoApp() {
  const t = document.documentElement.dataset.theme
  return t === 'dark' ? 'escuro' : t === 'light' ? 'claro' : 'auto'
}

function montar() {
  if (el || LAN) return
  if (!customElements.get('zro-set') && !document.querySelector(`script[src="${SCRIPT_SET}"]`)) {
    const s = document.createElement('script')
    s.type = 'module'
    s.src = SCRIPT_SET
    document.head.appendChild(s)
  }
  el = document.createElement('zro-set')
  el.setAttribute('modo', 'folha')
  el.setAttribute('api', '/api/zro/set')
  el.setAttribute('tema', temaDoApp())
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a aba fica escondida
  el.style.display = 'none'
  new MutationObserver(() => el?.setAttribute('tema', temaDoApp())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  el.addEventListener('zro-set:estado', (ev) => {
    const d = ev.detail || {}
    mudar({ visivel: true, online: d.online || 0, novidades: (d.naoLidas || 0) + (d.pedidos || 0) })
  })
  el.addEventListener('zro-set:sem-login', () => mudar({ visivel: false, novidades: 0 }))
  el.addEventListener('zro-set:aberto', () => mudar({ aberto: true }))
  el.addEventListener('zro-set:fechado', () => mudar({ aberto: false }))
  document.body.appendChild(el)
}

function desmontar() {
  el?.remove()
  el = null
  mudar({ visivel: false, novidades: 0, online: 0, aberto: false })
}

/** Monta (ou desmonta) o <zro-set> do app com a conta deste aparelho: chamado uma vez pelas abas (tabs.js). */
export function useSet() {
  const comConta = useApp((s) => COM_CONTA.has(s.auth.status))
  useEffect(() => {
    if (comConta) montar()
    else desmontar()
  }, [comConta])
}

/** O botão "Set" do topo, ao lado da Z: aparece quando o Set responde e abre (ou fecha) a folha. */
export function SetBotao() {
  const [s, setS] = useState(estado)
  useEffect(() => {
    ouvintes.add(setS)
    return () => ouvintes.delete(setS)
  }, [])
  if (!s.visivel) return null
  const rotulo = `Set${s.online ? `, ${s.online} online` : ''}${s.novidades ? `, ${s.novidades} ${s.novidades === 1 ? 'novidade' : 'novidades'}` : ''}`
  return html`<button
    type="button"
    class=${cx('icon-btn', 'set-botao', s.aberto && 'is-on')}
    data-set=""
    aria-haspopup="dialog"
    aria-expanded=${s.aberto ? 'true' : 'false'}
    aria-label=${rotulo}
    title="Set: quem está online e as conversas"
    onClick=${() => (el?.aberto ? el.fecharSet?.() : el?.abrirSet?.())}
  >
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${s.aberto ? 1.9 : 1.7} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4" />
    </svg>
    ${s.novidades ? html`<span class="tab-balao" aria-hidden="true">${s.novidades > 99 ? '99+' : s.novidades}</span>` : null}
  </button>`
}
