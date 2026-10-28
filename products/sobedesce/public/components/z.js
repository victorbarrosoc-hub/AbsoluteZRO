// A Z, a IA da Absolute ZRO, na aba própria do app de computador (pedido do titular, 27/10/2026: "uma aba só pra Z em
// todas as plataformas"). É o primeiro item do menu e a tela de entrada (lib/router.js, rota padrão "z"). O painel <zro-ia> (servido pela Absolute
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

  const reconectar = () => openExternal(`${siteUrl()}/api/zro/entrar?modo=vincular&volta=%2Fz`)
  return html`<section class="pn-z" aria-label="Z, a IA da Absolute ZRO">
    <h1 class="pn-z-oculto">Z</h1>
    <div class="pn-z-painel" ref=${caixa}></div>
    ${semLogin
      ? html`<div class="pn-z-acao">
          ${conectado
            ? html`<button type="button" class="btn btn-secondary" onClick=${reconectar}>Reconectar com Absolute ZRO</button>`
            : html`<button type="button" class="btn btn-secondary" onClick=${() => cloudLogin()}>Entrar com Absolute ZRO</button>`}
        </div>`
      : null}
  </section>`
}

/** A tela da aba Z: a Z ocupa a janela. Sem animação de entrada com transform (prenderia a gaveta de Conversas). */
export function ZScreen() {
  const nome = useStore((s) => (s.cloud?.usuario?.nome || '').trim().split(/\s+/)[0])
  return html`<div class="page page-z"><${PainelZ} nome=${nome} /></div>`
}
