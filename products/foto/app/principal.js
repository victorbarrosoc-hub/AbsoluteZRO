// Entrada do app (módulo carregado pela casca, app/index.html). Aqui fica só a estrutura: o tema, quem é a pessoa e o
// ponto onde a casca monta. A casca (app/casca/casca.js) traz o topo, o dock e o painel; as telas moram em
// app/telas/<nome>/index.js; o estado, em app/estado.js (a loja).
// Bibliotecas: sempre por caminho relativo a /vendor (a CSP não aceita import map inline); veja app/preact.js.

import { html, render } from './preact.js'
import { Casca } from './casca/casca.js'
import { loja } from './estado.js'

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

const alvo = document.getElementById('app')
render(html`<${Casca} loja=${loja} tema=${tema} lerConta=${conta} />`, alvo)
alvo.removeAttribute('aria-busy')
raiz.dataset.pronto = '1'
