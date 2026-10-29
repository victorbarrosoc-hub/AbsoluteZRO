// Revela · balão de pendências nas abas do dock e nos itens do menu (o mesmo desenho do SOBEDESCE e do HUB). Cada
// ferramenta diz quanto espera a pessoa (src/pendencias.js) e este módulo pinta: pílula com o número no canto do ícone
// do dock, à direita do nome no menu aberto e no canto do ícone no menu recolhido. O dock e o menu ficam parados quando
// a aba troca (app/navegar.js), então o número da Converter continua lá enquanto a pessoa está na LUT.

import { paginaDe } from './navegar.js'
import { rotuloBalao } from '../src/pendencias.js'

const atuais = new Map() // pagina → { n, dica }

function pintar(a, { n, dica }) {
  const nome = a.dataset.nome ?? (a.dataset.nome = a.title || a.textContent.trim())
  let balao = a.querySelector(':scope > .balao')
  if (!n) {
    balao?.remove()
    if (a.classList.contains('menu-item')) a.title = nome
    else a.removeAttribute('title')
    return
  }
  if (!balao) {
    balao = Object.assign(document.createElement('span'), { className: 'balao' })
    balao.setAttribute('role', 'img')
    a.append(balao)
  }
  balao.textContent = rotuloBalao(n)
  balao.setAttribute('aria-label', `${n} ${n === 1 ? 'pendência' : 'pendências'}`)
  a.title = `${nome} · ${dica}`
}

function pintarTudo() {
  for (const a of document.querySelectorAll('.abas a[href], .menu-item[href]')) {
    const p = paginaDe(a.href)
    if (p) pintar(a, atuais.get(p) ?? { n: 0, dica: '' })
  }
}

/** A ferramenta `pagina` (lut, cst, entrega, converter) tem `n` coisas esperando a pessoa. */
export function avisarPendencias(pagina, { n, dica }) {
  const antes = atuais.get(pagina)
  if (antes && antes.n === n && antes.dica === dica) return
  atuais.set(pagina, { n, dica })
  pintarTudo()
}
