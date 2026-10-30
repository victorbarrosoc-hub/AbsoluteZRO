// O Set da Absolute ZRO no Synquei (ADR 0032 da Absolute ZRO): quem da equipe e dos contatos está online, em qual app,
// e as conversas (diretas e do projeto). É a entrada em comum de todas as plataformas: aqui, "Set" no menu lateral (logo
// abaixo do Início) e, no celular, no canto do Início ao lado do anel da Z (views/inicio.js): a barra de abas de baixo
// fica só com as cinco da tarefa. A folha é o <zro-set modo="folha"> publicado pela Absolute ZRO
// (lateral no computador, tela cheia no iPhone), vestida com as cores do Synquei (app.css, --zro-set-*). Ele fala com
// /api/zro/set, o repasse do próprio Synquei (api/zro/set.js no site, desktop/conta.cjs no app), que acrescenta o
// token da conta no servidor. O token nunca chega a esta página.
// A entrada só aparece depois que o Set respondeu (conta com o escopo zro.set); sem login, login antigo ou sem rede,
// ela não existe, e o resto do app segue igual.

import { C } from './conta.js'

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'

/**
 * Liga as entradas do app (botões com data-set) ao widget: aparecem com o primeiro estado, somem sem login, levam o
 * balão das não lidas e dos pedidos e abrem ou fecham a folha. `entradas` é a lista ou uma função que devolve as de
 * agora: a do canto do Início nasce de novo a cada desenho da tela, e a função devolvida (pintar) liga a nova com o
 * estado do momento. Sem DOM de verdade (o teste usa objetos simples).
 */
export function ligarSet(el, entradas) {
  const agora = typeof entradas === 'function' ? entradas : () => entradas
  const ligadas = new WeakSet()
  let st = { visivel: false, n: 0, rotulo: 'Set', aberto: false }
  const pintar = () => {
    for (const e of agora()) {
      if (!ligadas.has(e)) {
        ligadas.add(e)
        e.setAttribute('aria-haspopup', 'dialog')
        e.addEventListener('click', (ev) => {
          ev.preventDefault?.()
          if (el.aberto) el.fecharSet?.()
          else el.abrirSet?.()
        })
      }
      e.hidden = !st.visivel
      e.setAttribute('aria-label', st.rotulo)
      e.setAttribute('aria-expanded', st.aberto ? 'true' : 'false')
      const b = e.querySelector?.('[data-set-balao]')
      if (b) {
        b.hidden = !st.n
        b.textContent = st.n ? (st.n > 99 ? '99+' : String(st.n)) : ''
      }
    }
  }
  const mudar = (m) => {
    st = { ...st, ...m }
    pintar()
  }
  el.addEventListener('zro-set:estado', (ev) => {
    const d = ev.detail || {}
    const n = (d.naoLidas || 0) + (d.pedidos || 0)
    mudar({ visivel: true, n, rotulo: `Set${d.online ? `, ${d.online} online` : ''}${n ? `, ${n} ${n === 1 ? 'novidade' : 'novidades'}` : ''}` })
  })
  el.addEventListener('zro-set:sem-login', () => mudar({ visivel: false, n: 0, rotulo: 'Set' }))
  el.addEventListener('zro-set:aberto', () => mudar({ aberto: true }))
  el.addEventListener('zro-set:fechado', () => mudar({ aberto: false }))
  pintar()
  return pintar
}

let el = null
let carregou = null
let pintar = null

/** A tela redesenhou (main.js › render): a entrada nova do Início ganha o estado e o clique do Set. */
export function pintarSet() {
  pintar?.()
}

function criar() {
  el?.remove()
  el = null
  pintar = null
  if (C.estado !== 'logado') {
    for (const e of document.querySelectorAll('[data-set]')) e.hidden = true
    return
  }
  el = document.createElement('zro-set')
  el.setAttribute('modo', 'folha')
  el.setAttribute('api', '/api/zro/set')
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a entrada fica escondida
  el.style.display = 'none'
  // cada entrada é recriada com a conta (os ouvintes antigos saem junto)
  for (const e of document.querySelectorAll('[data-set]')) e.replaceWith(e.cloneNode(true))
  pintar = ligarSet(el, () => document.querySelectorAll('[data-set]'))
  document.body.append(el)
}

/** Monta o Set depois de saber da conta (como a Z: o /eu já renovou o token). */
export async function iniciarSet() {
  if (!document.querySelector('[data-set]') || C.estado === 'sem') return
  try {
    carregou ??= import(SCRIPT_SET)
    await carregou
  } catch {
    carregou = null
    return
  }
  if (!customElements.get('zro-set')) return
  criar()
  // entrou ou saiu da conta: o Set começa de novo com a conta de agora
  let antes = `${C.estado}:${C.pessoa?.email || ''}`
  document.addEventListener('synquei:conta-mudou', () => {
    const agora = `${C.estado}:${C.pessoa?.email || ''}`
    if (agora === antes) return
    antes = agora
    criar()
  })
}
