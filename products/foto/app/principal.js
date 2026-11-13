// Entrada do app (módulo carregado pela casca, app/index.html). Aqui fica só a estrutura: quem é a pessoa, o tema e o
// ponto onde as telas montam. As telas (Preact + htm, sem build) entram em `Telas` abaixo.
// Bibliotecas: sempre por caminho relativo a /vendor (a CSP não aceita import map inline).

import { render } from '../vendor/preact/preact.mjs'
import { html } from '../vendor/htm/preact.mjs'
import { ASSINATURA, NOME } from './nome.js'

const raiz = document.documentElement

/** Tema: claro é o padrão. A escolha fica no cookie foto_tema, que o servidor lê para a página já nascer certa. */
export const tema = {
  atual: () => (raiz.dataset.tema === 'escuro' ? 'escuro' : 'claro'),
  definir(valor) {
    const t = valor === 'escuro' ? 'escuro' : 'claro'
    raiz.dataset.tema = t
    document.cookie = `foto_tema=${t}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'escuro' ? '#0e0e10' : '#f5f5f7')
    return t
  },
  alternar: () => tema.definir(tema.atual() === 'escuro' ? 'claro' : 'escuro'),
}

/**
 * Quem está logado: { ok, acesso, pessoa } de /api/zro/eu (que relê o perfil na Absolute ZRO no máximo uma vez por
 * minuto: é assim que o acesso tirado no HUB chega aqui). Sem rede, { ok: false, semRede: true }.
 */
export async function conta() {
  try {
    const r = await fetch('/api/zro/eu', { headers: { accept: 'application/json' } })
    return r.ok ? await r.json() : { ok: false, semRede: true }
  } catch {
    return { ok: false, semRede: true }
  }
}

/** Ponto de montagem das telas. Enquanto elas não chegam, só o nome e a assinatura. */
function Telas() {
  return html`<section class="casca"><h1>${NOME}</h1><p>${ASSINATURA}</p></section>`
}

const alvo = document.getElementById('app')
render(html`<${Telas} />`, alvo)
alvo.removeAttribute('aria-busy')
raiz.dataset.pronto = '1'

// A sessão acabou ou o acesso saiu: recarrega, e o servidor entrega a página neutra. Sem rede, fica como está
// (e sem login configurado, que só acontece no modo local, também: recarregar não mudaria nada).
conta().then((c) => {
  if (!c.semRede && c.configurado !== false && !(c.ok && c.acesso)) location.reload()
})
