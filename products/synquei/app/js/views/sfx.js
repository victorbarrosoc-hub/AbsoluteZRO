// Analisar a montagem (Beta): escolher uma sequência montada no DaVinci, ver onde cabe um SFX e, se quiser, marcar os
// pontos ou encaixar os sons da sua biblioteca (app/js/montagem.js).

import { h, icon, plural } from '../util.js'
import { midiaUrl } from '../media/pathfile.js'
import { TIPOS } from '../montagem-sfx.js'
import { O } from '../organizar.js'
import { M, buscarSequencias, analisar, escolherBiblioteca, reindexar, escolherSom, alternar, mandar, recomecar } from '../montagem.js'

const NOMES = { abertura: ['abertura', 'aberturas'], corte: ['corte', 'cortes'], impacto: ['pico de som', 'picos de som'], final: ['final', 'finais'] }
const dur = (quadros, fps) => {
  const s = Math.round(quadros / (fps || 24))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function cartaoSequencia() {
  if (M.linha) {
    return `<section class="card"><div class="card-pad sfx-seq-escolhida">
      <span class="sfx-ic">${icon('timeline')}</span>
      <div><b>${h(M.linha.nome)}</b><small>${dur(M.linha.quadros, M.linha.fps)} · ${M.linha.fps} fps · ${plural(M.pontos.length, 'ponto', 'pontos')}</small></div>
      <button class="btn btn-ghost btn-sm" data-act="sfx-outra">Analisar outra sequência</button>
    </div></section>`
  }
  const lista = M.sequencias
  return `<section class="card"><header class="card-head"><h2>Qual sequência você quer analisar?</h2></header><div class="card-pad">
    ${
      lista && lista.length
        ? `<div class="sfx-seqs">${lista
            .map(
              (s) => `<button class="sfx-seq" data-act="sfx-analisar" data-nome="${h(s.nome)}"><span class="sfx-ic">${icon('timeline')}</span><span><b>${h(s.nome)}</b><small>${dur(s.quadros, s.fps)}${s.aberta ? ' · aberta no DaVinci' : ''}</small></span>${icon('chev')}</button>`,
            )
            .join('')}</div>
          <button class="btn btn-ghost btn-sm" data-act="sfx-buscar">${icon('sync')}Buscar de novo</button>`
        : `<p class="sub" style="margin-bottom:14px">O Synquei pergunta ao DaVinci quais sequências o projeto aberto tem. Escolha a montagem final e ele mostra onde cabe um efeito sonoro: cada corte, o começo, o fim e os picos de som.</p>
          <button class="btn btn-primary" data-act="sfx-buscar">${icon('timeline')}Escolher a sequência no DaVinci</button>
          ${O.davinci && !O.davinci.conectado ? `<p class="sub sfx-dica">${icon('info')}Abra o DaVinci e a janelinha do Synquei (Workspace › Scripts › Synquei).${O.davinci.instalado ? '' : ' Antes, instale a ponte na tela Organizar.'}</p>` : ''}`
    }
  </div></section>`
}

function resumo() {
  const n = (t) => M.pontos.filter((p) => p.tipo === t).length
  const total = M.linha.quadros || 1
  return `<section class="card"><div class="card-pad">
    <div class="sfx-resumo">${Object.entries(TIPOS)
      .map(([k, t]) => `<span class="sfx-chip" style="--tom:${t.tom}"><i></i>${plural(n(k), ...NOMES[k])}</span>`)
      .join('')}</div>
    <div class="sfx-trilha" aria-hidden="true">${M.pontos.map((p) => `<i style="--tom:${TIPOS[p.tipo].tom};left:${Math.min(100, (p.quadro / total) * 100)}%" data-tip="${h(`${p.tc} · ${TIPOS[p.tipo].rotulo}`)}"></i>`).join('')}</div>
    ${M.aviso ? `<p class="sub sfx-dica">${icon('info')}${h(M.aviso)}</p>` : ''}
  </div></section>`
}

function linhaPonto(p) {
  const t = TIPOS[p.tipo]
  const opcoes = p.opcoes || []
  const som = opcoes.length
    ? `<select class="select sfx-som" data-change="sfx-som" data-id="${p.id}" aria-label="Som para ${h(p.tc)}">${opcoes.map((o) => `<option value="${h(o.caminho)}"${o.caminho === p.escolhido ? ' selected' : ''}>${h(o.nome)}${o.duracao ? ` · ${o.duracao.toFixed(1)} s` : ''}</option>`).join('')}<option value=""${p.escolhido ? '' : ' selected'}>Sem som</option></select>
       <button class="icon-btn" data-act="sfx-ouvir" data-c="${h(p.escolhido || '')}" aria-label="Ouvir" ${p.escolhido ? '' : 'disabled'}>${icon('play')}</button>`
    : `<span class="sub sfx-sem">${M.biblioteca ? 'Nada parecido na biblioteca' : 'Ligue a sua biblioteca para sugerir sons'}</span>`
  return `<li class="sfx-ponto${p.incluir ? '' : ' is-fora'}">
    <span class="sfx-tc mono">${h(p.tc)}</span>
    <span class="sfx-chip" style="--tom:${t.tom}"><i></i>${t.rotulo}</span>
    <span class="sfx-motivo">${h(p.motivo)}</span>
    <span class="sfx-escolha">${som}${opcoes.length ? `<label class="switch" title="Encaixar este som"><input type="checkbox" data-change="sfx-incluir" data-id="${p.id}" ${p.incluir ? 'checked' : ''} ${p.escolhido ? '' : 'disabled'} aria-label="Encaixar este som"/><i></i></label>` : ''}</span>
  </li>`
}

function biblioteca() {
  const b = M.biblioteca
  return `<section class="card"><header class="card-head"><h2>Sua biblioteca de SFX</h2>${b ? `<span class="chip">${plural(b.total, 'som', 'sons')}</span>` : ''}</header><div class="card-pad">
    <div class="set-row"><div><b>${b ? h(b.pasta.split(/[\\/]/).pop()) : 'Nenhuma pasta ligada'}</b><small>${b ? h(b.pasta) : 'Escolha a pasta onde ficam seus SFX (WAV, AIFF, MP3…). O Synquei sugere os sons pelo nome dos arquivos e das pastas: whoosh, hit, riser, impact…'}</small></div>
    <span style="display:flex;gap:8px">${b ? `<button class="btn btn-ghost btn-sm" data-act="sfx-reindexar">${icon('sync')}Atualizar</button>` : ''}<button class="btn ${b ? 'btn-secondary' : 'btn-primary'} btn-sm" data-act="sfx-biblioteca">${icon('folder')}${b ? 'Trocar pasta' : 'Escolher pasta'}</button></span></div>
  </div></section>`
}

function acoes() {
  const n = M.pontos.filter((p) => p.incluir && p.escolhido).length
  const r = M.resultado
  return `<div class="sfx-acoes">
    <button class="btn btn-secondary" data-act="sfx-marcar">${icon('timeline')}Marcar os ${plural(M.pontos.length, 'ponto', 'pontos')} no DaVinci</button>
    <button class="btn btn-primary" data-act="sfx-encaixar" ${n ? '' : 'disabled'}>${icon('music')}Encaixar ${plural(n, 'som', 'sons')}</button>
    ${r ? `<span class="sfx-feito">${icon('check')}${r.sons ? `${plural(r.encaixados, 'som encaixado', 'sons encaixados')} na faixa “SFX · Synquei” e ` : ''}${plural(r.marcados, 'marcador', 'marcadores')} na sequência${r.falhas ? ` · ${plural(r.falhas, 'som não entrou', 'sons não entraram')}` : ''}</span>` : ''}
  </div>`
}

export default {
  title: 'Analisar montagem',
  render() {
    if (!M.ativo)
      return `<div class="page tela"><header class="page-head"><div><h1>Analisar montagem</h1><p class="page-lead">Só no app de desktop, junto com o DaVinci Resolve Studio.</p></div></header></div>`
    return `<div class="page tela"><header class="page-head"><div><h1>Analisar montagem <span class="chip chip-lav">Beta</span></h1><p class="page-lead">Uma opção extra para o fim da edição: escolha a sequência montada no DaVinci e veja onde cabe um efeito sonoro. Marque os pontos ou encaixe sons da sua biblioteca numa faixa à parte.</p></div></header>
      ${M.ocupado ? `<div class="info-box org-agora is-live">${icon('sync')}<div><b>${h(M.ocupado)}</b></div></div>` : ''}
      ${M.erro ? `<div class="warn-box" style="margin-bottom:16px">${icon('warn')}<div>${h(M.erro)}</div></div>` : ''}
      <div class="settings stagger">
        ${cartaoSequencia()}
        ${M.linha ? resumo() : ''}
        ${M.linha && M.pontos.length ? `<section class="card"><header class="card-head"><h2>Onde cabe um SFX</h2><span class="sub">${plural(M.pontos.length, 'ponto', 'pontos')}</span></header><ul class="sfx-pontos">${M.pontos.map(linhaPonto).join('')}</ul></section>${acoes()}` : ''}
        ${biblioteca()}
      </div>
      <audio id="sfxPrevia" hidden></audio></div>`
  },
  acts: {
    'sfx-buscar': () => buscarSequencias(),
    'sfx-analisar': (el) => analisar(el.dataset.nome),
    'sfx-outra': () => {
      recomecar()
      buscarSequencias()
    },
    'sfx-biblioteca': () => escolherBiblioteca(),
    'sfx-reindexar': () => reindexar(),
    'sfx-ouvir': (el) => {
      const a = document.getElementById('sfxPrevia')
      if (!a || !el.dataset.c) return
      a.src = midiaUrl(el.dataset.c)
      a.play().catch(() => {})
    },
    'sfx-marcar': () => mandar(false),
    'sfx-encaixar': () => mandar(true),
  },
  changes: {
    'sfx-som': (el) => escolherSom(el.dataset.id, el.value),
    'sfx-incluir': (el) => alternar(el.dataset.id, el.checked),
  },
}
