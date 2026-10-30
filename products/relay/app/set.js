// Relay · o Set da Absolute ZRO (ADR 0032 de lá): quem da equipe e dos contatos está online, em qual app, e as
// conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, "Set" no fim das páginas do topo.
// O Relay continua aberto (converter não pede conta): sem sessão, "Set" leva a entrar com a Absolute ZRO e volta para
// a mesma página; com sessão, abre a folha, o <zro-set modo="folha"> da Absolute ZRO (lateral no computador, tela
// cheia no iPhone), vestida com a identidade do Relay (relay.css, --zro-set-*) e no tema escolhido (data-tema).
// O widget fala com /api/zro/set, o repasse do próprio Relay (api/zro/set.js), que acrescenta o token da conta no
// servidor; o token nunca chega a esta página. Sem o login ligado neste site (sem ZRO_CLIENT_ID), nada aparece.

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'

/** O que dizer quando a volta do login traz ?zro=<código> (api/zro/callback.js). "ok" e "config" não dizem nada. */
export const AVISOS = {
  erro: 'Não deu para entrar agora. Tente de novo.',
  expirou: 'A entrada demorou demais. Tente de novo.',
  recusado: 'Entrada cancelada.',
  'sem-set': 'Você entrou, mas o Set ainda não abriu para o Relay.',
}

/**
 * Liga a entrada (o link "Set" do topo) ao widget: com o primeiro estado ela vira o botão da folha (com o balão das
 * não lidas e dos pedidos); sem login (401 do Set), volta a ser o link de entrar. Com a conta já dentro (`dentro`) e
 * o Set recusando o token (canal da API do produto fechado no HUB, por exemplo), entrar de novo não resolve: o clique
 * avisa (`avisar`) em vez de refazer o login em volta. Sem DOM de verdade (o teste usa objetos simples).
 */
export function ligarSet(el, entrada, { dentro = false, avisar = () => {} } = {}) {
  let ligado = false
  let recusou = false
  entrada.setAttribute('aria-haspopup', 'dialog')
  entrada.setAttribute('aria-expanded', 'false')
  entrada.addEventListener('click', (ev) => {
    if (!ligado && dentro && recusou) {
      ev.preventDefault?.()
      return avisar(AVISOS['sem-set'])
    }
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
    recusou = true
    balao(0)
    entrada.setAttribute('aria-label', 'Set: entrar com a Absolute ZRO')
  })
  el.addEventListener('zro-set:aberto', () => entrada.setAttribute('aria-expanded', 'true'))
  el.addEventListener('zro-set:fechado', () => entrada.setAttribute('aria-expanded', 'false'))
}

const temaDe = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')

/** O link "Set" no fim das páginas do topo (entrar com a Absolute ZRO até o Set responder). */
function entradaNoTopo() {
  const nav = document.querySelector('.topo nav')
  if (!nav) return null
  const a = document.createElement('a')
  a.dataset.set = ''
  a.href = `/api/zro/entrar?volta=${encodeURIComponent(location.pathname + location.search)}`
  a.title = 'Quem está online e as conversas'
  a.append('Set')
  const b = Object.assign(document.createElement('span'), { className: 'set-balao', hidden: true })
  b.dataset.setBalao = ''
  a.append(b)
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
  if (AVISOS[codigo] && codigo !== 'sem-set') avisar(AVISOS[codigo])
}

export async function montarSet() {
  avisoDaVolta()
  if (document.querySelector('[data-set]')) return null
  let conta
  try {
    // o /eu do Relay responde 200 sempre (api/zro/eu.js): ok com sessão, configurado sem ela
    const r = await fetch('/api/zro/eu', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
    const j = r.ok && (r.headers.get('content-type') || '').includes('application/json') ? await r.json().catch(() => null) : null
    conta = j?.ok ? 'dentro' : j?.configurado ? 'fora' : null
  } catch {
    conta = null
  }
  // login não ligado neste site (ou sem as funções, no servidor local): nada de Set
  if (!conta) return null
  const entrada = entradaNoTopo()
  if (!entrada || conta === 'fora') return null
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
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: o link segue sendo o de entrar
  el.style.display = 'none'
  new MutationObserver(() => el.setAttribute('tema', temaDe())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
  ligarSet(el, entrada, { dentro: conta === 'dentro', avisar })
  document.body.append(el)
  return el
}
