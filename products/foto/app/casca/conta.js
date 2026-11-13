// A conta Absolute ZRO no topo (perfil único: nome, foto e e-mail são os da conta e se editam em
// absolutezro.com/perfil). A foto abre o menu; sem foto, as iniciais. No modo local (só para desenvolver) não há
// conta de verdade: o menu fica só com o que é do app.

import { html, useState } from '../preact.js'
import { Menu } from '../componentes/base.js'

export const CONTA_PADRAO = 'https://absolutezro.com/perfil'

export const iniciais = (p) =>
  (p?.nome || p?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('')

/** Onde editar nome, foto e e-mail: a conta Absolute ZRO, nunca aqui. */
export const ondeEditar = (p) => (typeof p?.conta === 'string' && /^https:\/\//.test(p.conta) ? p.conta : CONTA_PADRAO)

/** Só a foto da conta (https, /api/v1/foto/…): o servidor já conferiu que é da Absolute ZRO. */
export function fotoDe(p) {
  try {
    const u = new URL(p?.foto)
    return u.protocol === 'https:' && u.pathname.startsWith('/api/v1/foto/') ? u.href : null
  } catch {
    return null
  }
}

function Avatar({ pessoa }) {
  const [falhou, definir] = useState(false)
  const src = falhou ? null : fotoDe(pessoa)
  return html`<span class="avatar">${src ? html`<img src=${src} alt="" decoding="async" referrerpolicy="no-referrer" onError=${() => definir(true)} />` : iniciais(pessoa)}</span>`
}

/** Sai do app (a sessão na Absolute ZRO continua) e recarrega: o servidor entrega a página neutra. */
export async function sair() {
  await fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  location.replace('/')
}

/**
 * `conta`: a resposta de /api/zro/eu ({ ok, pessoa, local? }). `aoAtalhos` abre a folha de teclas.
 */
export function Conta({ conta, aoAtalhos }) {
  if (!conta?.ok || !conta.pessoa) return null
  const p = conta.pessoa
  const nome = p.nome || String(p.email || '').split('@')[0] || 'Sua conta'
  return html`<${Menu}
    classe="conta"
    lado="direita"
    rotulo=${`Sua conta: ${nome}`}
    gatilho=${html`<${Avatar} pessoa=${p} />`}
    itens=${[
      { no: html`<div class="conta-quem"><${Avatar} pessoa=${p} /><span><strong>${nome}</strong>${p.email ? html`<small>${p.email}</small>` : null}</span></div>` },
      conta.local ? null : { rotulo: 'Sua conta Absolute ZRO', href: ondeEditar(p), externo: true, icone: 'pessoa' },
      { rotulo: 'Atalhos do teclado', icone: 'teclado', detalhe: '?', aoEscolher: aoAtalhos },
      conta.local ? null : { divisa: true },
      conta.local ? null : { rotulo: 'Sair', icone: 'sair', aoEscolher: sair },
    ]}
  />`
}
