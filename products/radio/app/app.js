// RADION · o app (ADR 0042). O rádio do set no modelo dos headsets (C1 Pro): um canal por setor, cada pessoa escolhe o
// que ouve e para onde fala; o TALK abre o microfone com um toque (fala aberta, full duplex) e segurar fala só enquanto
// aperta (push-to-talk). Papéis: o dono pode tudo; o responsável cuida do setor dele; a equipe fala no próprio setor; o
// convidado só ouve. Silêncio: o servidor diz quem está silenciado e este aparelho corta o microfone e a voz que chega.
// Telas aprovadas pelo titular em 06/11/2026.

import { icone, porIcones } from './icones.js'
import { Malha } from './rtc.js'
import { desenharQr } from './qr.js'
import { contextoDeAudio, destravarSom, somAviso, somComeca, somTermina } from './som.js'

const $ = (id) => document.getElementById(id)
const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content ?? ''
// onde o app mora: '' e /api/radio no app separado; /radio e /api/v1/radio dentro do HUB
const BASE = meta('radio-base')
const API = meta('radio-api') || '/api/radio'
const SET = meta('radio-set')
const SET_API = meta('radio-set-api')
const SAIR = meta('radio-sair')
const INICIO = BASE || '/'
const ZRO = SET ? new URL(SET, location.href).origin : ''

// os setores vêm da diária (o dono cria, renomeia e tira; db/migrations/0002_setores.sql); estes são os de sempre
const PADRAO = [
  ['direcao', 'Direção', 'laranja'],
  ['producao', 'Produção', 'roxo'],
  ['camera', 'Câmera', 'azul'],
  ['som', 'Som', 'verde'],
  ['luz', 'Luz', 'amarelo'],
  ['arte', 'Arte', 'rosa'],
  ['elenco', 'Elenco', 'ciano'],
]
const CORES = { laranja: '#ff6b1a', roxo: '#6c4df5', azul: '#0a8cff', verde: '#12b76a', amarelo: '#e0a100', rosa: '#e6195c', ciano: '#18c2e8', indigo: '#5856d6', vermelho: '#ff3b30', cinza: '#8e8e93' }
const ICONE_PROPRIO = new Set(['geral', ...PADRAO.map(([id]) => id)])
/** Ícone de um canal: os de sempre têm o seu; o setor criado pelo dono usa o de gente. */
const icSetor = (id, classe) => icone(ICONE_PROPRIO.has(id) ? id : 'gente', classe)
let SETORES = PADRAO.map(([id, nome]) => [id, nome])
let CANAIS = [['geral', 'Geral'], ...SETORES]
const NOME = { todos: 'Todos' }
let setoresVistos = ''
const folhaDeCores = new CSSStyleSheet()
document.adoptedStyleSheets = [...document.adoptedStyleSheets, folhaDeCores]
/** Troca a lista de setores (vinda da batida) e as cores de cada um. Devolve se mudou. */
function aplicarSetores(lista) {
  const chave = JSON.stringify(lista)
  if (chave === setoresVistos) return false
  setoresVistos = chave
  SETORES = lista.map((x) => [x.id, x.nome])
  CANAIS = [['geral', 'Geral'], ...SETORES]
  for (const k of Object.keys(NOME)) if (k !== 'todos') delete NOME[k]
  Object.assign(NOME, Object.fromEntries(CANAIS))
  const regras = lista.map((x) => {
    const c = CORES[x.cor] || CORES.cinza
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
    return `[data-canal='${x.id}'] { --c: ${c}; --cf: rgba(${r}, ${g}, ${b}, 0.13); }`
  })
  folhaDeCores.replaceSync(regras.join('\n'))
  return true
}
aplicarSetores(PADRAO.map(([id, nome, cor]) => ({ id, nome, cor })))
const nomeDoSetor = (id, reserva) => (id ? NOME[id] || reserva || 'Setor' : null)
const AVISOS = { acao: 'Gravando', corta: 'Corta', silencio: 'Silêncio', intervalo: 'Intervalo' }
const AVISO_DICA = { acao: 'Silencia o set até o Corta', corta: 'Reativa quem o Gravando calou', silencio: 'Pede silêncio no set', intervalo: 'Pausa da equipe' }
const PAPEL = { dono: 'Dono do projeto', responsavel: 'Responsável', equipe: 'Equipe', convidado: 'Convidado' }
const PONTOS = 22
const BATIDA_MS = 1000
const BATIDA_ESCONDIDO_MS = 4000
const TOQUE_MS = 280 // soltar antes disso = toque (trava ou destrava); depois = segurou (push-to-talk)
const PAGINAS = ['inicio', 'noar', 'diarias', 'equipe', 'avisos', 'setores', 'convites', 'ajustes']
const SETOR_ERRO = { repetido: 'Já existe um setor com esse nome.', limite: 'Até 20 setores por diária.', sem_permissao: 'Só o dono mexe nos setores.' }
// as plataformas da Absolute ZRO no ar (a mesma família dos outros apps; os não lançados não entram)
const FAMILIA = [
  ['Absolute ZRO', 'https://absolutezro.com', '/brand/app-icon-1024.png'],
  ['SOBEDESCE', 'https://sobedesce.com', '/products/sobedesce.svg'],
  ['Synquei', 'https://synquei.absolutezro.com', '/products/synquei.svg'],
  ['Relay', 'https://relay.absolutezro.com', '/products/relay.svg'],
  ['TPeasy', 'https://tpeasy.absolutezro.com', '/products/tpeasy.svg'],
  ['Carro do Freela', 'https://carro.absolutezro.com', '/products/carro-do-freela.png'],
  ['Maestro', 'https://maestro.absolutezro.com', '/products/maestro.svg'],
]

/** Nível (0 a 1, RMS) para a escala do medidor: de -54 dB a -6 dB, como um medidor de áudio. */
const escala = (v) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-5)) + 54) / 48))
let ultimoNivel = 0
const novoPeer = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)

const estado = {
  pagina: 'inicio',
  nome: '',
  diarias: [],
  diaria: null, // { id, codigo, nome, dono, papel, funcao }
  eu: null, // da batida
  peer: novoPeer(),
  pessoas: [],
  membros: [],
  silenciados: new Map(), // apelido → { por, ate, motivo }
  maos: new Set(),
  silencio: { todos: null, setores: [] },
  ajustes: null,
  paraMim: new Set(), // apelidos que eu silenciei só para mim
  malha: null,
  saida: [],
  ultimoAviso: null,
  avisosVistos: new Set(),
  avisosLog: [],
  escuta: new Set(['geral']),
  escutaDe: new Map(),
  alvo: 'geral',
  todos: false,
  modo: 'mudo', // mudo | aberto | ptt
  noAr: new Map(), // peer → { nome, canal, nivel, visto }
  laco: null,
  trava: null,
  ligado: false,
  trilha: null,
  medidorMic: null,
  apertou: 0,
}

// ───────── utilidades ─────────
/** Cria um elemento: h('b', { class: 'x' }, 'texto', filho). Texto sempre como texto (nada de HTML vindo de fora). */
function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)))
  return el
}
const COR_AV = ['#FF6B1A', '#6C4DF5', '#0A8CFF', '#12B76A', '#E0A100', '#E6195C', '#18C2E8', '#5856D6', '#FF9500', '#30B0C7']
const iniciais = (n) => (String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
function cor(n) {
  let x = 0
  for (const ch of String(n)) x = (x * 31 + ch.charCodeAt(0)) >>> 0
  return COR_AV[x % COR_AV.length]
}
function avatar(nome, classe = '') {
  const a = h('span', { class: `av ${classe}`, 'aria-hidden': 'true' }, iniciais(nome))
  a.style.background = cor(nome)
  return a
}
const ico = (canal, classe = 'ico') => h('span', { class: classe, dataset: { canal } }, icSetor(canal))
const primeiro = (n) => String(n || '').split(/\s+/)[0]
function mostrarErro(id, texto) {
  const el = $(id)
  if (!el) return
  el.textContent = texto || ''
  el.hidden = !texto
}
async function api(caminho, corpo) {
  const r = await fetch(caminho, corpo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) } : {})
  const dados = await r.json().catch(() => ({}))
  if (r.status === 401) location.reload()
  return { status: r.status, ...dados }
}
const guardar = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // sem armazenamento: vale só nesta aba
  }
}
const ler = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

// ───────── tema e lateral ─────────
function aplicarTema(t) {
  document.documentElement.dataset.tema = t
  document.querySelector('meta[name="theme-color"]').content = t === 'escuro' ? '#0b0b0c' : '#f5f5f7'
  $('aj-tema').setAttribute('aria-checked', String(t === 'escuro'))
  document.querySelector('zro-set')?.setAttribute('tema', t === 'escuro' ? 'escuro' : 'claro')
}
const trocarTema = () => {
  const t = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro'
  aplicarTema(t)
  guardar('rd_tema', t)
}
function aplicarLado(l) {
  $('app').dataset.lado = l
  $('recolher').setAttribute('aria-expanded', String(l === 'aberto'))
  $('recolher').title = l === 'aberto' ? 'Recolher o menu' : 'Abrir o menu'
  $('recolher').setAttribute('aria-label', $('recolher').title)
}

