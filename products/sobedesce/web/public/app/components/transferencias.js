// Tela Transferências do celular, a mesma ideia da aba do app de computador: o andamento geral (porcentagem,
// velocidade, tempo restante), os lotes da fila (pausar, retomar e cancelar o lote inteiro), os terminados com a
// conferência (MD5) e filtros simples. Abre pelo cartão do Início (TransfersCard); não é aba da barra de baixo.
// Os dados vêm do motor (lib/uploader.js): a fila em engine.items e os terminados em engine.history (IndexedDB).
import { html, useState } from '../vendor/preact-htm.js'
import { LAN, local } from '../lib/config.js'
import { bytes, count, fileKind, KIND_ICON, percent, plural, speed, timecode } from '../lib/format.js'
import { ago } from '../lib/computador.js'
import { closeSheet, folderTrail, openSheet, setTab, useApp } from '../lib/state.js'
import { FINISHED, engine } from '../lib/uploader.js'
import { CONFERIR_AUTO_MAX, seloConferencia } from '../lib/conferir.js'
import { FILTROS, rodada, conferenciaLote, contagem, filtraHist, filtraItem, ordemFila, porLote, resumoLote, textoConferencia } from '../lib/transferencias.js'
import { Icon } from './icons.js'
import { Button, Pill, cx, useEngine } from './ui.js'
import { Pilulas, Vazio } from './kit.js'
import { FileName, QueueRow, SequenceBar, ShareLink, driveLink } from './queue.js'

const FILTRO_KEY = 'sobedesce.transferencias.filtro'
const pctW = (f) => `${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)}%`


function situacao(r) {
  const parts = []
  if (r.andando) parts.push(`${count(r.andando)} enviando`)
  if (r.naFila) parts.push(`${count(r.naFila)} na fila`)
  if (r.pausados) parts.push(plural(r.pausados, 'pausado', 'pausados'))
  if (r.erros) parts.push(`${count(r.erros)} com erro`)
  return parts.join(' · ')
}

// ───── cartão do Início ─────

/** O que hoje mostrava a fila no Início: um cartão só, que abre a tela Transferências. */
export function TransfersCard() {
  useEngine()
  const fila = engine.items.filter((it) => !FINISHED.has(it.status))
  const hist = engine.history
  if (!fila.length && !hist.length) return null
  const r = resumoLote(fila)
  const frac = rodada(engine.items).frac
  const diferentes = hist.filter((h) => h.verify?.state === 'mismatch').length
  const pausado = fila.length > 0 && !r.andando && !r.naFila
  const estado = !fila.length ? (diferentes ? 'erro' : 'pronto') : pausado ? 'pausado' : 'andando'
  const big = estado === 'pronto' ? 'Pronto' : estado === 'erro' ? `${diferentes}` : percent(frac)
  const sub = fila.length
    ? situacao(r)
    : diferentes
      ? `${diferentes === 1 ? 'não conferiu' : 'não conferiram'} · ${plural(hist.length, 'terminado', 'terminados')}`
      : plural(hist.length, 'terminado', 'terminados')
  return html`<button type="button" class=${cx('pc-card', 'tr-card', `is-${estado}`)} onClick=${() => setTab('transferencias')} aria-label=${`Transferências: ${big}, ${sub}. Abrir`}>
    <span class="pc-card-top">
      <span class="pc-card-icon" aria-hidden="true"><${Icon} name="transfers" size=${18} /></span>
      <span class="pc-card-name">Transferências</span>
      ${fila.length && r.eta != null ? html`<span class="tc tr-card-tc" aria-label="tempo restante">${timecode(r.eta)}</span>` : null}
      <${Icon} name="chevron-right" size=${15} strokeWidth=${2} class="pc-card-chev" />
    </span>
    <span class="pc-card-main">
      <span class="pc-card-pct">${big}</span>
      <span class="pc-card-sub">${sub}</span>
    </span>
    ${fila.length ? html`<div class=${cx('pc-bar', pausado && 'tone-muted')} aria-hidden="true"><span style=${`width:${pctW(frac)}`}></span></div>` : null}
  </button>`
}

// ───── tela ─────

