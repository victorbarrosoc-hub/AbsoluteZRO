// Menu recolhível do app, como nas outras plataformas da Absolute ZRO: projeto (abrir, salvar), conta e a família
// Absolute ZRO. Recolhido é um trilho de ícones; aberto mostra os nomes. A escolha fica lembrada (⌘/Ctrl + \ alterna).
// As páginas do editor ficam no dock de baixo (estilo DaVinci).

import { FAMILIA, CONTA, iconeDe } from '../src/familia.js'

const CHAVE = 'aeon-menu'
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos)
  return n
}
const svgUso = (id) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  u.setAttribute('href', `#i-${id}`)
  s.append(u)
  return s
}

/** acoes: { universos(), abrir(), salvar() } — os mesmos atalhos do teclado */
export function montarTrilho(acoes) {
  const botao = document.getElementById('menuBotao')
  const item = ({ nome, icone, img, href, acao, dica }) => {
    const n = href ? el('a', { className: 'trilho-item', href, target: '_blank', rel: 'noopener' }) : el('button', { className: 'trilho-item', type: 'button' })
    n.title = dica || nome
    n.append(el('span', { className: 'trilho-icone' }, img ? el('img', { src: img, alt: '', width: 22, height: 22 }) : svgUso(icone)), el('span', { className: 'trilho-nome', textContent: nome }))
    if (acao) n.addEventListener('click', acao)
    return n
  }
  const trilho = el(
    'aside',
    { id: 'trilho', className: 'trilho', ariaLabel: 'Menu' },
    el('p', { className: 'trilho-grupo', textContent: 'Projeto' }),
    item({ nome: 'Seus universos', icone: 'universos', acao: acoes.universos, dica: 'Seus projetos' }),
    item({ nome: 'Abrir projeto', icone: 'abrir', acao: acoes.abrir, dica: 'Abrir projeto (⌘O)' }),
    item({ nome: 'Salvar cópia', icone: 'salvar', acao: acoes.salvar, dica: 'Salvar uma cópia do projeto em arquivo (⌘S)' }),
    el('p', { className: 'trilho-grupo', textContent: 'Conta' }),
    item({ nome: 'Entrar', icone: 'conta', href: CONTA.entrar, dica: 'Entrar com a conta Absolute ZRO' }),
    el('p', { className: 'trilho-grupo', textContent: 'Absolute ZRO' }),
    ...FAMILIA.map((f) => item({ nome: f.nome, img: iconeDe(f, '../'), href: f.href, dica: `${f.nome} · ${f.papel}` })),
  )
  document.body.append(trilho)

  const ler = () => {
    try {
      return localStorage.getItem(CHAVE) === 'aberto'
    } catch {
      return false
    }
  }
  const aplicar = (aberto) => {
    document.documentElement.classList.toggle('trilho-aberto', aberto)
    botao.setAttribute('aria-expanded', String(aberto))
    botao.setAttribute('aria-label', aberto ? 'Recolher menu' : 'Abrir menu')
  }
  const alternar = () => {
    const aberto = !document.documentElement.classList.contains('trilho-aberto')
    try {
      localStorage.setItem(CHAVE, aberto ? 'aberto' : 'recolhido')
    } catch {}
    aplicar(aberto)
  }
  botao.addEventListener('click', alternar)
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault()
      alternar()
    }
  })
  aplicar(ler())
}
