// Menu recolhível do app, no molde do SOBEDESCE e do Synquei: em cima o que é do AEON (projetos: ver, criar, abrir,
// salvar cópia), embaixo a família Absolute ZRO numa linha só (abre a grade de apps) e a conta num cartão (quem é,
// conta na Absolute ZRO, sair). As etapas do editor ficam no dock de baixo (estilo DaVinci), não repetidas aqui.
// Recolhido é um trilho de ícones; aberto mostra os nomes. A escolha fica lembrada (⌘/Ctrl + \ alterna).
//
// Links de fora só com https e target=_blank: no navegador abrem aba nova; no app de computador o Electron entrega ao
// navegador do sistema (desktop/main.cjs › setWindowOpenHandler, que recusa qualquer outro endereço).

import { FAMILIA, iconeDe } from '../src/familia.js'
import { CONTA_PADRAO, preencherAvatar } from '../site/conta.js'

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
const externo = (href, props = {}, ...filhos) => el('a', { href, target: '_blank', rel: 'noopener', ...props }, ...filhos)

/**
 * acoes: { conta (pessoa logada ou null), editarConta (zro_conta), universos(), novo(), abrir(), salvar(), sair() } —
 * os mesmos atalhos do teclado. Perfil único: foto e nome são os da conta Absolute ZRO e se editam lá, não aqui. Devolve { atualizar({ projeto, naLista }) } para o editor marcar onde a pessoa está e o que dá para fazer.
 */
