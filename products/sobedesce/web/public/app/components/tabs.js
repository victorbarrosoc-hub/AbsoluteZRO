// Abas do app (embaixo, como no iOS): Z (a IA da Absolute ZRO, a primeira e a tela de entrada; pedido do titular,
// 27/10/2026), Início (o botão de enviar, atalhos e a fila; violeta), Drive (azul), Aparelhos (no
// meio e em destaque: mandar e receber pelo Wi-Fi), Referências (para quem tem o recurso) e Criar (Frames e as outras
// ferramentas do computador, adaptadas ao celular). Por último o Set da Absolute ZRO (a aba em comum do ecossistema,
// components/set.js): aparece quando o Set responde e abre a folha dele, sem trocar de tela.
// No modo Wi-Fi não há abas: lá o celular não tem token do Google.
// A aba Z aparece sempre, com o estado de login dela; sem Drive pronto (`pronto` falso), as outras abas mostram a tela
// da conta (entrar, conectar, escolher ou reconectar o Drive).
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
import { AbaSet, useSetVisivel } from './set.js'

function TabBar({ tab, refsOn }) {
  useEngine()
  const sum = summarize(engine.items)
  const busy = sum.pending > 0
  const aviso = useP2pAviso()
  const abas = 5 + (refsOn ? 1 : 0) + (useSetVisivel() ? 1 : 0)
  return html`<nav class=${cx('tabbar', abas >= 6 && 'n-6', abas >= 7 && 'n-7')} aria-label="Seções">
    <button type="button" class=${cx('tab', 'tab-z', tab === 'z' && 'is-on')} aria-current=${tab === 'z' ? 'page' : undefined} onClick=${() => setTab('z')} title="A Z, a IA da Absolute ZRO">
      <span class="tab-icon"><${Icon} name="z" size=${24} strokeWidth=${tab === 'z' ? 1.9 : 1.6} /></span>
      <span class="tab-label">Z</span>
    </button>
    <button type="button" class=${cx('tab', 'tab-up', tab === 'send' && 'is-on')} aria-current=${tab === 'send' ? 'page' : undefined} onClick=${() => setTab('send')}>
      <span class="tab-icon">
        <${Icon} name="home" size=${24} strokeWidth=${tab === 'send' ? 2 : 1.7} />
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
    <${AbaSet} />
  </nav>`
}

/** As telas ficam montadas (Drive e Referências só depois da primeira visita): trocar de aba não perde nada. */
export function Tabs({ pronto = true }) {
  const { saved, refsOn } = useApp((s) => ({ saved: s.tab, refsOn: Boolean(s.recursos?.referencias) }))
  const tab = saved === 'refs' && !refsOn ? 'send' : saved
  const seen = useRef({})
  seen.current[tab] = true
  if (!pronto)
    return html`<div class="tabs">
      <div class="tab-pane" hidden=${tab !== 'z'}><${ZScreen} /></div>
      <div class="tab-pane" hidden=${tab === 'z'}><${AccountScreen} /></div>
      <${TabBar} tab=${tab} refsOn=${refsOn} />
    </div>`
  return html`<div class="tabs">
    <div class="tab-pane" hidden=${tab !== 'z'}><${ZScreen} /></div>
    <div class="tab-pane" hidden=${tab !== 'send'}><${MainScreen} /></div>
    ${seen.current.drive ? html`<div class="tab-pane" hidden=${tab !== 'drive'}><${DriveScreen} active=${tab === 'drive'} /></div>` : null}
    ${seen.current.ap ? html`<div class="tab-pane" hidden=${tab !== 'ap'}><${AparelhosScreen} active=${tab === 'ap'} /></div>` : null}
    ${seen.current.refs && refsOn ? html`<div class="tab-pane" hidden=${tab !== 'refs'}><${RefsScreen} active=${tab === 'refs'} /></div>` : null}
    ${seen.current.criar ? html`<div class="tab-pane" hidden=${tab !== 'criar'}><${CriarScreen} active=${tab === 'criar'} Calculadora=${Calculadora} /></div>` : null}
    <${TabBar} tab=${tab} refsOn=${refsOn} />
  </div>`
}
