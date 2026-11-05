// Rádio do set · o app (ADR 0042, fase 1 web). Diárias → rádio: canais Geral e Equipe (pela função), botão de segurar
// para falar, avisos de set e a tela de cue. Sem integração com as outras plataformas por enquanto (pedido do titular,
// 05/11/2026): a equipe entra pelo código ou pelo QR.

import { Malha } from './rtc.js'
import { desenharQr } from './qr.js'
import { destravarSom, somAviso, somComeca, somTermina } from './som.js'

const $ = (id) => document.getElementById(id)
const FUNCOES = { direcao: 'Direção', producao: 'Produção', camera: 'Câmera', som: 'Som', luz: 'Luz', arte: 'Arte', elenco: 'Elenco' }
const AVISOS = { silencio: 'Silêncio', acao: 'Ação', corta: 'Corta', intervalo: 'Intervalo' }
const BATIDA_MS = 1000
const BATIDA_ESCONDIDO_MS = 4000

const novoPeer = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)

const estado = {
  diaria: null, // { id, codigo, nome, dono, funcao }
  eu: null, // da batida: { peer, nome, funcao, dono, podeAvisar }
  peer: novoPeer(),
  pessoas: [],
  malha: null,
  saida: [],
  ultimoAviso: null,
  avisosVistos: new Set(),
  canal: 'geral',
  falando: false,
  noAr: new Map(), // peer → { nome, canal }
  laco: null,
  trava: null,
  ligado: false,
  trilha: null,
}

// ───────── tema (claro é o padrão; o escuro é escolha) ─────────
function aplicarTema(t) {
  document.documentElement.dataset.tema = t
  document.querySelector('meta[name="theme-color"]').content = t === 'escuro' ? '#000000' : '#f5f5f7'
}
try {
  aplicarTema(localStorage.getItem('rd_tema') === 'escuro' ? 'escuro' : 'claro')
} catch {
  aplicarTema('claro')
}
$('tema').addEventListener('click', () => {
  const t = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro'
  aplicarTema(t)
  try {
    localStorage.setItem('rd_tema', t)
  } catch {
    // sem armazenamento: vale só nesta aba
  }
})

// ───────── API ─────────
async function api(caminho, corpo) {
  const r = await fetch(caminho, corpo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) } : {})
  const dados = await r.json().catch(() => ({}))
  if (r.status === 401) location.reload()
  return { status: r.status, ...dados }
}

function mostrarErro(id, texto) {
  const el = $(id)
  el.textContent = texto || ''
  el.hidden = !texto
}

// ───────── tela 1: diárias ─────────
async function telaDiarias() {
  sairDoRadio()
  $('tela-radio').hidden = true
  $('tela-diarias').hidden = false
  history.replaceState(null, '', '/')
  const r = await api('/api/radio/diarias')
  if (r.status === 503) return mostrarErro('diarias-erro', 'O rádio está sem banco agora.')
  const lista = $('lista')
  lista.replaceChildren(
    ...(r.diarias || []).map((d) => {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      const nome = document.createElement('span')
      nome.textContent = d.nome
      const cod = document.createElement('small')
      cod.textContent = d.codigo
      b.append(nome, cod)
      b.addEventListener('click', () => abrirDiaria(d))
      li.append(b)
      return li
    }),
  )
}

$('criar').addEventListener('submit', async (e) => {
  e.preventDefault()
  const nome = $('criar-nome').value.trim()
  if (!nome) return
  const r = await api('/api/radio/diarias', { acao: 'criar', nome })
  if (!r.diaria) return mostrarErro('diarias-erro', 'Não deu para criar. Tente de novo.')
  $('criar-nome').value = ''
  abrirDiaria(r.diaria)
})

async function entrarComCodigo(codigo) {
  const r = await api('/api/radio/diarias', { acao: 'entrar', codigo })
  if (!r.diaria) {
    mostrarErro('diarias-erro', 'Código não encontrado.')
    return false
  }
  abrirDiaria(r.diaria)
  return true
}
$('entrar').addEventListener('submit', (e) => {
  e.preventDefault()
  const codigo = $('entrar-codigo').value.trim()
  if (codigo) entrarComCodigo(codigo)
})

// ───────── tela 2: o rádio ─────────
function abrirDiaria(d) {
  mostrarErro('diarias-erro', '')
  estado.diaria = d
  estado.ultimoAviso = null
  estado.avisosVistos.clear()
  $('tela-diarias').hidden = true
  $('tela-radio').hidden = false
  $('diaria-nome').textContent = d.nome
  $('codigo').textContent = d.codigo
  $('ligar').hidden = estado.ligado
  $('radio').hidden = !estado.ligado
  history.replaceState(null, '', `/?d=${d.codigo}`)
  desenharFuncoes(d.funcao)
  estado.malha = new Malha({
    eu: estado.peer,
    enviarSinal: (para, tipo, dados) => {
      estado.saida.push({ para, tipo, dados })
      bater()
    },
    aoMudar: desenharPessoas,
    aoRecado: recado,
  })
  if (estado.trilha) estado.malha.usarMicrofone(estado.trilha)
  bater()
}

