// Regras da tela Transferências sem interface (dá para testar no Node): filtros, integridade do lote e o rodapé
// do medidor ("1,7 GB andando · 42 GB parados").
import { bits, bytes, duracao, speed } from './format.js'

const RANK = { running: 0, verifying: 0, failed: 1, waiting: 2, paused: 3, queued: 4, completed: 5, skipped: 5, canceled: 6 }

/**
 * Ordem das linhas de um lote: andando, com problema, esperando, pausado, na fila, concluído, cancelado.
 * Na fila, a mesma ordem do motor: prioridade e, no envio, o maior arquivo primeiro (no mesmo lote e na mesma
 * prioridade o motor sobe o maior antes); depois a ordem de entrada.
 */
export function sortRows(a, b) {
  const r = (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9)
  if (r) return r
  if (a.status === 'queued') {
    const p = (b.priority || 0) - (a.priority || 0)
    if (p) return p
    if (a.type === 'upload' && b.type === 'upload' && a.batchId === b.batchId) {
      const s = (b.size || 0) - (a.size || 0)
      if (s) return s
    }
  }
  return (a.createdAt || 0) - (b.createdAt || 0) || (a.name < b.name ? -1 : 1)
}

/** Pausado com motivo (acesso vencido, disco cheio…): não volta sozinho, alguém precisa agir. */
export function needsYou(t) {
  return t.status === 'paused' && !!t.error
}

export const FILTER_TESTS = {
  all: () => true,
  // "Pausado · precisa de você" não conta aqui: vai para "Com problema", junto com o que falhou.
  active: (t) => t.status === 'running' || t.status === 'verifying' || t.status === 'waiting' || (t.status === 'paused' && !t.error),
  queued: (t) => t.status === 'queued',
  done: (t) => t.status === 'completed' || t.status === 'skipped',
  failed: (t) => t.status === 'failed' || t.verify?.state === 'mismatch' || needsYou(t),
}

/**
 * Integridade do lote, pelo que o motor já sabe de cada item concluído: `verify.state` 'ok' é MD5 conferido;
 * 'mismatch' chegou diferente; o resto (conferência desligada, Doc Google, arquivo sem MD5) ficou sem conferência.
 */
export function integrity(items) {
  let total = 0
  let checked = 0
  let mismatch = 0
  for (const t of items) {
    if (t.status !== 'completed' && t.status !== 'skipped') continue
    total++
    if (t.verify?.state === 'ok') checked++
    else if (t.verify?.state === 'mismatch') mismatch++
  }
  return { total, checked, mismatch, unchecked: total - checked - mismatch }
}

/** "9 de 9 conferidos (MD5)" · "8 de 9 conferidos · 1 sem conferência" · "… · 1 chegou diferente". */
export function integrityLabel({ total, checked, mismatch, unchecked }) {
  if (!total) return null
  if (checked === total) return `${total} de ${total} ${total === 1 ? 'conferido' : 'conferidos'} (MD5)`
  const parts = [`${checked} de ${total} ${total === 1 ? 'conferido' : 'conferidos'}`]
  if (mismatch) parts.push(`${mismatch} ${mismatch === 1 ? 'chegou diferente' : 'chegaram diferentes'}`)
  if (unchecked) parts.push(`${unchecked} sem conferência`)
  return parts.join(' · ')
}

/**
 * Rodapé do medidor a partir de stats.totals: o que anda (mesma conta do ETA) e o que está parado, à parte.
 * Motor antigo sem `remaining`: cai na conta de antes (tudo o que falta).
 */
export function meterTotals(totals = {}) {
  const all = Math.max(0, (totals.bytes || 0) - (totals.doneBytes || 0))
  const moving = typeof totals.remaining === 'number' ? Math.max(0, totals.remaining) : all
  return { moving, parked: Math.max(0, totals.parked || 0), parkedCount: totals.parkedCount || 0, problems: totals.problems || 0 }
}

const PODE_ANDAR = new Set(['queued', 'running', 'verifying', 'waiting', 'paused'])
const FEITO = new Set(['completed', 'skipped'])

