// Números de cada lote para a tela Transferências ("104 GB em 1 h 12 min · 24,6 MB/s · proxies em 18 min").
// Ficam no próprio lote (`batch.stats`, vai para queue.json e para a tela pelo evento 'batches'), então sobrevivem a
// fechar e abrir o app. Só números do lote: nada de nome de arquivo sai daqui.
//
//  - inicio / fim: o primeiro arquivo que começou e o último original que terminou (conferido, quando o MD5 está ligado).
//  - ativoMs: tempo com ALGUM arquivo do lote andando (vários ao mesmo tempo contam uma vez só). Fila, pausa, espera da
//    cota ou da rede ficam de fora; é a base da velocidade média.
//  - bytes: o que de fato passou pela rede neste lote (o que já estava no Drive não conta; retomada conta só o resto).
//  - proxyInicio / proxyFim / proxyMs: o mesmo para os proxies dos vídeos do lote (proxyMs só com um gerando/subindo).

/** Fases da prévia leve em que o computador está trabalhando nela (fila e pausa não contam). */
export const PROXY_ATIVO = new Set(['analisando', 'baixando', 'gerando', 'enviando'])
/** Fases em que a prévia acabou (bem ou mal). */
export const PROXY_FIM = new Set(['pronta', 'dispensada', 'falhou', 'cancelada'])

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)

export class LoteTempo {
  constructor() {
    this.runs = new Map() // batchId -> { n, since } arquivos do lote andando agora
    this.proxies = new Map() // batchId -> { ids: Set, since } proxies do lote em trabalho agora
  }

  /** O objeto de números do lote (cria na primeira vez; limpa o que veio estranho do disco). */
  static stats(batch) {
    const s = batch.stats && typeof batch.stats === 'object' ? batch.stats : {}
    batch.stats = s
    for (const k of ['ativoMs', 'bytes', 'proxyMs']) s[k] = num(s[k])
    return s
  }

  /** Um arquivo do lote começou a andar. */
  comecou(batch, now = Date.now()) {
    if (!batch) return
    const s = LoteTempo.stats(batch)
    if (!Number.isFinite(s.inicio)) s.inicio = now
    const r = this.runs.get(batch.id) ?? { n: 0, since: now }
    if (r.n === 0) r.since = now
    r.n++
    this.runs.set(batch.id, r)
  }

  /** Um arquivo do lote parou (terminou, pausou, falhou, voltou para a fila). `ok`: o original chegou. */
  parou(batch, { ok = false, now = Date.now() } = {}) {
    if (!batch) return
    const s = LoteTempo.stats(batch)
    const r = this.runs.get(batch.id)
    if (r && r.n > 0) {
      r.n--
      if (r.n === 0) {
        s.ativoMs += Math.max(0, now - r.since)
        this.runs.delete(batch.id)
      }
    }
    if (ok) s.fim = Number.isFinite(s.fim) ? Math.max(s.fim, now) : now
  }

  /** Bytes que passaram pela rede. */
  bytes(batch, n) {
    if (!batch || !(n > 0)) return
    LoteTempo.stats(batch).bytes += n
  }

  /** A prévia leve de um vídeo do lote mudou de fase. Devolve true quando os números mudaram. */
  proxy(batch, recId, estado, now = Date.now()) {
    if (!batch) return false
    const s = LoteTempo.stats(batch)
    const p = this.proxies.get(batch.id) ?? { ids: new Set(), since: now }
    const ativo = PROXY_ATIVO.has(estado)
    let mudou = false
    if (ativo && !p.ids.has(recId)) {
      if (p.ids.size === 0) p.since = now
      p.ids.add(recId)
      if (!Number.isFinite(s.proxyInicio)) s.proxyInicio = now
      this.proxies.set(batch.id, p)
      mudou = true
    } else if (!ativo && p.ids.delete(recId)) {
      if (p.ids.size === 0) {
        s.proxyMs += Math.max(0, now - p.since)
        this.proxies.delete(batch.id)
      }
      mudou = true
    }
    if (PROXY_FIM.has(estado) && estado !== 'cancelada' && estado !== 'dispensada') {
      s.proxyFim = Number.isFinite(s.proxyFim) ? Math.max(s.proxyFim, now) : now
      mudou = true
    }
    return mudou
  }

  /** Fecha os intervalos abertos (o app vai fechar): o que andou até aqui fica gravado. */
  fecharTudo(batches, now = Date.now()) {
    for (const [id, r] of this.runs) {
      const b = batches.get(id)
      if (b && r.n > 0) LoteTempo.stats(b).ativoMs += Math.max(0, now - r.since)
    }
    for (const [id, p] of this.proxies) {
      const b = batches.get(id)
      if (b && p.ids.size) LoteTempo.stats(b).proxyMs += Math.max(0, now - p.since)
    }
    this.runs.clear()
    this.proxies.clear()
  }
}