export function montarTrilho(acoes) {
  const botao = document.getElementById('menuBotao')
  const item = ({ nome, icone, acao, dica, chave }) => {
    const n = el('button', { className: 'trilho-item', type: 'button', title: dica || nome })
    n.dataset.acao = chave
    n.append(el('span', { className: 'trilho-icone' }, svgUso(icone)), el('span', { className: 'trilho-nome', textContent: nome }))
    n.addEventListener('click', () => !n.disabled && acao())
    return n
  }
  const universos = item({ chave: 'universos', nome: 'Seus universos', icone: 'universos', acao: acoes.universos, dica: 'Seus projetos' })
  const salvar = item({ chave: 'salvar', nome: 'Salvar cópia', icone: 'salvar', acao: acoes.salvar, dica: 'Salvar uma cópia do projeto em arquivo (⌘S)' })

  // ── família: uma linha só; a grade com os apps abre ao lado (popover: Esc e clique fora fecham) ──
  const apps = el('div', { id: 'trilhoApps', className: 'trilho-pop trilho-pop--apps', popover: 'auto', role: 'menu', ariaLabel: 'Apps Absolute ZRO' })
  apps.append(
    el('p', { className: 'trilho-pop-titulo', textContent: 'Absolute ZRO' }),
    el(
      'div',
      { className: 'familia-grade' },
      ...FAMILIA.map((f) =>
        externo(f.href, { className: 'familia-app', role: 'menuitem', title: `${f.nome} · ${f.papel}` }, el('img', { src: iconeDe(f, '../'), alt: '', width: 40, height: 40 }), el('span', { textContent: f.nome })),
      ),
    ),
  )
  const appsBotao = item({ chave: 'apps', nome: 'Apps Absolute ZRO', icone: 'apps', acao: () => {}, dica: 'Os outros apps da Absolute ZRO' })
  appsBotao.setAttribute('popovertarget', 'trilhoApps')
  appsBotao.setAttribute('aria-haspopup', 'menu')

  // ── conta: cartão com a foto da conta (ou as iniciais); o menu diz quem é e leva à conta Absolute ZRO ou sai ──
  const p = acoes.conta
  let contaBotao
  let contaMenu = null
  if (p) {
    const quem = [p.nome, p.email].filter(Boolean).join(' · ')
    contaBotao = el('button', { className: 'trilho-item trilho-conta', type: 'button', title: `${quem} · conta e sair` })
    contaBotao.dataset.acao = 'conta'
    contaBotao.setAttribute('popovertarget', 'trilhoConta')
    contaBotao.setAttribute('aria-haspopup', 'menu')
    contaBotao.append(
      el('span', { className: 'trilho-icone' }, preencherAvatar(el('span', { className: 'avatar', ariaHidden: 'true' }), p)),
      el('span', { className: 'trilho-nome trilho-conta-texto' }, el('strong', { textContent: p.nome || p.email.split('@')[0] }), el('small', { textContent: p.email || '' })),
    )
    const sair = el('button', { className: 'trilho-pop-item', type: 'button', role: 'menuitem', textContent: 'Sair' })
    sair.dataset.acao = 'sair'
    sair.addEventListener('click', () => acoes.sair())
    contaMenu = el(
      'div',
      { id: 'trilhoConta', className: 'trilho-pop trilho-pop--conta', popover: 'auto', role: 'menu', ariaLabel: 'Conta' },
      el('div', { className: 'trilho-pop-cabeca' }, preencherAvatar(el('span', { className: 'avatar avatar--grande', ariaHidden: 'true' }), p), el('span', {}, el('strong', { textContent: p.nome || p.email }), el('small', { textContent: [p.email, p.organizacao?.nome].filter(Boolean).join(' · ') }))),
      externo(acoes.editarConta || CONTA_PADRAO, { className: 'trilho-pop-item', role: 'menuitem', textContent: 'Editar na conta Absolute ZRO', title: 'Nome, foto e e-mail são os mesmos em todos os apps. Abre no navegador.' }),
      sair,
    )
  } else {
    contaBotao = el('a', { className: 'trilho-item trilho-conta', href: '../entrar.html', title: 'Entrar com a conta Absolute ZRO' })
    contaBotao.append(el('span', { className: 'trilho-icone' }, svgUso('conta')), el('span', { className: 'trilho-nome', textContent: 'Entrar' }))
  }

  const trilho = el(
    'aside',
    { id: 'trilho', className: 'trilho', ariaLabel: 'Menu' },
    el(
      'nav',
      { className: 'trilho-nav', ariaLabel: 'Projeto' },
      el('p', { className: 'trilho-grupo', textContent: 'Projeto' }),
      universos,
      item({ chave: 'novo', nome: 'Novo projeto', icone: 'mais', acao: acoes.novo, dica: 'Novo projeto: nome, formato e quadros' }),
      item({ chave: 'abrir', nome: 'Abrir projeto…', icone: 'abrir', acao: acoes.abrir, dica: 'Abrir um arquivo de projeto (⌘O)' }),
      salvar,
    ),
    el('div', { className: 'trilho-pe' }, appsBotao, contaBotao),
  )
  document.body.append(trilho, apps, ...(contaMenu ? [contaMenu] : []))

  // o popover abre colado ao trilho, na altura do botão (recolhido ou aberto)
  for (const [pop, dono] of [
    [apps, appsBotao],
    [contaMenu, contaBotao],
  ]) {
    if (!pop) continue
    pop.addEventListener('beforetoggle', (e) => {
      dono.setAttribute('aria-expanded', String(e.newState === 'open'))
      if (e.newState !== 'open') return
      const r = dono.getBoundingClientRect()
      pop.style.left = `${Math.round(trilho.getBoundingClientRect().right + 8)}px`
      pop.style.bottom = `${Math.max(12, Math.round(innerHeight - r.bottom))}px`
    })
    // abriu um app: fecha a grade (a janela do AEON fica onde estava)
    pop.addEventListener('click', (e) => e.target.closest('a') && pop.hidePopover())
  }

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

  return {
    /** projeto: há um aberto (Salvar cópia só com ele). naLista: a pessoa está em Seus universos. */
    atualizar({ projeto, naLista }) {
      universos.toggleAttribute('aria-current', naLista)
      if (naLista) universos.setAttribute('aria-current', 'page')
      salvar.disabled = !projeto
      salvar.title = projeto ? 'Salvar uma cópia do projeto em arquivo (⌘S)' : 'Abra ou crie um projeto para salvar uma cópia'
    },
  }
}