/**
 * O que conta no número grande de "Agora": a rodada de agora, não a lista inteira. Lotes que ainda andam (ou estão
 * pausados), mais os que terminaram depois que o primeiro deles começou (terminar não faz a porcentagem cair). Nada
 * andando: o último lote (mostra como ele terminou). Cancelado e envio substituído por uma nova tentativa não contam.
 * Devolve { size, done, total, feitos } (bytes e arquivos).
 */
export function rodada(items) {
  const vivas = (items || []).filter((t) => t.status !== 'canceled')
  const lotes = new Map()
  for (const t of vivas) {
    const k = t.batchId || 'sem-lote'
    let l = lotes.get(k)
    if (!l) lotes.set(k, (l = { itens: [], anda: false, inicio: Infinity, fim: 0, criado: Infinity }))
    l.itens.push(t)
    if (PODE_ANDAR.has(t.status)) l.anda = true
    l.inicio = Math.min(l.inicio, t.startedAt || t.createdAt || Infinity)
    l.criado = Math.min(l.criado, t.createdAt || Infinity)
    l.fim = Math.max(l.fim, t.finishedAt || 0)
  }
  const todos = [...lotes.values()]
  const andando = todos.filter((l) => l.anda)
  let escopo
  if (andando.length) {
    const inicio = Math.min(...andando.map((l) => l.inicio))
    escopo = todos.filter((l) => l.anda || (Number.isFinite(inicio) && l.fim >= inicio))
  } else {
    const ultimo = todos.sort((a, b) => b.fim - a.fim || b.criado - a.criado)[0]
    escopo = ultimo ? [ultimo] : []
  }
  const out = { size: 0, done: 0, total: 0, feitos: 0 }
  for (const t of escopo.flatMap((l) => l.itens)) {
    const size = t.size || 0
    out.total++
    out.size += size
    if (FEITO.has(t.status)) {
      out.feitos++
      out.done += size
    } else out.done += Math.min(size, t.bytesDone || 0)
  }
  return out
}

/**
 * A pasta do Drive para mandar o link de um envio concluído. Uma pasta enviada inteira ("CAM_A → Diária 02") vira a
 * própria pasta nova (CAM_A, criada no Drive); arquivos soltos, a pasta de destino. Só envios (download não tem pasta
 * no Drive) e só com todos os arquivos indo para o mesmo destino. Devolve { id, name, driveId, accountId } ou null.
 * `id` 'root' = Meu Drive (abre, mas não tem link para mandar).
 */
export function batchFolder(items, batch = {}) {
  const ups = (items || []).filter((t) => t.type === 'upload' && t.status !== 'canceled' && t.target?.rootId)
  if (!ups.length) return null
  const { rootId, driveId = null } = ups[0].target
  const accountId = ups[0].accountId || batch.accountId || null
  if (ups.some((t) => t.target.rootId !== rootId || (t.target.driveId || null) !== (driveId || null) || (t.accountId || null) !== accountId)) return null
  const tops = new Set(ups.map((t) => String(t.target.relDir || '').split('/')[0]))
  const [top] = tops
  if (tops.size === 1 && top) {
    // A pasta nova: o id vem de quem foi direto para ela (parentId é a pasta que recebeu o arquivo).
    const direct = ups.find((t) => t.target.relDir === top && t.target.parentId)
    if (direct) return { id: direct.target.parentId, name: top, driveId: driveId || null, accountId }
  }
  const name = rootId === 'root' && !driveId ? 'Meu Drive' : batch.destino || (rootId === driveId ? 'drive compartilhado' : 'pasta de destino')
  return { id: rootId, name, driveId: driveId || null, accountId }
}

/**
 * Onde um lote de download está caindo no computador: { dir, target, name }. `dir` é a pasta comum a todos os
 * arquivos (a pasta baixada, "…/SSD/ZRO"); `target` é o que o Finder/Explorer mostra selecionado para abrir essa pasta:
 * um arquivo que está nela (o pronto, ou o temporário de quem está baixando), ou a própria pasta. Cancelados não
 * contam. Sem caminho conhecido: null.
 */
