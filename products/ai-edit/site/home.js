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
// o fecho: a estrela de palco (pontas e fios somem aos poucos, em vez de terminar num corte seco), com respiro em volta
// para o brilho não encostar na borda; segue o tema (tinta escura no claro)
const fimSimbolo = $('[data-marca="palco"]')
const pintarFim = () => fimSimbolo && (fimSimbolo.innerHTML = simbolo({ titulo: false, brilho: true, claro: claro(), margem: 8 }))

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
  pintarFim()
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
  { id: 'aeon', papel: 'Edição completa' },
  { id: 'finishing', papel: 'Cor e LUT' },
  { id: 'nossom', papel: 'Som e master' },
]
$('#caminho').replaceChildren(
  ...CAMINHO.flatMap((c, i) => {
    const li = document.createElement('li')
    const f = FAMILIA.find((x) => x.id === c.id)
    const a = document.createElement('a')
    if (c.id === 'aeon') {
      // fechado ao público: o AEON do caminho aponta para a própria apresentação, não para o editor
      a.href = '#produto'
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
for (const n of $$('.ao-rolar, .cena')) olho.observe(n)

// ───────── números: contam até o valor quando aparecem (sem JavaScript ou com "reduzir movimento", o valor fica) ─────────
const contar = new IntersectionObserver(
  (es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue
      contar.unobserve(e.target)
      const n = e.target
      const ate = Number(n.dataset.contar)
      const de = Number(n.dataset.de || 0)
      if (reduzir.matches) continue
      const t0 = performance.now()
      const dur = 1600
      const passo = (t) => {
        const k = Math.min(1, (t - t0) / dur)
        const suave = 1 - Math.pow(1 - k, 3)
        n.textContent = String(Math.round(de + (ate - de) * suave))
        if (k < 1) requestAnimationFrame(passo)
      }
      n.textContent = String(de)
      requestAnimationFrame(passo)
    }
  },
  { rootMargin: '0px 0px -15% 0px' },
)
for (const n of $$('[data-contar]')) contar.observe(n)

// ───────── por dentro: as telas do app no MacBook. Troca sozinha (barra que enche) até a pessoa escolher uma ─────────
const explorar = $('#explorar')
if (explorar) {
  const abas = $$('[role="tab"]', explorar)
  const TEMPO = 6000
  let atual = 0
  let sozinho = !reduzir.matches
  let timer = null
  const mostrarTela = (i, foco = false) => {
    atual = (i + abas.length) % abas.length
    abas.forEach((b, k) => {
      const sim = k === atual
      b.setAttribute('aria-selected', String(sim))
      b.tabIndex = sim ? 0 : -1
      $(`#${b.getAttribute('aria-controls')}`).classList.toggle('ativa', sim)
    })
    if (foco) abas[atual].focus()
    explorar.classList.toggle('sozinho', sozinho)
    // a barra recomeça a encher na tela nova
    const barra = $('.explorar-barra', abas[atual])
    barra.style.animation = 'none'
    void barra.offsetWidth
    barra.style.animation = ''
    clearTimeout(timer)
    if (sozinho && emTela) timer = setTimeout(() => mostrarTela(atual + 1), TEMPO)
  }
  const parar = () => {
    sozinho = false
    clearTimeout(timer)
    explorar.classList.remove('sozinho')
  }
  abas.forEach((b, k) =>
    b.addEventListener('click', () => {
      parar()
      mostrarTela(k)
    }),
  )
  explorar.addEventListener('keydown', (e) => {
    const passo = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (!passo || !e.target.matches('[role="tab"]')) return
    e.preventDefault()
    parar()
    mostrarTela(atual + passo, true)
  })
  let emTela = false
  new IntersectionObserver(
    (es) => {
      emTela = es[0].isIntersecting
      if (emTela) mostrarTela(atual)
      else clearTimeout(timer)
    },
    { threshold: 0.35 },
  ).observe(explorar)
  mostrarTela(0)
}

// ───────── para o resto, o ecossistema: cada ferramenta no seu lugar (da lista da família) ─────────
const LUGARES = [
  { id: 'finishing', faz: 'Cor e LUT' },
  { id: 'nossom', faz: 'Som e master' },
  { id: 'synquei', faz: 'Câmeras em sincronia' },
  { id: 'sobedesce', faz: 'Cartão descarregado e conferido' },
]
const lugares = $('#lugares')
if (lugares)
  lugares.replaceChildren(
    ...LUGARES.map((l) => {
      const f = FAMILIA.find((x) => x.id === l.id)
      const li = document.createElement('li')
      li.innerHTML = `<a><img alt="" width="36" height="36"/><span></span><strong></strong></a>`
      const a = li.querySelector('a')
      a.href = f.href
      li.querySelector('img').src = iconeDe(f)
      li.querySelector('span').textContent = l.faz
      li.querySelector('strong').textContent = f.nome
      return li
    }),
  )

// ───────── perguntas: abre uma de cada vez (a altura anima pelo CSS) ─────────
for (const b of $$('#faq button[aria-expanded]'))
  b.addEventListener('click', () => {
    const abrir = b.getAttribute('aria-expanded') !== 'true'
    for (const o of $$('#faq button[aria-expanded]')) o.setAttribute('aria-expanded', 'false')
    b.setAttribute('aria-expanded', String(abrir))
  })
