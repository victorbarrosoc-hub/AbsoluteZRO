// Rádio do set · o app (ADR 0042). Intercom no modelo dos headsets de set (C1 Pro): uma faixa por setor, cada pessoa
// escolhe o que ouve e para onde fala; o TALK abre o microfone com um toque (fala aberta, full duplex) e segurar fala só
// enquanto aperta (push-to-talk). A Direção (e quem criou a diária) tem "Todos", que fala para todos os canais, e os
// avisos de set. Sem integração com as outras plataformas por enquanto: a equipe entra pelo código ou pelo QR.

import { icone } from './icones.js'
import { Malha } from './rtc.js'
import { desenharQr } from './qr.js'
import { contextoDeAudio, destravarSom, somAviso, somComeca, somTermina } from './som.js'

const $ = (id) => document.getElementById(id)
const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content ?? ''
// onde o app mora: '' e /api/radio no app separado; /radio e /api/v1/radio dentro do HUB
const BASE = meta('radio-base')
const API = meta('radio-api') || '/api/radio'
const INICIO = BASE || '/'

const CANAIS = [
  ['geral', 'Geral'],
  ['direcao', 'Direção'],
  ['producao', 'Produção'],
  ['camera', 'Câmera'],
  ['som', 'Som'],
  ['luz', 'Luz'],
  ['arte', 'Arte'],
  ['elenco', 'Elenco'],
]
const NOME = Object.fromEntries(CANAIS)
NOME.todos = 'Todos'
const SETORES = CANAIS.filter(([id]) => id !== 'geral')
const AVISOS = { silencio: 'Silêncio', acao: 'Ação', corta: 'Corta', intervalo: 'Intervalo' }
const PONTOS = 16
const BATIDA_MS = 1000
const BATIDA_ESCONDIDO_MS = 4000
const TOQUE_MS = 280 // soltar antes disso = toque (trava ou destrava); depois = segurou (push-to-talk)

/** Nível (0 a 1, RMS) para a escala do medidor: de -54 dB a -6 dB, como um medidor de áudio. */
const escala = (v) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-5)) + 54) / 48))

let ultimoNivel = 0 // nível do meu microfone, com decaimento (anel do TALK e minha faixa de destino)

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
  escuta: new Set(['geral']), // o que eu ouço
  escutaDe: new Map(), // peer → Set do que ele ouve (pelo canal de dados)
  alvo: 'geral', // para onde eu falo
  todos: false, // "Todos" (só Direção): fala para todos os canais
  modo: 'mudo', // mudo | aberto | ptt
  noAr: new Map(), // peer → { nome, canal, nivel, visto }
  laco: null,
  trava: null,
  ligado: false,
  trilha: null,
  medidorMic: null,
  apertou: 0,
}

