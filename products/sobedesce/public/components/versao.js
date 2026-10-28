// Aviso "Nova versão do SOBEDESCE" na barra lateral, acima dos medidores. Não bloqueia nada: as transferências seguem.
// Na barra fica só uma pílula ("Atualizar" com um ponto); o cartão com os detalhes abre ao lado, num balão (em janela
// baixa o cartão inteiro espremia a navegação e os apps da família). App instalado no Mac/Windows: a versão nova já
// baixa sozinha (com o progresso) e, no fim, aparece "Atualizar agora" (o app fecha, troca e abre de novo). "Baixar"
// fica de alternativa; "Depois" esconde este build (a pílula some; o cartão completo continua em Ajustes).
import { html, useMemo, useRef, useState } from '/vendor/preact-htm.js'
import { cx, useDismiss } from '../lib/ui.js'
import { balaoAoLado } from './balao.js'
import { useStore, activeCount } from '../lib/store.js'
import { dismissUpdate, downloadingAlone, downloadUpdate, installHint, installUpdate, retryUpdate, updateProgress, updateReady, updating } from '../lib/versao.js'
import { Icon } from './icons.js'
import { Button } from './common.js'

/** Barra fina de progresso da atualização (sem medida = listras andando). */
export function UpdateBar({ fraction }) {
  const known = typeof fraction === 'number'
  return html`<div class=${known ? 'update-bar' : 'update-bar is-indeterminate'} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${known ? Math.round(fraction * 100) : undefined}>
    <span style=${known ? { width: `${(fraction * 100).toFixed(1)}%` } : undefined}></span>
  </div>`
}

export function UpdateCard({ onDepois } = {}) {
  const v = useStore((s) => s.versao)
  const depois = () => {
    onDepois?.()
    dismissUpdate()
  }
  const transfers = useStore((s) => s.transfers)
  const busy = useMemo(() => activeCount(transfers) > 0, [transfers])
  const andando = updating(v)
  if (!v?.nova && !andando) return null
  const prog = updateProgress(v.atualizacao)
  const baixando = downloadingAlone(v)
  const pronto = updateReady(v)
  const titulo = andando ? 'Atualizando o SOBEDESCE' : pronto ? 'Versão nova pronta' : 'Nova versão do SOBEDESCE'

  let corpo
  if (andando || baixando) {
    corpo = html`<div class="update-progress" aria-live="polite">
        <${UpdateBar} fraction=${prog?.fraction} />
        <p>${prog?.label}</p>
        ${baixando ? html`<p class="update-busy">Quando terminar, é só tocar em Atualizar agora.</p>` : null}
      </div>
      ${baixando
        ? html`<div class="update-actions">
            <${Button} size="sm" variant="ghost" onClick=${depois}>Depois</${Button}>
          </div>`
        : null}`
  } else {
    const hint = pronto ? 'O app fecha, troca pela versão nova e abre de novo.' : installHint(v.plataforma, v.podeAtualizar)
    let principal
    if (pronto) principal = html`<${Button} size="sm" variant="primary" onClick=${installUpdate}>Atualizar agora</${Button}>`
    else if (v.podeAtualizar && prog?.erro) principal = html`<${Button} size="sm" variant="primary" onClick=${retryUpdate}>Tentar de novo</${Button}>`
    else if (v.podeAtualizar) principal = html`<${Button} size="sm" variant="primary" onClick=${installUpdate}>Atualizar</${Button}>`
    else principal = html`<${Button} size="sm" variant="primary" onClick=${downloadUpdate}>Baixar</${Button}>`
    corpo = html`<p>
        ${prog?.erro ? html`<span class="update-error">${prog.label}</span>` : hint}
        ${busy && !prog?.erro
          ? html` <span class="update-busy">${v.podeAtualizar ? 'Atualizar pausa as transferências até o app voltar.' : 'Instale quando as transferências terminarem.'}</span>`
          : null}
      </p>
      <div class="update-actions">
        ${principal}
        <${Button} size="sm" variant="ghost" onClick=${depois}>Depois</${Button}>
      </div>
      ${v.podeAtualizar ? html`<button type="button" class="update-alt" onClick=${downloadUpdate}>Ou baixe o instalador</button>` : null}`
  }

  return html`<section class="update-card" aria-labelledby="update-title" aria-busy=${andando || baixando ? 'true' : undefined}>
    <div class="update-head">
      <span class="update-mark" aria-hidden="true"><${Icon} name="arrow-down" size=${12} strokeWidth=${2.2} /></span>
      <b id="update-title">${titulo}</b>
    </div>
    ${corpo}
  </section>`
}

/** Texto curto da pílula: o que está acontecendo com a versão nova. */
export function rotuloPilula(v) {
  if (updating(v)) return 'Atualizando…'
  const prog = updateProgress(v?.atualizacao)
  if (prog?.erro) return 'Atualização falhou'
  if (downloadingAlone(v)) return typeof prog?.fraction === 'number' ? `Versão nova · ${Math.floor(prog.fraction * 100)}%` : 'Baixando versão nova'
  if (updateReady(v)) return 'Atualizar'
  return 'Versão nova'
}

/** A pílula da barra lateral; o clique abre o cartão num balão ao lado da barra. */
export function UpdatePill() {
  const v = useStore((s) => s.versao)
  const [pos, setPos] = useState(null)
  const caixa = useRef(null)
  useDismiss(caixa, () => setPos(null), !!pos)
  if (!v?.nova && !updating(v)) return null
  const erro = !!updateProgress(v.atualizacao)?.erro
  const abrir = (e) => setPos(pos ? null : balaoAoLado(e.currentTarget))
  return html`<div class="update-pilula-caixa" ref=${caixa}>
    <button
      type="button"
      class=${cx('update-pilula', erro && 'is-erro', pos && 'is-open')}
      aria-haspopup="dialog"
      aria-expanded=${pos ? 'true' : 'false'}
      title=${`Build ${v.ultima?.build ?? ''}`.trim()}
      onClick=${abrir}
    >
      <span class="update-ponto" aria-hidden="true"></span>
      <span class="update-pilula-txt">${rotuloPilula(v)}</span>
      <${Icon} name="chevron-right" size=${13} />
    </button>
    ${pos ? html`<div class="balao update-balao" role="dialog" aria-label="Versão nova" style=${pos}><${UpdateCard} onDepois=${() => setPos(null)} /></div>` : null}
  </div>`
}
