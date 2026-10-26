// O site do AEON: a marca sai do mesmo código do app (src/marca.js), o menu recolhível e o caminho do ecossistema saem
// da mesma lista da família (src/familia.js). Motion só com propósito (a estrela acende, o MacBook se endireita com a
// rolagem, as seções entram) e nada disso com "reduzir movimento".

import { simbolo, wordmark, estrelaComBrilho, FORMAS } from '../src/marca.js'
import { FAMILIA, iconeDe } from '../src/familia.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const reduzir = matchMedia('(prefers-reduced-motion: reduce)')

// ───────── marca ─────────
for (const n of $$('[data-marca="simbolo"]')) n.innerHTML = simbolo({ titulo: false })
for (const n of $$('[data-marca="nome"]')) n.innerHTML = wordmark()
const claro = () => document.documentElement.dataset.theme === 'light'
function estrelas() {
  // a estrela de palco (larga, acesa); a do fim acompanha o tema
  const r = 100
  const H = r * FORMAS.larga.largura
  const vb = `${-H * 1.05} ${-r * 1.08} ${H * 2.1} ${r * 2.16}`
  $$('[data-marca="estrela"]').forEach((n, i) => {
    const naHero = n.classList.contains('hero-estrela')
    n.innerHTML = `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${estrelaComBrilho({ cx: 0, cy: 0, r, forma: 'larga', claro: !naHero && claro(), id: `estrela${i}` })}</svg>`
  })
}
estrelas()

// ───────── tema ─────────
function tema(t) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('zro-tema', t)
  } catch {}
  for (const img of $$('[data-zro]')) img.src = `vendor/marca/absolute-zro-simbolo-${t === 'dark' ? 'branco' : 'grafite'}.svg`
  estrelas()
}
$('#tema').addEventListener('click', () => tema(claro() ? 'dark' : 'light'))
tema(document.documentElement.dataset.theme)

// ───────── menu recolhível ─────────
const menu = $('#menu')
const veu = $('#veu')
function abrirMenu(aberto) {
  document.documentElement.classList.toggle('menu-aberto', aberto)
  menu.inert = !aberto
  $('#menuAbrir').setAttribute('aria-expanded', String(aberto))
  if (aberto) {
    veu.hidden = false
    requestAnimationFrame(() => $('#menuFechar').focus())
  } else {
    setTimeout(() => (veu.hidden = !document.documentElement.classList.contains('menu-aberto') || veu.hidden), 400)
    $('#menuAbrir').focus({ preventScroll: true })
  }
}
$('#menuAbrir').addEventListener('click', () => abrirMenu(true))
$('#menuFechar').addEventListener('click', () => abrirMenu(false))
veu.addEventListener('click', () => abrirMenu(false))
addEventListener('keydown', (e) => e.key === 'Escape' && document.documentElement.classList.contains('menu-aberto') && abrirMenu(false))
for (const a of $$('.menu-links a')) a.addEventListener('click', () => abrirMenu(false))
$('#menuFamilia').replaceChildren(
  ...FAMILIA.map((f) => {
    const li = document.createElement('li')
    li.innerHTML = `<a href="${f.href}"><img alt="" width="32" height="32"/><span><strong></strong><span></span></span></a>`
    li.querySelector('img').src = iconeDe(f)
    li.querySelector('strong').textContent = f.nome
    li.querySelector('span span').textContent = f.papel
    return li
  }),
)

// ───────── o caminho do vídeo no ecossistema ─────────
const CAMINHO = [
  { id: 'sobedesce', papel: 'Descarrega o cartão' },
  { id: 'synquei', papel: 'Sincroniza as câmeras' },
  { id: 'aeon', papel: 'Corta, legenda, zoom' },
  { id: 'finishing', papel: 'Cor e LUT' },
  { id: 'nossom', papel: 'Som e master' },
]
$('#caminho').replaceChildren(
  ...CAMINHO.flatMap((c, i) => {
    const li = document.createElement('li')
    const f = FAMILIA.find((x) => x.id === c.id)
    const a = document.createElement('a')
    if (c.id === 'aeon') {
      a.href = 'app/'
      a.className = 'eu'
      a.innerHTML = `<img src="marca/aeon-icone.svg" alt="" width="64" height="64"/><strong>AEON</strong><span></span>`
    } else {
      a.href = f.href
      a.innerHTML = `<img alt="" width="64" height="64"/><strong></strong><span></span>`
      a.querySelector('img').src = iconeDe(f)
      a.querySelector('strong').textContent = f.nome
    }
    a.querySelector('span').textContent = c.papel
    li.append(a)
    if (i < CAMINHO.length - 1) li.append(Object.assign(document.createElement('span'), { className: 'seta', textContent: '→', ariaHidden: 'true' }))
    return [li]
  }),
)

// ───────── rolagem: barra de vidro, hero e MacBook ─────────
const nav = $('#nav')
const hero = $('.hero')
const mac = $('#mac')
let pedido = false
function rolar() {
  pedido = false
  nav.classList.toggle('rolou', scrollY > 8)
  if (reduzir.matches) return
  const h = hero.offsetHeight
  hero.style.setProperty('--p', String(Math.min(1, Math.max(0, scrollY / h))))
  const r = mac.getBoundingClientRect()
  const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.75)))
  mac.style.setProperty('--p', p.toFixed(3))
}
addEventListener('scroll', () => pedido || ((pedido = true), requestAnimationFrame(rolar)), { passive: true })
rolar()

const olho = new IntersectionObserver(
  (es) => {
    for (const e of es)
      if (e.isIntersecting) {
        e.target.classList.add('visivel')
        olho.unobserve(e.target)
      }
  },
  { rootMargin: '0px 0px -12% 0px' },
)
for (const n of $$('.ao-rolar')) olho.observe(n)