// ───────── tema (claro é o padrão; o escuro é escolha) ─────────
function aplicarTema(t) {
  document.documentElement.dataset.tema = t
  document.querySelector('meta[name="theme-color"]').content = t === 'escuro' ? '#0b0b0c' : '#f5f5f7'
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

// os ícones dos setores na abertura
$('tela-diarias')
  .querySelector('.setores-mini')
  .append(
    ...SETORES.map(([id]) => {
      const s = document.createElement('span')
      s.dataset.canal = id
      s.append(icone(id))
      return s
    }),
  )

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
  $('base').hidden = true
  $('tela-diarias').hidden = false
  history.replaceState(null, '', INICIO)
  const r = await api(`${API}/diarias`)
  if (r.status === 503) return mostrarErro('diarias-erro', 'O rádio está sem banco agora.')
  $('lista').replaceChildren(
    ...(r.diarias || []).map((d, i) => {
      const li = document.createElement('li')
      li.style.animationDelay = `${i * 40}ms`
      const b = document.createElement('button')
      b.type = 'button'
      const ic = document.createElement('span')
      ic.className = 'lista-icone'
      ic.dataset.canal = d.funcao || 'geral'
      ic.append(icone(d.funcao || 'geral'))
      const nome = document.createElement('span')
      nome.textContent = d.nome
      const cod = document.createElement('small')
      cod.textContent = d.codigo
      b.append(ic, nome, cod)
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
  const r = await api(`${API}/diarias`, { acao: 'criar', nome })
  if (!r.diaria) return mostrarErro('diarias-erro', 'Não deu para criar. Tente de novo.')
  $('criar-nome').value = ''
  abrirDiaria(r.diaria)
})

async function entrarComCodigo(codigo) {
  const r = await api(`${API}/diarias`, { acao: 'entrar', codigo })
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

// ───────── servidores de conexão (TURN quando há) ─────────
let iceCache = null
async function servidoresIce() {
  if (iceCache && Date.now() - iceCache.em < 5 * 3600_000) return iceCache.lista
  try {
    const r = await api(`${API}/ice`)
    if (Array.isArray(r.iceServers) && r.iceServers.length) iceCache = { lista: r.iceServers, em: Date.now() }
  } catch {
    // sem a lista do servidor: a Malha usa só STUN
  }
  return iceCache?.lista ?? null
}

// ───────── tela 2: o rádio ─────────
async function abrirDiaria(d) {
  const iceServers = await servidoresIce()
  mostrarErro('diarias-erro', '')
  estado.diaria = d
  estado.ultimoAviso = null
  estado.avisosVistos.clear()
  estado.escuta = new Set(['geral', ...(d.funcao ? [d.funcao] : [])])
  estado.alvo = 'geral'
  estado.todos = false
  $('tela-diarias').hidden = true
  $('tela-radio').hidden = false
  $('diaria-nome').textContent = d.nome
  $('codigo').textContent = d.codigo
  $('ligar').hidden = estado.ligado
  $('radio').hidden = !estado.ligado
  $('base').hidden = !estado.ligado
  history.replaceState(null, '', `${INICIO}?d=${d.codigo}`)
  montarFaixas()
  estado.malha = new Malha({
    eu: estado.peer,
    iceServers,
    enviarSinal: (para, tipo, dados) => {
      estado.saida.push({ para, tipo, dados })
      bater()
    },
    aoMudar: desenharPessoas,
    aoRecado: recado,
    aoAbrir: (peer) => estado.malha.enviar(peer, { t: 'escuta', canais: [...estado.escuta] }),
  })
  if (estado.trilha) estado.malha.usarMicrofone(estado.trilha)
  if (!d.funcao) abrirSetores()
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
  estado.escutaDe.clear()
}
$('voltar').addEventListener('click', telaDiarias)

// Entrar no rádio: o toque libera o microfone, o som e a tela ligada (regras do navegador, sobretudo no iPhone).
$('ligar-btn').addEventListener('click', async () => {
  destravarSom()
  try {
    const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    estado.trilha = m.getAudioTracks()[0]
    const ctx = contextoDeAudio()
    if (ctx) {
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(m).connect(an)
      estado.medidorMic = { an, buf: new Float32Array(an.fftSize) }
    }
  } catch {
    mostrarErro('radio-erro', 'Sem microfone, você só ouve. Libere nos ajustes do navegador.')
  }
  estado.ligado = true
  if (estado.trilha) estado.malha?.usarMicrofone(estado.trilha)
  for (const a of document.querySelectorAll('audio')) a.play().catch(() => {})
  $('ligar').hidden = true
  $('radio').hidden = false
  $('base').hidden = false
  $('ptt').disabled = !estado.trilha
  desenharBase()
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

// ───────── setor ─────────
function abrirSetores() {
  const atual = estado.diaria?.funcao
  $('setores').replaceChildren(
    ...SETORES.map(([id, nome], i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.canal = id
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(id === atual))
      b.style.animationDelay = `${i * 30}ms`
      const ic = document.createElement('span')
      ic.className = 'setor-icone'
      ic.append(icone(id))
      const t = document.createElement('span')
      t.textContent = nome
      b.append(ic, t)
      b.addEventListener('click', () => escolherSetor(id))
      return b
    }),
  )
  if (!$('setor-folha').open) $('setor-folha').showModal()
}

async function escolherSetor(id) {
  const r = await api(`${API}/diarias`, { acao: 'funcao', diaria: estado.diaria.id, funcao: id })
  if (!r.ok) return
  const antigo = estado.diaria.funcao
  estado.diaria.funcao = id
  if (antigo && antigo !== id) estado.escuta.delete(antigo)
  estado.escuta.add(id)
  if (estado.alvo === antigo) estado.alvo = id
  $('setor-folha').close()
  anunciarEscuta()
  montarFaixas()
  bater()
}
$('trocar-setor').addEventListener('click', () => {
  $('pessoas-folha').close()
  abrirSetores()
})

// ───────── faixas (um canal por setor) ─────────
function montarFaixas() {
  const meu = estado.diaria?.funcao
  const ordem = [CANAIS[0], ...(meu ? [CANAIS.find(([id]) => id === meu)] : []), ...CANAIS.slice(1).filter(([id]) => id !== meu)]
  $('faixas').replaceChildren(
    ...ordem.map(([id, nome], i) => {
      const f = document.createElement('article')
      f.className = 'faixa'
      f.dataset.canal = id
      f.style.animationDelay = `${i * 35}ms`
      const ic = document.createElement('div')
      ic.className = 'faixa-icone'
      ic.append(icone(id))
      const corpo = document.createElement('div')
      corpo.className = 'faixa-corpo'
      const linha = document.createElement('div')
      linha.className = 'faixa-nome'
      const n = document.createElement('strong')
      n.textContent = nome
      linha.append(n)
      if (id === meu) {
        const seu = document.createElement('span')
        seu.className = 'seu'
        seu.textContent = 'Seu'
        linha.append(seu)
      }
      const sub = document.createElement('small')
      sub.className = 'faixa-sub'
      linha.append(sub)
      const med = document.createElement('div')
      med.className = 'medidor'
      med.setAttribute('aria-hidden', 'true')
      for (let k = 0; k < PONTOS; k++) med.append(document.createElement('i'))
      corpo.append(linha, med)
      const botoes = document.createElement('div')
      botoes.className = 'faixa-botoes'
      const ouvir = document.createElement('button')
      ouvir.type = 'button'
      ouvir.dataset.ouvir = id
      ouvir.setAttribute('aria-label', `Ouvir ${nome}`)
      ouvir.title = 'Ouvir'
      ouvir.append(icone('ouvir'))
      ouvir.addEventListener('click', () => alternarEscuta(id))
      const falar = document.createElement('button')
      falar.type = 'button'
      falar.dataset.alvo = id
      falar.setAttribute('aria-label', `Falar para ${nome}`)
      falar.title = 'Falar para este canal'
      falar.append(icone('falar'))
      falar.addEventListener('click', () => escolherAlvo(id))
      botoes.append(ouvir, falar)
      f.append(ic, corpo, botoes)
      return f
    }),
  )
  desenharFaixas()
  desenharBase()
}

function alternarEscuta(id) {
  if (estado.escuta.has(id)) estado.escuta.delete(id)
  else estado.escuta.add(id)
  anunciarEscuta()
  desenharFaixas()
}

function anunciarEscuta() {
  estado.malha?.avisar({ t: 'escuta', canais: [...estado.escuta] })
}

function escolherAlvo(id) {
  estado.alvo = id
  estado.todos = false
  if (estado.modo !== 'mudo') falarAgora() // troca de canal no meio da fala, sem fechar o TALK
  desenharFaixas()
  desenharBase()
}

/** O que um aparelho escuta: o que ele disse pelo canal de dados ou, antes disso, Geral e o setor dele. */
function escutaDe(peer) {
  const dita = estado.escutaDe.get(peer)
  if (dita) return dita
  const p = estado.pessoas.find((x) => x.peer === peer)
  return new Set(['geral', ...(p?.funcao ? [p.funcao] : [])])
}

/** Quantas pessoas (fora eu) ouvem o canal agora. */
const ouvintes = (canal) => estado.pessoas.filter((p) => !p.eu && escutaDe(p.peer).has(canal)).length

function desenharFaixas() {
  for (const f of $('faixas').children) {
    const id = f.dataset.canal
    f.classList.toggle('is-alvo', !estado.todos && estado.alvo === id)
    f.classList.toggle('is-surda', !estado.escuta.has(id))
    f.querySelector('[data-ouvir]').setAttribute('aria-pressed', String(estado.escuta.has(id)))
    f.querySelector('[data-alvo]').setAttribute('aria-pressed', String(!estado.todos && estado.alvo === id))
  }
  pintarNiveis()
}

// O medidor de cada faixa: o nível que quem fala manda (10 vezes por segundo) e um decaimento suave.
function pintarNiveis() {
  const agora = Date.now()
  const porCanal = new Map()
  const falas = [...estado.noAr.entries()]
  // a minha fala acende o canal de destino (retorno de que o TALK está aberto)
  if (estado.modo !== 'mudo') falas.push(['eu', { nome: 'Você', canal: estado.todos ? 'todos' : estado.alvo, nivel: ultimoNivel, visto: agora, minha: true }])
  for (const [peer, f] of falas) {
    if (!f.minha && agora - f.visto > 1500) {
      estado.noAr.delete(peer)
      continue
    }
    const canais = f.canal === 'todos' ? CANAIS.map(([id]) => id) : [f.canal]
    for (const c of canais) {
      const atual = porCanal.get(c) || { nivel: 0, nomes: [] }
      atual.nivel = Math.max(atual.nivel, f.nivel)
      atual.nomes.push(f.nome)
      porCanal.set(c, atual)
    }
  }
  for (const f of $('faixas').children) {
    const id = f.dataset.canal
    const c = porCanal.get(id)
    const ouvindo = estado.escuta.has(id) || c?.nomes.length
    f.classList.toggle('is-no-ar', Boolean(c && ouvindo))
    const n = c && ouvindo ? Math.max(1, Math.round(escala(c.nivel) * PONTOS)) : 0
    const pontos = f.querySelectorAll('.medidor i')
    pontos.forEach((p, k) => {
      p.classList.toggle('aceso', k < n)
      p.classList.toggle('alto', k < n && k >= PONTOS - 3)
    })
    const sub = f.querySelector('.faixa-sub')
    if (c && ouvindo) sub.textContent = c.nomes.join(', ')
    else {
      const q = ouvintes(id)
      sub.textContent = q ? `${q} ouvindo` : ''
    }
  }
}

function desenharBase() {
  const alvo = estado.todos ? 'todos' : estado.alvo
  const el = $('alvo-nome')
  el.textContent = NOME[alvo]
  el.dataset.canal = alvo === 'todos' ? 'geral' : alvo
  $('todos').hidden = !estado.eu?.podeAvisar
  $('base-dica').hidden = Boolean(estado.eu?.podeAvisar)
  $('base-dica').replaceChildren(...(estado.modo === 'aberto' ? ['Toque fecha'] : ['Toque abre', document.createElement('br'), 'Segure fala']))
  $('todos').setAttribute('aria-pressed', String(estado.todos))
  $('ptt').dataset.estado = estado.modo
  $('ptt-texto').textContent = estado.modo === 'aberto' ? 'Aberto' : estado.modo === 'ptt' ? 'Falando' : 'Falar'
  desenharNoAr()
}

$('todos').addEventListener('click', () => {
  estado.todos = !estado.todos
  if (estado.modo !== 'mudo') falarAgora()
  desenharFaixas()
  desenharBase()
})

function desenharPessoas() {
  const n = estado.pessoas.length
  $('pessoas-conta').textContent = String(n)
  $('pessoas').replaceChildren(
    ...estado.pessoas.map((p) => {
      const li = document.createElement('li')
      li.dataset.estado = p.eu ? 'ligado' : (estado.malha?.estado(p.peer) ?? 'sem')
      li.dataset.canal = p.funcao || 'geral'
      const ponto = document.createElement('span')
      ponto.className = 'ponto'
      const quem = document.createElement('span')
      quem.className = 'quem'
      quem.textContent = p.eu ? `${p.nome} (você)` : p.nome
      const onde = document.createElement('span')
      onde.className = 'onde'
      onde.textContent = p.funcao ? NOME[p.funcao] : 'Sem setor'
      li.append(ponto, quem, onde)
      return li
    }),
  )
  pintarNiveis()
}
$('pessoas-btn').addEventListener('click', () => $('pessoas-folha').showModal())
$('pessoas-fechar').addEventListener('click', () => $('pessoas-folha').close())

function desenharNoAr() {
  const el = $('no-ar')
  const falas = [...estado.noAr.values()]
  if (estado.modo !== 'mudo') el.textContent = `Você · ${NOME[estado.todos ? 'todos' : estado.alvo]}`
  else if (falas.length) el.textContent = falas.map((f) => `${f.nome} · ${NOME[f.canal] || 'Geral'}`).join(', ')
  else el.textContent = ''
  el.classList.toggle('falando', Boolean(estado.modo !== 'mudo' || falas.length))
}

// ───────── batida: presença, sinais e avisos perdidos ─────────
async function bater() {
  if (!estado.diaria) return
  clearTimeout(estado.laco)
  const diaria = estado.diaria
  const sinais = estado.saida.splice(0, 20)
  let r
  try {
    r = await api(`${API}/batida`, { diaria: diaria.id, peer: estado.peer, sinais, aviso: estado.ultimoAviso })
  } catch {
    estado.saida.unshift(...sinais)
    r = null
  }
  if (estado.diaria !== diaria) return
  if (r?.ok) {
    const podia = estado.eu?.podeAvisar
    estado.eu = r.eu
    estado.pessoas = r.pessoas
    $('avisos').hidden = !r.eu.podeAvisar
    if (podia !== r.eu.podeAvisar) desenharBase()
    estado.malha.atualizar(r.pessoas.map((p) => p.peer))
    for (const s of r.sinais) estado.malha.receber(s.de, s.tipo, s.dados)
    for (const a of r.avisos) mostrarAviso(a)
    estado.ultimoAviso = Math.max(estado.ultimoAviso ?? 0, r.ultimoAviso)
    for (const peer of estado.noAr.keys()) if (!r.pessoas.some((p) => p.peer === peer)) estado.noAr.delete(peer)
    for (const peer of estado.escutaDe.keys()) if (!r.pessoas.some((p) => p.peer === peer)) estado.escutaDe.delete(peer)
    desenharPessoas()
    mostrarErro('radio-erro', '')
  } else if (r?.status === 403) {
    return telaDiarias()
  } else if (r) {
    mostrarErro('radio-erro', 'Sem conexão com o servidor. Tentando de novo.')
  }
  estado.laco = setTimeout(bater, document.visibilityState === 'visible' ? BATIDA_MS : BATIDA_ESCONDIDO_MS)
}

// ───────── falar: o TALK ─────────
function deveOuvir(peer) {
  if (estado.todos) return true
  return escutaDe(peer).has(estado.alvo)
}

/** Liga (ou atualiza) a fala para o destino atual. */
function falarAgora() {
  if (!estado.trilha || !estado.malha) return
  estado.malha.falar({ nome: estado.eu?.nome || 'Alguém', canal: estado.todos ? 'todos' : estado.alvo }, deveOuvir)
}

function abrirMic(modo) {
  if (!estado.trilha || !estado.malha) return
  const estava = estado.modo
  estado.modo = modo
  if (estava === 'mudo') {
    somComeca()
    falarAgora()
  }
  desenharBase()
}

function calar() {
  if (estado.modo === 'mudo') return
  estado.modo = 'mudo'
  estado.malha?.calar()
  somTermina()
  desenharBase()
}

// Toque: trava aberto (ou fecha, se estava aberto). Segurar: fala enquanto aperta, como o botão do headset.
function apertar() {
  estado.apertou = Date.now()
  estado.estavaAberto = estado.modo === 'aberto'
  if (estado.modo === 'mudo') abrirMic('ptt')
}
function soltar() {
  if (!estado.apertou) return
  const toque = Date.now() - estado.apertou < TOQUE_MS
  estado.apertou = 0
  if (estado.estavaAberto) {
    if (toque) calar()
    return
  }
  if (toque) abrirMic('aberto')
  else calar()
}

const ptt = $('ptt')
ptt.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  ptt.setPointerCapture?.(e.pointerId)
  apertar()
})
ptt.addEventListener('pointerup', soltar)
ptt.addEventListener('pointercancel', () => {
  estado.apertou = 0
  if (estado.modo === 'ptt') calar()
})
ptt.addEventListener('contextmenu', (e) => e.preventDefault())
// no computador: a barra de espaço é o TALK (toque trava, segurar fala)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !$('radio').hidden && !(e.target instanceof HTMLInputElement) && !document.querySelector('dialog[open]')) {
    e.preventDefault()
    apertar()
  }
})
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') soltar()
})
window.addEventListener('blur', () => {
  if (estado.modo === 'ptt') calar()
})

