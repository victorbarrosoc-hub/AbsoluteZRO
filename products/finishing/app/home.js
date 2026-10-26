// Revela · página inicial: o produto entra com a rolagem (IntersectionObserver liga uma classe; o movimento é CSS),
// a faixa de destinos acende um por vez quando aparece, e a barra ganha a linha de baixo ao rolar. Com "reduzir
// movimento", tudo já aparece no lugar.
import './conta.js'
import { DESTINOS } from '../src/entrega/destinos.js'
import { NOME_CURTO, glifo, svg } from './visual.js'

document.documentElement.classList.add('js')
const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches

// Faixa de destinos (os mesmos da Entrega).
const faixa = document.getElementById('faixa')
for (const d of DESTINOS) {
  const item = document.createElement('span')
  item.className = 'glifo-home'
  item.append(svg(glifo(d)), Object.assign(document.createElement('span'), { textContent: NOME_CURTO[d.id] ?? d.nome }))
  faixa.append(item)
}

let acender = null
function acenderFaixa() {
  if (acender || calmo) return
  const itens = [...faixa.children]
  let i = 0
  acender = setInterval(() => {
    itens.forEach((n, j) => n.classList.toggle('aceso', j === i % itens.length))
    i++
  }, 900)
}

const ver = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue
      e.target.classList.add('visivel')
      if (e.target === faixa) acenderFaixa()
      ver.unobserve(e.target)
    }
  },
  { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
)
document.querySelectorAll('.revela-ao-rolar').forEach((n) => ver.observe(n))

const nav = document.getElementById('nav')
const marcar = () => nav.classList.toggle('rolou', scrollY > 8)
addEventListener('scroll', marcar, { passive: true })
marcar()