export function batchLocal(items) {
  const downs = (items || []).filter((t) => t.type === 'download' && t.status !== 'canceled' && t.dest?.path)
  if (!downs.length) return null
  const sep = downs[0].dest.path.includes('\\') && !downs[0].dest.path.includes('/') ? '\\' : '/'
  const split = (p) => String(p).split(/[\\/]/)
  let common = split(downs[0].dest.path).slice(0, -1)
  for (const t of downs.slice(1)) {
    const d = split(t.dest.path).slice(0, -1)
    let i = 0
    while (i < common.length && i < d.length && common[i] === d[i]) i++
    common = common.slice(0, i)
  }
  if (common.length <= 1) return null
  const dir = common.join(sep)
  const here = (t) => split(t.dest.path).slice(0, -1).join(sep) === dir
  const pronto = downs.find((t) => here(t) && t.status === 'completed')
  const indo = downs.find((t) => here(t) && t.dest.tempPath && (t.status === 'running' || t.status === 'verifying'))
  const target = pronto ? pronto.dest.path : indo ? indo.dest.tempPath : dir
  return { dir, target, name: common[common.length - 1] }
}

// ───── proxies (prévia leve) e números do lote ─────

/** Fases da prévia leve que ainda vão andar (as mesmas do motor: src/media/previa-fila.js, PREVIA_PENDENTE). */
export const PROXY_PENDENTE = new Set(['fila', 'pausada', 'analisando', 'baixando', 'gerando', 'enviando'])
const PROXY_ATIVO = new Set(['analisando', 'baixando', 'gerando', 'enviando'])

/** O envio tem proxy na fila ou sendo feito? (limpar a lista não tira esse lote) */
export const proxyPendente = (t) => t?.type === 'upload' && PROXY_PENDENTE.has(t.previa?.estado)

/**
 * Proxies dos vídeos de um lote, pelo que o motor grava em cada envio (`t.previa`): quantos precisam (`total` =
 * prontos + pendentes + falharam; "já tinha proxy" e pulados não contam), quantos faltam, quantos falharam (com os ids
 * para "Tentar de novo") e o andamento do lote inteiro (`frac`, 0–1).
 */
export function proxiesDoLote(items) {
  const px = { total: 0, prontos: 0, pendentes: 0, ativos: 0, pausados: 0, falhou: 0, falhouIds: [], feitos: 0, frac: 0 }
  let parcial = 0
  for (const t of items || []) {
    if (t.type !== 'upload' || t.status === 'canceled' || t.status === 'failed') continue
    const e = t.previa?.estado
    if (e === 'pronta') px.prontos++
    else if (e === 'falhou') {
      px.falhou++
      px.falhouIds.push(t.id)
    } else if (PROXY_PENDENTE.has(e)) {
      px.pendentes++
      if (e === 'pausada') px.pausados++
      if (PROXY_ATIVO.has(e)) {
        px.ativos++
        const f = Number.isFinite(t.previa.frac) ? Math.max(0, Math.min(1, t.previa.frac)) : 0
        // Gerar pesa mais que subir (a cópia é leve): ~85% do tempo de um proxy é a conversão.
        parcial += e === 'enviando' ? 0.85 + 0.15 * f : e === 'gerando' ? 0.85 * f : 0
      }
    } else continue
    px.total++
  }
  px.feitos = px.total - px.pendentes
  px.frac = px.total ? Math.min(1, (px.feitos + parcial) / px.total) : 0
  return px
}

/**
 * O que o cartão do lote diz dos proxies. `originais`: todos os originais já chegaram (o lote "terminou").
 * `proxyMs`: quanto os proxies levaram (batch.stats), para "26 proxies prontos em 18 min".
 * Devolve null (lote sem proxy) ou { tom: 'trabalhando'|'pausado'|'falhou'|'ok', texto, curto }.
 */