// ───────── navegação ─────────
function ir(p) {
  if (!PAGINAS.includes(p)) p = 'inicio'
  // outra página começa do topo (a rolagem da anterior não vem junto)
  if (p !== estado.pagina) window.scrollTo(0, 0)
  estado.pagina = p
  fecharFlutuantes()
  if ($('mais-folha').open) $('mais-folha').close()
  for (const id of PAGINAS) $(`pg-${id}`).hidden = id !== p
  for (const b of document.querySelectorAll('.item[data-ir], .aba[data-ir]')) {
    if (b.dataset.ir === p) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  const titulo = { inicio: 'Início', noar: 'No ar', diarias: 'Diárias', equipe: 'Equipe', avisos: 'Avisos', setores: 'Setores e responsáveis', convites: 'Convites e QR', ajustes: 'Ajustes' }[p]
  const cam = $('caminho')
  cam.replaceChildren(...(estado.diaria && ['noar', 'equipe', 'avisos', 'setores', 'convites'].includes(p) ? [estado.diaria.nome, h('i', {}, '/'), h('b', {}, titulo)] : [h('b', {}, titulo)]))
  const alvo = `${INICIO}${estado.diaria ? `?d=${estado.diaria.codigo}` : ''}#${p}`
  if (location.pathname + location.search + location.hash !== alvo) history.replaceState(null, '', alvo)
  $('ligar').hidden = !(p === 'noar' && estado.diaria && !estado.ligado)
  $('ligar-nome').textContent = estado.diaria?.nome || ''
  $('base').hidden = !(p === 'noar' && estado.diaria && estado.ligado)
  $('fala-cel').hidden = $('base').hidden
  desenharPagina()
}
function desenharPagina() {
  const p = estado.pagina
  if (p === 'inicio') desenharInicio()
  else if (p === 'diarias') desenharDiarias()
  else if (p === 'noar') desenharNoAr()
  else if (p === 'equipe') desenharEquipe()
  else if (p === 'avisos') desenharAvisos()
  else if (p === 'setores') desenharSetores()
  else if (p === 'convites') desenharConvites()
  else if (p === 'ajustes') desenharAjustes()
}

function desenharCasca() {
  const n = estado.nome || estado.eu?.nome || ''
  $('eu-av').replaceWith(Object.assign(avatar(n), { id: 'eu-av' }))
  $('eu-nome').textContent = n
  $('eu-sub').textContent = estado.diaria ? [PAPEL[estado.diaria.papel], nomeDoSetor(estado.diaria.funcao, estado.diaria.funcaoNome)].filter(Boolean).join(' · ') : 'Conta Absolute ZRO'
  const t = $('topo-av')
  t.textContent = iniciais(n)
  t.style.background = cor(n)
  $('nav-diarias').textContent = estado.diarias.length ? String(estado.diarias.length) : ''
  $('nav-vivo').hidden = !estado.diaria
  $('nav-noar').dataset.vivo = estado.diaria ? '1' : ''
  $('nav-diaria').hidden = !estado.diaria
  $('nav-diaria-nome').textContent = estado.diaria?.nome || ''
}

// ───────── diárias ─────────
async function carregarDiarias() {
  const r = await api(`${API}/diarias`)
  if (r.status === 503) return mostrarErro('diarias-erro', 'O RADION está sem banco agora.')
  estado.diarias = r.diarias || []
  if (r.eu?.nome) estado.nome = r.eu.nome
  desenharCasca()
  if (['inicio', 'diarias'].includes(estado.pagina)) desenharPagina()
}
function linhaDiaria(d) {
  const aberta = estado.diaria?.id === d.id
  return h(
    'li',
    { class: 'linha-diaria-casa' },
    h(
      'button',
      { class: 'linha-diaria', type: 'button', onclick: () => (aberta ? ir('noar') : abrirDiaria(d)) },
      ico(d.funcao && ICONE_PROPRIO.has(d.funcao) ? d.funcao : 'geral', 'ico ico--p'),
      h('div', {}, h('b', {}, d.nome), h('small', {}, [PAPEL[d.papel] || 'Equipe', d.funcao ? (estado.diaria?.id === d.id ? nomeDoSetor(d.funcao) : d.funcaoNome) : null, d.pessoas != null ? `${d.pessoas} ${d.pessoas === 1 ? 'pessoa' : 'pessoas'}` : null].filter(Boolean).join(' · '))),
      aberta || d.noAr ? h('span', { class: 'chip chip--vivo' }, aberta ? `no ar · ${estado.pessoas.length || 1}` : `no ar · ${d.noAr}`) : null,
      h('span', { class: 'codigo chip' }, d.codigo),
    ),
    h('button', { class: 'redondo diaria-mais', type: 'button', 'aria-label': `Opções de ${d.nome}`, title: 'Renomear, copiar o link, excluir', onclick: () => abrirDiariaFolha(d) }, icone('ajustes')),
  )
}
// ───────── uma diária da lista: renomear, copiar o link, excluir (o dono) ou deixar ─────────
let diariaDaFolha = null
function abrirDiariaFolha(d) {
  diariaDaFolha = d
  $('df-nome').textContent = d.nome
  $('df-campo').hidden = !d.dono
  $('df-novo').value = d.nome
  $('df-info').textContent = [PAPEL[d.papel] || 'Equipe', d.funcao ? (estado.diaria?.id === d.id ? nomeDoSetor(d.funcao) : d.funcaoNome) : 'Sem setor', d.pessoas != null ? `${d.pessoas} ${d.pessoas === 1 ? 'pessoa' : 'pessoas'}` : null, d.criado ? `criada em ${new Date(d.criado).toLocaleDateString('pt-BR')}` : null].filter(Boolean).join(' · ')
  $('df-codigo').textContent = `Código ${d.codigo}`
  $('df-excluir').hidden = !d.dono
  $('df-deixar').hidden = Boolean(d.dono)
  mostrarErro('df-erro', '')
  $('diaria-folha').showModal()
}
async function depoisDeSair(d) {
  $('diaria-folha').close()
  if (estado.diaria?.id === d.id) return desligar()
  await carregarDiarias()
  desenharPagina()
}
$('df-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const d = diariaDaFolha
  const nome = $('df-novo').value.trim()
  if (!d?.dono || !nome || nome === d.nome) return $('diaria-folha').close()
  const r = await api(`${API}/diarias`, { acao: 'renomear', diaria: d.id, nome })
  if (!r.ok) return mostrarErro('df-erro', 'Não deu para renomear.')
  if (estado.diaria?.id === d.id) estado.diaria.nome = r.diaria.nome
  $('diaria-folha').close()
  await carregarDiarias()
  desenharCasca()
  desenharPagina()
})
$('df-copiar').addEventListener('click', async () => {
  const d = diariaDaFolha
  try {
    await navigator.clipboard.writeText(`${location.origin}${INICIO}?d=${d.codigo}`)
    $('df-codigo').textContent = 'Link copiado'
  } catch {
    $('df-codigo').textContent = `Código ${d.codigo}`
  }
})
for (const [botao, acao, pergunta] of [
  ['df-deixar', 'sair', 'Deixar a diária? Para voltar, você vai precisar do código.'],
  ['df-excluir', 'encerrar', 'Excluir a diária para todo mundo? O código para de valer.'],
]) {
  $(botao).addEventListener('click', async () => {
    const d = diariaDaFolha
    if (!d || !confirm(pergunta)) return
    const r = await api(`${API}/diarias`, { acao, diaria: d.id })
    if (!r.ok) return mostrarErro('df-erro', 'Não deu certo. Tente de novo.')
    depoisDeSair(d)
  })
}
$('df-fechar').addEventListener('click', () => $('diaria-folha').close())
$('diaria-folha').addEventListener('click', (e) => e.target === $('diaria-folha') && $('diaria-folha').close())
function desenharDiarias() {
  $('lista').replaceChildren(...(estado.diarias.length ? estado.diarias.map(linhaDiaria) : [h('li', { class: 'vazio' }, 'Nenhuma diária ainda.')]))
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

// ───────── início ─────────
function desenharInicio() {
  const hora = new Date().getHours()
  $('ola-saudacao').textContent = hora < 12 ? 'Bom dia,' : hora < 18 ? 'Boa tarde,' : 'Boa noite,'
  $('ola-nome').textContent = `${primeiro(estado.nome || estado.eu?.nome) || 'você'}.`
  const d = estado.diaria
  $('ola-sub').textContent = d ? 'Uma diária no ar agora.' : estado.diarias.length ? 'Abra uma diária para entrar no rádio.' : 'Crie a primeira diária.'
  $('heroi').hidden = !d
  $('estats').hidden = !d
  if (d) {
    $('heroi-vivo').textContent = `no ar · ${estado.pessoas.length} de ${estado.membros.length || 1}`
    $('heroi-nome').textContent = d.nome
    $('heroi-sub').textContent = papelDaFrase()
    const niveis = niveisPorCanal()
    $('heroi-setores').replaceChildren(
      ...SETORES.map(([id, nome]) => {
        const n = Math.round(escala(niveis.get(id)?.nivel || 0) * 4)
        return h('div', { class: 'mini-setor', dataset: { canal: id } }, h('span', { class: 'ico' }, icSetor(id)), h('small', {}, nome), h('div', { class: 'medidor' }, ...Array.from({ length: 4 }, (_, k) => h('i', { class: k < n ? 'aceso' : '' }))))
      }),
    )
    const meu = d.funcao
    const noSetor = estado.membros.filter((m) => m.funcao === meu)
    const resp = estado.membros.find((m) => m.funcao === meu && m.papel === 'responsavel')
    $('estats').replaceChildren(
      estat(meu || 'geral', 'Seu setor', meu ? NOME[meu] : 'Sem setor', meu ? `${noSetor.length} ${noSetor.length === 1 ? 'pessoa' : 'pessoas'}${resp ? ` · ${resp.apelido === estado.eu?.apelido ? 'você é o responsável' : `${primeiro(resp.nome)} responde`}` : ''}` : 'Escolha um setor'),
      estat('som', 'Equipe', `${estado.membros.length} ${estado.membros.length === 1 ? 'pessoa' : 'pessoas'}`, `${estado.pessoas.length} no ar agora`),
      estat('producao', 'Seu papel', PAPEL[estado.eu?.papel || d.papel] || 'Equipe', estado.eu?.silenciado ? 'Silenciado agora' : 'Pode falar'),
      estat('direcao', 'Código', d.codigo, 'Chame a equipe pelo QR'),
    )
  }
  $('lista-inicio').replaceChildren(...(estado.diarias.length ? estado.diarias.slice(0, 5).map(linhaDiaria) : [h('li', { class: 'vazio' }, 'Nenhuma diária ainda.')]))
}
function estat(canal, rotulo, valor, sub) {
  return h('div', { class: 'cartao estat' }, h('div', { class: 'estat-topo' }, ico(canal), h('div', {}, h('small', {}, rotulo), h('b', {}, valor))), h('span', {}, sub))
}
function papelDaFrase() {
  const e = estado.eu || estado.diaria || {}
  if (e.papel === 'dono') return 'Você criou esta diária e pode tudo.'
  if (e.papel === 'responsavel') return `Você responde pela ${NOME[e.funcao] || 'equipe'}.`
  if (e.papel === 'convidado') return 'Você entrou como convidado: só ouve.'
  return e.funcao ? `Você está na ${NOME[e.funcao]}.` : 'Escolha o seu setor.'
}

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

// ───────── abrir uma diária ─────────
async function abrirDiaria(d) {
  if (estado.diaria && estado.diaria.id !== d.id) sairDoRadio()
  const iceServers = await servidoresIce()
  mostrarErro('diarias-erro', '')
  const nova = estado.diaria?.id !== d.id
  estado.diaria = d
  if (nova) {
    estado.ultimoAviso = null
    estado.avisosVistos.clear()
    estado.escuta = new Set(['geral', ...(d.funcao ? [d.funcao] : [])])
    estado.alvo = alvoPadrao(d)
    estado.todos = false
    estado.paraMim = new Set(JSON.parse(ler(`rd_mim_${d.id}`) || '[]'))
    estado.malha = new Malha({
      eu: estado.peer,
      iceServers,
      enviarSinal: (para, tipo, dados) => {
        estado.saida.push({ para, tipo, dados })
        bater()
      },
      aoMudar: () => estado.pagina === 'noar' && desenharPessoas(),
      aoRecado: recado,
      aoAbrir: (peer) => estado.malha.enviar(peer, { t: 'escuta', canais: [...estado.escuta] }),
    })
    if (estado.trilha) estado.malha.usarMicrofone(estado.trilha)
    montarCanais()
  }
  desenharCasca()
  ir('noar')
  if (!d.funcao) abrirSetores()
  bater()
  if (nova) carregarDiarias()
}
/** Desliga o rádio: fecha as conexões e o microfone (some o ponto laranja do iPhone); a pessoa segue na diária. */
function desligar() {
  sairDoRadio()
  estado.trilha?.stop()
  estado.trilha = null
  estado.medidorMic = null
  estado.ligado = false
  estado.trava?.release?.().catch(() => {})
  history.replaceState(null, '', `${INICIO}#diarias`)
  carregarDiarias().then(() => ir('diarias'))
}
function sairDoRadio() {
  clearTimeout(estado.laco)
  estado.laco = null
  calar()
  estado.malha?.fecharTodas()
  estado.malha = null
  estado.diaria = null
  estado.eu = null
  estado.pessoas = []
  estado.membros = []
  estado.silenciados.clear()
  estado.maos.clear()
  estado.noAr.clear()
  estado.escutaDe.clear()
  desenharCasca()
}

/** Para onde a pessoa fala ao entrar: quem pode falar no Geral começa nele; a equipe, no próprio setor. */
function alvoPadrao(d = estado.diaria) {
  return falaNoGeral(d) || !d?.funcao ? 'geral' : d.funcao
}
const falaNoGeral = (e = estado.eu || estado.diaria) => Boolean(e && (e.papel === 'dono' || e.papel === 'responsavel' || e.funcao === 'direcao'))
const podeTodos = (e = estado.eu || estado.diaria) => Boolean(e && (e.papel === 'dono' || e.funcao === 'direcao'))
/** Canais em que eu posso falar. */
function podeFalarEm(canal) {
  const e = estado.eu || estado.diaria
  if (!e || e.papel === 'convidado') return false
  if (falaNoGeral(e)) return true
  return canal === e.funcao
}
const possoFalar = () => Boolean(estado.trilha && estado.eu && !estado.eu.silenciado && estado.eu.papel !== 'convidado' && (estado.todos || podeFalarEm(estado.alvo)))

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
  $('base').hidden = estado.pagina !== 'noar'
  $('fala-cel').hidden = $('base').hidden
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
/** Com a trava, quem já tem setor não troca sozinho (o dono move). */
const setorTravado = () => Boolean(estado.ajustes?.setorTravado && !(estado.eu || estado.diaria)?.dono && (estado.eu?.funcao ?? estado.diaria?.funcao))
function abrirSetores() {
  const atual = estado.eu?.funcao ?? estado.diaria?.funcao
  $('setores').replaceChildren(
    ...SETORES.map(([id, nome]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === atual), dataset: { canal: id }, onclick: () => escolherSetor(id) }, h('span', { class: 'ico' }, icSetor(id)), nome),
    ),
  )
  if (!$('setor-folha').open) $('setor-folha').showModal()
}
$('setor-folha').addEventListener('click', (e) => e.target === $('setor-folha') && (estado.eu?.funcao ?? estado.diaria?.funcao) && $('setor-folha').close())
async function escolherSetor(id) {
  const r = await api(`${API}/diarias`, { acao: 'funcao', diaria: estado.diaria.id, funcao: id })
  if (!r.ok) {
    $('setor-folha').close()
    estado.erroAte = Date.now() + 4000
    return mostrarErro('radio-erro', r.erro === 'travado' ? 'O setor está travado. Peça para o dono mover você.' : 'Não deu para trocar de setor.')
  }
  const antigo = estado.diaria.funcao
  estado.diaria.funcao = id
  if (estado.eu) estado.eu.funcao = id
  if (antigo && antigo !== id) estado.escuta.delete(antigo)
  estado.escuta.add(id)
  if (!falaNoGeral() || estado.alvo === antigo) estado.alvo = alvoPadrao()
  $('setor-folha').close()
  anunciarEscuta()
  montarCanais()
  bater()
}

