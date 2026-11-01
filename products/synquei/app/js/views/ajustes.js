// Ajustes: conta (opcional), aparência, padrões de exportação, atalhos, privacidade e dados guardados no navegador.

import { S, changed } from '../store.js'
import { h, icon, toast, modal } from '../util.js'
import { sfx, soundPrefs, setSoundPrefs } from '../sfx.js'
import { temAtualizador, estadoAtualizacao, buildLabel } from '../atualizacao.js'
import { planoAtual } from '../plano.js'
import { cartaoConta, sair } from '../conta.js'

const theme = () => {
  try {
    return localStorage.getItem('synquei:theme') || 'auto'
  } catch {
    return 'auto'
  }
}
const defaults = () => {
  try {
    return JSON.parse(localStorage.getItem('synquei:defaults') || '{}')
  } catch {
    return {}
  }
}

function versaoApp() {
  const v = estadoAtualizacao()
  const atual = v ? buildLabel(v.atual) : '…'
  const nova = !!(v && v.nova)
  const sub = !v
    ? ''
    : !v.atual.build
      ? 'Versão de desenvolvimento.'
      : nova
        ? `Versão ${v.ultima.build} disponível.`
        : v.verificadaEm
          ? `Você está com a versão mais nova. Conferido ${new Date(v.verificadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
          : ''
  // as atualizações chegam pela central Absolute ZRO (o app não baixa nem instala nada sozinho)
  return `<section class="card"><header class="card-head"><h2>Atualizações</h2></header><div class="card-pad">
    <div class="set-row"><div><b>Synquei ${h(atual)}</b><small>${h(sub)}</small></div></div>
    <div class="set-row"><div><b>As atualizações chegam pela Absolute ZRO</b></div><span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn ${nova ? 'btn-primary' : 'btn-secondary'} btn-sm" data-act="atu-central">Atualizar na Absolute ZRO</button></span></div>
  </div></section>`
}

export default {
  title: 'Ajustes',
  render() {
    const t = theme()
    const d = defaults()
    const som = soundPrefs()
    return `<div class="page tela"><header class="page-head"><div><h1>Ajustes</h1><p class="page-lead">Valem para este ${window.synqueiDesktop ? 'computador' : 'navegador'}.</p></div></header>
    <div class="settings stagger">
      ${cartaoConta()}
      <section class="card"><header class="card-head"><h2>Plano</h2><span class="plano-chip">${h(planoAtual().nome)}</span></header><div class="card-pad">
        <div class="set-row"><div><b>Seu plano: ${h(planoAtual().nome)}</b><small>Sincronia, linha do tempo e exportação para todos os editores. O Pro adiciona multicâmera nos 4 editores e o Direto no DaVinci (Beta).</small></div><button class="btn btn-primary btn-sm" data-act="upgrade">${icon('sparkle')}Fazer upgrade</button></div>
      </div></section>
      <section class="card"><header class="card-head"><h2>Aparência</h2></header><div class="card-pad"><div class="set-row"><div><b>Tema</b><small>Automático segue o sistema.</small></div><div class="seg">${[
        ['auto', 'Automático'],
        ['light', 'Claro'],
        ['dark', 'Escuro'],
      ]
        .map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${t === k}">${l}</button>`)
        .join('')}</div></div></div></section>
      <section class="card"><header class="card-head"><h2>Sons</h2></header><div class="card-pad">
        <div class="set-row"><div><b>Sons da interface</b><small>Curtinhos: arquivos chegando, clipe encaixando, sincronia pronta, exportação.</small></div><label class="switch"><input type="checkbox" data-change="som" ${som.on ? 'checked' : ''} aria-label="Sons da interface"/><i></i></label></div>
        <div class="set-row"${som.on ? '' : ' hidden'}><div><b>Volume</b></div><span class="som-vol"><input type="range" class="range" min="0" max="100" value="${Math.round(som.vol * 100)}" data-input="vol" aria-label="Volume dos sons"/><button class="btn btn-ghost btn-sm" data-act="testar">${icon('play')}Ouvir</button></span></div>
      </div></section>
      <section class="card"><header class="card-head"><h2>Padrões para projetos novos</h2></header><div class="card-pad">
        <label class="set-row"><div><b>Pasta da mídia</b><small>Onde costumam ficar os projetos no seu disco.</small></div><input class="input" style="max-width:280px" data-change="def" data-k="root" value="${h(d.root || '')}" placeholder="/Volumes/SSD" spellcheck="false"/></label>
        <label class="set-row"><div><b>Timecode de início</b><small>Das sequências exportadas.</small></div><select class="select" style="width:auto" data-change="def" data-k="start">${[
          ['01:00:00:00', '01:00:00:00'],
          ['00:00:00:00', '00:00:00:00'],
          ['tc', 'Timecode real'],
        ]
          .map(([v, l]) => `<option value="${v}" ${(d.start || '01:00:00:00') === v ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></label>
      </div></section>
      <section class="card"><header class="card-head"><h2>Atalhos</h2></header><div class="card-pad">
        <div class="set-row"><div><b>Adicionar pasta</b></div><span><span class="kbd">⌘</span> <span class="kbd">O</span></span></div>
        <div class="set-row"><div><b>Sincronizar</b></div><span><span class="kbd">⌘</span> <span class="kbd">↵</span></span></div>
        <div class="set-row"><div><b>Parar a sincronização</b></div><span><span class="kbd">⌘</span> <span class="kbd">.</span></span></div>
        <div class="set-row"><div><b>Exportar tudo</b></div><span><span class="kbd">⌘</span> <span class="kbd">E</span></span></div>
        <div class="set-row"><div><b>Empurrar clipe um quadro</b><small>Na linha do tempo. Com Option/Alt, 1 ms.</small></div><span><span class="kbd">←</span> <span class="kbd">→</span></span></div>
        <div class="set-row"><div><b>Trocar de aba</b><small>Z, Início, Mídia, Sincronizar, Linha do tempo, Exportar.</small></div><span><span class="kbd">1</span> … <span class="kbd">6</span></span></div>
      </div></section>
      ${temAtualizador() ? versaoApp() : ''}
      ${window.synqueiDesktop ? '' : `<section class="card"><header class="card-head"><h2>No computador</h2></header><div class="card-pad">
        <div class="set-row"><div><b>Use no computador com a Absolute ZRO</b><small>Baixe a Absolute ZRO, entre com a sua conta e instale o Synquei por ela.</small></div><a class="btn btn-secondary btn-sm" href="https://absolutezro.com/baixar" target="_blank" rel="noopener">Baixar a Absolute ZRO</a></div>
      </div></section>`}
      <section class="card"><header class="card-head"><h2>Privacidade</h2></header><div class="card-pad" style="padding:16px 20px;display:grid;gap:10px">
        <div class="info-box">${icon('lock')}<div>O Synquei roda inteiro no seu computador. Os arquivos são lidos direto do disco e nunca são enviados para servidor nenhum. Não há rastreador nem análise de uso. A conta Absolute ZRO é opcional e não vê seus arquivos.</div></div>
        <p class="sub">Os projetos (nomes dos arquivos, aparelhos e posições) ficam guardados neste navegador. Para levar a outro computador, exporte o arquivo .synquei em Exportar › Relatório.</p>
      </div></section>
      <section class="card"><header class="card-head"><h2>Dados</h2></header><div class="card-pad"><div class="set-row"><div><b>Projetos guardados</b><small>${S.list.length} neste navegador.</small></div><button class="btn btn-secondary btn-danger" data-act="wipe">${icon('trash')}Apagar todos</button></div></div></section>
      <p class="muted" style="font-size:12px">Synquei · versão 1.0 · feito para quem grava com mais de uma câmera.</p>
    </div></div>`
  },
  acts: {
    'conta-sair'() {
      sair()
    },
    testar() {
      sfx.done()
    },
    theme(el) {
      const v = el.dataset.v
      try {
        if (v === 'auto') localStorage.removeItem('synquei:theme')
        else localStorage.setItem('synquei:theme', v)
      } catch {}
      if (v === 'auto') delete document.documentElement.dataset.theme
      else document.documentElement.dataset.theme = v
      changed()
    },
    async wipe() {
      const ok = await modal({ title: 'Apagar todos os projetos?', body: 'Os arquivos de mídia não são tocados. Isso só limpa a lista deste navegador.', ok: 'Apagar tudo', danger: true })
      if (!ok) return
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('synquei:p:') || k === 'synquei:index') localStorage.removeItem(k)
      } catch {}
      S.list = []
      S.project = null
      toast('Projetos apagados')
      changed()
    },
  },
  inputs: {
    vol(el) {
      setSoundPrefs({ vol: +el.value / 100 })
      sfx.snap()
    },
  },
  changes: {
    som(el) {
      setSoundPrefs({ on: el.checked })
      if (el.checked) sfx.pop()
      changed()
    },
    def(el) {
      const d = defaults()
      d[el.dataset.k] = el.value
      try {
        localStorage.setItem('synquei:defaults', JSON.stringify(d))
      } catch {}
      toast('Padrão salvo')
    },
  },
}