function Geral({ fila }) {
  const r = resumoLote(fila)
  const rd = rodada(engine.items)
  const pausado = !r.andando && !r.naFila
  const waiting = useApp((s) => s.auth.issue === 'rede')
  const rotulo = pausado ? 'Pausado' : r.speed > 0 ? speed(r.speed) : waiting ? 'Esperando a conta' : 'Preparando…'
  return html`<section class="pc-card tr-geral k-entra" style="--i:1" aria-label="Andamento geral">
    <div class="pc-card-top">
      <span class="pc-card-icon" aria-hidden="true"><${Icon} name=${pausado ? 'pause' : 'arrow-up'} size=${16} strokeWidth=${2.1} /></span>
      <span class="pc-card-name">${rotulo}</span>
      <span class="tc tr-geral-tc" aria-label="tempo restante">${pausado || !r.speed ? '--:--:--' : timecode(r.eta)}</span>
      <button type="button" class="icon-btn tr-geral-btn" onClick=${() => (pausado ? engine.resumeAll() : engine.pauseAll())} aria-label=${pausado ? 'Retomar tudo' : 'Pausar tudo'}>
        <${Icon} name=${pausado ? 'play' : 'pause'} size=${16} strokeWidth=${2} />
      </button>
    </div>
    <div class="pc-card-main">
      <span class="pc-card-pct">${percent(rd.frac)}</span>
      <span class="pc-card-sub">${count(rd.feitos)} de ${plural(rd.total, 'arquivo', 'arquivos')} · ${bytes(rd.restantes)} restantes</span>
    </div>
    <${SequenceBar} items=${rd.itens} />
  </section>`
}

/** O limite honesto do navegador, recolhido. */
function AbaAberta() {
  return html`<details class="tip tip-more tr-aviso">
    <summary><${Icon} name="info" size=${15} /> <span>Deixe esta aba aberta</span></summary>
    <p>O navegador só envia com a página aberta. Se fechar, o envio para e continua de onde parou quando você escolher o arquivo de novo.</p>
  </details>`
}

function LoteFila({ lote, waiting, i }) {
  const [confirma, setConfirma] = useState(false)
  const todos = engine.batchItems(lote.id).filter((it) => !FINISHED.has(it.status))
  const r = resumoLote(todos)
  const andando = todos.some((it) => it.status === 'queued' || it.status === 'preparing' || it.status === 'running')
  const pausados = todos.some((it) => it.status === 'paused')
  const cancelaveis = todos.filter((it) => it.status !== 'mac').length
  const frac = r.bytes ? r.feito / r.bytes : 0
  const nome = lote.folder?.name || 'Envio'
  const itens = [...lote.itens].sort(ordemFila)
  return html`<section class=${cx('group tr-lote k-entra', !andando && pausados && 'is-paused')} style=${`--i:${i + 3}`} aria-label=${`Lote para ${nome}`}>
    <header class="tr-lote-head">
      <span class=${cx('pc-row-icon', andando ? 'is-up' : '')} aria-hidden="true"><${Icon} name=${andando ? 'arrow-up' : 'pause'} size=${16} strokeWidth=${2.1} /></span>
      <span class="tr-lote-txt">
        <b title=${folderTrail(lote.folder)}>${nome}</b>
        <span class="tr-lote-sub">${plural(r.arquivos, 'arquivo', 'arquivos')} · ${bytes(r.bytes)} · ${percent(frac)}</span>
      </span>
      <span class="tr-lote-acts">
        ${andando ? html`<button type="button" class="icon-btn" onClick=${() => engine.pauseBatch(lote.id)} aria-label="Pausar lote" title="Pausar lote"><${Icon} name="pause" size=${17} strokeWidth=${2} /></button>` : null}
        ${!andando && pausados ? html`<button type="button" class="icon-btn is-strong" onClick=${() => engine.resumeBatch(lote.id)} aria-label="Retomar lote" title="Retomar lote"><${Icon} name="play" size=${17} strokeWidth=${2} /></button>` : null}
        ${cancelaveis ? html`<button type="button" class="icon-btn is-danger" onClick=${() => setConfirma(!confirma)} aria-expanded=${confirma ? 'true' : 'false'} aria-label="Cancelar lote" title="Cancelar lote"><${Icon} name="x" size=${17} strokeWidth=${2} /></button>` : null}
      </span>
    </header>
    ${confirma
      ? html`<div class="tr-confirma" role="alert">
          <span>Cancelar ${plural(cancelaveis, 'envio', 'envios')}?</span>
          <button type="button" class="btn btn-sm btn-secondary" onClick=${() => setConfirma(false)}><span>Voltar</span></button>
          <button type="button" class="btn btn-sm btn-secondary is-danger" onClick=${() => (engine.cancelBatch(lote.id), setConfirma(false))}><span>Cancelar envios</span></button>
        </div>`
      : null}
    <ul class="rows">${itens.map((it) => html`<${QueueRow} key=${it.id} it=${it} waiting=${waiting} />`)}</ul>
  </section>`
}

