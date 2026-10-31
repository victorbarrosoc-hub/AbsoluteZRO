// Relay · o Set da Absolute ZRO (ADR 0032 de lá): quem da equipe e dos contatos está online, em qual app, e as
// conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, "Set" no fim das páginas do topo.
// O Relay continua aberto (converter não pede conta): sem sessão, o topo mostra "Entrar" (com a Absolute ZRO, volta
// para a mesma página; da inicial, para o painel). Com sessão: "Painel", a foto da conta com o menu (Painel, Sua conta,
// Sair; app/conta.js) e o "Set", que só aparece quando o Set responde (pedido do titular, 30/10/2026), e
// abre a folha, o <zro-set modo="folha"> da Absolute ZRO (lateral no computador, tela cheia no iPhone), vestida com a
// identidade do Relay (relay.css, --zro-set-*) e no tema escolhido (data-tema).
// O widget fala com /api/zro/set, o repasse do próprio Relay (api/zro/set.js), que acrescenta o token da conta no
// servidor; o token nunca chega a esta página. Sem o login ligado neste site (sem ZRO_CLIENT_ID), nada aparece.

import { lerConta, linkEntrar, menuConta } from './conta.js'

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'

/** O que dizer quando a volta do login traz ?zro=<código> (api/zro/callback.js). "ok" e "config" não dizem nada. */
export const AVISOS = {
  erro: 'Não deu para entrar agora. Tente de novo.',
  expirou: 'A entrada demorou demais. Tente de novo.',
  recusado: 'Entrada cancelada.',
}

/**
 * Liga a entrada (o "Set" do topo) ao widget: com o primeiro estado ela aparece e vira o botão da folha (com o balão
 * das não lidas e dos pedidos). Com a conta dentro (`dentro`), o "Set" nasce escondido e só aparece quando o Set
 * responde; se o Set recusar o token (401: canal da API do produto fechado no HUB, por exemplo), ele some de novo, em
 * vez de virar um link de entrar que refaz o login em volta. Sem DOM de verdade (o teste usa objetos simples).
 */
export function ligarSet(el, entrada, { dentro = false } = {}) {
  let ligado = false
  entrada.setAttribute('aria-haspopup', 'dialog')
  entrada.setAttribute('aria-expanded', 'false')
  entrada.addEventListener('click', (ev) => {
    if (!ligado && dentro) return ev.preventDefault?.() // já está dentro: entrar de novo não resolve
    if (!ligado) return // sem o Set: o link leva a entrar
    ev.preventDefault?.()
    if (el.aberto) el.fecharSet?.()
    else el.abrirSet?.()
  })
  const balao = (n) => {
    const b = entrada.querySelector?.('[data-set-balao]')
    if (!b) return
    b.hidden = !n
    b.textContent = n ? (n > 99 ? '99+' : String(n)) : ''
  }
  el.addEventListener('zro-set:estado', (ev) => {
    const d = ev.detail || {}
    const n = (d.naoLidas || 0) + (d.pedidos || 0)
    ligado = true
    entrada.hidden = false
    balao(n)
    entrada.setAttribute('aria-label', `Set${d.online ? `, ${d.online} online` : ''}${n ? `, ${n} ${n === 1 ? 'novidade' : 'novidades'}` : ''}`)
  })
  el.addEventListener('zro-set:sem-login', () => {
    ligado = false
    balao(0)
    if (dentro) entrada.hidden = true
    else entrada.setAttribute('aria-label', 'Set: entrar com a Absolute ZRO')
  })
  el.addEventListener('zro-set:aberto', () => entrada.setAttribute('aria-expanded', 'true'))
  el.addEventListener('zro-set:fechado', () => entrada.setAttribute('aria-expanded', 'false'))
}

const temaDe = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')

/** Um link no fim das páginas do topo: "Entrar" (fora da conta), "Painel" ou "Set" (dentro; o Set escondido até
 * responder). */
function linkNoTopo(tipo) {
  const nav = document.querySelector('.topo nav')
  if (!nav) return null
  const a = document.createElement('a')
  if (tipo === 'entrar') {
    a.href = linkEntrar()
    a.dataset.entrar = ''
    a.title = 'Entrar com a conta Absolute ZRO'
    a.append('Entrar')
  } else if (tipo === 'painel') {
    a.href = '/painel'
    a.dataset.painel = ''
    a.className = 'opcional'
    a.append('Painel')
  } else {
    a.href = '/painel'
    a.dataset.set = ''
    a.hidden = true
    a.title = 'Quem está online e as conversas'
    a.append('Set')
    const b = Object.assign(document.createElement('span'), { className: 'set-balao', hidden: true })
    b.dataset.setBalao = ''
    a.append(b)
  }
  nav.append(a)
  return a
}

/** Aviso curto embaixo do topo (some sozinho). */
function avisar(texto) {
  let a = document.querySelector('.set-aviso')
  if (!a) {
    a = Object.assign(document.createElement('p'), { className: 'set-aviso', role: 'status' })
    document.body.append(a)
  }
  a.textContent = texto
  a.hidden = false
  clearTimeout(avisar.t)
  avisar.t = setTimeout(() => (a.hidden = true), 6000)
}

/** A volta do login (?zro=<código>): diz o que houve e limpa o endereço. */
function avisoDaVolta() {
  const u = new URL(location.href)
  const codigo = u.searchParams.get('zro')
  if (!codigo) return
  u.searchParams.delete('zro')
  history.replaceState(history.state, '', u.pathname + u.search + u.hash)
  if (AVISOS[codigo]) avisar(AVISOS[codigo])
}

export async function montarSet() {
  avisoDaVolta()
  if (document.querySelector('[data-set], [data-entrar]')) return null
  const { estado: conta, pessoa } = await lerConta()
  // login não ligado neste site (ou sem as funções, no servidor local): nada de conta no topo
  if (conta === 'desligado') return null
  if (conta === 'fora') {
    linkNoTopo('entrar')
    return null
  }
  // dentro: a foto da conta no fim do topo (menu com Painel, Sua conta e Sair) e o "Painel" nas páginas
  document.body.classList.add('com-conta')
  if (!document.querySelector('.topo nav a[href="/painel"], .topo nav a[href="painel"]')) linkNoTopo('painel')
  document.querySelector('.topo')?.append(menuConta(pessoa))
  const entrada = linkNoTopo('set')
  if (!entrada) return null
  try {
    await import(SCRIPT_SET)
    await customElements.whenDefined('zro-set')
  } catch {
    entrada.remove()
    return null
  }
  const el = document.createElement('zro-set')
  el.setAttribute('modo', 'folha')
  el.setAttribute('api', '/api/zro/set')
  el.setAttribute('tema', temaDe())
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: o "Set" fica escondido
  el.style.display = 'none'
  new MutationObserver(() => el.setAttribute('tema', temaDe())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
  ligarSet(el, entrada, { dentro: true })
  document.body.append(el)
  return el
}
