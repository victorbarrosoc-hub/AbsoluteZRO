// Revela · o Set da Absolute ZRO (ADR 0032 de lá): quem da equipe e dos contatos está online, em qual app, e as
// conversas (diretas e do projeto). É a entrada em comum de todas as plataformas: aqui, um ícone no topo, ao lado do anel
// da Z (o dock fica com as cinco ferramentas, o máximo que cabe no iPhone). A folha é o <zro-set modo="folha"> publicado pela Absolute ZRO (lateral no computador, tela cheia no
// iPhone), vestida com a identidade da Revela (revela.css, --zro-set-*), no tema que a pessoa escolheu (data-tema).
// Ele fala com /api/zro/set, o repasse da própria Revela (api/_set.js), que acrescenta o token da conta no servidor.
// O token nunca chega a esta página. A entrada só aparece quando o Set responde (conta liberada, com zro.set).

import { ICONES, svg } from './visual.js'

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'

/**
 * Liga as entradas (botões com data-set) ao widget: aparecem com o primeiro estado, somem sem login, levam o balão das
 * não lidas e dos pedidos e abrem ou fecham a folha. Sem DOM de verdade (o teste usa objetos simples).
 */
export function ligarSet(el, entradas) {
  const cada = (f) => {
    for (const e of entradas) f(e)
  }
  cada((e) => {
    e.hidden = true
    e.setAttribute('aria-haspopup', 'dialog')
    e.setAttribute('aria-expanded', 'false')
    e.addEventListener('click', (ev) => {
      ev.preventDefault?.()
      if (el.aberto) el.fecharSet?.()
      else el.abrirSet?.()
    })
  })
  const balao = (n, rotulo) =>
    cada((e) => {
      const b = e.querySelector?.('[data-set-balao]')
      if (b) {
        b.hidden = !n
        b.textContent = n ? (n > 99 ? '99+' : String(n)) : ''
      }
      e.setAttribute('aria-label', rotulo)
    })
  el.addEventListener('zro-set:estado', (ev) => {
    const d = ev.detail || {}
    const n = (d.naoLidas || 0) + (d.pedidos || 0)
    cada((e) => (e.hidden = false))
    balao(n, `Set${d.online ? `, ${d.online} online` : ''}${n ? `, ${n} ${n === 1 ? 'novidade' : 'novidades'}` : ''}`)
  })
  el.addEventListener('zro-set:sem-login', () => {
    cada((e) => (e.hidden = true))
    balao(0, 'Set')
  })
  el.addEventListener('zro-set:aberto', () => cada((e) => e.setAttribute('aria-expanded', 'true')))
  el.addEventListener('zro-set:fechado', () => cada((e) => e.setAttribute('aria-expanded', 'false')))
}

/** O botão "Set" no topo, logo antes do anel da Z (o topo fica parado na troca de ferramenta, como o dock). */
function entradaNoTopo() {
  const topo = document.querySelector('.topo')
  if (!topo) return null
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'topo-set'
  b.dataset.set = ''
  b.title = 'Set: quem está online e as conversas'
  const i = document.createElement('span')
  i.className = 'aba-icone'
  i.ariaHidden = 'true'
  i.append(svg(ICONES.set))
  const balao = Object.assign(document.createElement('span'), { className: 'balao', hidden: true })
  balao.dataset.setBalao = ''
  b.append(i, balao)
  b.hidden = true
  topo.insertBefore(b, topo.querySelector('.topo-z') ?? topo.querySelector('.conta'))
  return b
}

const temaDe = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')

/** Monta o Set uma vez por página (o topo fica parado na troca de ferramenta, app/navegar.js). */
export async function montarSet() {
  if (document.querySelector('zro-set')) return null
  const entrada = entradaNoTopo()
  if (!entrada) return null
  try {
    await import(SCRIPT_SET)
    await customElements.whenDefined('zro-set')
  } catch {
    return null
  }
  const el = document.createElement('zro-set')
  el.setAttribute('modo', 'folha')
  el.setAttribute('api', '/api/zro/set')
  el.setAttribute('tema', temaDe())
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a entrada fica escondida
  el.style.display = 'none'
  document.addEventListener('revela:tema', () => el.setAttribute('tema', temaDe()))
  ligarSet(el, [entrada])
  document.body.append(el)
  return el
}