function sairDoRadio() {
  clearTimeout(estado.laco)
  estado.laco = null
  calar()
  estado.malha?.fecharTodas()
  estado.malha = null
  estado.diaria = null
  estado.pessoas = []
  estado.noAr.clear()
}
$('voltar').addEventListener('click', telaDiarias)

// Entrar no rádio: o toque libera o microfone, o som e a tela ligada (regras do navegador, sobretudo no iPhone).
$('ligar-btn').addEventListener('click', async () => {
  destravarSom()
  try {
    const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    estado.trilha = m.getAudioTracks()[0]
  } catch {
    mostrarErro('radio-erro', 'Sem microfone, você só ouve. Libere nos ajustes do navegador.')
  }
  estado.ligado = true
  if (estado.trilha) estado.malha?.usarMicrofone(estado.trilha)
  for (const a of document.querySelectorAll('audio')) a.play().catch(() => {})
  $('ligar').hidden = true
  $('radio').hidden = false
  $('ptt').disabled = !estado.trilha
  manterTelaLigada()
})

async function manterTelaLigada() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !estado.trava) {
      estado.trava = await navigator.wakeLock.request('screen')
      estado.trava.addEventListener('release', () => (estado.trava = null))
    }
  } catch {
    // sem trava de tela: a dica "deixe a tela ligada" continua valendo
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (estado.ligado) manterTelaLigada()
    if (estado.diaria) bater()
  }
})

function desenharFuncoes(atual) {
  $('funcoes').replaceChildren(
    ...Object.entries(FUNCOES).map(([id, nome]) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(id === atual))
      b.textContent = nome
      b.addEventListener('click', async () => {
        const r = await api('/api/radio/diarias', { acao: 'funcao', diaria: estado.diaria.id, funcao: id })
        if (r.ok) {
          estado.diaria.funcao = id
          desenharFuncoes(id)
          bater()
        }
      })
      return b
    }),
  )
  $('canal-equipe').textContent = atual ? FUNCOES[atual] : 'Equipe'
  $('canal-equipe').disabled = !atual
  if (!atual && estado.canal === 'equipe') escolherCanal('geral')
}

function escolherCanal(c) {
  estado.canal = c
  for (const b of document.querySelectorAll('.canais button')) b.setAttribute('aria-checked', String(b.dataset.canal === c))
}
for (const b of document.querySelectorAll('.canais button')) b.addEventListener('click', () => escolherCanal(b.dataset.canal))

function desenharPessoas() {
  const n = estado.pessoas.length
  $('pessoas-conta').textContent = n ? `${n} no rádio` : ''
  $('pessoas').replaceChildren(
    ...estado.pessoas.map((p) => {
      const li = document.createElement('li')
      li.dataset.estado = p.eu ? 'ligado' : (estado.malha?.estado(p.peer) ?? 'sem')
      const a = document.createElement('span')
      a.textContent = p.eu ? `${p.nome} (você)` : p.nome
      const b = document.createElement('span')
      b.textContent = [p.funcao ? FUNCOES[p.funcao] : null, !p.eu && li.dataset.estado !== 'ligado' ? 'conectando' : null].filter(Boolean).join(' · ')
      li.append(a, b)
      return li
    }),
  )
  desenharNoAr()
}

function desenharNoAr() {
  const el = $('no-ar')
  const falas = [...estado.noAr.values()]
  if (estado.falando) {
    el.textContent = estado.canal === 'geral' ? 'Você · Geral' : `Você · ${FUNCOES[estado.diaria?.funcao] || 'Equipe'}`
  } else if (falas.length) {
    el.textContent = falas.map((f) => `${f.nome} · ${f.canal === 'geral' ? 'Geral' : FUNCOES[f.canal] || 'Equipe'}`).join(', ')
  } else el.textContent = ''
  el.classList.toggle('falando', Boolean(estado.falando || falas.length))
}

// ───────── batida: presença, sinais e avisos perdidos ─────────
async function bater() {
  if (!estado.diaria) return
  clearTimeout(estado.laco)
  const diaria = estado.diaria
  const sinais = estado.saida.splice(0, 20)
  let r
  try {
    r = await api('/api/radio/batida', { diaria: diaria.id, peer: estado.peer, sinais, aviso: estado.ultimoAviso })
  } catch {
    estado.saida.unshift(...sinais)
    r = null
  }
  if (estado.diaria !== diaria) return
  if (r?.ok) {
    estado.eu = r.eu
    estado.pessoas = r.pessoas
    $('avisos').hidden = !r.eu.podeAvisar
    estado.malha.atualizar(r.pessoas.map((p) => p.peer))
    for (const s of r.sinais) estado.malha.receber(s.de, s.tipo, s.dados)
    for (const a of r.avisos) mostrarAviso(a)
    estado.ultimoAviso = Math.max(estado.ultimoAviso ?? 0, r.ultimoAviso)
    for (const peer of estado.noAr.keys()) if (!r.pessoas.some((p) => p.peer === peer)) estado.noAr.delete(peer)
    desenharPessoas()
    mostrarErro('radio-erro', '')
  } else if (r?.status === 403) {
    return telaDiarias()
  } else if (r) {
    mostrarErro('radio-erro', 'Sem conexão com o servidor. Tentando de novo.')
  }
  estado.laco = setTimeout(bater, document.visibilityState === 'visible' ? BATIDA_MS : BATIDA_ESCONDIDO_MS)
}

