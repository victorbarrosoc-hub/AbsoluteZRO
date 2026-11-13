// O Set da Absolute ZRO (ADR 0032 de lá): quem da equipe e dos contatos está online, em qual app, e as conversas.
// É a entrada em comum de todas as plataformas: aqui, um ícone no topo, ao lado do anel da Z. A folha é o
// <zro-set modo="folha"> publicado pela Absolute ZRO, vestido com a identidade daqui (casca.css, --zro-set-*) e no
// tema escolhido. Ele fala com /api/zro/set, o repasse do próprio app, que põe o token da conta no servidor: o token
// nunca chega à página. A entrada só aparece quando o Set responde (pedido do titular, 30/10/2026).
//
// O script de fora só é buscado no primeiro gesto da pessoa: abrir o app não espera nem depende de outra origem.

import { html, useEffect, useState } from '../preact.js'
import { Icone } from '../icones.js'
import { noPrimeiroGesto } from './atalhos.js'

export const SCRIPT_SET = 'https://absolutezro.com/set/v1/zro-set.js'

const temaDe = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')

/**
 * Liga o widget ao estado da entrada. Sem DOM de verdade (o teste usa objetos simples): `mudar(parcial)` recebe
 * { visivel, novidades, online, aberto }.
 */
export function ligarSet(el, mudar) {
  el.addEventListener('zro-set:estado', (ev) => {
    const d = ev.detail || {}
    mudar({ visivel: true, novidades: (d.naoLidas || 0) + (d.pedidos || 0), online: d.online || 0 })
  })
  el.addEventListener('zro-set:sem-login', () => mudar({ visivel: false, novidades: 0, online: 0 }))
  el.addEventListener('zro-set:aberto', () => mudar({ aberto: true }))
  el.addEventListener('zro-set:fechado', () => mudar({ aberto: false }))
}

/** O botão do Set no topo. Não aparece no modo local nem enquanto o Set não responde. */
export function EntradaDoSet({ conta }) {
  const [estado, definir] = useState({ visivel: false, novidades: 0, online: 0, aberto: false, el: null })
  const dentro = !!conta?.ok && !conta.local
  useEffect(() => {
    if (!dentro) return
    let el = null
    let observador = null
    let vivo = true
    noPrimeiroGesto(async () => {
      try {
        await import(SCRIPT_SET)
        await customElements.whenDefined('zro-set')
      } catch {
        return // sem internet ou sem o widget: a entrada simplesmente não aparece
      }
      if (!vivo) return
      el = document.createElement('zro-set')
      el.setAttribute('modo', 'folha')
      el.setAttribute('api', '/api/zro/set')
      el.setAttribute('tema', temaDe())
      // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém
      el.style.display = 'none'
      observador = new MutationObserver(() => el.setAttribute('tema', temaDe()))
      observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
      ligarSet(el, (parcial) => definir((e) => ({ ...e, ...parcial })))
      document.body.append(el)
      definir((e) => ({ ...e, el }))
    })
    return () => {
      vivo = false
      observador?.disconnect()
      el?.remove()
    }
  }, [dentro])
  if (!estado.visivel || !estado.el) return null
  const n = estado.novidades
  const rotulo = `Set${estado.online ? `, ${estado.online} online` : ''}${n ? `, ${n} ${n === 1 ? 'novidade' : 'novidades'}` : ''}`
  return html`<button
    type="button"
    class="liso topo-set"
    aria-label=${rotulo}
    aria-haspopup="dialog"
    aria-expanded=${estado.aberto ? 'true' : 'false'}
    data-dica="Set"
    data-dica-lado="esquerda"
    onClick=${() => (estado.el.aberto ? estado.el.fecharSet?.() : estado.el.abrirSet?.())}
  >
    <${Icone} nome="set" />
    ${n ? html`<span class="balao">${n > 99 ? '99+' : n}</span>` : null}
  </button>`
}
