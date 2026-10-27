// Conta Absolute ZRO (opcional). /api/zro/eu diz quem está logado. No site, o login acontece nas funções da Vercel
// (api/zro/*); no app de desktop, o próprio app responde as mesmas rotas (desktop/conta.cjs: o login abre o navegador da
// pessoa e volta pelo 127.0.0.1). Offline ou aberto de arquivo, não há função: fica tudo como sempre, sem conta.
// Conta única: quem não tem conta cria na Absolute ZRO ("Criar conta" = /api/zro/entrar?criar=1, prompt=create).
// O direito de uso vem do admin da Absolute ZRO (zro_products): sem o Synquei liberado, a parte de conta mostra o aviso
// e o caminho para a Absolute ZRO. O app em si (local, sem login) continua aberto; os planos seguem em plano.js.
// Perfil único: nome, e-mail e foto são da conta Absolute ZRO (o /eu relê a cada abertura). O Synquei só mostra; para
// mudar, "Editar na conta Absolute ZRO" abre o Perfil da Absolute ZRO fora do app.

import { h, icon, toast } from './util.js'

/** 'sem' (sem login neste lugar) · 'anonimo' (dá para entrar) · 'logado'. `acesso`: o Synquei está liberado na conta. */
export const C = { estado: 'sem', pessoa: null, acesso: false }

export const FERRAMENTAS = 'https://absolutezro.com/ferramentas'
export const PERFIL_ZRO = 'https://absolutezro.com/perfil'
const SEM_ACESSO = 'Sua conta Absolute ZRO ainda não tem acesso ao Synquei.'

const AVISOS = {
  ok: ['Pronto, você entrou com a Absolute ZRO.', 'check'],
  recusado: ['Login cancelado na Absolute ZRO.', 'info'],
  expirou: ['O login demorou demais. Tente de novo.', 'warn'],
  erro: ['Não deu para entrar agora. Tente de novo em instantes.', 'warn'],
  config: ['O login da Absolute ZRO ainda não está ligado neste site.', 'info'],
}

const avisar = () => document.dispatchEvent(new CustomEvent('synquei:conta-mudou'))
/** App de desktop com a conta (desktop/conta.cjs)? Versões antigas do app não têm: ficam sem conta, como antes. */
const noDesktop = () => !!globalThis.window?.synqueiDesktop
const temFuncao = () => (noDesktop() ? window.synqueiDesktop.conta === true : /^https?:$/.test(location.protocol))

/** Link de entrada que volta para a tela atual. `criar`: abre o cadastro da Absolute ZRO (prompt=create). */
export const linkEntrar = (criar = false) => `/api/zro/entrar?volta=${encodeURIComponent(location.pathname + location.hash)}${criar ? '&criar=1' : ''}`

/** Resposta de /api/zro/eu → estado da conta. */
export function lerEu(status, j) {
  if (status === 200 && j && j.ok && j.pessoa) Object.assign(C, { estado: 'logado', pessoa: j.pessoa, acesso: j.acesso === true })
  else if (status === 401 && j && j.configurado) Object.assign(C, { estado: 'anonimo', pessoa: null, acesso: false })
  else Object.assign(C, { estado: 'sem', pessoa: null, acesso: false })
  return C
}

/** Relê /api/zro/eu (no desktop, o app relê o perfil na Absolute ZRO) e mostra o recado da volta do login. */
async function lerConta(aviso) {
  try {
    const r = await fetch('/api/zro/eu', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    lerEu(r.status, (r.headers.get('content-type') || '').includes('application/json') ? await r.json() : null)
  } catch {
    lerEu(0, null)
  }
  // o recado da volta sai depois de saber se o Synquei está liberado na conta
  const a = aviso === 'ok' && C.estado === 'logado' && !C.acesso ? [SEM_ACESSO, 'warn'] : AVISOS[aviso]
  if (a) toast(a[0], { icon: a[1] })
  avisar()
}

/** Desktop: o login acontece no navegador da pessoa; a página fica onde estava e espera a volta (sem recarregar). */
let entrando = false
async function entrarNoDesktop(link) {
  if (entrando) return
  entrando = true
  toast('Continue no navegador para entrar.', { icon: 'info' })
  let aviso = 'erro'
  try {
    const r = await fetch(link, { cache: 'no-store' })
    aviso = new URL(r.url).searchParams.get('zro') || 'erro'
  } catch {}
  entrando = false
  await lerConta(aviso)
}

export async function iniciarConta() {
  if (!temFuncao()) return
  // o link de entrar volta para a tela de agora (a barra lateral não redesenha a cada troca de aba)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-entrar]')
    if (!a) return
    a.href = linkEntrar(a.dataset.entrar === 'criar')
    if (noDesktop()) {
      e.preventDefault()
      entrarNoDesktop(a.getAttribute('href'))
    }
  })
  // foto da conta que não carrega (sem rede, foto trocada há pouco): some e ficam as iniciais
  document.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof HTMLImageElement && e.target.parentElement?.classList.contains('conta-av')) e.target.remove()
    },
    true,
  )
  // volta do login: mostra o recado e tira o ?zro= do endereço
  const q = new URLSearchParams(location.search)
  const aviso = q.get('zro')
  if (aviso) {
    q.delete('zro')
    const resto = q.toString()
    history.replaceState(history.state, '', location.pathname + (resto ? `?${resto}` : '') + location.hash)
  }
  await lerConta(aviso)
  // desktop: voltou para o app (depois de editar a conta no navegador, por exemplo): relê nome, foto e produtos
  if (noDesktop()) {
    let ultima = Date.now()
    addEventListener('focus', () => {
      if (entrando || C.estado !== 'logado' || Date.now() - ultima < 60_000) return
      ultima = Date.now()
      lerConta(null)
    })
  }
}