// ───────── no ar: os canais ─────────
function montarCanais() {
  const meu = estado.diaria?.funcao
  const ordem = [CANAIS[0], ...(meu ? [CANAIS.find(([id]) => id === meu)] : []), ...CANAIS.slice(1).filter(([id]) => id !== meu)]
  $('canais').replaceChildren(
    ...ordem.map(([id, nome]) =>
      h(
        'article',
        { class: 'cartao canal', dataset: { canal: id }, onclick: (e) => !e.target.closest('button') && estado.modo === 'mudo' && escolherAlvo(id) },
        h(
          'div',
          { class: 'canal-topo' },
          ico(id),
          h('div', { class: 'canal-corpo' }, h('div', { class: 'canal-nome' }, h('b', {}, nome), id === meu ? h('span', { class: 'chip' }, 'seu') : null, h('span', { class: 'chip canal-calado', hidden: true }, icone('micoff', 'ic ic--p'), 'silenciado')), h('div', { class: 'canal-sub' })),
          h('button', { class: 'redondo', type: 'button', dataset: { ouvir: id }, 'aria-label': `Ouvir ${nome}`, title: 'Ouvir', onclick: () => alternarEscuta(id) }, icone('ouvir')),
          h('button', { class: 'redondo', type: 'button', dataset: { alvo: id }, 'aria-label': `Falar para ${nome}`, title: 'Falar para este canal', onclick: () => escolherAlvo(id) }, icone('falar')),
        ),
        h('div', { class: 'medidor', 'aria-hidden': 'true' }, ...Array.from({ length: PONTOS }, () => h('i'))),
      ),
    ),
  )
  desenharCanais()
  desenharBase()
}
function alternarEscuta(id) {
  if (estado.escuta.has(id)) estado.escuta.delete(id)
  else estado.escuta.add(id)
  anunciarEscuta()
  desenharCanais()
}
const anunciarEscuta = () => estado.malha?.avisar({ t: 'escuta', canais: [...estado.escuta] })
function escolherAlvo(id) {
  if (!podeFalarEm(id)) {
    estado.erroAte = Date.now() + 3000
    const e = estado.eu || estado.diaria
    return mostrarErro('radio-erro', e?.papel === 'convidado' ? 'Convidado só ouve.' : 'A equipe fala no próprio setor. O Geral é do dono, da Direção e dos responsáveis.')
  }
  estado.alvo = id
  estado.todos = false
  if (estado.modo !== 'mudo') falarAgora()
  desenharCanais()
  desenharBase()
}
function escutaDe(peer) {
  const dita = estado.escutaDe.get(peer)
  if (dita) return dita
  const p = estado.pessoas.find((x) => x.peer === peer)
  return new Set(['geral', ...(p?.funcao ? [p.funcao] : [])])
}
const ouvintes = (canal) => estado.pessoas.filter((p) => !p.eu && escutaDe(p.peer).has(canal)).length
/** O setor está calado: o silêncio do set (menos a Direção, e o Som no Gravando) ou o silêncio do próprio setor. */
function setorCalado(id) {
  const t = estado.silencio.todos
  if (t && id !== 'direcao' && id !== 'geral' && !(t.motivo === 'gravando' && id === 'som')) return true
  return estado.silencio.setores.includes(id)
}

function desenharCanais() {
  for (const f of $('canais').children) {
    const id = f.dataset.canal
    f.classList.toggle('is-alvo', !estado.todos && estado.alvo === id)
    f.classList.toggle('is-surda', !estado.escuta.has(id))
    f.querySelector('[data-ouvir]').setAttribute('aria-pressed', String(estado.escuta.has(id)))
    const falar = f.querySelector('[data-alvo]')
    falar.setAttribute('aria-pressed', String(!estado.todos && estado.alvo === id))
    falar.disabled = !podeFalarEm(id)
    f.querySelector('.canal-calado').hidden = !setorCalado(id)
  }
  pintarNiveis()
}
function niveisPorCanal() {
  const agora = Date.now()
  const porCanal = new Map()
  const falas = [...estado.noAr.entries()]
  if (estado.modo !== 'mudo') falas.push(['eu', { nome: 'Você', canal: estado.todos ? 'todos' : estado.alvo, nivel: ultimoNivel, visto: agora, minha: true }])
  for (const [peer, f] of falas) {
    if (!f.minha && agora - f.visto > 1500) {
      estado.noAr.delete(peer)
      continue
    }
    for (const c of f.canal === 'todos' ? CANAIS.map(([id]) => id) : [f.canal]) {
      const atual = porCanal.get(c) || { nivel: 0, nomes: [] }
      atual.nivel = Math.max(atual.nivel, f.nivel)
      atual.nomes.push(f.nome)
      porCanal.set(c, atual)
    }
  }
  return porCanal
}
function pintarNiveis() {
  const porCanal = niveisPorCanal()
  for (const f of $('canais').children) {
    const id = f.dataset.canal
    const c = porCanal.get(id)
    const ouvindo = estado.escuta.has(id) || c?.nomes.length
    f.classList.toggle('is-no-ar', Boolean(c && ouvindo))
    const n = c && ouvindo ? Math.max(1, Math.round(escala(c.nivel) * PONTOS)) : 0
    f.querySelectorAll('.medidor i').forEach((p, k) => {
      p.classList.toggle('aceso', k < n)
      p.classList.toggle('alto', k < n && k >= PONTOS - 3)
    })
    const sub = f.querySelector('.canal-sub')
    if (c && ouvindo) {
      sub.replaceChildren(icone('falar', 'ic ic--p'), c.nomes.join(', '))
      continue
    }
    const q = id === 'geral' ? estado.pessoas.length : estado.pessoas.filter((p) => p.funcao === id).length
    if (id === 'geral') sub.replaceChildren(icone('gente', 'ic ic--p'), `todos · ${q} no ar`)
    else {
      const resp = estado.membros.find((m) => m.funcao === id && m.papel === 'responsavel')
      const ouve = ouvintes(id)
      sub.replaceChildren(...(resp ? [avatar(resp.nome, 'av--p'), `${primeiro(resp.nome)} · responsável`, h('i', {}, ' · ')] : []), `${q} no ar${ouve > q ? ` · ${ouve} ouvindo` : ''}`)
    }
  }
}

