// "Preparar no Synquei" (src/engine/manifesto.js): o lado do motor.
//
//  - Lote de download terminou (evento 'lote-concluido' do TransferManager): grava a linha v2 na pasta baixada e guarda
//    no próprio lote (batch.synquei) o que a tela precisa: op, pasta, quantos conferidos.
//  - "Preparar no Synquei" (preparar): confere de novo (o manifesto pode ter sido apagado; lote antigo não tinha),
//    marca a hora do pedido e devolve o link synquei://organizar?pasta=…&op=….
//  - Depois do pedido, lê o recibo do Synquei (<pasta>/Synquei/preparos.jsonl) a cada poucos segundos e põe no lote:
//    aguardando → preparando → preparado / com pendências / erro. Sem recibo novo em `esperaMs`: `semResposta`
//    (a tela pede para atualizar o Synquei). Nunca marca "preparado" sem o recibo.
import { linkSynquei } from '../backup/synquei.js'
import { acessoDaPasta, appVersao, gravarManifesto, lerRecibo, manifestoDoLote } from './manifesto.js'

const FINAIS = new Set(['preparado', 'com_pendencias', 'erro'])
const ESPERA_MS = 45_000 // sem recibo nesse tempo: o Synquei não está lá, está fechado e não abriu, ou é antigo
const DESISTE_MS = 6 * 60 * 60_000 // preparando há mais que isso sem mudar: para de olhar (a tela mostra o último)
const INTERVALO_MS = 3000

export class PreparoError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'PreparoError'
    this.status = status
  }
}

export class PreparoSynquei {
  /**
   * @param {{ manager: import('./manager.js').TransferManager, versao?: string, intervaloMs?: number, esperaMs?: number,
   *   desisteMs?: number, agora?: () => number, log?: Function }} o
   */
  constructor({ manager, versao = appVersao(), intervaloMs = INTERVALO_MS, esperaMs = ESPERA_MS, desisteMs = DESISTE_MS, agora = () => Date.now(), log = () => {} }) {
    this.manager = manager
    this.versao = versao
    this.intervaloMs = intervaloMs
    this.esperaMs = esperaMs
    this.desisteMs = desisteMs
    this.agora = agora
    this.log = log
    this.timer = null
    this.rodando = null
    this.fila = Promise.resolve()
    this.onLote = ({ batch }) => {
      if (batch?.type !== 'download' && !this.#records(batch?.id).some((r) => r.type === 'download')) return
      this.fila = this.fila.then(() => this.aoConcluir(batch.id)).catch((err) => this.log('manifesto:', err?.message))
    }
  }

  start() {
    this.manager.on?.('lote-concluido', this.onLote)
    if (this.intervaloMs > 0 && !this.timer) {
      this.timer = setInterval(() => this.verificar().catch(() => {}), this.intervaloMs)
      this.timer.unref?.()
    }
    return this
  }

  close() {
    this.manager.off?.('lote-concluido', this.onLote)
    clearInterval(this.timer)
    this.timer = null
    return this.fila
  }

  #records(batchId) {
    const out = []
    for (const r of this.manager.records?.values?.() || []) if (r.batchId === batchId) out.push(r)
    return out
  }

