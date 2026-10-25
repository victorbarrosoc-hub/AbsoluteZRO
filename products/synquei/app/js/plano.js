// Plano do usuário: o cartão da barra lateral, o de Ajustes e a comparação dos planos (Fazer upgrade). Ainda não há
// conta nem assinatura no app, então todo mundo está no Grátis e tudo continua liberado; os planos e preços são os
// mesmos da seção Planos do site. A conta Absolute ZRO (conta.js) mostra quem é e se o Synquei está liberado: não muda o plano.

import { h, icon } from './util.js'
import { linhaConta } from './conta.js'

const SITE_PLANOS = 'https://synquei.vercel.app/#planos'
const SOBEDESCE = 'https://sobedesce.com'

export const PLANOS = [
  {
    id: 'gratis',
    nome: 'Grátis',
    preco: 'R$ 0',
    sub: 'Sem conta e sem cadastro',
    itens: ['Sincronia pelo som e pelo timecode', 'Linha do tempo com monitor e tela cheia', 'Exporta em camadas pra 5 editores', 'Mac, Windows e navegador'],
  },
  {
    id: 'pro',
    nome: 'Synquei Pro',
    preco: 'R$ 49',
    mes: true,
    sub: 'ou R$ 490/ano',
    itens: ['Tudo do Grátis', 'Multicâmera nos 4 editores', 'Direto no DaVinci (Beta)'],
    breve: true,
  },
  {
    id: 'combo',
    nome: 'SOBEDESCE + Synquei',
    preco: 'R$ 179',
    mes: true,
    sub: 'ou R$ 1.790/ano',
    itens: ['Tudo do Synquei Pro', 'Plano Produtora do SOBEDESCE', 'Backup automático e conferido no set'],
    link: SOBEDESCE,
    destaque: true,
  },
]

/** Sem conta no app ainda: todo mundo está no Grátis. */
export const planoAtual = () => PLANOS[0]

/** Cartão da barra lateral (aberta) e o botão compacto (recolhida). */
export function cartaoPlano() {
  const p = planoAtual()
  return `<div class="plano-card">
    ${linhaConta()}
    <div class="plano-card-topo"><span class="eyebrow">Seu plano</span><span class="plano-chip">${h(p.nome)}</span></div>
    <p>Multicâmera e Direto no DaVinci no <b>Pro</b>.</p>
    <button class="plano-up" data-act="upgrade">${icon('sparkle')}Fazer upgrade</button>
  </div>
  <button class="plano-mini" data-act="upgrade" data-tip="Plano ${h(p.nome)} · Fazer upgrade" aria-label="Plano ${h(p.nome)}: fazer upgrade">${icon('sparkle')}</button>`
}

/** Comparação dos planos, dentro do app. */
export function abrirPlanos() {
  const atual = planoAtual()
  const layer = document.getElementById('layer')
  const back = document.createElement('div')
  back.className = 'modal-back'
  const card = (p) => `<article class="pm${p.destaque ? ' is-destaque' : ''}${p.id === atual.id ? ' is-atual' : ''}">
      <p class="pm-nome">${h(p.nome)}${p.id === atual.id ? '<span class="plano-chip">Seu plano</span>' : ''}</p>
      <p class="pm-preco"><b>${h(p.preco)}</b>${p.mes ? '<span>/mês</span>' : ''}</p>
      <p class="pm-sub">${h(p.sub)}</p>
      <ul>${p.itens.map((i) => `<li>${icon('check')}${h(i)}</li>`).join('')}</ul>
      ${
        p.id === atual.id
          ? '<span class="btn btn-secondary btn-sm pm-btn is-off">Plano atual</span>'
          : p.breve
            ? '<span class="btn btn-secondary btn-sm pm-btn is-off">Assinatura em breve</span>'
            : `<a class="btn btn-primary btn-sm pm-btn" href="${p.link}" target="_blank" rel="noopener">Conhecer o SOBEDESCE</a>`
      }
    </article>`
  back.innerHTML = `<div class="modal modal-planos" role="dialog" aria-modal="true" aria-label="Planos do Synquei">
    <div class="pm-topo"><h2>Planos do Synquei</h2><button class="icon-btn" data-v="0" aria-label="Fechar">${icon('close')}</button></div>
    <div class="pm-grade">${PLANOS.map(card).join('')}</div>
    <p class="pm-fino">Direto no DaVinci usa as pastas do Backup Automático do SOBEDESCE e precisa do DaVinci Resolve Studio. <a href="${SITE_PLANOS}" target="_blank" rel="noopener">Ver os planos no site</a></p>
  </div>`
  const close = () => back.remove()
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-v="0"]')) close()
  })
  back.addEventListener('keydown', (e) => e.key === 'Escape' && close())
  layer.appendChild(back)
  back.querySelector('[data-v="0"]').focus()
}
