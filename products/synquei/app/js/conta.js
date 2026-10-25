// Conta Absolute ZRO (opcional). No site, /api/zro/eu diz quem está logado; o login em si acontece nas funções da
// Vercel (api/zro/*). No app de desktop, offline ou aberto de arquivo, não há função: fica tudo como sempre, sem conta.
// A conta só identifica a pessoa: não libera nem bloqueia nada do app (os planos continuam como em plano.js).

import { h, icon, toast } from './util.js'

/** 'sem' (sem login neste lugar) · 'anonimo' (dá para entrar) · 'logado' */
export const C = { estado: 'sem', pessoa: null }

const AVISOS = {
  ok: ['Pronto, você entrou com a Absolute ZRO.', 'check'],
  recusado: ['Login cancelado na Absolute ZRO.', 'info'],
  expirou: ['O login demorou demais. Tente de novo.', 'warn'],
  erro: ['Não deu para entrar agora. Tente de novo em instantes.', 'warn'],
  config: ['O login da Absolute ZRO ainda não está ligado neste site.', 'info'],
}

const avisar = () => document.dispatchEvent(new CustomEvent('synquei:conta-mudou'))
const temFuncao = () => !window.synqueiDesktop && /^https?:$/.test(location.protocol)

/** Link de entrada que volta para a tela atual. */
export const linkEntrar = () => `/api/zro/entrar?volta=${encodeURIComponent(location.pathname + location.hash)}`

export async function iniciarConta() {
  if (!temFuncao()) return
  // o link de entrar volta para a tela de agora (a barra lateral não redesenha a cada troca de aba)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-entrar]')
    if (a) a.href = linkEntrar()
  })
  // volta do login: mostra o recado e tira o ?zro= do endereço
  const q = new URLSearchParams(location.search)
  const aviso = q.get('zro')
  if (aviso) {
    q.delete('zro')
    const resto = q.toString()
    history.replaceState(history.state, '', location.pathname + (resto ? `?${resto}` : '') + location.hash)
    const a = AVISOS[aviso]
    if (a) toast(a[0], { icon: a[1] })
  }
  try {
    const r = await fetch('/api/zro/eu', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    const j = (r.headers.get('content-type') || '').includes('application/json') ? await r.json() : null
    if (r.status === 200 && j && j.ok && j.pessoa) Object.assign(C, { estado: 'logado', pessoa: j.pessoa })
    else if (r.status === 401 && j && j.configurado) Object.assign(C, { estado: 'anonimo', pessoa: null })
    else Object.assign(C, { estado: 'sem', pessoa: null })
  } catch {
    Object.assign(C, { estado: 'sem', pessoa: null })
  }
  avisar()
}

export async function sair() {
  try {
    const r = await fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' })
    if (!r.ok) throw new Error(String(r.status))
    Object.assign(C, { estado: 'anonimo', pessoa: null })
    toast('Você saiu da conta neste navegador.', { icon: 'check' })
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

/** Linha da pessoa no cartão do plano (barra lateral). Vazio quando não há login neste lugar. */
export function linhaConta() {
  if (C.estado === 'logado') {
    const p = C.pessoa
    return `<a class="conta-linha" href="#/ajustes" title="Sua conta Absolute ZRO"><span class="conta-av" aria-hidden="true">${h(iniciais(p))}</span><span class="conta-txt"><b>${h(p.nome || p.email)}</b><small>${h(p.organizacao ? p.organizacao.nome : p.email)}</small></span></a>`
  }
  if (C.estado === 'anonimo') return `<a class="conta-entrar" data-entrar href="${h(linkEntrar())}">${icon('user')}Entrar com Absolute ZRO</a>`
  return ''
}

/** Cartão "Conta" em Ajustes. Vazio quando não há login neste lugar (desktop, offline). */
export function cartaoConta() {
  if (C.estado === 'logado') {
    const p = C.pessoa
    return `<section class="card"><header class="card-head"><h2>Conta</h2><span class="plano-chip">Absolute ZRO</span></header><div class="card-pad">
      <div class="set-row"><div class="conta-quem"><span class="conta-av" aria-hidden="true">${h(iniciais(p))}</span><span><b>${h(p.nome || p.email)}</b><small>${h(p.email || '')}</small></span></div><button class="btn btn-secondary btn-sm" data-act="conta-sair">Sair</button></div>
      <div class="set-row"><div><b>Organização</b><small>${p.organizacao ? h(p.organizacao.nome) : 'Nenhuma ainda.'}</small></div></div>
      <div class="set-row"><div><b>O que a conta faz</b><small>Identifica você com a mesma conta da Absolute ZRO. Seus arquivos continuam só no seu computador.</small></div></div>
    </div></section>`
  }
  if (C.estado === 'anonimo') {
    return `<section class="card"><header class="card-head"><h2>Conta</h2></header><div class="card-pad">
      <div class="set-row"><div><b>Absolute ZRO</b><small>Opcional. Use a mesma conta das outras plataformas. Sem conta, tudo continua igual.</small></div><a class="btn btn-secondary btn-sm" data-entrar href="${h(linkEntrar())}">${icon('user')}Entrar com Absolute ZRO</a></div>
    </div></section>`
  }
  return ''
}
