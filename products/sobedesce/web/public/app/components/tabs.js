// Abas do app (embaixo, como no iOS): Início (o botão de enviar, atalhos e a fila; violeta; a tela de entrada), Drive
// (azul), Aparelhos (no meio e em destaque: mandar e receber pelo Wi-Fi), Referências (para quem tem o recurso) e Criar
// (Frames e as outras ferramentas do computador, adaptadas ao celular). Nada além da tarefa: a barra fica em no máximo
// cinco abas no iPhone.
// No modo Wi-Fi não há abas: lá o celular não tem token do Google.
// A Z não é aba (titular, 29/10/2026; Plano de Integração §7–8): abre pelo botão discreto do topo (ZBotao, main.js) ou
// por /app/#z, e mostra o estado de login dela; sem Drive pronto (`pronto` falso), as abas mostram a tela da conta.
// O Set da Absolute ZRO (components/set.js) também não é aba: é o botão ao lado da Z no topo, que abre a folha dele sem
// trocar de tela. As abas monta o <zro-set> (useSet) para o app inteiro, com ou sem Drive pronto.
// Transferências (components/transferencias.js) também não é aba: é uma tela do Início (o cartão dele abre), e a aba
// Início fica acesa enquanto ela está aberta.
import { html, useRef } from '../vendor/preact-htm.js'
import { setTab, useApp } from '../lib/state.js'
import { engine, summarize } from '../lib/uploader.js'
import { Icon } from './icons.js'
import { cx, useEngine } from './ui.js'
import { MainScreen } from './main.js'
import { DriveScreen } from './browser.js'
import { RefsScreen } from './referencias.js'
import { CriarScreen } from './criar.js'
import { AparelhosScreen } from './aparelhos.js'
import { useP2pAviso } from './p2p.js'
import { AccountScreen } from './account.js'
import { ZScreen } from './z.js'
import { Calculadora } from './calculadora.js'
import { useSet } from './set.js'
import { TransfersScreen } from './transferencias.js'
import { ABAS_EMBUTIDO, EMBUTIDO } from '../lib/embutido.js'

function TabBar({ tab, refsOn }) {
  useEngine()
  const sum = summarize(engine.items)
  const busy = sum.pending > 0
  const aviso = useP2pAviso()
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
  return html`<nav class=${cx('tabbar', refsOn && 'n-6')} aria-label="Seções">
    <button type="button" class=${cx('tab', 'tab-up', inicio && 'is-on')} aria-current=${inicio ? 'page' : undefined} onClick=${() => setTab('send')}>
      <span class="tab-icon">
        <${Icon} name="home" size=${24} strokeWidth=${inicio ? 2 : 1.7} />
        ${busy ? html`<span class="tab-dot" aria-label="Enviando"></span>` : null}
      </span>
      <span class="tab-label">Início</span>
    </button>
    <button type="button" class=${cx('tab', 'tab-down', tab === 'drive' && 'is-on')} aria-current=${tab === 'drive' ? 'page' : undefined} onClick=${() => setTab('drive')}>
      <span class="tab-icon"><${Icon} name="drive" size=${24} strokeWidth=${tab === 'drive' ? 2 : 1.7} /></span>
      <span class="tab-label">Drive</span>
    </button>
    <button type="button" class=${cx('tab', 'tab-ap', tab === 'ap' && 'is-on')} aria-current=${tab === 'ap' ? 'page' : undefined} onClick=${() => setTab('ap')}>
      <span class="tab-icon">
        <span class="tab-ap-pilula"><${Icon} name="wifi" size=${22} strokeWidth=${2.1} /></span>
        ${aviso ? html`<span class=${cx('tab-dot', aviso === 'pedido' && 'is-pedido')} aria-label=${aviso === 'pedido' ? 'Alguém quer mandar arquivos' : 'Passando pelo Wi-Fi'}></span>` : null}
      </span>
      <span class="tab-label">Aparelhos</span>
    </button>
    ${refsOn
      ? html`<button type="button" class=${cx('tab', 'tab-refs', tab === 'refs' && 'is-on')} aria-current=${tab === 'refs' ? 'page' : undefined} onClick=${() => setTab('refs')}>
          <span class="tab-icon"><${Icon} name="bookmark" size=${24} strokeWidth=${tab === 'refs' ? 2 : 1.7} /></span>
          <span class="tab-label">Referências</span>
        </button>`
      : null}
    <button type="button" class=${cx('tab', 'tab-criar', tab === 'criar' && 'is-on')} aria-current=${tab === 'criar' ? 'page' : undefined} onClick=${() => setTab('criar')}>
      <span class="tab-icon"><${Icon} name="sparkle" size=${24} strokeWidth=${tab === 'criar' ? 2 : 1.7} /></span>
      <span class="tab-label">Criar</span>
    </button>
  </nav>`
}

/**
 * As telas ficam montadas (Drive, Referências e a Z só depois da primeira visita): trocar de aba não perde nada. A Z só
 * monta quando a pessoa abre (anel do topo ou /app/#z): nada dela carrega ao abrir o app (titular, 29/10/2026).
 */
export function Tabs({ pronto = true }) {
  const { saved, refsOn } = useApp((s) => ({ saved: s.tab, refsOn: Boolean(s.recursos?.referencias) }))
  const tab = EMBUTIDO ? (ABAS_EMBUTIDO.includes(saved) ? saved : 'send') : saved === 'refs' && !refsOn ? 'send' : saved
  const seen = useRef({})
  seen.current[tab] = true
  useSet()
  if (!pronto)
    return html`<div class="tabs">
      ${seen.current.z ? html`<div class="tab-pane" hidden=${tab !== 'z'}><${ZScreen} /></div>` : null}
      <div class="tab-pane" hidden=${tab === 'z'}><${AccountScreen} /></div>
      <${TabBar} tab=${tab} refsOn=${refsOn} />
    </div>`
  return html`<div class="tabs">
    ${seen.current.z ? html`<div class="tab-pane" hidden=${tab !== 'z'}><${ZScreen} /></div>` : null}
    <div class="tab-pane" hidden=${tab !== 'send'}><${MainScreen} /></div>
    ${seen.current.transferencias ? html`<div class="tab-pane" hidden=${tab !== 'transferencias'}><${TransfersScreen} /></div>` : null}
    ${seen.current.drive ? html`<div class="tab-pane" hidden=${tab !== 'drive'}><${DriveScreen} active=${tab === 'drive'} /></div>` : null}
    ${seen.current.ap ? html`<div class="tab-pane" hidden=${tab !== 'ap'}><${AparelhosScreen} active=${tab === 'ap'} /></div>` : null}
    ${seen.current.refs && refsOn ? html`<div class="tab-pane" hidden=${tab !== 'refs'}><${RefsScreen} active=${tab === 'refs'} /></div>` : null}
    ${seen.current.criar ? html`<div class="tab-pane" hidden=${tab !== 'criar'}><${CriarScreen} active=${tab === 'criar'} Calculadora=${Calculadora} /></div>` : null}
    <${TabBar} tab=${tab} refsOn=${refsOn} />
  </div>`
}
