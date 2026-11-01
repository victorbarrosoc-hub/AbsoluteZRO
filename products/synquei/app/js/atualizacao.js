// Aviso "Atualização disponível" na barra lateral (só no app de computador). Desde 01/11/2026 quem instala e atualiza
// os apps de computador é a central Absolute ZRO: o Synquei não baixa nem instala nada. O app confere o site
// (desktop/versao.cjs) e, com versão nova, mostra este aviso discreto; "Atualizar na Absolute ZRO" abre
// absolutezro://apps/synquei?acao=atualizar (sem a central no computador, a página de baixar a central).

import { h, icon, toast } from './util.js'

const api = globalThis.synqueiDesktop && globalThis.synqueiDesktop.atualizacao
let st = null

export const temAtualizador = () => !!api
export const estadoAtualizacao = () => st

/** "versão 12 · 21 de out. de 2026" (ou "versão de desenvolvimento"). */
export function buildLabel(info) {
  if (!info || !info.build) return 'versão de desenvolvimento'
  const d = info.data ? new Date(info.data) : null
  const quando = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return quando ? `versão ${info.build} · ${quando}` : `versão ${info.build}`
}

/** O cartão da barra lateral (vazio sem versão nova). */
export function cartaoHtml(v = st) {
  if (!v || !v.nova) return ''
  return `<section class="atu" aria-labelledby="atuTitulo">
    <div class="atu-topo"><span class="atu-marca" aria-hidden="true">${icon('download')}</span><b id="atuTitulo">Atualização disponível</b>${v.ultima ? `<span class="atu-build">versão ${h(String(v.ultima.build))}</span>` : ''}</div>
    <div class="atu-acoes"><button class="btn btn-primary btn-sm" data-act="atu-central">Atualizar na Absolute ZRO</button></div>
  </section>`
}

/** Desenha o cartão em `box`. Devolve 'novo' (HTML trocado) ou 'igual'. */
export function aplicarCartao(box, v = st) {
  const html = cartaoHtml(v)
  if (box.innerHTML === html) return 'igual'
  box.innerHTML = html
  return 'novo'
}

function desenhar() {
  const box = document.getElementById('atuCard')
  const r = box ? aplicarCartao(box) : 'novo'
  if (r !== 'igual') document.dispatchEvent(new CustomEvent('synquei:atualizacao-mudou'))
}

export function iniciarAtualizacao() {
  if (!api) return
  api.on((s) => {
    st = s
    desenhar()
  })
  api
    .status()
    .then((s) => {
      st = s
      desenhar()
    })
    .catch(() => {})
}

/** Ações dos botões (data-act="atu-…"), ligadas no main.js. */
export const acoesAtualizacao = {
  'atu-central'() {
    api.central().catch(() => {})
  },
  async 'atu-verificar'(el) {
    if (el) el.disabled = true
    st = await api.verificar()
    desenhar()
    if (el) el.disabled = false
    if (st && !st.nova) toast(st.falhou ? 'Não deu para conferir agora. Tente de novo daqui a pouco.' : 'Você já está com a versão mais nova')
  },
}
