// O site do AEON: a marca sai do mesmo código do app (src/marca.js), o menu recolhível e o caminho do ecossistema saem
// da mesma lista da família (src/familia.js). Motion só com propósito (a cena acende do escuro, as seções entram com um fade curto na
// rolagem: nada fica preso na tela) e nada disso com "reduzir movimento".
// A estrela da abertura está dentro da cena (imagem e vídeo do Higgsfield), não desenhada por cima.

import { simbolo, wordmark } from '../src/marca.js'
import { FAMILIA, iconeDe } from '../src/familia.js'
import { mostrarConta } from './conta.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const reduzir = matchMedia('(prefers-reduced-motion: reduce)')

// ───────── marca ─────────
for (const n of $$('[data-marca="simbolo"]')) n.innerHTML = simbolo({ titulo: false })
for (const n of $$('[data-marca="nome"]')) n.innerHTML = wordmark()
const claro = () => document.documentElement.dataset.theme === 'light'

// ───────── abertura: o vídeo da cena entra quando já está tocando (a foto segura até lá) ─────────
const video = $('#heroVideo')
const economia = navigator.connection?.saveData
if (video && !reduzir.matches && !economia) {
  video.src = video.dataset.src
  video.addEventListener('playing', () => video.classList.add('tocando'), { once: true })
  video.play().catch(() => {})
}

// ───────── tema ─────────
function tema(t) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('zro-tema', t)
  } catch {}
  for (const img of $$('[data-zro]')) img.src = `vendor/marca/absolute-zro-simbolo-${t === 'dark' ? 'branco' : 'grafite'}.svg`
}
$('#tema').addEventListener('click', () => tema(claro() ? 'dark' : 'light'))
tema(document.documentElement.dataset.theme)

mostrarConta()

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

// ───────── rolagem: só a barra vira vidro; as seções entram com um fade curto ─────────
const nav = $('#nav')
const rolar = () => nav.classList.toggle('rolou', scrollY > 8)
addEventListener('scroll', rolar, { passive: true })
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
