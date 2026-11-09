// Download lento depois de o Google recusar (relato de 09/11/2026: dois picos no começo e depois ~539 KB/s por horas,
// "0 com problema"). Três peças:
//  - economia com prazo: a cota do arquivo (downloadQuotaExceeded) põe o arquivo numa conexão só, mas só por
//    ECONOMIA_PRAZO_MS; depois volta às conexões dos Ajustes. Antes ficava assim até terminar.
//  - recuo da conta: 403 de limite ou 429 em qualquer conexão de download faz TODAS as conexões da conta esperarem
//    juntas (1 s, 2 s, 4 s… até 64 s), em vez de cada uma martelar sozinha até a tarefa desistir.
//  - diário do motor: as últimas linhas do log em memória, sem token e sem nome de arquivo, para o "Copiar diagnóstico".
import { sleep } from '../util/backoff.js'

const MINUTE = 60_000
export const ECONOMIA_PRAZO_MS = 60 * MINUTE

/** O arquivo está em economia (uma conexão só) agora? Registro antigo sem prazo: não (volta às conexões normais). */
export function emEconomia(rec, now = Date.now()) {
  return Boolean(rec?.economia) && Number(rec.economiaAte) > now
}

/** 403 de limite de pedidos ou 429: o Google pediu para ir mais devagar (não é queda de rede). */
export function ehLimite(info) {
  return info?.kind === 'retry' && (info.status === 429 || (info.status === 403 && /rate ?limit/i.test(info.reason || '')))
}

export const MSG_LIMITE = 'O Google pediu para ir mais devagar. Tento de novo sozinho.'
export const MSG_REDE = 'Sem conexão com o Google por enquanto. Tento de novo sozinho.'

/** Espera compartilhada pelas conexões de download de uma conta. */
export class RecuoDaConta {
  constructor({ baseMs = 1000, maxMs = 64_000, now = () => Date.now() } = {}) {
    this.baseMs = baseMs
    this.maxMs = maxMs
    this.now = now
    this.ate = 0
    this.n = 0
    this.vezes = 0 // quantas recusas, desde que o app abriu (diagnóstico)
  }

  /** Uma recusa de limite: todas as conexões da conta esperam até `ate`. Recusas juntas não somam espera. */
  bater(retryAfterMs = 0) {
    const agora = this.now()
    this.vezes++
    if (agora < this.ate) return this.restante()
    const espera = Math.min(this.maxMs, this.baseMs * 2 ** Math.min(this.n, 16))
    this.n++
    this.ate = agora + Math.max(espera, Number(retryAfterMs) || 0)
    return this.restante()
  }

  /** Um pedaço chegou: a próxima recusa recomeça do começo. */
  ok() {
    if (this.now() >= this.ate) this.n = 0
  }

  restante() {
    return Math.max(0, this.ate - this.now())
  }

  /** Espera o recuo da conta (se houver) antes do próximo pedido. */
  async esperar(signal) {
    const ms = this.restante()
    if (ms > 0) await sleep(ms, signal)
  }
}

// Caminhos de arquivo e e-mails nunca vão para o diário (o motivo e o id do registro bastam).
const CAMINHO = /(?:\/(?:Users|home|Volumes|private|tmp|var)\/[^\s'"]+|[A-Za-z]:\\[^\s'"]+)/g
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const TOKEN = /\b(?:ya29\.[\w-]+|1\/\/[\w-]+|Bearer\s+\S+)/g

export function limparLinha(texto) {
  return String(texto).replace(TOKEN, '[token]').replace(CAMINHO, '[caminho]').replace(EMAIL, '[e-mail]')
}

/** As últimas linhas do log do motor (em memória). */
export class DiarioMotor {
  constructor(max = 300) {
    this.max = max
    this.linhas = []
  }

  anotar(args) {
    const texto = args
      .map((a) => (a instanceof Error ? a.message : typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a)))
      .join(' ')
    const linha = `${new Date().toISOString()} ${limparLinha(texto)}`
    this.linhas.push(linha.length > 400 ? `${linha.slice(0, 400)}…` : linha)
    if (this.linhas.length > this.max) this.linhas.splice(0, this.linhas.length - this.max)
    return linha
  }

  ultimas(n = this.max) {
    return this.linhas.slice(-n)
  }
}
