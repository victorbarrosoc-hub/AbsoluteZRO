// Regras da tela Transferências do celular, sem interface (dá para testar no Node): filtros, ordem da fila, lotes e
// a conferência do lote. As mesmas ideias de public/lib/transferencias.js do app de computador, nos estados do motor do
// navegador (lib/uploader.js).

const RANK = { running: 0, preparing: 1, mac: 2, queued: 3, paused: 4, needsFile: 5, failed: 6 }

/** Ordem das linhas de um lote: andando, na fila (quem passou na frente primeiro), pausado, com problema. */
export function ordemFila(a, b) {
  const r = (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9)
  if (r) return r
  if (a.status === 'queued') {
    const p = (b.priority || 0) - (a.priority || 0)
    if (p) return p
  }
  return (a.id || 0) - (b.id || 0)
}

export const FILTROS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'enviando', label: 'Enviando' },
  { id: 'pausados', label: 'Pausados' },
  { id: 'terminados', label: 'Terminados' },
  { id: 'erro', label: 'Com erro' },
]

const ENVIANDO = new Set(['queued', 'preparing', 'running', 'mac'])
const PAUSADOS = new Set(['paused', 'needsFile'])

/** O item da fila (ainda não terminado) entra neste filtro? */
export function filtraItem(filtro, it) {
  if (filtro === 'tudo') return true
  if (filtro === 'enviando') return ENVIANDO.has(it.status)
  if (filtro === 'pausados') return PAUSADOS.has(it.status)
  if (filtro === 'erro') return it.status === 'failed'
  return false
}

/** A entrada do histórico entra neste filtro? ("Não conferiu" aparece em Terminados e em Com erro.) */
export function filtraHist(filtro, h) {
  if (filtro === 'tudo' || filtro === 'terminados') return true
  if (filtro === 'erro') return h.verify?.state === 'mismatch'
  return false
}

/** Contagem por filtro: { tudo, enviando, pausados, terminados, erro }. */
export function contagem(fila, historico) {
  const out = Object.fromEntries(FILTROS.map((f) => [f.id, 0]))
  for (const f of FILTROS) {
    for (const it of fila) if (filtraItem(f.id, it)) out[f.id]++
    for (const h of historico) if (filtraHist(f.id, h)) out[f.id]++
  }
  return out
}

/**
 * Lotes na ordem em que chegaram: [{ id, folder, itens }]. Quem não tem lote (versão antiga) fica num lote por pasta.
 * `itens` mantém a ordem recebida (quem chama ordena).
 */
export function porLote(lista) {
  const lotes = new Map()
  for (const t of lista) {
    const id = t.batchId || `pasta-${t.folder?.id || 'sem-pasta'}`
    let l = lotes.get(id)
    if (!l) lotes.set(id, (l = { id, folder: t.folder || null, itens: [] }))
    l.itens.push(t)
  }
  return [...lotes.values()]
}

const TERMINADO = new Set(['done', 'skipped', 'canceled'])

/**
 * A rodada de agora, como no computador: os lotes que ainda têm algo por terminar, com o que deles já terminou (terminar
 * não faz a porcentagem cair). Lote todo terminado e cancelado não contam. { frac, feitos, total, restantes, itens }.
 */
export function rodada(items) {
  const vivos = new Set(items.filter((it) => !TERMINADO.has(it.status)).map((it) => it.batchId))
  const itens = items.filter((it) => it.status !== 'canceled' && vivos.has(it.batchId))
  let bytesTotal = 0
  let feito = 0
  let feitos = 0
  for (const it of itens) {
    const size = it.size || 0
    bytesTotal += size
    if (TERMINADO.has(it.status) || it.status === 'mac') {
      feito += size
      feitos++
    } else feito += Math.min(size, (it.offset || 0) + (it.inflight || 0))
  }
  return { frac: bytesTotal ? feito / bytesTotal : 0, feitos, total: itens.length, restantes: Math.max(0, bytesTotal - feito), itens }
}

