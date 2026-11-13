// A Z, a IA do ecossistema Absolute ZRO. Aqui ela nunca é a entrada: abre por um anel discreto no topo, numa folha
// (decisão do titular para os apps, 29/10/2026). É o mesmo <zro-ia> de todos os apps, vindo de absolutezro.com, e
// fala com /api/zro/ia/*, o repasse do próprio app (que põe o token da sessão no servidor).
//
// Não fingir: o anel só aparece quando o repasse existe e responde. No primeiro gesto da pessoa, um pedido a
// /api/zro/ia/estado diz se há Z neste app; sem repasse (404), sem anel. A Z conversa e lê dados da conta: não decupa
// nem revela (isso é a pessoa, nas abas).

import { html, useEffect, useRef, useState } from '../preact.js'
import { Icone } from '../icones.js'
import { Folha } from '../componentes/folha.js'
import { noPrimeiroGesto } from './atalhos.js'

export const SCRIPT_Z = 'https://absolutezro.com/ia/v1/zro-ia.js'
export const API_Z = '/api/zro/ia'

const temaDe = () => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro')

/** O repasse da Z existe neste app? (200, ou 401 de quem ainda precisa entrar com o escopo da Z) */
export async function temZ(buscar = fetch) {
  try {
    const r = await buscar(`${API_Z}/estado`, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
    return r.ok || r.status === 401
  } catch {
    return false
  }
}

function PainelDaZ() {
  const lugar = useRef(null)
  const [aviso, definir] = useState(null)
  useEffect(() => {
    let vivo = true
    let z = null
    let observador = null
    ;(async () => {
      try {
        await import(SCRIPT_Z)
        await customElements.whenDefined('zro-ia')
      } catch {
        if (vivo) definir({ texto: 'A Z precisa de internet.' })
        return
      }
      if (!vivo || !lugar.current) return
      z = document.createElement('zro-ia')
      z.setAttribute('api', API_Z)
      z.setAttribute('apoio', 'Em que eu ajudo com as suas fotos?')
      z.setAttribute('tema', temaDe())
      z.addEventListener('zro-ia:sem-login', () => vivo && definir({ texto: 'Entre para conversar com a Z.', entrar: true }))
      observador = new MutationObserver(() => z.setAttribute('tema', temaDe()))
      observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
      lugar.current.append(z)
    })()
    return () => {
      vivo = false
      observador?.disconnect()
      z?.remove()
    }
  }, [])
  return html`<div class="z-lugar" ref=${lugar}>
    ${aviso
      ? html`<div class="z-aviso" role="status">
          <span>${aviso.texto}</span>
          ${aviso.entrar ? html`<a class="vidro vidro--tinta" href="/api/zro/entrar?volta=%2F">Entrar com Absolute ZRO</a>` : null}
        </div>`
      : null}
  </div>`
}

/** O anel da Z no topo e a folha dela. */
export function AnelDaZ({ conta }) {
  const [existe, definirExiste] = useState(false)
  const [aberta, definirAberta] = useState(false)
  const dentro = !!conta?.ok && !conta.local
  useEffect(() => {
    if (!dentro) return
    let vivo = true
    noPrimeiroGesto(async () => {
      const tem = await temZ()
      if (vivo && tem) definirExiste(true)
    })
    return () => (vivo = false)
  }, [dentro])
  if (!existe) return null
  return html`<button type="button" class="liso topo-z" aria-label="Z, a IA da Absolute ZRO" aria-haspopup="dialog" aria-expanded=${aberta ? 'true' : 'false'} data-dica="Z" data-dica-lado="esquerda" onClick=${() => definirAberta(true)}>
      <${Icone} nome="z" />
    </button>
    <${Folha} aberta=${aberta} aoFechar=${() => definirAberta(false)} titulo="Z" largura=${760} classe="folha-z">${aberta ? html`<${PainelDaZ} />` : null}<//>`
}
