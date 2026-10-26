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

// ───────── baixar: copiar o comando ─────────
for (const b of $$('[data-copiar]'))
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($(`#${b.dataset.copiar}`).textContent)
      b.textContent = 'Copiado'
      setTimeout(() => (b.textContent = 'Copiar'), 1800)
    } catch {
      getSelection().selectAllChildren($(`#${b.dataset.copiar}`))
    }
  })

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

// ───────── ao vivo: cada demonstração roda só enquanto está na tela ─────────
/** Liga e desliga um laço conforme o elemento aparece. */
function aoVer(el, ligar, desligar) {
  new IntersectionObserver((es) => (es[0].isIntersecting ? ligar() : desligar()), { rootMargin: '60px' }).observe(el)
}

// corte: fala (azul) e silêncio (cinza); os silêncios acendem em laranja, fecham e a trilha encolhe
const trilha = $('#trilhaDemo')
if (trilha) {
  const PEDACOS = [['f', 14], ['s', 6], ['f', 18], ['s', 4], ['f', 11], ['s', 7], ['f', 16], ['s', 5], ['f', 12]]
  const total = PEDACOS.reduce((t, [, n]) => t + n, 0)
  let semente = 7
  const acaso = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280)
  trilha.replaceChildren(
    ...PEDACOS.map(([tipo, n]) => {
      const d = document.createElement('div')
      d.className = `pedaco${tipo === 's' ? ' silencio' : ''}`
      d.style.width = `calc(${((n / total) * 100).toFixed(2)}% - 4px)`
      for (let i = 0; i < n * 2; i++) {
        const b = document.createElement('i')
        b.style.height = `${tipo === 's' ? 6 + acaso() * 8 : 22 + acaso() * 70}%`
        d.append(b)
      }
      return d
    }),
  )
  const palco = trilha.parentElement
  if (reduzir.matches) palco.classList.add('marcando', 'cortado')
  else {
    let timers = []
    const ciclo = () => {
      palco.classList.remove('marcando', 'cortado')
      timers = [setTimeout(() => palco.classList.add('marcando'), 1200), setTimeout(() => palco.classList.add('cortado'), 2600), setTimeout(ciclo, 6400)]
    }
    aoVer(
      palco,
      () => {
        palco.classList.add('tocando')
        ciclo()
      },
      () => {
        palco.classList.remove('tocando')
        timers.forEach(clearTimeout)
      },
    )
  }
}

// legenda: a palavra da vez acende, frase por frase
const legenda = $('#legendaDemo')
if (legenda) {
  const FRASES = ['Todo vídeo começa no bruto.', 'Você escolhe o que fica.', 'O tempo é seu.']
  let f = 0
  let w = 0
  let timer = null
  const mostrar = () => {
    const palavras = FRASES[f].split(' ')
    legenda.replaceChildren(
      ...palavras.flatMap((p, i) => {
        const b = document.createElement('b')
        b.textContent = p
        if (i < w) b.className = 'dita'
        if (i === w) b.className = 'agora'
        return i < palavras.length - 1 ? [b, ' '] : [b]
      }),
    )
    return palavras.length
  }
  const passo = () => {
    const n = mostrar()
    w++
    if (w > n) {
      w = 0
      f = (f + 1) % FRASES.length
      timer = setTimeout(passo, 700)
    } else timer = setTimeout(passo, 380)
  }
  if (reduzir.matches) {
    w = 99
    mostrar()
  } else
    aoVer(
      legenda,
      () => {
        clearTimeout(timer)
        passo()
      },
      () => clearTimeout(timer),
    )
}

// zoom: o punch-in roda (CSS) só enquanto aparece
for (const z of $$('.demo-zoom'))
  if (!reduzir.matches)
    aoVer(
      z,
      () => z.classList.add('tocando'),
      () => z.classList.remove('tocando'),
    )
