// Revela · página inicial: o produto entra com a rolagem (IntersectionObserver liga uma classe; o movimento é CSS),
// e a barra ganha a linha de baixo ao rolar. Com "reduzir movimento", tudo já aparece no lugar. Fechada ao público:
// só a apresentação (nada aqui abre ferramenta); a conta entra por app/conta.js.
import './conta.js'
import { ICONES, svg } from './visual.js'

document.documentElement.classList.add('js')

const ver = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue
      e.target.classList.add('visivel')
      ver.unobserve(e.target)
    }
  },
  { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
)
document.querySelectorAll('.revela-ao-rolar').forEach((n) => ver.observe(n))

// Comparação do topo: arrastar (ou setas do teclado) assume o controle e para a varredura automática
const comparar = document.querySelector('.comparar')
const divisao = comparar?.querySelector('.comparar-divisao')
divisao?.addEventListener('input', () => {
  comparar.classList.add('manual')
  comparar.style.setProperty('--corte', `${divisao.value}%`)
})

const nav = document.getElementById('nav')
const marcar = () => nav.classList.toggle('rolou', scrollY > 8)
addEventListener('scroll', marcar, { passive: true })
marcar()

// Tema: claro é o padrão; o botão mostra para onde vai (lua no claro, sol no escuro)
const botaoTema = document.getElementById('tema')
function pintarTema() {
  const escuro = window.revelaTema?.atual() === 'escuro'
  const nome = escuro ? 'Tema claro' : 'Tema escuro'
  botaoTema.replaceChildren(svg(ICONES[escuro ? 'sol' : 'lua']))
  botaoTema.setAttribute('aria-label', nome)
  botaoTema.title = nome
}
botaoTema?.addEventListener('click', () => {
  window.revelaTema?.alternar()
  pintarTema()
})
if (botaoTema) pintarTema()