function desenharBase() {
  const alvo = estado.todos ? 'todos' : estado.alvo
  const el = $('alvo-nome')
  el.textContent = NOME[alvo]
  el.dataset.canal = alvo === 'todos' ? 'geral' : alvo
  for (const b of [$('ptt'), $('ptt-aba')]) {
    b.dataset.estado = estado.modo
    b.dataset.canal = alvo === 'todos' ? 'geral' : alvo
    b.disabled = !estado.ligado || !possoFalar()
  }
  $('todos').hidden = !podeTodos()
  $('todos').setAttribute('aria-pressed', String(estado.todos))
  const calado = estado.eu?.silenciado || estado.eu?.papel === 'convidado'
  $('base-dica').hidden = podeTodos() && !calado
  $('base-dica').replaceChildren(...(calado ? [estado.eu?.papel === 'convidado' ? 'Você só ouve' : 'Silenciado'] : estado.modo === 'aberto' ? ['Toque fecha'] : ['Toque abre', h('br'), 'Segure fala']))
  $('ptt-texto').textContent = calado ? 'Silenciado' : estado.modo === 'aberto' ? 'Aberto' : estado.modo === 'ptt' ? 'Falando' : 'Falar'
  // celular: para quem fala, acima das abas; falando, a barra acende e o canal escolhido brilha (a tela não muda)
  const canal = alvo === 'todos' ? 'geral' : alvo
  const falando = estado.modo !== 'mudo'
  $('fala-cel-nome').textContent = calado ? (estado.eu?.papel === 'convidado' ? 'Você só ouve' : 'Silenciado') : NOME[alvo]
  $('fala-cel-nome').dataset.canal = canal
  $('fala-cel').dataset.canal = canal
  $('fala-cel').toggleAttribute('data-falando', falando)
  $('fala-cel-rotulo').textContent = falando ? (estado.modo === 'aberto' ? 'Aberto para' : 'Falando para') : 'Falar para'
  $('todos-cel').hidden = !podeTodos() || falando
  $('todos-cel').setAttribute('aria-pressed', String(estado.todos))
  // a dica diz o que o botão faz agora: segurar fala; aberto, um toque fecha (falando, o canal não troca por toque)
  const ouvem = estado.todos ? estado.pessoas.filter((p) => !p.eu).length : ouvintes(estado.alvo)
  $('fala-cel-sub').textContent = calado ? '' : estado.modo === 'aberto' ? 'Toque no botão para fechar' : falando ? (ouvem ? `${ouvem} ouvindo` : 'Ninguém ouvindo') : 'Segure para falar'
  document.documentElement.toggleAttribute('data-falando', falando)
  desenharFalando()
}
$('todos-cel').addEventListener('click', () => $('todos').click())
$('todos').addEventListener('click', () => {
  if (!podeTodos()) return
  estado.todos = !estado.todos
  if (estado.modo !== 'mudo') falarAgora()
  desenharCanais()
  desenharBase()
})
function desenharFalando() {
  const el = $('no-ar')
  const falas = [...estado.noAr.values()]
  if (estado.modo !== 'mudo') el.textContent = `Você · ${NOME[estado.todos ? 'todos' : estado.alvo]}`
  else if (falas.length) el.textContent = falas.map((f) => `${f.nome} · ${NOME[f.canal] || 'Geral'}`).join(', ')
  else el.textContent = ''
  el.classList.toggle('falando', Boolean(estado.modo !== 'mudo' || falas.length))
}

