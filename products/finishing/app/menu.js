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
// os apps da Absolute ZRO que estão no ar (gate `zro.product_release`, CLAUDE.md): só os lançados aparecem; AEON, NOSSOM e
// Rift Motion ficam de fora até a migration que abre cada um. Mesma ordem e mesmos ícones da janela de apps do AEON.
const FAMILIA = [
  { href: 'https://absolutezro.com', nome: 'Absolute ZRO', img: 'marca/familia/absolute-zro-o.webp', papel: 'Sua conta e seus projetos' },
  { href: 'https://sobedesce.absolutezro.com', nome: 'SOBEDESCE', img: 'marca/familia/sobedesce.svg', papel: 'Descarga e subida conferidas' },
  { href: 'https://synquei.absolutezro.com', nome: 'Synquei', img: 'marca/familia/synquei.svg', papel: 'Câmeras sincronizadas pelo som' },
  { href: 'https://relay.absolutezro.com', nome: 'Relay', img: 'marca/familia/relay.svg', papel: 'Versões para cada rede' },
  { href: 'https://tpeasy.absolutezro.com', nome: 'TPeasy', img: 'marca/familia/tpeasy.svg', papel: 'Teleprompter com o roteiro' },
  { href: 'https://carro.absolutezro.com', nome: 'Carro do Freela', img: 'marca/familia/carro-do-freela.png', papel: 'Escala de freelas' },
]
// Maestro na família (lançamento em Beta grátis, docs/operations/lancamento-maestro.md): fica de fora até o titular
// abrir; vira com `node scripts/lancamento-maestro.mjs --abrir` (e volta com --fechar).
const MAESTRO_NA_FAMILIA = true
if (MAESTRO_NA_FAMILIA) FAMILIA.push({ href: 'https://maestro.absolutezro.com', nome: 'Maestro', img: 'marca/familia/maestro.svg', papel: 'Gestão da produtora' })

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
  ),
)

// a família numa linha só, no pé do menu: "Apps Absolute ZRO" abre a janela com a grade de apps (como no AEON).
// Popover: Esc e clique fora fecham; abre colado ao menu, na altura do botão.
const janelaApps = el(
  'div',
  { id: 'menuApps', className: 'menu-apps', popover: 'auto', role: 'menu', ariaLabel: 'Apps Absolute ZRO' },
  el('p', { className: 'menu-apps-titulo', textContent: 'Absolute ZRO' }),
  el(
    'div',
    { className: 'menu-apps-grade' },
    ...FAMILIA.map((f) =>
      el(
        'a',
        { href: f.href, className: 'menu-app', role: 'menuitem', title: `${f.nome} · ${f.papel}`, rel: 'noopener' },
        el('img', { src: f.img, alt: '', width: 40, height: 40 }),
        el('span', { textContent: f.nome }),
      ),
    ),
  ),
)
const botaoApps = el('button', { type: 'button', className: 'menu-item menu-apps-botao', title: 'Os outros apps da Absolute ZRO' })
botaoApps.append(icone('apps'), el('span', { className: 'menu-nome', textContent: 'Apps Absolute ZRO' }))
botaoApps.setAttribute('popovertarget', 'menuApps')
botaoApps.setAttribute('aria-haspopup', 'menu')
janelaApps.addEventListener('beforetoggle', (e) => {
  botaoApps.setAttribute('aria-expanded', String(e.newState === 'open'))
  if (e.newState !== 'open') return
  const r = botaoApps.getBoundingClientRect()
  const borda = menu.getBoundingClientRect().right
  // no celular a gaveta ocupa a largura: a janela fica centrada sobre ela
  const largura = 3 * 92 + 2 * 4 + 22
  const esquerda = LARGO.matches ? Math.max(borda, r.right) + 8 : (innerWidth - largura) / 2
  janelaApps.style.left = `${Math.round(Math.max(12, esquerda))}px`
  janelaApps.style.bottom = `${Math.max(12, Math.round(innerHeight - r.bottom))}px`
})
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
menu.append(el('div', { className: 'menu-pe' }, botaoApps, botaoInstalar, botaoTema))

const fundo = el('div', { className: 'menu-fundo', hidden: true })
const alternarTopo = el('button', { type: 'button', className: 'menu-botao menu-botao--topo', ariaLabel: 'Abrir menu' }, icone('menu'))
alternarTopo.setAttribute('aria-controls', 'menu')
alternarRail.setAttribute('aria-controls', 'menu')

document.body.prepend(menu, fundo)
document.body.append(janelaApps)
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