const RESULTADO = {
  done: { label: 'Concluído', tone: 'success' },
  skipped: { label: 'Já estava', tone: 'success-soft' },
  canceled: { label: 'Cancelado', tone: 'muted' },
}

const SELO_ICONE = { ok: 'shield', erro: 'warning', vivo: 'clock', neutro: 'info', muted: 'x' }

/** O selo da conferência: Conferido (MD5 igual), Não conferiu (diferente) ou Tamanho confere · sem conferência. */
export function Selo({ t, class: klass }) {
  const s = seloConferencia(t)
  return html`<span class=${cx('tr-selo', `is-${s.tom}`, klass)} title=${s.dica}><${Icon} name=${SELO_ICONE[s.tom]} size=${13} strokeWidth=${2} /><span>${s.texto}</span></span>`
}

function HistRow({ h, agora }) {
  const kind = fileKind(h.name, h.type)
  const mismatch = h.verify?.state === 'mismatch'
  const res = mismatch ? { label: 'Não conferiu', tone: 'error' } : RESULTADO[h.result] || RESULTADO.done
  const tone = mismatch ? 'failed' : h.result === 'canceled' ? 'canceled' : 'done'
  return html`<li class=${cx('row', 'is-hist', `is-${h.result}`, mismatch && 'is-mismatch')}>
    <button type="button" class="row-hit" onClick=${() => openSheet('hist', { id: h.id })} aria-label=${`${h.name}, ${res.label}. Mais opções`}>
      <span class=${cx('row-tile', `tone-${tone}`)} aria-hidden="true"><${Icon} name=${KIND_ICON[kind]} size=${20} /></span>
      <span class="row-main">
        <span class="row-top">
          <${FileName} name=${h.name} />
          <span class="tr-quando">${ago(agora - (h.finishedAt || agora))}</span>
        </span>
        <span class="tr-hist-meta">
          <span class="row-nums">${bytes(h.size)}</span>
          ${h.result === 'canceled' ? html`<span class="tr-selo is-muted"><span>Cancelado</span></span>` : html`<${Selo} t=${h} />`}
        </span>
      </span>
    </button>
  </li>`
}

function LoteFeito({ lote, agora, i }) {
  const conf = conferenciaLote(lote.itens)
  const texto = textoConferencia(conf)
  const nome = lote.folder?.name || 'Envio'
  const quando = Math.max(...lote.itens.map((h) => h.finishedAt || 0))
  const itens = [...lote.itens].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
  const bytesLote = lote.itens.reduce((a, h) => a + (h.result === 'canceled' ? 0 : h.size || 0), 0)
  const icone = conf.diferentes ? 'warning' : conf.total ? 'check' : 'x'
  return html`<section class=${cx('group tr-lote is-feito k-entra', conf.diferentes && 'is-erro')} style=${`--i:${i + 3}`} aria-label=${`Terminados em ${nome}`}>
    <header class="tr-lote-head">
      <span class=${cx('pc-row-icon', conf.diferentes ? 'is-err' : conf.total ? 'is-ok' : '')} aria-hidden="true"><${Icon} name=${icone} size=${16} strokeWidth=${2.2} /></span>
      <span class="tr-lote-txt">
        <b title=${folderTrail(lote.folder)}>${nome}</b>
        <span class="tr-lote-sub">${plural(lote.itens.length, 'arquivo', 'arquivos')}${bytesLote ? ` · ${bytes(bytesLote)}` : ''} · ${ago(agora - quando)}</span>
      </span>
    </header>
    ${texto ? html`<p class=${cx('tr-lote-conf', conf.conferidos === conf.total && 'is-ok', conf.diferentes && 'is-erro')}><${Icon} name=${conf.diferentes ? 'warning' : 'shield'} size=${14} /> ${texto}</p>` : null}
    <ul class="rows">${itens.map((h) => html`<${HistRow} key=${h.id} h=${h} agora=${agora} />`)}</ul>
  </section>`
}

