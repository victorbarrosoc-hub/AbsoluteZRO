// A Z, a IA da Absolute ZRO, no Início do app do celular (27/10/2026): o painel <zro-ia> (servido pela Absolute ZRO)
// fala com /api/zro/ia, no próprio site, que acrescenta o token da conta no servidor (web/src/lib/zro/ia.ts). O
// celular nunca vê token. Sem token ou sem o escopo da Z, o painel avisa (zro-ia:sem-login) e aparece "Reconectar com
// Absolute ZRO", que volta para cá. O tema acompanha o do app (data-theme; sem escolha, o do aparelho).
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js'

export const SCRIPT_ZRO_IA = 'https://absolutezro.com/ia/v1/zro-ia.js'
// Só o que a Z consegue: conversar e ler o retrato da conta (projetos, pendências, entregas, consumo do mês).
const SUGESTOES = ['Entregas pendentes', 'Resumo dos meus projetos', 'Como conferir uma descarga', 'Quanto usei este mês']
const APOIO = 'Pergunte sobre seus projetos, entregas e descargas.'
const RECONECTAR = '/api/zro/entrar?modo=vincular&volta=%2Fapp%2F'

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
  const caixa = useRef(null)
  const [semLogin, setSemLogin] = useState(false)
  useEffect(() => {
    const lugar = caixa.current
    if (!lugar) return
    const el = document.createElement('zro-ia')
    el.setAttribute('api', '/api/zro/ia')
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
  }, [nome])
  return html`<section class="ini-z" aria-label="Z, a IA da Absolute ZRO">
    <div class="ini-z-painel" ref=${caixa}></div>
    ${semLogin ? html`<a class="btn btn-secondary btn-sm ini-z-entrar" href=${RECONECTAR}><span>Reconectar com Absolute ZRO</span></a>` : null}
  </section>`
}