// ───────── falar ─────────
function deveOuvir(peer) {
  if (estado.canal === 'geral') return true
  const p = estado.pessoas.find((x) => x.peer === peer)
  return Boolean(p && estado.diaria?.funcao && p.funcao === estado.diaria.funcao)
}

function falar() {
  if (estado.falando || !estado.trilha || !estado.malha) return
  estado.falando = true
  $('ptt').classList.add('ativo')
  $('ptt-texto').textContent = 'No ar'
  somComeca()
  const canal = estado.canal === 'geral' ? 'geral' : estado.diaria.funcao
  estado.malha.falar({ nome: estado.eu?.nome || 'Alguém', canal }, deveOuvir)
  desenharNoAr()
}

function calar() {
  if (!estado.falando) return
  estado.falando = false
  $('ptt').classList.remove('ativo')
  $('ptt-texto').textContent = 'Segure'
  estado.malha?.calar()
  somTermina()
  desenharNoAr()
}

const ptt = $('ptt')
ptt.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  ptt.setPointerCapture?.(e.pointerId)
  falar()
})
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) ptt.addEventListener(ev, calar)
ptt.addEventListener('contextmenu', (e) => e.preventDefault())
// no computador: segurar a barra de espaço
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !$('radio').hidden && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    falar()
  }
})
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') calar()
})
window.addEventListener('blur', calar)

// ───────── recados de outros aparelhos ─────────
function recado(peer, msg) {
  if (msg.t === 'fala' && typeof msg.nome === 'string') {
    if (!estado.noAr.has(peer)) somComeca()
    estado.noAr.set(peer, { nome: msg.nome.slice(0, 60), canal: String(msg.canal || 'geral') })
    desenharNoAr()
  } else if (msg.t === 'fim') {
    if (estado.noAr.delete(peer)) somTermina()
    desenharNoAr()
  } else if (msg.t === 'aviso' && Number.isSafeInteger(msg.id) && AVISOS[msg.tipo]) {
    mostrarAviso({ id: msg.id, tipo: msg.tipo, de: String(msg.de || '').slice(0, 60) })
  }
}

// ───────── avisos de set ─────────
let avisoTempo = null
function mostrarAviso(a) {
  if (estado.avisosVistos.has(a.id)) return
  estado.avisosVistos.add(a.id)
  estado.ultimoAviso = Math.max(estado.ultimoAviso ?? 0, a.id)
  somAviso(a.tipo)
  const tela = $('aviso-tela')
  $('aviso-texto').textContent = AVISOS[a.tipo]
  tela.dataset.tipo = a.tipo
  tela.hidden = false
  clearTimeout(avisoTempo)
  avisoTempo = setTimeout(() => (tela.hidden = true), 2200)
  $('cue-texto').textContent = AVISOS[a.tipo]
  $('cue').dataset.tipo = a.tipo
}
$('aviso-tela').addEventListener('click', () => ($('aviso-tela').hidden = true))

for (const b of document.querySelectorAll('[data-aviso]')) {
  b.addEventListener('click', async () => {
    const r = await api('/api/radio/aviso', { diaria: estado.diaria.id, tipo: b.dataset.aviso })
    if (!r.aviso) return mostrarErro('radio-erro', 'Só a Direção manda aviso.')
    estado.malha?.avisar({ t: 'aviso', ...r.aviso })
    mostrarAviso(r.aviso)
  })
}

// ───────── tela de cue ─────────
$('cue-btn').addEventListener('click', () => {
  $('cue').hidden = false
  document.documentElement.requestFullscreen?.().catch(() => {})
})
$('cue-fechar').addEventListener('click', () => {
  $('cue').hidden = true
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
})

// ───────── chamar a equipe (QR) ─────────
const linkDaDiaria = () => `${location.origin}/?d=${estado.diaria.codigo}`
$('codigo').addEventListener('click', () => {
  desenharQr($('qr'), linkDaDiaria())
  $('qr-codigo').textContent = estado.diaria.codigo
  $('qr-folha').showModal()
})
$('qr-fechar').addEventListener('click', () => $('qr-folha').close())
$('qr-copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(linkDaDiaria())
    $('qr-copiar').textContent = 'Copiado'
    setTimeout(() => ($('qr-copiar').textContent = 'Copiar link'), 1600)
  } catch {
    // sem área de transferência: o código está na tela
  }
})

// ───────── início: ?d=CODIGO entra direto ─────────
const codigoNaUrl = new URLSearchParams(location.search).get('d')
if (codigoNaUrl && /^[A-Za-z0-9]{6}$/.test(codigoNaUrl)) {
  entrarComCodigo(codigoNaUrl).then((ok) => ok || telaDiarias())
} else telaDiarias()

// a sessão relê o perfil e o gate (no máximo uma vez por minuto, api/zro/eu.js)
fetch('/api/zro/eu').catch(() => {})