// ───────── no ar: a página ─────────
function desenharNoAr() {
  const d = estado.diaria
  $('noar-vazio').hidden = Boolean(d)
  $('noar').hidden = !d
  if (!d) return
  $('diaria-nome').textContent = d.nome
  $('diaria-papel').textContent = `· ${PAPEL[estado.eu?.papel || d.papel] || 'Equipe'}`
  $('noar-conta').textContent = `no ar · ${estado.pessoas.length}`
  // gravando é estado: liga no Gravando, desliga no Corta (o botão mostra e um toque corta)
  $('gravando-chip').hidden = !estado.gravando
  const grav = $('avisos').querySelector('[data-aviso="acao"]')
  grav.dataset.ativo = estado.gravando ? '1' : ''
  grav.textContent = estado.gravando && podeTodos() ? 'Gravando · cortar' : 'Gravando'
  $('codigo').textContent = d.codigo
  $('avisos').hidden = !(estado.eu?.podeAvisar || estado.eu?.podeModerar)
  for (const b of $('avisos').querySelectorAll('[data-aviso]')) b.hidden = !estado.eu?.podeAvisar
  // eu silenciado
  const s = estado.eu?.silenciado
  $('eu-calado').hidden = !s
  if (s) {
    $('eu-calado-titulo').textContent =
      s.motivo === 'convidado' ? 'Você entrou como convidado' : s.motivo === 'gravando' ? 'Gravando: silêncio no set' : s.motivo === 'manual' ? `${s.por ? primeiro(s.por) : 'O dono'} travou a fala` : s.motivo === 'setor' ? 'A fala do seu setor está travada' : s.por ? `${primeiro(s.por)} silenciou você` : 'Você está silenciado'
    const ate = s.ate ? new Date(s.ate) : null
    $('eu-calado-sub').textContent = s.motivo === 'convidado' ? 'Você ouve tudo. Para falar, o dono muda o seu papel.' : `Você continua ouvindo.${ate ? ` Volta às ${ate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : ''}`
    const jaPediu = estado.maos.has(estado.eu.apelido)
    $('pedir-palavra').hidden = s.motivo === 'convidado' || !estado.ajustes?.pedirPalavra
    $('pedir-palavra').disabled = jaPediu
    $('pedir-palavra').lastChild.textContent = jaPediu ? 'Pediu a palavra' : 'Pedir a palavra'
  }
  // silêncio do set (ou do meu setor)
  const todos = estado.silencio.todos
  const meuSetor = estado.eu?.funcao && estado.silencio.setores.includes(estado.eu.funcao)
  const algum = todos || estado.silencio.setores.length
  // quem foi calado pela trava já vê o aviso dele; a faixa do set fica para quem modera e para quem segue falando
  $('silencio-set').hidden = !algum || (!todos && !meuSetor && !estado.eu?.dono) || Boolean(s && s.motivo !== 'pessoa' && !estado.eu?.podeModerar)
  if (algum) {
    $('silencio-titulo').textContent = todos ? 'Silêncio no set' : `Silêncio na ${estado.silencio.setores.map((x) => NOME[x] || 'equipe').join(', ')}`
    $('silencio-sub').textContent = todos ? (todos.motivo === 'gravando' ? 'Só Direção e Som falam · ligou com o Gravando, sai no Corta' : `Fala travada · só o dono e a Direção falam · ${primeiro(todos.por)} travou`) : 'Fala travada · só o responsável do setor fala'
    const maos = [...estado.maos].map((a) => estado.membros.find((m) => m.apelido === a)?.nome).filter(Boolean)
    $('silencio-maos').hidden = !maos.length || !estado.eu?.podeModerar
    $('silencio-maos').replaceChildren(icone('mao', 'ic ic--p'), maos.length === 1 ? `${primeiro(maos[0])} pediu a palavra` : `${maos.length} pediram a palavra`)
    $('reativar-todos').hidden = !(estado.eu?.dono || (estado.eu?.papel === 'responsavel' && !todos))
  }
  // travar a fala: o dono cala o set (ele e a Direção seguem falando); o responsável, o setor dele
  const travada = Boolean(estado.eu?.dono ? todos : estado.silencio.setores.includes(estado.eu?.funcao))
  const rotuloTrava = estado.eu?.dono ? 'Travar a fala' : `Travar a ${NOME[estado.eu?.funcao] || 'equipe'}`
  for (const b of [$('silenciar-todos'), $('travar-fala')]) {
    b.hidden = !estado.eu?.podeModerar || travada
    b.lastChild.textContent = rotuloTrava
  }
  desenharCanais()
  desenharPessoas()
  desenharBase()
}

const membroDe = (apelido) => estado.membros.find((m) => m.apelido === apelido)
const calado = (apelido) => estado.silenciados.has(apelido)

function desenharPessoas() {
  if (!estado.diaria) return
  // uma linha por pessoa (vários aparelhos da mesma conta contam uma vez)
  const vistos = new Set()
  const linhas = []
  for (const p of estado.pessoas) {
    if (vistos.has(p.apelido)) continue
    vistos.add(p.apelido)
    const falando = [...estado.noAr.entries()].some(([peer]) => estado.pessoas.find((x) => x.peer === peer)?.apelido === p.apelido)
    const meu = p.apelido === estado.eu?.apelido
    const st = meu ? 'ligado' : (estado.malha?.estado(p.peer) ?? 'sem')
    const mao = estado.maos.has(p.apelido)
    const situacao = falando ? 'falando' : mao ? 'pediu a palavra' : calado(p.apelido) ? (membroDe(p.apelido)?.papel === 'convidado' ? 'convidado' : 'silenciado') : estado.paraMim.has(p.apelido) ? 'silenciado para você' : 'ouvindo'
    linhas.push(
      h(
        'li',
        {},
        h(
          'button',
          { class: 'pessoa', type: 'button', dataset: { estado: st, mao: mao ? '1' : '', calado: calado(p.apelido) ? '1' : '' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => abrirMenuPessoa(p.apelido, e.currentTarget) },
          h('span', { class: 'av-casa' }, avatar(p.nome)),
          h('div', {}, h('b', {}, meu ? 'Você' : p.nome), h('small', { dataset: { canal: p.funcao || 'geral' } }, h('span', { class: 'ponto' }), `${p.funcao ? NOME[p.funcao] : 'Sem setor'} · ${situacao}`)),
          mao ? h('span', { class: 'mao' }, icone('mao', 'ic ic--p')) : calado(p.apelido) ? icone('micoff', 'ic ic--p') : null,
        ),
      ),
    )
  }
  $('pessoas').replaceChildren(...linhas)
  $('pessoas-cel').replaceChildren(
    ...[...vistos].map((apelido) => {
      const p = estado.pessoas.find((x) => x.apelido === apelido)
      const meu = apelido === estado.eu?.apelido
      const falando = [...estado.noAr.keys()].some((peer) => estado.pessoas.find((x) => x.peer === peer)?.apelido === apelido)
      return h(
        'li',
        {},
        h(
          'button',
          { type: 'button', class: 'pessoa-cel', dataset: { canal: p.funcao || 'geral', mao: estado.maos.has(apelido) ? '1' : '', calado: calado(apelido) ? '1' : '', falando: falando ? '1' : '' }, 'aria-label': `${meu ? 'Você' : p.nome}${p.funcao ? `, ${NOME[p.funcao]}` : ''}`, onclick: (e) => abrirMenuPessoa(apelido, e.currentTarget) },
          h('span', { class: 'av-casa' }, avatar(p.nome, 'av--g')),
          h('span', {}, meu ? 'Você' : primeiro(p.nome)),
        ),
      )
    }),
  )
  $('pessoas-conta').textContent = `${vistos.size} de ${estado.membros.length}`
  pintarNiveis()
}

// ───────── moderação ─────────
/** O que eu posso fazer com uma pessoa (o banco confere de novo: radio.moderar). */
function poderesSobre(t) {
  const e = estado.eu
  if (!e || !t || t.apelido === e.apelido) return { nada: true }
  const imune = t.papel === 'dono' || t.funcao === 'direcao'
  const dono = e.papel === 'dono'
  const doSetor = e.papel === 'responsavel' && t.funcao === e.funcao && ['equipe', 'convidado'].includes(t.papel)
  return { silenciar: !imune && (dono || doSetor), tirar: t.papel !== 'dono' && (dono || doSetor), dono, doSetor, imune }
}
async function moderar(acao, extra = {}) {
  const r = await api(`${API}/moderar`, { diaria: estado.diaria.id, acao, ...extra })
  if (!r.ok) estado.erroAte = Date.now() + 4000
  if (!r.ok) mostrarErro('radio-erro', r.erro === 'imune' ? 'Ninguém silencia o dono nem a Direção.' : r.erro === 'sem_permissao' ? 'Você não tem esse poder nesta diária.' : 'Não deu certo. Tente de novo.')
  fecharFlutuantes()
  bater()
  return r
}
function fecharFlutuantes() {
  $('menu-pessoa').hidden = true
  $('apps').hidden = true
  $('apps-btn').setAttribute('aria-expanded', 'false')
  for (const b of document.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]')) b.setAttribute('aria-expanded', 'false')
}
function abrirMenuPessoa(apelido, botao) {
  const t = membroDe(apelido)
  const p = poderesSobre(t)
  if (!t) return
  const menu = $('menu-pessoa')
  const acao = (ic, texto, fn, extra = {}) => h('button', { class: `acao${extra.perigo ? ' acao--perigo' : ''}`, type: 'button', role: 'menuitem', onclick: fn }, icone(ic), texto, extra.dica ? h('small', {}, extra.dica) : null)
  const itens = []
  const ehEu = apelido === estado.eu?.apelido
  if (!ehEu && p.silenciar) {
    if (calado(apelido) || estado.maos.has(apelido)) itens.push(acao('falar', estado.maos.has(apelido) ? 'Dar a palavra' : 'Reativar', () => moderar('reativar', { alvo: apelido })))
    if (!estado.silenciados.get(apelido) || estado.silenciados.get(apelido).motivo !== 'pessoa') {
      itens.push(
        h('div', {}, h('div', { class: 'acao', role: 'presentation' }, icone('micoff'), p.doSetor ? `Silenciar para a ${NOME[estado.eu.funcao]}` : 'Silenciar para todos')),
        h('div', { class: 'tempos' }, ...[['5 min', 5], ['15 min', 15], ['Até eu reativar', 0]].map(([r, m]) => h('button', { type: 'button', onclick: () => moderar('silenciar', { alvo: apelido, minutos: m }) }, r))),
      )
    }
  }
  if (!ehEu) {
    const mim = estado.paraMim.has(apelido)
    itens.push(acao('fone', mim ? 'Voltar a ouvir' : 'Silenciar só para mim', () => {
      if (mim) estado.paraMim.delete(apelido)
      else estado.paraMim.add(apelido)
      guardar(`rd_mim_${estado.diaria.id}`, JSON.stringify([...estado.paraMim]))
      aplicarSilencio()
      fecharFlutuantes()
      desenharPessoas()
    }, { dica: 'ninguém vê' }))
  }
  if (ehEu && !setorTravado()) itens.push(acao('setores', 'Trocar meu setor', () => (fecharFlutuantes(), abrirSetores())))
  if (ehEu && setorTravado()) itens.push(h('div', { class: 'acao', role: 'presentation' }, icone('cadeado'), 'Setor travado pelo dono'))
  if (p.dono && !ehEu) {
    itens.push(
      h('div', {}, h('div', { class: 'acao', role: 'presentation' }, icone('mover'), 'Mover para outro setor')),
      h('div', { class: 'setores-menu' }, ...SETORES.filter(([id]) => id !== t.funcao).map(([id, nome]) => h('button', { type: 'button', dataset: { canal: id }, onclick: () => moderar('mover', { alvo: apelido, valor: id }) }, h('span', { class: 'ponto' }), nome))),
    )
    if (t.funcao && t.papel !== 'responsavel' && t.papel !== 'dono') itens.push(acao('escudo', `Tornar responsável da ${NOME[t.funcao]}`, () => moderar('responsavel', { alvo: apelido })))
    if (t.papel === 'equipe') itens.push(acao('fone', 'Tornar convidado (só ouve)', () => moderar('papel', { alvo: apelido, valor: 'convidado' })))
    if (t.papel === 'convidado') itens.push(acao('falar', 'Deixar falar (equipe)', () => moderar('papel', { alvo: apelido, valor: 'equipe' })))
  }
  if (!ehEu && p.tirar) itens.push(h('div', { class: 'divisor' }), acao('sair', p.dono ? 'Tirar da diária' : 'Tirar do setor', () => moderar('tirar', { alvo: apelido }), { perigo: true }))
  menu.replaceChildren(
    h('svg', {}),
    h('div', { class: 'balao-caixa' }, h('div', { class: 'balao-cabeca' }, avatar(t.nome, 'av--g'), h('div', {}, h('b', {}, ehEu ? `${t.nome} (você)` : t.nome), h('small', {}, [t.funcao ? NOME[t.funcao] : 'Sem setor', PAPEL[t.papel]].join(' · ')))), ...itens),
  )
  // a ponta do balão, apontando para a pessoa
  const ponta = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  ponta.setAttribute('class', 'balao-ponta')
  ponta.setAttribute('viewBox', '0 0 11 22')
  const pp = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  pp.setAttribute('d', 'M0 0 9.5 9a3 3 0 0 1 0 4L0 22z')
  pp.setAttribute('fill', 'currentColor')
  ponta.append(pp)
  menu.firstChild.replaceWith(ponta)
  menu.hidden = false
  const r = botao.getBoundingClientRect()
  const alto = menu.offsetHeight
  const topo = Math.max(12, Math.min(window.innerHeight - alto - 12, r.top + r.height / 2 - 34))
  menu.style.left = `${Math.max(12, r.left - 330 - 14)}px`
  menu.style.top = `${topo}px`
  ponta.style.right = '-10px'
  ponta.style.top = `${Math.max(14, Math.min(alto - 36, r.top + r.height / 2 - topo - 11))}px`
  botao.setAttribute('aria-expanded', 'true')
}
document.addEventListener('pointerdown', (e) => {
  if (!$('menu-pessoa').hidden && !$('menu-pessoa').contains(e.target) && !e.target.closest('.pessoa, .linha-pessoa')) fecharFlutuantes()
  if (!$('apps').hidden && !$('apps').contains(e.target) && !e.target.closest('#apps-btn')) fecharFlutuantes()
})
document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharFlutuantes())
$('silenciar-todos').addEventListener('click', () => moderar('silenciar_todos'))
$('travar-fala').addEventListener('click', () => moderar('silenciar_todos'))
$('reativar-todos').addEventListener('click', () => moderar('reativar_todos'))
$('pedir-palavra').addEventListener('click', () => moderar('mao'))

/** Silêncio: meu microfone fecha se fui silenciado; a voz de quem está silenciado (ou silenciei para mim) não toca. */
function aplicarSilencio() {
  if (estado.modo !== 'mudo' && !possoFalar()) calar()
  const calar_ = new Set()
  for (const p of estado.pessoas) if (!p.eu && (calado(p.apelido) || estado.paraMim.has(p.apelido))) calar_.add(p.peer)
  estado.malha?.calarDe(calar_)
  for (const peer of calar_) estado.noAr.delete(peer)
}

// ───────── batida: presença, sinais, papéis, silêncio e avisos perdidos ─────────
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
    const antes = estado.eu
    estado.eu = r.eu
    estado.pessoas = r.pessoas
    estado.membros = r.membros
    estado.silenciados = new Map(r.silenciados.map((s) => [s.apelido, s]))
    estado.maos = new Set(r.maos)
    estado.silencio = r.silencio
    estado.ajustes = r.ajustes
    estado.gravando = r.gravando ?? null
    const setoresMudaram = Array.isArray(r.setores) && aplicarSetores(r.setores)
    diaria.papel = r.eu.papel
    diaria.dono = r.eu.dono
    if (diaria.funcao !== r.eu.funcao || setoresMudaram) {
      if (diaria.funcao !== r.eu.funcao) {
        if (diaria.funcao) estado.escuta.delete(diaria.funcao)
        if (r.eu.funcao) estado.escuta.add(r.eu.funcao)
        anunciarEscuta()
      }
      diaria.funcao = r.eu.funcao
      for (const c of [...estado.escuta]) if (!Object.hasOwn(NOME, c)) estado.escuta.delete(c)
      montarCanais()
      if (!r.eu.funcao && estado.ligado) abrirSetores()
    }
    if (!podeFalarEm(estado.alvo)) estado.alvo = alvoPadrao()
    if (estado.todos && !podeTodos()) estado.todos = false
    estado.malha.atualizar(r.pessoas.map((p) => p.peer))
    for (const s of r.sinais) estado.malha.receber(s.de, s.tipo, s.dados)
    for (const a of r.avisos) mostrarAviso(a)
    estado.ultimoAviso = Math.max(estado.ultimoAviso ?? 0, r.ultimoAviso)
    for (const peer of estado.noAr.keys()) if (!r.pessoas.some((p) => p.peer === peer)) estado.noAr.delete(peer)
    for (const peer of estado.escutaDe.keys()) if (!r.pessoas.some((p) => p.peer === peer)) estado.escutaDe.delete(peer)
    aplicarSilencio()
    if (!antes || antes.papel !== r.eu.papel || antes.funcao !== r.eu.funcao || setoresMudaram) desenharCasca()
    if (estado.pagina === 'noar') desenharNoAr()
    else if (estado.pagina === 'equipe') desenharEquipe()
    // a lista de setores não redesenha com um seletor aberto (a pessoa está escolhendo), a não ser que os setores mudem
    else if (estado.pagina === 'setores' && (setoresMudaram || !document.activeElement?.matches?.('#pg-setores select'))) desenharSetores()
    else if (estado.pagina === 'inicio') desenharInicio()
    desenharBase()
    if (!(estado.erroAte > Date.now())) mostrarErro('radio-erro', '')
  } else if (r?.status === 403) {
    sairDoRadio()
    await carregarDiarias()
    return ir('diarias')
  } else if (r) {
    mostrarErro('radio-erro', 'Sem conexão com o servidor. Tentando de novo.')
  }
  estado.laco = setTimeout(bater, document.visibilityState === 'visible' ? BATIDA_MS : BATIDA_ESCONDIDO_MS)
}

// ───────── falar: o TALK ─────────
const deveOuvir = (peer) => (estado.todos ? true : escutaDe(peer).has(estado.alvo))
function falarAgora() {
  if (!estado.trilha || !estado.malha || !possoFalar()) return
  estado.malha.falar({ nome: estado.eu?.nome || 'Alguém', canal: estado.todos ? 'todos' : estado.alvo }, deveOuvir)
}
function abrirMic(modo) {
  if (!possoFalar() || !estado.malha) return
  const estava = estado.modo
  estado.modo = modo
  if (estava === 'mudo') {
    somComeca()
    falarAgora()
  }
  desenharBase()
  pintarNiveis()
}
function calar() {
  if (estado.modo === 'mudo') return
  estado.modo = 'mudo'
  estado.malha?.calar()
  somTermina()
  desenharBase()
}
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
for (const ptt of [$('ptt'), $('ptt-aba')]) {
  ptt.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (!estado.diaria) return ir('diarias')
    if (!estado.ligado) return ir('noar')
    ptt.setPointerCapture?.(e.pointerId)
    apertar()
  })
  ptt.addEventListener('pointerup', soltar)
  ptt.addEventListener('pointercancel', () => {
    estado.apertou = 0
    if (estado.modo === 'ptt') calar()
  })
  ptt.addEventListener('contextmenu', (e) => e.preventDefault())
}
// no computador: a barra de espaço é o TALK (toque trava, segurar fala)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && estado.pagina === 'noar' && estado.ligado && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && !document.querySelector('dialog[open]')) {
    e.preventDefault()
    apertar()
  }
})
document.addEventListener('keyup', (e) => e.code === 'Space' && soltar())
window.addEventListener('blur', () => estado.modo === 'ptt' && calar())

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
  $('talk-nivel').style.strokeDashoffset = String(339.3 * (1 - (estado.modo === 'mudo' ? 0 : escala(ultimoNivel))))
  if (estado.modo !== 'mudo') estado.malha?.avisar({ t: 'nivel', v: Math.round(v * 1000) / 1000 })
  if (estado.diaria && estado.ligado && estado.pagina === 'noar') pintarNiveis()
}, 100)

// ───────── recados de outros aparelhos ─────────
function recado(peer, msg) {
  const quieto = estado.malha?.calados.has(peer)
  if (msg.t === 'fala' && typeof msg.nome === 'string') {
    if (quieto) return
    const canal = Object.hasOwn(NOME, msg.canal) ? msg.canal : 'geral'
    if (!estado.noAr.has(peer)) somComeca()
    estado.noAr.set(peer, { nome: msg.nome.slice(0, 60), canal, nivel: 0.05, visto: Date.now() })
    desenharFalando()
  } else if (msg.t === 'nivel') {
    const f = estado.noAr.get(peer)
    if (f && Number.isFinite(msg.v)) {
      f.nivel = Math.max(0, Math.min(1, msg.v))
      f.visto = Date.now()
    }
  } else if (msg.t === 'fim') {
    if (estado.noAr.delete(peer)) somTermina()
    desenharFalando()
  } else if (msg.t === 'escuta' && Array.isArray(msg.canais)) {
    estado.escutaDe.set(peer, new Set(msg.canais.filter((c) => Object.hasOwn(NOME, c)).slice(0, 10)))
    estado.malha?.reavaliar(peer)
    pintarNiveis()
  } else if (msg.t === 'aviso' && Number.isSafeInteger(msg.id) && AVISOS[msg.tipo]) {
    // aviso para um setor só toca em quem é dele (e no dono e na Direção); o servidor também filtra na batida
    const s = msg.setor ?? null
    if (s && s !== estado.eu?.funcao && !podeTodos()) return
    mostrarAviso({ id: msg.id, tipo: msg.tipo, de: String(msg.de || '').slice(0, 60), setor: s })
  }
}

// ───────── avisos de set ─────────
let avisoTempo = null
function mostrarAviso(a) {
  if (estado.avisosVistos.has(a.id)) return
  estado.avisosVistos.add(a.id)
  estado.ultimoAviso = Math.max(estado.ultimoAviso ?? 0, a.id)
  estado.avisosLog.unshift({ ...a, quando: new Date() })
  estado.avisosLog.length = Math.min(estado.avisosLog.length, 30)
  somAviso(a.tipo)
  const tela = $('aviso-tela')
  $('aviso-texto').textContent = AVISOS[a.tipo]
  $('aviso-de').textContent = [a.de, a.setor ? `para a ${NOME[a.setor]}` : null].filter(Boolean).join(' · ')
  tela.dataset.tipo = a.tipo
  tela.hidden = false
  clearTimeout(avisoTempo)
  avisoTempo = setTimeout(() => (tela.hidden = true), 2200)
  $('cue-texto').textContent = AVISOS[a.tipo]
  $('cue').dataset.tipo = a.tipo
  if (estado.pagina === 'avisos') desenharAvisos()
}
$('aviso-tela').addEventListener('click', () => ($('aviso-tela').hidden = true))
async function mandarAviso(tipo, setor = null) {
  const r = await api(`${API}/aviso`, { diaria: estado.diaria.id, tipo, setor })
  if (!r.aviso) return mostrarErro('radio-erro', 'Só o dono, a Direção e os responsáveis mandam aviso.')
  if (!r.aviso.setor && tipo === 'acao') estado.gravando = estado.gravando || new Date().toISOString()
  if (!r.aviso.setor && tipo === 'corta') estado.gravando = null
  if (estado.pagina === 'noar') desenharNoAr()
  estado.malha?.avisar({ t: 'aviso', ...r.aviso })
  mostrarAviso(r.aviso)
  bater()
}
/** Gravando liga e desliga: gravando, o mesmo botão manda o Corta. */
const avisoDoBotao = (tipo) => (tipo === 'acao' && estado.gravando && podeTodos() ? 'corta' : tipo)
for (const b of document.querySelectorAll('#avisos [data-aviso]')) b.addEventListener('click', () => mandarAviso(avisoDoBotao(b.dataset.aviso)))

function desenharAvisos() {
  const d = estado.diaria
  const pode = estado.eu?.podeAvisar
  const geral = podeTodos()
  $('avisos-sub').textContent = !d ? 'Abra uma diária.' : pode ? (geral ? 'Toca na tela de todo mundo.' : `Vai para a ${NOME[estado.eu.funcao] || 'sua equipe'}.`) : 'Só o dono, a Direção e os responsáveis mandam aviso.'
  $('avisos-para-casa').hidden = !(d && pode && geral)
  if (d && pode && geral) {
    const antes = $('avisos-para').value
    $('avisos-para').replaceChildren(h('option', { value: '' }, 'Para todos'), ...SETORES.map(([id, nome]) => h('option', { value: id, selected: id === antes }, `Só ${nome}`)))
  }
  $('avisos-grade').replaceChildren(
    ...(d && pode
      ? Object.entries(AVISOS).map(([tipo, rot]) => {
          const ativo = tipo === 'acao' && estado.gravando && geral
          return h('button', { class: 'aviso-cartao', type: 'button', dataset: { aviso: tipo, ativo: ativo ? '1' : '' }, onclick: () => mandarAviso(ativo ? 'corta' : tipo, ativo || !geral ? null : $('avisos-para').value || null).then(() => desenharAvisos()) }, h('b', {}, ativo ? 'Gravando agora' : rot), h('small', {}, ativo ? 'Toque para cortar' : AVISO_DICA[tipo]))
        })
      : []),
  )
  $('avisos-lista').replaceChildren(
    ...(estado.avisosLog.length
      ? estado.avisosLog.map((a) => h('li', {}, h('b', {}, AVISOS[a.tipo]), ` · ${a.de || ''}${a.setor ? ` para a ${NOME[a.setor]}` : ''} · ${a.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`))
      : [h('li', {}, 'Nenhum aviso desde que você abriu.')]),
  )
}
$('cue-btn').addEventListener('click', () => {
  $('cue').hidden = false
  document.documentElement.requestFullscreen?.().catch(() => {})
})
$('cue-fechar').addEventListener('click', () => {
  $('cue').hidden = true
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
})

// ───────── equipe ─────────
function semDiaria(caixa) {
  caixa.replaceChildren(h('div', { class: 'vazio' }, h('b', {}, 'Nenhuma diária aberta.'), h('button', { class: 'vidro vidro--tinta', type: 'button', onclick: () => ir('diarias') }, 'Abrir uma diária')))
}
function desenharEquipe() {
  const d = estado.diaria
  const caixa = $('equipe-tabela')
  $('equipe-conta').textContent = d ? `· ${estado.membros.length} ${estado.membros.length === 1 ? 'pessoa' : 'pessoas'}` : ''
  $('equipe-sub').textContent = d ? `${estado.pessoas.length} no ar agora. Toque em alguém para ver o que dá para fazer.` : ''
  if (!d) return semDiaria(caixa)
  const linhas = [...estado.membros].sort((a, b) => (a.papel === 'dono' ? -1 : b.papel === 'dono' ? 1 : (a.funcao || 'z').localeCompare(b.funcao || 'z') || a.nome.localeCompare(b.nome)))
  caixa.replaceChildren(
    h('div', { class: 'tabela-linha tabela-cabeca t-equipe' }, h('span', {}, 'Pessoa'), h('span', {}, 'Setor'), h('span', {}, 'Papel'), h('span', {}, 'Agora'), h('span')),
    ...linhas.map((m) => {
      const eu = m.apelido === estado.eu?.apelido
      return h(
        'div',
        { class: 'tabela-linha t-equipe' },
        h('div', { class: 'quem' }, avatar(m.nome, 'av--g'), h('div', {}, h('b', {}, eu ? `${m.nome} (você)` : m.nome), h('small', {}, [m.funcao ? NOME[m.funcao] : 'Sem setor', calado(m.apelido) ? 'silenciado' : estado.maos.has(m.apelido) ? 'pediu a palavra' : m.online ? 'no ar' : null].filter(Boolean).join(' · ')))),
        m.funcao ? h('span', { class: 'chip', dataset: { canal: m.funcao } }, h('span', { class: 'ponto' }), NOME[m.funcao]) : h('span', { class: 'chip' }, 'Sem setor'),
        h('span', { class: 'chip', title: PAPEL[m.papel] }, m.papel === 'dono' ? icone('coroa', 'ic ic--p') : m.papel === 'responsavel' ? icone('escudo', 'ic ic--p') : null, m.papel === 'dono' ? 'Dono' : PAPEL[m.papel]),
        h('span', { class: 'chip' }, h('span', { class: 'ponto', dataset: { canal: m.online ? 'som' : '' } }), m.online ? 'no ar' : 'fora do ar'),
        h('button', { class: 'redondo linha-pessoa', type: 'button', 'aria-label': `Opções de ${m.nome}`, 'aria-haspopup': 'menu', onclick: (e) => abrirMenuPessoa(m.apelido, e.currentTarget) }, icone('ajustes')),
      )
    }),
  )
}

// ───────── setores e responsáveis; poderes ─────────
let abaSetores = 'setores'
$('aba-setores').addEventListener('click', () => ((abaSetores = 'setores'), desenharSetores()))
$('aba-poderes').addEventListener('click', () => ((abaSetores = 'poderes'), desenharSetores(), carregarHistorico()))
function desenharSetores() {
  const d = estado.diaria
  const dono = estado.eu?.dono
  $('setores-titulo').replaceChildren(...(abaSetores === 'setores' ? [h('span', { class: 'leve' }, 'Quem cuida'), ' ', h('span', { class: 'forte' }, 'de cada rádio.')] : [h('span', { class: 'leve' }, 'Quem pode'), ' ', h('span', { class: 'forte' }, 'o quê.')]))
  $('setores-sub').textContent = abaSetores === 'setores' ? (d ? (dono ? 'Toque num setor para renomear, mudar a cor e pôr gente.' : `Só o dono de ${d.nome} mexe nos setores.`) : '') : 'Ninguém silencia o dono nem a Direção.'
  $('novo-setor').hidden = !(dono && d && abaSetores === 'setores')
  $('aba-setores').setAttribute('aria-selected', String(abaSetores === 'setores'))
  $('aba-poderes').setAttribute('aria-selected', String(abaSetores === 'poderes'))
  $('vista-setores').hidden = abaSetores !== 'setores'
  $('vista-poderes').hidden = abaSetores !== 'poderes'
  if (abaSetores === 'setores') {
    if (!d) return semDiaria($('setores-tabela'))
    $('setores-tabela').replaceChildren(
      h('div', { class: 'tabela-linha tabela-cabeca t-setores' }, h('span', {}, 'Setor'), h('span', {}, 'Responsável'), h('span', {}, 'No rádio'), h('span', {}, 'Agora')),
      ...SETORES.map(([id, nome]) => {
        const doSetor = estado.membros.filter((m) => m.funcao === id)
        const resp = doSetor.find((m) => m.papel === 'responsavel')
        const escolhiveis = doSetor.filter((m) => m.papel !== 'dono')
        let celula
        if (dono && escolhiveis.length) {
          const sel = h('select', { class: 'seletor', 'aria-label': `Responsável da ${nome}` }, h('option', { value: '' }, resp ? '' : 'Escolher…'), ...escolhiveis.map((m) => h('option', { value: m.apelido, selected: m.apelido === resp?.apelido }, m.nome)))
          if (resp) sel.firstChild.remove()
          sel.addEventListener('change', () => sel.value && moderar('responsavel', { alvo: sel.value }))
          celula = sel
        } else celula = resp ? h('span', { class: 'quem' }, avatar(resp.nome), h('b', {}, resp.nome)) : h('span', { class: 'sub' }, doSetor.length ? (escolhiveis.length ? 'Ninguém ainda' : 'Só o dono') : 'Ninguém no setor')
        const noAr = doSetor.filter((m) => m.online).length
        const nomeCel = dono
          ? h('button', { class: 'quem setor-nome', type: 'button', 'aria-label': `Editar ${nome}`, onclick: () => abrirEditorSetor(id) }, ico(id, 'ico ico--p'), h('b', {}, nome), icone('lapis', 'ic ic--p'))
          : h('div', { class: 'quem' }, ico(id, 'ico ico--p'), h('b', {}, nome))
        return h('div', { class: 'tabela-linha t-setores' }, nomeCel, celula, h('span', { class: 'chip' }, `${doSetor.length} ${doSetor.length === 1 ? 'pessoa' : 'pessoas'}`), h('span', { class: setorCalado(id) ? 'chip' : 'chip' }, setorCalado(id) ? 'silenciado' : `${noAr} no ar`))
      }),
    )
    const papel = (ic, canal, t, s) => h('div', { class: 'papel' }, h('span', { class: 'ico ico--p', dataset: { canal } }, icone(ic)), h('div', {}, h('b', {}, t), h('small', {}, s)))
    $('papeis').replaceChildren(
      h('b', { class: 'titulo-sec' }, 'Papéis'),
      papel('coroa', 'geral', 'Dono do projeto', 'Cria a diária, escolhe os responsáveis e pode tudo.'),
      papel('escudo', 'camera', 'Responsável do setor', 'Silencia e tira gente do setor dele e fala no Geral.'),
      papel('gente', 'som', 'Equipe', 'Fala no próprio setor e ouve o Geral.'),
      papel('fone', 'elenco', 'Convidado', 'Só ouve.'),
    )
    return
  }
  // poderes (o mesmo que radio.moderar faz no banco)
  const SIM = () => h('span', { class: 'sim' }, icone('check', 'ic ic--p'))
  const NAO = () => h('span', { class: 'nao' }, '—')
  const info = (t) => h('span', { class: 'chip chip--info' }, t)
  const meu = (t) => h('span', { class: 'chip' }, t)
  const linhas = [
    ['falar', 'Falar no próprio setor', SIM(), SIM(), SIM(), NAO()],
    ['geral', 'Falar no Geral', SIM(), SIM(), NAO(), NAO()],
    ['ar', 'Falar com todos ao mesmo tempo', SIM(), NAO(), NAO(), NAO()],
    ['sino', 'Mandar avisos (Gravando, Corta…)', SIM(), info('no setor'), NAO(), NAO()],
    ['micoff', 'Silenciar uma pessoa', SIM(), info('no setor'), meu('só para si'), meu('só para si')],
    ['cadeado', 'Travar a fala', SIM(), info('do setor'), NAO(), NAO()],
    ['gente', 'Tirar gente', SIM(), info('do setor'), NAO(), NAO()],
    ['mover', 'Mover alguém de setor', SIM(), NAO(), NAO(), NAO()],
    ['escudo', 'Escolher os responsáveis', SIM(), NAO(), NAO(), NAO()],
    ['setores', 'Criar, renomear e tirar setores', SIM(), NAO(), NAO(), NAO()],
  ]
  $('poderes-tabela').replaceChildren(
    h('div', { class: 'tabela-linha tabela-cabeca t-poderes' }, h('span', {}, 'Poder'), h('span', {}, 'Dono'), h('span', {}, 'Responsável'), h('span', {}, 'Equipe'), h('span', {}, 'Convidado')),
    ...linhas.map(([ic, t, ...v]) => h('div', { class: 'tabela-linha t-poderes' }, h('span', { class: 't-poder' }, icone(ic, 'ic ic--p'), t), ...v.map((x) => h('span', {}, x)))),
  )
  const a = estado.ajustes || {}
  const regra = (ic, t, s, on, fn) =>
    h('div', { class: 'regra' }, h('span', { class: 'ico ico--p' }, icone(ic)), h('div', {}, h('b', {}, t), h('small', {}, s)), h('button', { class: 'alavanca', type: 'button', role: 'switch', 'aria-checked': String(Boolean(on)), 'aria-label': t, disabled: !dono || !d, onclick: fn }))
  $('regras').replaceChildren(
    h('b', { class: 'titulo-sec' }, 'Silêncio'),
    regra('sino', 'Gravando silencia o set', 'Só Direção e Som falam até o Corta.', a.gravandoSilencia, () => moderar('ajustes', { ajustes: { gravandoSilencia: !a.gravandoSilencia, silencioMin: a.silencioMin ?? null } })),
    regra('mao', 'Pedir a palavra', 'Quem foi silenciado levanta a mão.', a.pedirPalavra, () => moderar('ajustes', { ajustes: { pedirPalavra: !a.pedirPalavra, silencioMin: a.silencioMin ?? null } })),
    regra('relogio', 'Silêncio volta sozinho', 'Silenciar alguém vale 5 min.', a.silencioMin === 5, () => moderar('ajustes', { ajustes: { silencioMin: a.silencioMin === 5 ? null : 5 } })),
    h('b', { class: 'titulo-sec' }, 'Setores'),
    regra('cadeado', 'Setor travado', 'Quem já escolheu o setor não troca sozinho; o dono move.', a.setorTravado, () => moderar('ajustes', { ajustes: { setorTravado: !a.setorTravado, silencioMin: a.silencioMin ?? null } })),
  )
}
async function carregarHistorico() {
  const lista = $('historico')
  if (!estado.diaria || !estado.eu?.dono) return lista.replaceChildren(h('li', {}, 'Só o dono da diária vê o histórico.'))
  const r = await api(`${API}/moderar`, { diaria: estado.diaria.id, acao: 'historico' })
  const ACAO = { silenciar: 'silenciou', reativar: 'reativou', silenciar_todos: 'travou a fala', reativar_todos: 'destravou a fala', mover: 'moveu', responsavel: 'fez responsável', papel: 'mudou o papel de', tirar: 'tirou', setor_criar: 'criou o setor', setor_editar: 'mudou o setor', setor_tirar: 'tirou o setor', sair: 'saiu da diária' }
  lista.replaceChildren(
    ...((r.historico || []).length
      ? r.historico.slice(0, 20).map((x) => h('li', {}, h('b', {}, x.quem), ` ${ACAO[x.acao] || x.acao}${x.alvo ? ` ${x.alvo}` : ''}${x.detalhe ? ` (${NOME[x.detalhe] || PAPEL[x.detalhe] || x.detalhe})` : ''} · ${new Date(x.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`))
      : [h('li', {}, 'Nada por enquanto.')]),
  )
}

// ───────── um setor: criar, renomear, a cor, pôr gente, tirar (o dono; radio.setor confere) ─────────
let setorEmEdicao = null
let corEscolhida = 'azul'
function abrirEditorSetor(id = null) {
  setorEmEdicao = id
  const lista = JSON.parse(setoresVistos)
  const atual = id ? lista.find((x) => x.id === id) : null
  corEscolhida = atual?.cor || Object.keys(CORES).find((c) => !lista.some((x) => x.cor === c)) || 'azul'
  $('se-titulo').replaceChildren(h('span', {}, id ? 'Editar' : 'Novo'), ' ', h('b', {}, id ? NOME[id] : 'setor'))
  $('se-nome').value = atual?.nome || ''
  $('se-tirar').hidden = !id || id === 'direcao'
  mostrarErro('se-erro', '')
  desenharCores()
  desenharGenteDoSetor()
  $('setor-editar').showModal()
  if (!id) $('se-nome').focus()
}
function desenharCores() {
  $('se-cores').replaceChildren(
    ...Object.entries(CORES).map(([nome, hex]) => {
      const b = h('button', { type: 'button', class: 'cor', role: 'radio', 'aria-checked': String(nome === corEscolhida), 'aria-label': nome, onclick: () => ((corEscolhida = nome), desenharCores()) })
      b.style.setProperty('--c', hex)
      return b
    }),
  )
}
function desenharGenteDoSetor() {
  const id = setorEmEdicao
  const caixa = $('se-gente')
  if (!id) return caixa.replaceChildren()
  const dentro = estado.membros.filter((m) => m.funcao === id)
  const fora = estado.membros.filter((m) => m.funcao !== id && m.papel !== 'dono')
  const sel = h('select', { class: 'seletor', 'aria-label': `Pôr alguém em ${NOME[id]}` }, h('option', { value: '' }, fora.length ? 'Pôr alguém neste setor…' : 'Todo mundo já está aqui'), ...fora.map((m) => h('option', { value: m.apelido }, `${m.nome}${m.funcao ? ` · ${NOME[m.funcao] || 'outro setor'}` : ' · sem setor'}`)))
  sel.disabled = !fora.length
  sel.addEventListener('change', async () => {
    if (!sel.value) return
    const r = await moderar('mover', { alvo: sel.value, valor: id })
    if (r.ok) {
      const m = estado.membros.find((x) => x.apelido === sel.value)
      if (m) m.funcao = id
      desenharGenteDoSetor()
    }
  })
  caixa.replaceChildren(
    h('div', { class: 'titulo-sec' }, 'Pessoas', h('small', {}, `${dentro.length}`)),
    h('ul', { class: 'se-lista' }, ...(dentro.length ? dentro.map((m) => h('li', {}, avatar(m.nome, 'av--p'), h('span', {}, m.nome), m.papel === 'responsavel' ? h('small', {}, 'responsável') : m.papel === 'dono' ? h('small', {}, 'dono') : null)) : [h('li', { class: 'sub' }, 'Ninguém ainda.')])),
    sel,
  )
}
$('se-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const nome = $('se-nome').value.trim()
  if (!nome) return
  const r = await api(`${API}/moderar`, { diaria: estado.diaria.id, acao: setorEmEdicao ? 'setor_editar' : 'setor_criar', setor: { id: setorEmEdicao, nome, cor: corEscolhida } })
  if (!r.ok) return mostrarErro('se-erro', SETOR_ERRO[r.erro] || 'Não deu certo. Tente de novo.')
  $('setor-editar').close()
  bater()
})
$('se-tirar').addEventListener('click', async () => {
  if (!setorEmEdicao || !confirm(`Tirar o setor ${NOME[setorEmEdicao]}? Quem está nele fica sem setor.`)) return
  const r = await api(`${API}/moderar`, { diaria: estado.diaria.id, acao: 'setor_tirar', setor: { id: setorEmEdicao } })
  if (!r.ok) return mostrarErro('se-erro', SETOR_ERRO[r.erro] || 'Não deu certo. Tente de novo.')
  $('setor-editar').close()
  bater()
})
$('se-cancelar').addEventListener('click', () => $('setor-editar').close())
$('novo-setor').addEventListener('click', () => abrirEditorSetor())

// ───────── sair: desligar o rádio, deixar a diária, encerrar (o dono) ─────────
$('sair-btn').addEventListener('click', () => {
  const dono = estado.eu?.dono ?? estado.diaria?.dono
  $('sair-nome').textContent = estado.diaria?.nome || 'diária'
  $('sair-deixar').hidden = Boolean(dono)
  $('sair-encerrar').hidden = !dono
  $('sair-folha').showModal()
})
$('sair-cancelar').addEventListener('click', () => $('sair-folha').close())
$('sair-folha').addEventListener('click', (e) => e.target === $('sair-folha') && $('sair-folha').close())
$('sair-desligar').addEventListener('click', () => ($('sair-folha').close(), desligar()))
for (const [botao, acao, pergunta] of [
  ['sair-deixar', 'sair', 'Deixar a diária? Para voltar, você vai precisar do código.'],
  ['sair-encerrar', 'encerrar', 'Encerrar a diária para todo mundo? O código para de valer.'],
]) {
  $(botao).addEventListener('click', async () => {
    if (!estado.diaria || !confirm(pergunta)) return
    const r = await api(`${API}/diarias`, { acao, diaria: estado.diaria.id })
    $('sair-folha').close()
    if (!r.ok) {
      estado.erroAte = Date.now() + 4000
      return mostrarErro('radio-erro', 'Não deu certo. Tente de novo.')
    }
    desligar()
  })
}

// ───────── convites e QR ─────────
const linkDaDiaria = () => `${location.origin}${INICIO}?d=${estado.diaria.codigo}`
function desenharConvites() {
  if (!estado.diaria) {
    $('qr').replaceChildren()
    $('qr-codigo').textContent = '—'
    $('qr-copiar').disabled = true
    return
  }
  $('qr-copiar').disabled = false
  desenharQr($('qr'), linkDaDiaria())
  $('qr-codigo').textContent = estado.diaria.codigo
}
$('qr-copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(linkDaDiaria())
    $('qr-copiar').lastChild.textContent = 'Copiado'
    setTimeout(() => ($('qr-copiar').lastChild.textContent = 'Copiar link'), 1600)
  } catch {
    // sem área de transferência: o código está na tela
  }
})

// ───────── ajustes ─────────
function desenharAjustes() {
  const n = estado.nome || estado.eu?.nome || ''
  $('aj-nome').textContent = n
  $('aj-av').textContent = iniciais(n)
  $('aj-av').style.background = cor(n)
  $('aj-sair').hidden = !SAIR
}
$('aj-tema').addEventListener('click', trocarTema)
$('aj-sair').addEventListener('click', async (e) => {
  e.preventDefault()
  sairDoRadio()
  await fetch(SAIR, { method: 'POST' }).catch(() => {})
  location.href = INICIO
})

// ───────── apps da Absolute ZRO ─────────
$('apps-grade').replaceChildren(...FAMILIA.map(([nome, url, icone_]) => h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: `${ZRO}${icone_}`, alt: '', loading: 'lazy' }), nome)))
$('apps-btn').addEventListener('click', () => {
  const abrir = $('apps').hidden
  fecharFlutuantes()
  $('apps').hidden = !abrir
  $('apps-btn').setAttribute('aria-expanded', String(abrir))
})

// ───────── celular: a folha Mais ─────────
const celular = () => matchMedia('(max-width: 860px)').matches
$('topo-av').addEventListener('click', () => {
  if (!celular()) return ir('ajustes')
  const n = estado.nome || estado.eu?.nome || ''
  $('mais-av').textContent = iniciais(n)
  $('mais-av').style.background = cor(n)
  $('mais-nome').textContent = n
  $('mais-sub').textContent = $('eu-sub').textContent
  for (const b of $('mais-folha').querySelectorAll('[data-precisa-diaria]')) b.hidden = !estado.diaria
  $('mais-set').hidden = $('nav-set').hidden
  $('mais-folha').showModal()
})
$('mais-folha').addEventListener('click', (e) => e.target === $('mais-folha') && $('mais-folha').close())
$('mais-set').addEventListener('click', () => ($('mais-folha').close(), $('nav-set').click()))
$('mais-apps').addEventListener('click', () => ($('mais-folha').close(), $('apps-btn').click()))

// ───────── o Set da Absolute ZRO ─────────
function ligarSet() {
  if (!SET || !SET_API) return
  const s = document.createElement('script')
  s.type = 'module'
  s.src = SET
  document.head.append(s)
  const el = document.createElement('zro-set')
  el.setAttribute('api', SET_API)
  el.setAttribute('tema', document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')
  el.addEventListener('zro-set:estado', (e) => {
    $('nav-set').hidden = false
    const n = Number(e.detail?.naoLidas) || 0
    $('nav-set-num').textContent = n ? String(n) : ''
  })
  el.addEventListener('zro-set:sem-login', () => ($('nav-set').hidden = true))
  $('set-casa').append(el)
  $('nav-set').addEventListener('click', () => el.abrirSet?.())
}

// ───────── início ─────────
for (const a of document.querySelectorAll('[data-so-app]')) a.hidden = Boolean(BASE)
porIcones()
aplicarTema(ler('rd_tema') === 'escuro' ? 'escuro' : 'claro')
aplicarLado(ler('rd_lado') === 'recolhido' ? 'recolhido' : 'aberto')
$('tema').addEventListener('click', trocarTema)
$('recolher').addEventListener('click', () => {
  const l = $('app').dataset.lado === 'aberto' ? 'recolhido' : 'aberto'
  aplicarLado(l)
  guardar('rd_lado', l)
})
for (const b of document.querySelectorAll('[data-ir]')) b.addEventListener('click', () => ir(b.dataset.ir))
window.addEventListener('hashchange', () => {
  const p = location.hash.slice(1)
  if (p !== estado.pagina && PAGINAS.includes(p)) ir(p)
})
ligarSet()
const pedida = location.hash.slice(1)
const codigoNaUrl = new URLSearchParams(location.search).get('d')
carregarDiarias().then(async () => {
  if (codigoNaUrl && /^[A-Za-z0-9]{6}$/.test(codigoNaUrl)) {
    const minha = estado.diarias.find((d) => d.codigo === codigoNaUrl.toUpperCase())
    if (minha) return abrirDiaria(minha)
    if (await entrarComCodigo(codigoNaUrl)) return
    return ir('diarias')
  }
  ir(PAGINAS.includes(pedida) && !['noar', 'equipe', 'avisos', 'setores', 'convites'].includes(pedida) ? pedida : 'inicio')
})

// app separado: a sessão relê o perfil e o gate (no máximo uma vez por minuto, api/zro/eu.js). No HUB, a sessão é a dele.
if (!BASE) fetch('/api/zro/eu').catch(() => {})
