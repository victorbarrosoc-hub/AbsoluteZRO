// ZERA · site: tema (claro por padrão; o escuro fica guardado neste navegador), o que entra com a rolagem e o anel que
// se desenha quando aparece. Sem biblioteca e sem rede.
'use strict'

document.documentElement.classList.add('js')

const raiz = document.documentElement
const SOL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>'
const LUA = '<svg viewBox="0 0 24 24"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/></svg>'

function lerTema() {
  try {
    return localStorage.getItem('zera-tema') === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

function aplicarTema(t) {
  raiz.dataset.tema = t
  const b = document.getElementById('tema')
  if (!b) return
  b.innerHTML = t === 'escuro' ? SOL : LUA
  b.setAttribute('aria-label', t === 'escuro' ? 'Tema claro' : 'Tema escuro')
}

aplicarTema(lerTema())

document.getElementById('tema').addEventListener('click', () => {
  const t = raiz.dataset.tema === 'escuro' ? 'claro' : 'escuro'
  aplicarTema(t)
  try {
    localStorage.setItem('zera-tema', t)
  } catch {
    /* sem guardar: vale só nesta visita */
  }
})

// ---------- o anel de exemplo: 3 camadas, fatias que se desenham ----------

const NS = 'http://www.w3.org/2000/svg'
// [tipo, fração] por camada (um disco de quem edita: muito vídeo, projetos, imagens…)
const CAMADAS = [
  { r: 92, w: 52, fatias: [[0, 0.46], [3, 0.12], [2, 0.1], [4, 0.09], [1, 0.05], [5, 0.18]] },
  { r: 148, w: 40, fatias: [[0, 0.27], [0, 0.12], [0, 0.05], [3, 0.08], [3, 0.03], [2, 0.08], [4, 0.06], [1, 0.04], [5, 0.12]] },
  { r: 182, w: 22, fatias: [[0, 0.15], [0, 0.07], [0, 0.04], [0, 0.06], [3, 0.05], [2, 0.05], [4, 0.04], [5, 0.08]] },
]
const MISTURA = [100, 74, 54]

function montarAnel(svg) {
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('transform', 'rotate(-90 200 200)')
  const fatias = []
  CAMADAS.forEach((c, nivel) => {
    let ini = 0
    for (const [k, tam] of c.fatias) {
      const el = document.createElementNS(NS, 'circle')
      el.setAttribute('cx', 200)
      el.setAttribute('cy', 200)
      el.setAttribute('r', c.r)
      el.setAttribute('pathLength', 1000)
      el.setAttribute('stroke-width', c.w)
      el.setAttribute('class', 'fatia')
      el.style.stroke = `color-mix(in oklab, var(--k${k}) ${MISTURA[nivel]}%, var(--mistura))`
      el.style.strokeDashoffset = String(-ini * 1000)
      el.style.strokeDasharray = '0 1000'
      el.style.transitionDelay = `${nivel * 160 + fatias.length * 25}ms`
      el.dataset.alvo = `${tam * 1000 - 3} 1000`
      g.appendChild(el)
      fatias.push(el)
      ini += tam
    }
  })
  svg.appendChild(g)
  return fatias
}

const svg = document.getElementById('anel-demo')
const fatias = svg ? montarAnel(svg) : []
const desenhar = () => fatias.forEach((f) => (f.style.strokeDasharray = f.dataset.alvo))

// ---------- entra com a rolagem ----------

const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
const alvos = document.querySelectorAll('.revelar, .subir')
if (reduzir || !('IntersectionObserver' in window)) {
  alvos.forEach((a) => a.classList.add('visto'))
  desenhar()
} else {
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue
        e.target.classList.add('visto')
        if (e.target.classList.contains('anel-demo')) requestAnimationFrame(() => requestAnimationFrame(desenhar))
        io.unobserve(e.target)
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  alvos.forEach((a) => io.observe(a))
}