const VAZIO = {
  tudo: ['Nada por aqui', 'Os arquivos que você mandar para o Drive aparecem aqui.'],
  enviando: ['Nada enviando agora', null],
  pausados: ['Nada pausado', null],
  terminados: ['Nada terminado ainda', null],
  erro: ['Nenhum erro', null],
}

export function TransfersScreen() {
  useEngine()
  const waiting = useApp((s) => s.auth.issue === 'rede')
  const [filtro, setFiltroState] = useState(() => {
    const salvo = local.get(FILTRO_KEY)
    return FILTROS.some((f) => f.id === salvo) ? salvo : 'tudo'
  })
  const setFiltro = (f) => {
    setFiltroState(f)
    local.set(FILTRO_KEY, f)
  }
  const fila = engine.items.filter((it) => !FINISHED.has(it.status))
  const hist = engine.history
  const conta = contagem(fila, hist)
  const lotesFila = porLote(fila.filter((it) => filtraItem(filtro, it)))
  const lotesFeitos = porLote(hist.filter((h) => filtraHist(filtro, h)))
  const agora = Date.now()
  const r = resumoLote(fila)
  const frase = fila.length ? situacao(r) || plural(fila.length, 'arquivo', 'arquivos') : hist.length ? plural(hist.length, 'terminado', 'terminados') : null
  const limpaveis = hist.some((h) => h.verify?.state !== 'mismatch')
  const vazio = !lotesFila.length && !lotesFeitos.length
  const [titVazio, txtVazio] = VAZIO[filtro] || VAZIO.tudo
  return html`<div class="screen tr-tela">
    <button type="button" class="cr-voltar tr-voltar" onClick=${() => setTab('send')}><${Icon} name="chevron-left" size=${18} />Início</button>
    <header class="k-cabeca k-entra" style="--i:0">
      <div class="k-cabeca-txt">
        <h1>Transferências</h1>
        ${frase ? html`<p>${frase}</p>` : null}
      </div>
    </header>
    ${fila.length ? html`<${Geral} fila=${fila} />` : null}
    ${LAN ? null : html`<${AbaAberta} />`}
    ${fila.length || hist.length
      ? html`<div class="pc-filtros tr-filtros k-entra" style="--i:2"><${Pilulas}
          rolar
          label="Mostrar transferências"
          valor=${filtro}
          onEscolher=${setFiltro}
          itens=${FILTROS.map((f) => ({ value: f.id, label: f.label, conta: f.id !== 'tudo' && conta[f.id] ? count(conta[f.id]) : null }))}
        /></div>`
      : null}
    ${lotesFila.map((l, i) => html`<${LoteFila} key=${l.id} lote=${l} waiting=${waiting} i=${i} />`)}
    ${lotesFeitos.length
      ? html`<div class="section-head tr-feitos-head">
            <h2>Terminados</h2>
            ${limpaveis ? html`<button type="button" class="link-btn" onClick=${() => engine.clearFinished()}>Limpar concluídas</button>` : null}
          </div>
          ${lotesFeitos.map((l, i) => html`<${LoteFeito} key=${l.id} lote=${l} agora=${agora} i=${i + lotesFila.length} />`)}`
      : null}
    ${vazio
      ? html`<${Vazio}
          icone=${filtro === 'erro' ? 'check' : 'transfers'}
          titulo=${titVazio}
          acoes=${filtro === 'tudo'
            ? html`<button type="button" class="btn btn-secondary btn-sm" onClick=${() => setTab('send')}><${Icon} name="upload" size=${15} /><span>Escolher arquivos</span></button>`
            : html`<button type="button" class="btn btn-secondary btn-sm" onClick=${() => setFiltro('tudo')}><span>Ver tudo</span></button>`}
          >${txtVazio}</${Vazio}>`
      : null}
    <p class="foot">Direto do aparelho para o Google: nada passa por servidor nosso.</p>
  </div>`
}