export async function sair() {
  try {
    const r = await fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' })
    if (!r.ok) throw new Error(String(r.status))
    Object.assign(C, { estado: 'anonimo', pessoa: null, acesso: false })
    toast(noDesktop() ? 'Você saiu da conta neste computador.' : 'Você saiu da conta neste navegador.', { icon: 'check' })
    avisar()
  } catch {
    toast('Não deu para sair agora. Tente de novo.', { icon: 'warn' })
  }
}

const iniciais = (p) =>
  (p.nome || p.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('')

/** Só endereço https vira <img>; o resto cai nas iniciais. */
const fotoSegura = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null)
/** Onde editar nome, e-mail e foto: o zro_conta que veio do login (sempre https), ou o Perfil da Absolute ZRO. */
export const linkConta = (p) => (p && typeof p.conta === 'string' && /^https:\/\/[^\s"'<>]+$/.test(p.conta) ? p.conta : PERFIL_ZRO)

/** Avatar da conta: a foto da Absolute ZRO; sem foto (ou se ela não carregar), as iniciais. */
export function avatar(p) {
  const ini = h(iniciais(p))
  const f = fotoSegura(p.foto)
  if (!f) return `<span class="conta-av" aria-hidden="true">${ini}</span>`
  return `<span class="conta-av com-foto" aria-hidden="true">${ini}<img src="${h(f)}" alt="" referrerpolicy="no-referrer" decoding="async"/></span>`
}

const editarNaConta = (p) =>
  `<div class="set-row"><div><b>Nome, e-mail e foto</b><small>Os mesmos em todos os apps da Absolute ZRO.</small></div><a class="btn btn-secondary btn-sm" href="${h(linkConta(p))}" target="_blank" rel="noopener">${icon('link')}Editar na conta Absolute ZRO</a></div>`

const botoesEntrar = (cls) =>
  `<a class="${cls}" data-entrar href="${h(linkEntrar())}">${icon('user')}Entrar com Absolute ZRO</a><a class="${cls} conta-criar" data-entrar="criar" href="${h(linkEntrar(true))}">${icon('plus')}Criar conta</a>`

/** Linha da pessoa no cartão do plano (barra lateral). Vazio quando não há login neste lugar. */
export function linhaConta() {
  if (C.estado === 'logado') {
    const p = C.pessoa
    const sub = C.acesso ? (p.organizacao ? p.organizacao.nome : p.email) : 'Sem acesso ao Synquei'
    return `<a class="conta-linha${C.acesso ? '' : ' sem-acesso'}" href="#/ajustes" title="${C.acesso ? 'Sua conta Absolute ZRO' : h(SEM_ACESSO)}">${avatar(p)}<span class="conta-txt"><b>${h(p.nome || p.email)}</b><small>${h(sub)}</small></span></a>`
  }
  if (C.estado === 'anonimo') return `<div class="conta-botoes">${botoesEntrar('conta-entrar')}</div>`
  return ''
}

/** Cartão "Conta" em Ajustes. Vazio quando não há login neste lugar (offline, aberto de arquivo, desktop antigo). */
export function cartaoConta() {
  if (C.estado === 'logado') {
    const p = C.pessoa
    const quem = `<div class="set-row"><div class="conta-quem">${avatar(p)}<span><b>${h(p.nome || p.email)}</b><small>${h(p.email || '')}</small></span></div><button class="btn btn-secondary btn-sm" data-act="conta-sair">Sair</button></div>`
    if (!C.acesso) {
      return `<section class="card conta-bloqueio"><header class="card-head"><h2>Conta</h2><span class="plano-chip">Absolute ZRO</span></header><div class="card-pad">
      ${quem}
      ${editarNaConta(p)}
      <div class="set-row"><div><b>${h(SEM_ACESSO)}</b><small>Peça ao admin da sua organização para liberar o Synquei.</small></div><a class="btn btn-primary btn-sm" href="${FERRAMENTAS}" target="_blank" rel="noopener">Ver na Absolute ZRO</a></div>
    </div></section>`
    }
    return `<section class="card"><header class="card-head"><h2>Conta</h2><span class="plano-chip">Absolute ZRO</span></header><div class="card-pad">
      ${quem}
      ${editarNaConta(p)}
      <div class="set-row"><div><b>Organização</b><small>${p.organizacao ? h(p.organizacao.nome) : 'Nenhuma ainda.'}</small></div></div>
      <div class="set-row"><div><b>O que a conta faz</b><small>Identifica você com a mesma conta da Absolute ZRO. Seus arquivos continuam só no seu computador.</small></div></div>
    </div></section>`
  }
  if (C.estado === 'anonimo') {
    return `<section class="card"><header class="card-head"><h2>Conta</h2></header><div class="card-pad">
      <div class="set-row"><div><b>Absolute ZRO</b><small>Uma conta para todas as plataformas. Sem conta, o app continua igual.</small></div><div class="conta-acoes">${botoesEntrar('btn btn-secondary btn-sm')}</div></div>
    </div></section>`
  }
  return ''
}
