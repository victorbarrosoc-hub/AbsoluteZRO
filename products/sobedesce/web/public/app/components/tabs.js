// Abas do app (embaixo, como no iOS), as mesmas do app de computador desde a 0.3.6 que cabem no celular (titular,
// 06/11/2026): Início (enviar, o destino, atalhos; a entrada), Drive, Transferências (o resumo ao vivo e a fila) e
// Estúdio (Frames · Montagens · Referências, components/estudio.js). Cartões fica no computador (o leitor de cartão
// está lá); a Calculadora abre pelo atalho "Cartões" do Início. Quatro abas: nada além da tarefa.
// No modo Wi-Fi não há abas: lá o celular não tem token do Google.
// A Z não é aba (titular, 29/10/2026; Plano de Integração §7–8): abre pelo botão discreto do topo (ZBotao, main.js) ou
// por /app/#z, e mostra o estado de login dela; sem Drive pronto (`pronto` falso), as abas mostram a tela da conta.
// O Set da Absolute ZRO (components/set.js) também não é aba: é o botão ao lado da Z no topo, que abre a folha dele sem
// trocar de tela. As abas monta o <zro-set> (useSet) para o app inteiro, com ou sem Drive pronto.
import { html, useRef } from '../vendor/preact-htm.js'
import { setTab, useApp } from '../lib/state.js'
import { engine, summarize } from '../lib/uploader.js'
import { Icon } from './icons.js'
import { cx, useEngine } from './ui.js'
import { MainScreen } from './main.js'
import { DriveScreen } from './browser.js'
import { RefsScreen } from './referencias.js'
import { CriarScreen } from './criar.js'
import { AccountScreen } from './account.js'
import { ZScreen } from './z.js'
import { Calculadora } from './calculadora.js'
import { useSet } from './set.js'
import { TransfersScreen } from './transferencias.js'
import { ABAS_EMBUTIDO, EMBUTIDO } from '../lib/embutido.js'

// A seção do Estúdio de antes (Frames/Montagens na 'criar' ou Referências na 'refs'): a aba volta para ela.
let ultimaDoEstudio = 'criar'

function TabBar({ tab }) {
  useEngine()
  const sum = summarize(engine.items)
  const busy = sum.pending > 0
  const inicio = tab === 'send' || tab === 'transferencias'
  if (EMBUTIDO)
    return html`<nav class="tabbar n-2" aria-label="Seções">
      <button type="button" class=${cx('tab', 'tab-up', inicio && 'is-on')} aria-current=${inicio ? 'page' : undefined} onClick=${() => setTab('send')}>
        <span class="tab-icon">
          <${Icon} name="upload" size=${24} strokeWidth=${inicio ? 2 : 1.7} />
          ${busy ? html`<span class="tab-dot" aria-label="Enviando"></span>` : null}
        </span>
        <span class="tab-label">Transferências</span>
      </button>
      <button type="button" class=${cx('tab', 'tab-down', tab === 'drive' && 'is-on')} aria-current=${tab === 'drive' ? 'page' : undefined} onClick=${() => setTab('drive')}>
        <span class="tab-icon"><${Icon} name="drive" size=${24} strokeWidth=${tab === 'drive' ? 2 : 1.7} /></span>
        <span class="tab-label">Drive</span>
      </button>
    </nav>`
  // As abas do app de computador (0.3.6) que cabem no celular: Início, Drive, Transferências e Estúdio (Frames,
  // Montagens e Referências). Cartões fica no computador (o leitor está lá); a Calculadora abre pelo atalho do Início.
  const estudio = tab === 'criar' || tab === 'refs'
  if (estudio) ultimaDoEstudio = tab
  const aba = (id, tom, on, icone, rotulo, extra = null) => html`<button type="button" class=${cx('tab', `tab-${tom}`, on && 'is-on')} aria-current=${on ? 'page' : undefined} onClick=${() => setTab(id)}>
    <span class="tab-icon"><${Icon} name=${icone} size=${24} strokeWidth=${on ? 2 : 1.7} />${extra}</span>
    <span class="tab-label">${rotulo}</span>
  </button>`
  return html`<nav class="tabbar n-4" aria-label="Seções">
    ${aba('send', 'up', tab === 'send', 'home', 'Início')}
    ${aba('drive', 'down', tab === 'drive', 'drive', 'Drive')}
    ${aba('transferencias', 'tr', tab === 'transferencias', 'transfers', 'Transferências', busy ? html`<span class="tab-dot" aria-label="Enviando"></span>` : null)}
    <button type="button" class=${cx('tab', 'tab-criar', estudio && 'is-on')} aria-current=${estudio ? 'page' : undefined} onClick=${() => setTab(estudio ? tab : ultimaDoEstudio)}>
      <span class="tab-icon"><${Icon} name="sparkle" size=${24} strokeWidth=${estudio ? 2 : 1.7} /></span>
      <span class="tab-label">Estúdio</span>
    </button>
  </nav>`
}

/**
 * As telas ficam montadas (Drive, Referências e a Z só depois da primeira visita): trocar de aba não perde nada. A Z só
 * monta quando a pessoa abre (anel do topo ou /app/#z): nada dela carrega ao abrir o app (titular, 29/10/2026).
 */
export function Tabs({ pronto = true }) {
  const { saved, refsOn } = useApp((s) => ({ saved: s.tab, refsOn: Boolean(s.recursos?.referencias) }))
  // 'ap' (Aparelhos, o Wi-Fi descontinuado em 02/11/2026) guardado de antes cai no Início.
  const tab = EMBUTIDO ? (ABAS_EMBUTIDO.includes(saved) ? saved : 'send') : (saved === 'refs' && !refsOn) || saved === 'ap' ? 'send' : saved
  const seen = useRef({})
  seen.current[tab] = true
  useSet()
  if (!pronto)
    return html`<div class="tabs">
      ${seen.current.z ? html`<div class="tab-pane" hidden=${tab !== 'z'}><${ZScreen} /></div>` : null}
      <div class="tab-pane" hidden=${tab === 'z'}><${AccountScreen} /></div>
      <${TabBar} tab=${tab} />
    </div>`
  return html`<div class="tabs">
    ${seen.current.z ? html`<div class="tab-pane" hidden=${tab !== 'z'}><${ZScreen} /></div>` : null}
    <div class="tab-pane" hidden=${tab !== 'send'}><${MainScreen} /></div>
    ${seen.current.transferencias ? html`<div class="tab-pane" hidden=${tab !== 'transferencias'}><${TransfersScreen} /></div>` : null}
    ${seen.current.drive ? html`<div class="tab-pane" hidden=${tab !== 'drive'}><${DriveScreen} active=${tab === 'drive'} /></div>` : null}
    ${seen.current.refs && refsOn ? html`<div class="tab-pane" hidden=${tab !== 'refs'}><${RefsScreen} active=${tab === 'refs'} /></div>` : null}
    ${seen.current.criar ? html`<div class="tab-pane" hidden=${tab !== 'criar'}><${CriarScreen} active=${tab === 'criar'} Calculadora=${Calculadora} /></div>` : null}
    <${TabBar} tab=${tab} />
  </div>`
}
