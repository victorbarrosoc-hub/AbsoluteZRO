// Relay · o Set da Absolute ZRO (ADR 0032 de lá): quem da equipe e dos contatos está online, em qual app, e as
// conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, "Set" no fim das páginas do topo.
// O Relay continua aberto (converter não pede conta): sem sessão, "Set" leva a entrar com a Absolute ZRO e volta para
// a mesma página; com sessão, abre a folha, o <zro-set modo="folha"> da Absolute ZRO (lateral no computador, tela
// cheia no iPhone), vestida com a identidade do Relay (relay.css, --zro-set-*) e no tema escolhido (data-tema).
// O widget fala com /api/zro/set, o repasse do próprio Relay (api/zro/set.js), que acrescenta o token da conta no
// servidor; o token nunca chega a esta página. Sem o login ligado neste site (sem ZRO_CLIENT_ID), nada aparece.

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'

/**
 * Liga a entrada (o link "Set" do topo) ao widget: com o primeiro estado ela vira o botão da folha (com o balão das
 * não lidas e dos pedidos); sem login (401 do Set), volta a ser o link de entrar. Sem DOM de verdade (o teste usa
 * objetos simples).
 */
export function ligarSet(el, entrada) {
  let ligado = false
  entrada.setAttribute('aria-haspopup', 'dialog')
  entrada.setAttribute('aria-expanded', 'false')
  entrada.addEventListener('click', (ev) => {
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

export async function montarSet() {
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
  ligarSet(el, entrada)
  document.body.append(el)
  return el
}