// O nível do meu microfone: o anel do TALK e o recado para quem me ouve (10 vezes por segundo).
setInterval(() => {
  const m = estado.medidorMic
  let v = 0
  if (m && estado.modo !== 'mudo') {
    m.an.getFloatTimeDomainData(m.buf)
    let s = 0
    for (const x of m.buf) s += x * x
    v = Math.sqrt(s / m.buf.length)
  }
  ultimoNivel = Math.max(v, ultimoNivel * 0.6)
  const anel = $('talk-nivel')
  if (anel) anel.style.strokeDashoffset = String(339.3 * (1 - (estado.modo === 'mudo' ? 0 : escala(ultimoNivel))))
  if (estado.modo !== 'mudo') estado.malha?.avisar({ t: 'nivel', v: Math.round(v * 1000) / 1000 })
  if (estado.diaria && estado.ligado) pintarNiveis()
}, 100)

// ───────── recados de outros aparelhos ─────────
function recado(peer, msg) {
  if (msg.t === 'fala' && typeof msg.nome === 'string') {
    const canal = Object.hasOwn(NOME, msg.canal) ? msg.canal : 'geral'
    if (!estado.noAr.has(peer)) somComeca()
    estado.noAr.set(peer, { nome: msg.nome.slice(0, 60), canal, nivel: 0.05, visto: Date.now() })
    desenharNoAr()
  } else if (msg.t === 'nivel') {
    const f = estado.noAr.get(peer)
    if (f && Number.isFinite(msg.v)) {
      f.nivel = Math.max(0, Math.min(1, msg.v))
      f.visto = Date.now()
    }
  } else if (msg.t === 'fim') {
    if (estado.noAr.delete(peer)) somTermina()
    desenharNoAr()
  } else if (msg.t === 'escuta' && Array.isArray(msg.canais)) {
    estado.escutaDe.set(peer, new Set(msg.canais.filter((c) => Object.hasOwn(NOME, c)).slice(0, 10)))
    estado.malha?.reavaliar(peer)
    pintarNiveis()
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
    const r = await api(`${API}/aviso`, { diaria: estado.diaria.id, tipo: b.dataset.aviso })
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
const linkDaDiaria = () => `${location.origin}${INICIO}?d=${estado.diaria.codigo}`
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

// app separado: a sessão relê o perfil e o gate (no máximo uma vez por minuto, api/zro/eu.js). No HUB, a sessão é a dele.
if (!BASE) fetch('/api/zro/eu').catch(() => {})
