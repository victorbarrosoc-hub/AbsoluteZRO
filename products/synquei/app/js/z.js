// A Z, a IA do ecossistema Absolute ZRO, numa tela só dela (#/z). Desde 29/10/2026 (titular; Plano de Integração §7–8)
// não é a primeira nem a tela de entrada (site, celular e app de desktop abrem no Início): fica no pé da barra lateral
// e num anel discreto no Início do celular, e nunca abre sozinha. O painel é o <zro-ia> da
// Absolute ZRO; ele fala com /api/zro/ia, o repasse do próprio Synquei (api/zro/ia.js no site, desktop/conta.cjs no
// app), que acrescenta o token da conta no servidor. O token nunca chega a esta página.
// A Z conversa e lê os dados da conta; não mexe nos arquivos nem no projeto. O painel fica fora de #view (a conversa não
// se perde ao trocar de aba); main.js só o mostra na aba Z. Sem conta neste lugar (offline, aberto de arquivo) ou sem
// rede para buscar o painel, a aba diz que a Z precisa de internet e leva ao Início.

import { C, linkEntrar } from './conta.js'
import { h, icon } from './util.js'

export const SCRIPT_Z = 'https://absolutezro.com/ia/v1/zro-ia.js'
export const APOIO = 'Sobre a diária, a sincronia ou a sua conta.'
export const SUGESTOES = ['Como sincronizar câmeras sem timecode?', 'Qual exportação usar no DaVinci?', 'Como organizar as diárias de um projeto?', 'Quantos créditos de IA eu tenho?']

/** A aba Z em #view fica vazia: quem aparece é o painel #zPainel. */
export const telaZ = { title: 'Z', render: () => '' }

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

/** Sem a Z aqui: o recado curto e o caminho de volta para o resto do app, que funciona sem ela. */
function fora(p) {
  p.innerHTML = `<div class="z-fora"><span class="z-fora-anel" aria-hidden="true"></span><h2>A Z precisa de internet.</h2><p>O resto do Synquei funciona sem ela.</p><div class="z-fora-acoes"><button class="btn btn-primary" type="button" data-z="tentar">Tentar de novo</button><a class="btn btn-secondary" href="#/inicio">${icon('home')}Ir para o Início</a></div></div>`
  p.querySelector('[data-z="tentar"]').addEventListener('click', () => location.reload())
}

let contaPronta = null
let montada = null
/**
 * main.js entrega a promessa da conta; a Z só monta na primeira vez que a pessoa abre #/z (abrirZ): nada dela carrega ao
 * abrir o app (titular, 29/10/2026). `jaNaZ`: o app abriu direto em #/z (link direto).
 */
export function ligarZ(conta, jaNaZ = false) {
  contaPronta = conta
  if (jaNaZ) abrirZ()
}
/** A pessoa abriu a Z: monta uma vez, depois de saber da conta. */
export function abrirZ() {
  if (contaPronta) montada ??= contaPronta.then(iniciarZ)
}

/** Monta a Z na aba dela depois de saber da conta (o /eu já renovou o token: a Z não disputa o refresh token com ele). */
export async function iniciarZ() {
  const p = document.getElementById('zPainel')
  if (!p) return
  if (C.estado === 'sem') return fora(p)
  try {
    carregou ??= import(SCRIPT_Z)
    await carregou
  } catch {
    carregou = null
    return fora(p)
  }
  if (!customElements.get('zro-ia')) return fora(p)
  if (!p.querySelector('.z-entrar')) p.insertAdjacentHTML('beforeend', '<div class="z-entrar" hidden></div>')
  criar(p)
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
