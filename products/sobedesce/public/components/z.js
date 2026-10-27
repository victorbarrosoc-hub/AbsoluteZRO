// A Z, a IA da Absolute ZRO, no Início do app de computador (27/10/2026). O painel <zro-ia> (servido pela Absolute
// ZRO) fala com /api/ia/* deste motor, que repassa ao site com o Bearer deste computador (CloudAuth.ia); o site
// acrescenta o token da Absolute ZRO da conta. Nenhum token chega à interface.
// Sem conta neste computador: "Entrar na conta SOBEDESCE" (o fluxo de código de sempre). Conta sem o token da Z:
// "Reconectar com Absolute ZRO", no navegador. Ao voltar para a janela, o painel tenta de novo.
import { html, useEffect, useRef, useState } from '/vendor/preact-htm.js'
import { useStore } from '../lib/store.js'
import { cloudLogin, siteUrl } from '../lib/cloud.js'
import { openExternal } from '../lib/desktop.js'

export const SCRIPT_ZRO_IA = 'https://absolutezro.com/ia/v1/zro-ia.js'
// Só o que a Z consegue: conversar e ler o retrato da conta (projetos, pendências, entregas, consumo do mês).
const SUGESTOES = ['Entregas pendentes', 'Resumo dos meus projetos', 'Como conferir uma descarga', 'Quanto usei este mês']
const APOIO = 'Pergunte sobre seus projetos, entregas e descargas.'

function carregarScript() {
  if (document.querySelector(`script[src="${SCRIPT_ZRO_IA}"]`)) return
  const s = document.createElement('script')
  s.type = 'module'
  s.src = SCRIPT_ZRO_IA
  document.head.appendChild(s)
}

function temaDoApp() {
  const t = document.documentElement.dataset.theme
  return t === 'dark' ? 'escuro' : t === 'light' ? 'claro' : 'auto'
}

// O elemento nasce por DOM: `api`, `sugestoes` e `tema` são getters/métodos dele, e o Preact tentaria atribuir por cima.
export function PainelZ({ nome }) {
  const conectado = useStore((s) => Boolean(s.cloud?.conectado))
  const caixa = useRef(null)
  const [semLogin, setSemLogin] = useState(false)
  const [volta, setVolta] = useState(0)

  useEffect(() => {
    const lugar = caixa.current
    if (!lugar) return
    setSemLogin(false)
    const el = document.createElement('zro-ia')
    el.setAttribute('api', '/api/ia')
    el.setAttribute('apoio', APOIO)
    el.setAttribute('sugestoes', JSON.stringify(SUGESTOES))
    el.setAttribute('tema', temaDoApp())
    if (nome) el.setAttribute('nome', nome)
    const avisar = () => setSemLogin(true)
    el.addEventListener('zro-ia:sem-login', avisar)
    const tema = new MutationObserver(() => el.setAttribute('tema', temaDoApp()))
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    lugar.replaceChildren(el)
    carregarScript()
    return () => {
      tema.disconnect()
      el.removeEventListener('zro-ia:sem-login', avisar)
      el.remove()
    }
  }, [nome, conectado, volta])

  // Voltou do navegador (reconectou): o painel recomeça.
  useEffect(() => {
    if (!semLogin) return undefined
    const tentar = () => setVolta((v) => v + 1)
    window.addEventListener('focus', tentar)
    return () => window.removeEventListener('focus', tentar)
  }, [semLogin])

  const reconectar = () => openExternal(`${siteUrl()}/api/zro/entrar?modo=vincular&volta=%2Fconta`)
  return html`<section class="pn-z" aria-label="Z, a IA da Absolute ZRO">
    <div class="pn-z-painel" ref=${caixa}></div>
    ${semLogin
      ? html`<div class="pn-z-acao">
          ${conectado
            ? html`<button type="button" class="btn btn-secondary" onClick=${reconectar}>Reconectar com Absolute ZRO</button>`
            : html`<button type="button" class="btn btn-secondary" onClick=${() => cloudLogin()}>Entrar na conta SOBEDESCE</button>`}
        </div>`
      : null}
  </section>`
}
