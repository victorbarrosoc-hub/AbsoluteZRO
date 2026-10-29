// A Z, a IA da Absolute ZRO, na aba própria do app do celular (pedido do titular, 27/10/2026: "uma aba só pra Z em
// todas as plataformas"). É a primeira aba e a tela de entrada, e aparece sempre, com ou sem Drive escolhido.
// O painel <zro-ia> (servido pela Absolute ZRO) fala com /api/zro/ia, no próprio site, que acrescenta o token da conta
// no servidor (web/src/lib/zro/ia.ts). O celular nunca vê token. Sem conta SOBEDESCE neste aparelho: "Entrar", aqui
// mesmo. Sem token ou sem o escopo da Z, o painel avisa (zro-ia:sem-login) e aparece "Reconectar com Absolute ZRO",
// que volta para cá. O tema acompanha o do app (data-theme; sem escolha, o do aparelho).
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js'
import { ACCOUNT } from '../lib/config.js'
import { useApp } from '../lib/state.js'
import { Icon } from './icons.js'

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
function Painel({ nome }) {
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
  return html`<div class="ini-z-painel" ref=${caixa}></div>
    ${semLogin ? html`<a class="btn btn-secondary btn-sm ini-z-entrar" href=${RECONECTAR}><span>Reconectar com Absolute ZRO</span></a>` : null}`
}

/** A tela da aba Z: a Z inteira; sem conta neste aparelho, o "Entrar" no lugar dela. */
export function ZScreen() {
  const { status, nome } = useApp((s) => ({ status: s.auth.status, nome: (s.account?.nome || '').trim().split(/\s+/)[0] }))
  const semConta = status === 'signedOut'
  return html`<div class="screen z-tela">
    <section class="ini-z" aria-label="Z, a IA da Absolute ZRO">
      <h1 class="z-oculto">Z</h1>
      ${semConta
        ? html`<div class="z-entrar">
            <span class="z-entrar-anel" aria-hidden="true"><${Icon} name="z" size=${34} strokeWidth=${1.4} /></span>
            <p class="z-entrar-t">Entre para conversar com a Z.</p>
            <a class="btn btn-primary btn-lg" href=${ACCOUNT.signIn}><span>Entrar</span></a>
          </div>`
        : html`<${Painel} nome=${nome} />`}
    </section>
  </div>`
}