export function proxyResumo(px, { originais = false, proxyMs = 0 } = {}) {
  if (!px?.total) return null
  const prontos = (n) => `${n} ${n === 1 ? 'proxy pronto' : 'proxies prontos'}`
  if (px.pendentes) {
    const pausado = px.pausados === px.pendentes
    const fase = pausado ? 'proxies pausados' : 'gerando proxies'
    return {
      tom: pausado ? 'pausado' : 'trabalhando',
      texto: originais ? `Originais no Drive · ${fase} ${px.feitos} de ${px.total}` : `${pausado ? 'Proxies pausados' : 'Gerando proxies'} ${px.feitos} de ${px.total}`,
      curto: `proxies ${px.feitos}/${px.total}`,
    }
  }
  if (px.falhou) {
    const falhou = px.falhou === 1 ? '1 proxy falhou' : `${px.falhou} proxies falharam`
    return { tom: 'falhou', texto: px.prontos ? `${falhou} · ${px.prontos} ${px.prontos === 1 ? 'pronto' : 'prontos'}` : falhou, curto: falhou }
  }
  const em = proxyMs >= 1000 ? ` em ${duracao(proxyMs)}` : ''
  return { tom: 'ok', texto: prontos(px.prontos) + em, curto: prontos(px.prontos) }
}

/**
 * Números do lote para quem quer saber como foi. Vêm de `batch.stats` (o motor grava: src/engine/lote-tempo.js).
 * Lote de uma versão anterior, sem eles: cai no relógio (primeiro começo → último fim) e no tamanho do que chegou, e
 * marca `estimado`. Devolve null enquanto não há o que mostrar (nada chegou, ou tudo já estava no destino).
 * @returns {{ bytes, duracaoMs, ativoMs, velocidade, proxyMs, estimado } | null}
 */
export function numerosLote(batch, items) {
  const s = batch?.stats
  const chegou = (items || []).filter((t) => t.status === 'completed' || t.status === 'skipped')
  let inicio = Number(s?.inicio) || 0
  let fim = Number(s?.fim) || 0
  let bytesRede = Number(s?.bytes) || 0
  let ativoMs = Number(s?.ativoMs) || 0
  let estimado = false
  if (!inicio || !fim) {
    if (!chegou.length) return null
    inicio = Math.min(...(items || []).map((t) => Number(t.startedAt) || Infinity))
    fim = Math.max(...chegou.map((t) => Number(t.finishedAt) || 0))
    if (!Number.isFinite(inicio) || !fim || fim < inicio) return null
    bytesRede = chegou.filter((t) => t.status === 'completed').reduce((a, t) => a + (t.size || 0), 0)
    ativoMs = 0
  }
  const duracaoMs = Math.max(0, fim - inicio)
  // Sem o tempo andando (versão anterior) a média usa o relógio inteiro: dá um número menor, nunca maior.
  if (!ativoMs) {
    ativoMs = duracaoMs
    estimado = true
  }
  if (!(bytesRede > 0) || !(ativoMs > 0)) return null
  return { bytes: bytesRede, duracaoMs, ativoMs, velocidade: bytesRede / (ativoMs / 1000), proxyMs: Number(s?.proxyMs) || 0, estimado }
}

/**
 * "104 GB em 1 h 12 min · 24,6 MB/s" e a dica com o detalhe (tempo andando, média em Mbps, tempo dos proxies).
 * O tempo dos proxies vai na linha deles ("26 proxies prontos em 18 min", proxyResumo).
 */
export function numerosTexto(n) {
  if (!n) return null
  const parts = [`${bytes(n.bytes)} em ${duracao(n.duracaoMs)}`, speed(n.velocidade)]
  const dica = [
    `Do primeiro arquivo ao último que chegou: ${duracao(n.duracaoMs)}.`,
    n.estimado ? 'Média pelo tempo total (lote de uma versão anterior).' : `Transferindo de fato: ${duracao(n.ativoMs)} (fila, pausas e esperas ficam fora).`,
    `Média: ${speed(n.velocidade)} (${bits(n.velocidade)}).`,
  ]
  if (n.proxyMs >= 1000) dica.push(`Proxies: ${duracao(n.proxyMs)} gerando e subindo.`)
  return { texto: parts.join(' · '), partes: parts, dica: dica.join(' ') }
}
