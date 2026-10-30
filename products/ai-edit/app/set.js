// O Set da Absolute ZRO no AEON (ADR 0032 da Absolute ZRO): quem da equipe e dos contatos está online, em qual app, e
// as conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, "Set" no fim do dock, depois
// das páginas do editor. A folha é o <zro-set modo="folha"> da Absolute ZRO (lateral no computador, tela cheia no
// celular), vestida com a identidade do AEON (editor.css, --zro-set-*; escuro é o ambiente de trabalho).
//
// O token nunca chega aqui: o <zro-set> fala com /api/zro/set, que no site é o repasse da Vercel (api/_set.js, token no
// cookie cifrado) e no app de computador é o próprio app (desktop/main.cjs, token na memória do processo principal).
// No site o componente vem de absolutezro.com; no app de computador, da cópia em vendor/ (npm run vendor): nenhum
// código de fora roda na janela que tem a ponte com o sistema. A entrada só aparece quando o Set responde (conta com
// zro.set); fechado ao público, só quem já entrou no editor chega aqui (o repasse também confere a liberação).

import { desktop } from './ponte.js'

const HOSPEDADO = 'https://absolutezro.com/set/v1/zro-set.js'
const LOCAL = new URL('../vendor/set/v1/zro-set.js', import.meta.url).href

/**
 * Liga as entradas (botões com data-set) ao widget: aparecem com o primeiro estado, somem sem login, levam o balão das
 * não lidas e dos pedidos e abrem ou fecham a folha. Sem DOM de verdade (o teste usa objetos simples).
 */
export function ligarSet(el, entradas) {
  const cada = (f) => {
    for (const e of entradas) f(e)
  }
  cada((e) => {
    e.hidden = true
    e.setAttribute('aria-haspopup', 'dialog')
    e.setAttribute('aria-expanded', 'false')
    e.addEventListener('click', (ev) => {
      ev.preventDefault?.()
      if (el.aberto) el.fecharSet?.()
      else el.abrirSet?.()
    })
  })
  const balao = (n, rotulo) =>
    cada((e) => {
      const b = e.querySelector?.('[data-set-balao]')
      if (b) {
        b.hidden = !n
        b.textContent = n ? (n > 99 ? '99+' : String(n)) : ''
      }
      e.setAttribute('aria-label', rotulo)
    })
  el.addEventListener('zro-set:estado', (ev) => {
    const d = ev.detail || {}
    const n = (d.naoLidas || 0) + (d.pedidos || 0)
    cada((e) => (e.hidden = false))
    balao(n, `Set${d.online ? `, ${d.online} online` : ''}${n ? `, ${n} ${n === 1 ? 'novidade' : 'novidades'}` : ''}`)
  })
  el.addEventListener('zro-set:sem-login', () => {
    cada((e) => (e.hidden = true))
    balao(0, 'Set')
  })
  el.addEventListener('zro-set:aberto', () => cada((e) => e.setAttribute('aria-expanded', 'true')))
  el.addEventListener('zro-set:fechado', () => cada((e) => e.setAttribute('aria-expanded', 'false')))
}

/** Monta o Set (depois que o editor abriu com a conta). Sem rede para buscar o widget, a entrada não aparece. */
export async function montarSet() {
  const entradas = [...document.querySelectorAll('[data-set]')]
  if (!entradas.length) return null
  try {
    await import(desktop ? LOCAL : HOSPEDADO)
    await customElements.whenDefined('zro-set')
  } catch {
    return null
  }
  const el = document.createElement('zro-set')
  el.setAttribute('modo', 'folha')
  el.setAttribute('api', '/api/zro/set')
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a entrada fica escondida
  el.style.display = 'none'
  ligarSet(el, entradas)
  document.body.append(el)
  return el
}