// ───── folha de um terminado ─────

const EXPLICA = {
  semMd5: 'O Drive não devolveu o MD5 deste arquivo.',
  semArquivo: 'A página foi recarregada: o arquivo do aparelho não está mais aqui para conferir.',
  erro: 'Não consegui ler o arquivo do aparelho para conferir.',
}

/** Folha de um envio terminado (vem do histórico): conferência, abrir, compartilhar, conferir agora, tirar da lista. */
export function HistSheet({ id }) {
  useEngine()
  const h = engine.history.find((x) => x.id === id)
  if (!h) return html`<div class="sheet-body"><p class="sub center">Este envio saiu da lista.</p></div>`
  const live = engine.liveOf(id)
  const v = live?.verify || h.verify || {}
  const t = { ...h, verify: v }
  const kind = fileKind(h.name, h.type)
  const mismatch = v.state === 'mismatch'
  const res = RESULTADO[h.result] || RESULTADO.done // o selo ao lado diz a conferência
  const podeConferir = Boolean(live?.file) && !mismatch && v.state !== 'ok' && v.state !== 'running' && v.state !== 'pending' && h.result !== 'canceled'
  const act = (fn) => () => {
    fn()
    closeSheet()
  }
  return html`<div class="sheet-body item-sheet">
    <div class="item-head" data-drag>
      <span class=${cx('row-tile', 'row-tile-lg', `tone-${mismatch ? 'failed' : h.result === 'canceled' ? 'canceled' : 'done'}`)} aria-hidden="true"><${Icon} name=${KIND_ICON[kind]} size=${24} /></span>
      <div class="item-titles">
        <h2 class="item-name">${h.name}</h2>
        <p class="sub">${bytes(h.size)} · ${folderTrail(h.folder) || 'Drive'}</p>
      </div>
    </div>
    <div class="item-state">
      <${Pill} tone=${res.tone}>${res.label}</${Pill}>
      ${h.result === 'canceled' ? null : html`<${Selo} t=${t} />`}
    </div>
    ${mismatch ? html`<p class="item-error">O arquivo no Drive é diferente do seu (MD5). Envie de novo; a cópia diferente fica no Drive.</p>` : null}
    ${v.state === 'big' ? html`<p class="item-explain">Acima de ${bytes(CONFERIR_AUTO_MAX)} a conferência só roda quando você pede: lê o arquivo inteiro.</p>` : null}
    ${v.state === 'unchecked' && EXPLICA[v.reason] ? html`<p class="item-explain">${EXPLICA[v.reason]}</p>` : null}
    ${podeConferir ? html`<${Button} variant="primary" icon="shield" class="btn-block tr-conferir" onClick=${() => engine.verifyNow(live)}>Conferir agora</${Button}>` : null}
    ${h.fileId && !LAN && h.result !== 'canceled' ? html`<${ShareLink} id=${h.fileId} name=${h.name} variant=${podeConferir ? 'secondary' : 'primary'} class="item-share" />` : null}
    <ul class="group menu">
      ${h.fileId && h.result !== 'canceled'
        ? html`<li><a class="menu-item" href=${driveLink(h.fileId)} target="_blank" rel="noopener noreferrer"><${Icon} name="external" /><span>Abrir no Drive</span></a></li>`
        : null}
      ${mismatch && live?.file
        ? html`<li><button type="button" class="menu-item" onClick=${act(() => engine.resend(live))}><${Icon} name="retry" /><span>Enviar de novo (outra cópia)</span></button></li>`
        : null}
      <li><button type="button" class="menu-item" onClick=${act(() => engine.forget(h.id))}><${Icon} name="x" /><span>Tirar da lista</span></button></li>
    </ul>
  </div>`
}
HistSheet.label = 'Envio terminado'