/** Números de um lote da fila: bytes, feito, velocidade, ETA e quantos em cada estado. */
export function resumoLote(itens) {
  const r = { arquivos: 0, bytes: 0, feito: 0, speed: 0, andando: 0, naFila: 0, pausados: 0, erros: 0, eta: null }
  for (const it of itens) {
    r.arquivos++
    r.bytes += it.size || 0
    r.feito += Math.min(it.size || 0, (it.offset || 0) + (it.inflight || 0))
    if (it.status === 'running' || it.status === 'preparing') {
      r.andando++
      r.speed += it.speed || 0
    } else if (it.status === 'queued') r.naFila++
    else if (it.status === 'paused' || it.status === 'needsFile') r.pausados++
    else if (it.status === 'failed') r.erros++
  }
  const falta = Math.max(0, r.bytes - r.feito)
  r.eta = r.speed > 0 ? falta / r.speed : null
  return r
}

/**
 * Conferência de um lote terminado (só concluídos e "já estava"; cancelado não conta):
 * { total, conferidos, diferentes, sem }.
 */
export function conferenciaLote(entradas) {
  const r = { total: 0, conferidos: 0, diferentes: 0, sem: 0 }
  for (const h of entradas) {
    if (h.result !== 'done' && h.result !== 'skipped') continue
    r.total++
    if (h.verify?.state === 'ok') r.conferidos++
    else if (h.verify?.state === 'mismatch') r.diferentes++
    else r.sem++
  }
  return r
}

/** "3 de 3 conferidos (MD5)" · "2 de 3 conferidos · 1 não conferiu" · "… · 1 sem conferência". */
export function textoConferencia({ total, conferidos, diferentes, sem }) {
  if (!total) return null
  const de = `${conferidos} de ${total} ${total === 1 ? 'conferido' : 'conferidos'}`
  if (conferidos === total) return `${de} (MD5)`
  const parts = [de]
  if (diferentes) parts.push(`${diferentes} não ${diferentes === 1 ? 'conferiu' : 'conferiram'}`)
  if (sem) parts.push(`${sem} sem conferência`)
  return parts.join(' · ')
}

// ───── o resumo ao vivo (como o "Agora" do app de computador, 0.3.7/0.3.8) ─────

/**
 * Quanto falta em número grande e unidade pequena, que não corta: "<1 min", "~12 min", "~1 h 12 min".
 * Devolve [[número, unidade], …].
 */
export function faltaPartes(sec) {
  if (!(sec >= 0) || !Number.isFinite(sec)) return null
  if (sec < 60) return [['<1', 'min']]
  const min = Math.round(sec / 60)
  if (min < 60) return [[`~${min}`, 'min']]
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? [[`~${h}`, 'h'], [String(m), 'min']] : [[`~${h}`, 'h']]
}

/** "termina ~19:22" (ou "termina amanhã ~08:10"); só com mais de um minuto pela frente. */
export function terminaAs(sec, agora = Date.now()) {
  if (!(sec >= 60) || !Number.isFinite(sec)) return null
  const fim = new Date(agora + sec * 1000)
  const hora = `${String(fim.getHours()).padStart(2, '0')}:${String(fim.getMinutes()).padStart(2, '0')}`
  const outroDia = fim.toDateString() !== new Date(agora).toDateString()
  return `termina ${outroDia ? 'amanhã ' : ''}~${hora}`
}

/** O gráfico de velocidade (SVG `w`×`h`): o caminho da linha e o da área, na escala do maior ponto. */
export function caminhoVelocidade(pontos, w, h) {
  if (!pontos.length) return null
  const max = Math.max(1, ...pontos)
  const passo = pontos.length > 1 ? w / (pontos.length - 1) : w
  const xy = pontos.map((v, i) => [i * passo, h - 2 - (v / max) * (h - 6)])
  const linha = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return { linha, area: `${linha} L${xy[xy.length - 1][0].toFixed(1)} ${h} L0 ${h} Z` }
}
