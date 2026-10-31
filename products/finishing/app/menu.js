// Revela · menu lateral recolhível, como nas outras plataformas da Absolute ZRO. As abas das ferramentas ficam no dock
// de baixo (o `.abas` do HTML, no estilo das páginas do DaVinci); aqui fica o resto: início, ferramentas e a família.
//
// Computador: trilho de ícones que abre e fecha (lembrado neste navegador). Celular: gaveta que entra pela esquerda,
// com fundo, Esc para fechar e o foco voltando ao botão.

import { paginaDe } from './navegar.js'
import { ICONES, svg } from './visual.js'
import { montarSet } from './set.js'

const CHAVE = 'revela-menu'
const LARGO = matchMedia('(min-width: 900px)')
const aqui =
  location.pathname
    .split('/')
    .pop()
    .replace(/\.html$/, '') || 'index'

const FERRAMENTAS = [
  { href: 'lut.html', nome: 'LUT', icone: 'lut', pagina: 'lut' },
  { href: 'lab.html', nome: 'Lab', icone: 'lab', pagina: 'lab' },
  { href: 'looks.html', nome: 'Looks', icone: 'looks', pagina: 'looks' },
  { href: 'cst.html', nome: 'CST', icone: 'cst', pagina: 'cst' },
  { href: 'entrega.html', nome: 'Entrega', icone: 'entrega', pagina: 'entrega' },
  { href: 'converter.html', nome: 'Converter', icone: 'converter', pagina: 'converter' },
]
const FAMILIA = [
  { href: 'https://absolutezro.com', nome: 'Absolute ZRO', img: 'marca/familia/absolute-zro-o.webp' },
  { href: 'https://aeon.absolutezro.com', nome: 'AEON', img: 'marca/familia/aeon.svg' },
  { href: 'https://carro.absolutezro.com', nome: 'Carro do Freela', img: 'marca/familia/carro-do-freela.png' },
  { href: 'https://nossom.absolutezro.com', nome: 'Nossom', img: 'marca/familia/nossom.svg' },
  { href: 'https://sobedesce.vercel.app', nome: 'Sobedesce', img: 'marca/familia/sobedesce.svg' },
  { href: 'https://synquei.vercel.app', nome: 'Synquei', img: 'marca/familia/synquei.svg' },
  { href: 'https://tpeasy.absolutezro.com', nome: 'TPEasy', img: 'marca/familia/tpeasy.svg' },
]
// Maestro na família (lançamento em Beta grátis, docs/operations/lancamento-maestro.md): fica de fora até o titular
// abrir; vira com `node scripts/lancamento-maestro.mjs --abrir` (e volta com --fechar).
const MAESTRO_NA_FAMILIA = true
// em ordem alfabética, como em todas as plataformas: entre o Carro do Freela e o Nossom
if (MAESTRO_NA_FAMILIA) FAMILIA.splice(3, 0, { href: 'https://maestro.absolutezro.com', nome: 'Maestro', img: 'marca/familia/maestro.svg' })

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos)
  return n
}
const icone = (nome) => el('span', { className: 'menu-icone', ariaHidden: 'true' }, svg(ICONES[nome]))

function item({ href, nome, icone: ic, img, pagina }) {
  const a = el('a', { href, className: 'menu-item', title: nome })
  if (img) a.append(el('span', { className: 'menu-icone' }, el('img', { src: img, alt: '', width: 22, height: 22 })))
  else a.append(icone(ic))
  a.append(el('span', { className: 'menu-nome', textContent: nome }))
  if (pagina === aqui) a.setAttribute('aria-current', 'page')
  if (href.startsWith('http')) a.rel = 'noopener'
  return a
}

const alternarRail = el('button', { type: 'button', className: 'menu-botao', ariaLabel: 'Menu' }, icone('menu'))
const menu = el(
  'aside',
  { id: 'menu', className: 'menu', ariaLabel: 'Menu' },
  el('div', { className: 'menu-topo' }, alternarRail),
  el(
    'nav',
    { className: 'menu-corpo', ariaLabel: 'Revela e Absolute ZRO' },
    item({ href: './', nome: 'Início', icone: 'casa', pagina: 'index' }),
    el('p', { className: 'menu-grupo', textContent: 'Ferramentas' }),
    ...FERRAMENTAS.map(item),
    // a Z, discreta, depois das ferramentas (titular, 29/10/2026): nunca a primeira do menu nem a entrada
    item({ href: 'inicio.html', nome: 'Z', icone: 'z', pagina: 'inicio' }),
    el('p', { className: 'menu-grupo', textContent: 'Absolute ZRO' }),
    ...FAMILIA.map(item),
  ),
)
// tema: claro é o padrão; o botão mostra para onde vai (lua no claro, sol no escuro)
const botaoTema = el('button', { type: 'button', className: 'menu-item menu-tema' })
function pintarTema() {
  const escuro = window.revelaTema?.atual() === 'escuro'
  const nome = escuro ? 'Tema claro' : 'Tema escuro'
  botaoTema.replaceChildren(icone(escuro ? 'sol' : 'lua'), el('span', { className: 'menu-nome', textContent: nome }))
  botaoTema.title = nome
}
botaoTema.addEventListener('click', () => {
  window.revelaTema?.alternar()
  pintarTema()
})
pintarTema()
// instalar: o app da Revela no iPhone vem do Compartilhar do Safari (Adicionar à Tela de Início); no Chrome, do pedido
// do próprio navegador. Já instalado (aberto da Tela de Início), o item some.
const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const botaoInstalar = el('button', { type: 'button', className: 'menu-item menu-instalar', title: 'Instalar o app', hidden: true })
botaoInstalar.append(icone('instalar'), el('span', { className: 'menu-nome', textContent: 'Instalar o app' }))
let pedido = null
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  pedido = e
  botaoInstalar.hidden = instalado
})
addEventListener('appinstalled', () => (botaoInstalar.hidden = true))
if (ehIphone && !instalado) botaoInstalar.hidden = false