  #set(batchId, info) {
    this.manager.setBatchInfo(batchId, 'synquei', info)
  }

  /** Grava a linha v2 do lote (se ele for uma pasta baixada inteira e sem arquivo diferente). Nunca lança. */
  async aoConcluir(batchId) {
    const batch = this.manager.batches?.get(batchId)
    if (!batch) return null
    const antes = batch.synquei || {}
    let m
    try {
      m = await manifestoDoLote({ batch, records: this.#records(batchId), versao: this.versao, agora: new Date(this.agora()) })
    } catch (err) {
      m = { ok: false, motivo: err?.message || 'Não consegui conferir a pasta.' }
    }
    if (!m.ok) {
      this.#set(batchId, { indisponivel: m.motivo })
      return null
    }
    try {
      await gravarManifesto(m.pasta, m.linha)
    } catch (err) {
      const semPermissao = err?.code === 'EACCES' || err?.code === 'EPERM'
      this.#set(batchId, { indisponivel: semPermissao ? 'Sem permissão para gravar na pasta baixada.' : 'Não consegui gravar o resumo na pasta baixada.' })
      return null
    }
    const v = m.linha.verificacao
    const info = { op: m.linha.op, pasta: m.pasta, nome: m.linha.destino.pasta, total: v.total, conferidos: v.conferidos, semConferencia: v.sem_conferencia, gravadoEm: m.linha.quando }
    // o pedido e o recibo que já existiam continuam (o mesmo op)
    if (antes.op === info.op) for (const k of ['pedidoEm', 'recibo', 'semResposta', 'acesso']) if (antes[k] !== undefined) info[k] = antes[k]
    this.#set(batchId, info)
    return info
  }

  /**
   * "Preparar no Synquei": o lote precisa ter terminado sem arquivo diferente e a pasta precisa estar acessível.
   * Lança PreparoError (status + texto para a tela).
   * @returns {Promise<{ link: string, pasta: string, op: string }>}
   */
  async preparar(batchId) {
    const batch = this.manager.batches?.get(batchId)
    if (!batch) throw new PreparoError(404, 'Não achei esse download. Ele pode ter sido limpo da lista.')
    const antes = batch.synquei || {}
    const info = await this.aoConcluir(batchId)
    if (!info) {
      const motivo = this.manager.batches.get(batchId)?.synquei?.indisponivel
      const acesso = antes.pasta ? await acessoDaPasta(antes.pasta) : null
      if (acesso === 'sem_pasta') throw new PreparoError(409, 'A pasta baixada não está mais lá (apagada, movida ou o disco foi desconectado).')
      throw new PreparoError(409, motivo || 'Esse download não pode ir para o Synquei.')
    }
    const acesso = await acessoDaPasta(info.pasta)
    if (acesso !== 'ok') {
      this.#set(batchId, { ...info, acesso })
      throw new PreparoError(409, acesso === 'sem_permissao' ? 'Sem permissão para ler a pasta baixada.' : 'A pasta baixada não está mais lá (apagada, movida ou o disco foi desconectado).')
    }
    this.#set(batchId, { ...info, acesso, pedidoEm: new Date(this.agora()).toISOString(), semResposta: false })
    await this.verificar(batchId)
    return { link: linkSynquei(info.pasta, null, info.op), pasta: info.pasta, op: info.op }
  }

  /** Lê o recibo dos lotes que esperam o Synquei (ou só de um). Nunca lança. */
  async verificar(soEste = null) {
    while (this.rodando) await this.rodando
    let fim
    this.rodando = new Promise((r) => (fim = r))
    try {
      const agora = this.agora()
      for (const b of this.manager.batches?.values?.() || []) {
        if (soEste && b.id !== soEste) continue
        const sq = b.synquei
        if (!sq?.op || !sq.pedidoEm) continue
        const pedido = Date.parse(sq.pedidoEm)
        const novo = sq.recibo && Date.parse(sq.recibo.quando) >= pedido - 2000
        if (novo && FINAIS.has(sq.recibo.estado)) continue
        if (agora - pedido > this.desisteMs) continue
        let lido
        try {
          lido = await lerRecibo(sq.pasta, sq.op)
        } catch {
          continue
        }
        const next = { ...sq, acesso: lido.acesso }
        if (lido.recibo && (!sq.recibo || lido.recibo.quando !== sq.recibo.quando || lido.recibo.estado !== sq.recibo.estado)) next.recibo = lido.recibo
        const temNovo = next.recibo && Date.parse(next.recibo.quando) >= pedido - 2000
        next.semResposta = !temNovo && agora - pedido > this.esperaMs
        if (JSON.stringify(next) !== JSON.stringify(sq)) this.#set(b.id, next)
      }
    } finally {
      this.rodando = null
      fim()
    }
  }
}
