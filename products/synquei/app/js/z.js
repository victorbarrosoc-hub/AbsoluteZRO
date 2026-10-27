// A Z, a IA do ecossistema Absolute ZRO, no topo do Início (site, celular e app de desktop). O painel é o <zro-ia> da
// Absolute ZRO; ele fala com /api/zro/ia, o repasse do próprio Synquei (api/zro/ia.js no site, desktop/conta.cjs no
// app), que acrescenta o token da conta no servidor. O token nunca chega a esta página.
// A Z conversa e lê os dados da conta; não mexe nos arquivos nem no projeto. O resto do Início continua logo abaixo.
// Sem login neste lugar (aberto de arquivo, servidor local sem funções) ou sem rede para buscar o painel: nada aparece.

import { C, linkEntrar } from './conta.js'
import { h, icon } from './util.js'

export const SCRIPT_Z = 'https://absolutezro.com/ia/v1/zro-ia.js'
export const APOIO = 'Sobre a diária, a sincronia ou a sua conta.'
export const SUGESTOES = ['Como sincronizar câmeras sem timecode?', 'Qual exportação usar no DaVinci?', 'Como organizar as diárias de um projeto?', 'Quantos créditos de IA eu tenho?']

let carregou = null
let el = null
let semLogin = false

/** Tema do app (Ajustes › Tema) → tema do painel. */
const temaZ = () => ({ light: 'claro', dark: 'escuro' })[document.documentElement.dataset.theme] || 'auto'

function rodape() {
  const p = document.getElementById('zPainel')
  const pe = p && p.querySelector('.z-entrar')
  if (!pe) return
  pe.hidden = !semLogin
  // logado mas sem a Z (login de antes dela): entrar de novo já pede a permissão da Z
  const de = C.estado === 'logado'
  pe.innerHTML = semLogin ? `<a class="btn btn-primary" data-entrar href="${h(linkEntrar())}">${icon('user')}${de ? 'Entrar de novo para usar a Z' : 'Entrar com Absolute ZRO'}</a>` : ''
}

function criar(p) {
  el?.remove()
  semLogin = false
  el = document.createElement('zro-ia')
  el.setAttribute('api', '/api/zro/ia')
  el.setAttribute('apoio', APOIO)
  el.setAttribute('sugestoes', JSON.stringify(SUGESTOES))
  el.setAttribute('tema', temaZ())
  if (C.pessoa?.nome) el.setAttribute('nome', C.pessoa.nome.split(/\s+/)[0])
  el.addEventListener('zro-ia:sem-login', () => {
    semLogin = true
    rodape()
  })
  p.prepend(el)
  rodape()
}

/** Monta a Z no Início depois de saber da conta (o /eu já renovou o token: a Z não disputa o refresh token com ele). */
export async function iniciarZ() {
  const p = document.getElementById('zPainel')
  if (!p || C.estado === 'sem') return
  try {
    carregou ??= import(SCRIPT_Z)
    await carregou
  } catch {
    // sem rede para buscar o painel: o Início segue como antes
    carregou = null
    return
  }
  if (!customElements.get('zro-ia')) return
  if (!p.querySelector('.z-entrar')) p.insertAdjacentHTML('beforeend', '<div class="z-entrar" hidden></div>')
  criar(p)
  document.documentElement.classList.add('tem-z')
  // Ajustes › Tema: o painel acompanha
  new MutationObserver(() => el?.setAttribute('tema', temaZ())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  // entrou ou saiu da conta: a Z começa de novo com a conta de agora
  let antes = `${C.estado}:${C.pessoa?.email || ''}`
  document.addEventListener('synquei:conta-mudou', () => {
    const agora = `${C.estado}:${C.pessoa?.email || ''}`
    if (agora === antes) return rodape()
    antes = agora
    criar(p)
  })
}