function folhaInstalar() {
  const passo = (n, ...filhos) => el('li', {}, el('span', { className: 'instalar-n', textContent: n }), ...filhos)
  const fechar = el('button', { type: 'button', className: 'vidro vidro--tinta', textContent: 'Entendi' })
  const folha = el(
    'dialog',
    { className: 'instalar', ariaLabel: 'Instalar a Revela' },
    el('img', { src: 'marca/app/revela-192.png', alt: '', width: 64, height: 64, className: 'instalar-icone' }),
    el('h2', { textContent: 'Revela na Tela de Início' }),
    el(
      'ol',
      {},
      passo('1', 'Toque em ', el('span', { className: 'instalar-chip' }, svg(ICONES.compartilhar), 'Compartilhar')),
      passo('2', el('span', { className: 'instalar-chip' }, svg(ICONES.instalar), 'Adicionar à Tela de Início')),
    ),
    fechar,
  )
  fechar.addEventListener('click', () => folha.close())
  folha.addEventListener('close', () => folha.remove())
  folha.addEventListener('click', (e) => e.target === folha && folha.close())
  document.body.append(folha)
  folha.showModal()
}
botaoInstalar.addEventListener('click', async () => {
  if (pedido) {
    pedido.prompt()
    await pedido.userChoice.catch(() => null)
    pedido = null
    botaoInstalar.hidden = true
  } else folhaInstalar()
})
menu.append(el('div', { className: 'menu-pe' }, botaoInstalar, botaoTema))

const fundo = el('div', { className: 'menu-fundo', hidden: true })
const alternarTopo = el('button', { type: 'button', className: 'menu-botao menu-botao--topo', ariaLabel: 'Abrir menu' }, icone('menu'))
alternarTopo.setAttribute('aria-controls', 'menu')
alternarRail.setAttribute('aria-controls', 'menu')

document.body.prepend(menu, fundo)
// o Set, a aba em comum do ecossistema: o fim do dock (app/set.js)
montarSet()
document.querySelector('.topo')?.prepend(alternarTopo)
document.documentElement.classList.add('com-menu')

const ler = () => {
  try {
    return localStorage.getItem(CHAVE) === 'aberto'
  } catch {
    return false
  }
}
const gravar = (aberto) => {
  try {
    localStorage.setItem(CHAVE, aberto ? 'aberto' : 'recolhido')
  } catch {
    // sem armazenamento (janela privada): o menu só não é lembrado
  }
}

let gavetaAberta = false

function aplicar() {
  const largo = LARGO.matches
  const aberto = largo ? ler() : gavetaAberta
  document.documentElement.classList.toggle('menu-aberto', aberto)
  document.documentElement.classList.toggle('menu-gaveta', !largo && gavetaAberta)
  menu.inert = !largo && !gavetaAberta
  fundo.hidden = largo || !gavetaAberta
  for (const b of [alternarRail, alternarTopo]) {
    b.setAttribute('aria-expanded', String(aberto))
    b.setAttribute('aria-label', aberto ? 'Recolher menu' : 'Abrir menu')
  }
}

function abrirGaveta(abrir) {
  gavetaAberta = abrir
  document.body.style.overflow = abrir ? 'hidden' : ''
  aplicar()

  if (abrir) menu.querySelector('[aria-current], .menu-item')?.focus()
  else alternarTopo.focus()
}

alternarRail.addEventListener('click', () => {
  if (LARGO.matches) {
    gravar(!ler())
    aplicar()

  } else abrirGaveta(false)
})
alternarTopo.addEventListener('click', () => abrirGaveta(!gavetaAberta))
fundo.addEventListener('click', () => abrirGaveta(false))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gavetaAberta) abrirGaveta(false)
})
LARGO.addEventListener('change', () => {
  if (gavetaAberta) abrirGaveta(false)
  else aplicar()

})
aplicar()

// troca de aba sem recarregar (navegar.js): o menu fica, só a marca do item muda; no celular a gaveta fecha
addEventListener('revela:pagina', (e) => {
  for (const a of menu.querySelectorAll('.menu-item[href]')) {
    if (paginaDe(a.href) === e.detail) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
  if (gavetaAberta) abrirGaveta(false)
})
