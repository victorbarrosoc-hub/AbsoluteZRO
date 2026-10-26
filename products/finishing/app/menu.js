// Revela · menu lateral recolhível, como nas outras plataformas da Absolute ZRO. As abas das ferramentas ficam no dock
// de baixo (o `.abas` do HTML, no estilo das páginas do DaVinci); aqui fica o resto: início, ferramentas e a família.
//
// Computador: trilho de ícones que abre e fecha (lembrado neste navegador). Celular: gaveta que entra pela esquerda,
// com fundo, Esc para fechar e o foco voltando ao botão.

import { ICONES, svg } from './visual.js'

const CHAVE = 'revela-menu'
const LARGO = matchMedia('(min-width: 900px)')
const aqui =
  location.pathname
    .split('/')
    .pop()
    .replace(/\.html$/, '') || 'index'

const FERRAMENTAS = [
  { href: 'lut.html', nome: 'LUT', icone: 'lut', pagina: 'lut' },
  { href: 'cst.html', nome: 'CST', icone: 'cst', pagina: 'cst' },
  { href: 'entrega.html', nome: 'Entrega', icone: 'entrega', pagina: 'entrega' },
  { href: 'converter.html', nome: 'Converter', icone: 'converter', pagina: 'converter' },
]
const FAMILIA = [
  { href: 'https://absolutezro.vercel.app', nome: 'Absolute ZRO', img: 'marca/familia/absolute-zro-o.webp' },
  { href: 'https://sobedesce.vercel.app', nome: 'Sobedesce', img: 'marca/familia/sobedesce.svg' },
  { href: 'https://synquei.vercel.app', nome: 'Synquei', img: 'marca/familia/synquei.svg' },
  { href: 'https://nossom-teal.vercel.app', nome: 'Nossom', img: 'marca/familia/nossom.svg' },
  { href: 'https://tpeasy.vercel.app', nome: 'TPEasy', img: 'marca/familia/tpeasy.svg' },
  { href: 'https://carrodofreela.com.br', nome: 'Carro do Freela', img: 'marca/familia/carro-do-freela.png' },
]

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
    el('p', { className: 'menu-grupo', textContent: 'Absolute ZRO' }),
    ...FAMILIA.map(item),
  ),
)
const fundo = el('div', { className: 'menu-fundo', hidden: true })
const alternarTopo = el('button', { type: 'button', className: 'menu-botao menu-botao--topo', ariaLabel: 'Abrir menu' }, icone('menu'))
alternarTopo.setAttribute('aria-controls', 'menu')
alternarRail.setAttribute('aria-controls', 'menu')

document.body.prepend(menu, fundo)
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
