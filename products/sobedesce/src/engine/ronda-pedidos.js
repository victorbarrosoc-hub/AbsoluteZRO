// Ronda única dos pedidos do celular e do Maestro (proxy, frames, formato, Relay) — CPU da Vercel (titular, 09/11/2026).
// Antes, cada tipo perguntava sozinho (`GET /api/proxies/pedidos?tipo=…` a cada 20–30 s, ~9 por minuto por computador
// aberto, o dia inteiro). Agora uma pergunta só (`tipo=todos`) entrega a cada um a parte dele, e o intervalo cresce
// enquanto não aparece nada: 30 s, 1 min, 2 min… até 5 min. Pediram algo (ou a pessoa mexeu no app): volta a 30 s.
//
//   ronda ──▶ GET /api/proxies/pedidos?status=pendente&tipo=todos ──▶ cada um.consultar(os pedidos do tipo dele)
import { HttpError } from '../net/http.js'
import { isAbortError } from '../util/backoff.js'

export const RONDA_PADRAO = Object.freeze({
  minMs: 30_000, // com pedido na fila ou logo depois de mexer no app
  maxMs: 5 * 60_000, // parado: no máximo uma pergunta a cada 5 min
  primeiraMs: 6_000,
  semSiteMs: 30 * 60_000, // site sem a rota ou recusando (403/404): pergunta de novo depois
})

/** O próximo intervalo: com pedido, o mínimo; sem nada, o dobro do atual até o teto. */
export function proximoIntervalo(atual, temPedido, { minMs, maxMs } = RONDA_PADRAO) {
  if (temPedido) return minMs
  return Math.min(maxMs, Math.max(minMs, atual * 2))
}

export class RondaPedidos {
  /**
   * @param {{ cloud: { signedIn: boolean, request(method, path, opts): Promise<{ data }> }, log?: Function }} o
   * Trocáveis nos testes: minMs, maxMs, primeiraMs, semSiteMs, now.
   */
  constructor({ cloud, log, now = () => Date.now(), ...t } = {}) {
    this.cloud = cloud
    this.t = { ...RONDA_PADRAO, ...t }
    this.log = log || ((...a) => console.warn('[pedidos]', ...a))
    this.now = now
    this.ouvintes = [] // { tipo, consultar(lista) }
    this.intervalo = this.t.minMs
    this.timer = null
    this.proximaEm = 0
    this.rodando = null
    this.pausaAte = 0
    this.closed = false
    this.perguntas = 0 // quantas vezes perguntou ao site (diagnóstico e testes)
  }

  /** Um tipo passa a receber os pedidos dele pela ronda. */
  ouvir(ouvinte) {
    if (!this.ouvintes.includes(ouvinte)) this.ouvintes.push(ouvinte)
  }

  start() {
    this.#planejar(this.t.primeiraMs)
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    this.timer = null
  }

  /** A pessoa mexeu no app (ou chegou um aviso): volta ao intervalo curto e pergunta logo. */
  acordar(emMs = 1_000) {
    if (this.closed) return
    this.intervalo = this.t.minMs
    if (!this.rodando && (!this.timer || this.proximaEm - this.now() > emMs)) this.#planejar(emMs)
  }

  #planejar(ms = this.intervalo) {
    if (this.closed) return
    clearTimeout(this.timer)
    this.proximaEm = this.now() + ms
    this.timer = setTimeout(() => {
      this.timer = null
      this.rodar().catch(() => {})
    }, ms)
    this.timer.unref?.()
  }

  /**
   * Uma volta: pergunta uma vez e entrega a cada tipo a parte dele (sem esperar o trabalho de cada um terminar).
   * O `rodando` fica certo mesmo quando a volta acaba sem esperar nada (sem conta, em pausa): num `async` que volta
   * na hora, o `finally` roda antes da atribuição, e a ronda ficaria presa para sempre.
   */
  async rodar() {
    if (this.rodando) return this.rodando
    let fim
    this.rodando = new Promise((r) => (fim = r))
    let tem = false
    try {
      tem = await this.#volta()
    } finally {
      this.intervalo = proximoIntervalo(this.intervalo, tem, this.t)
      this.rodando = null
      this.#planejar()
      fim()
    }
  }

  async #volta() {
    if (this.closed || !this.cloud?.signedIn || this.now() < this.pausaAte || !this.ouvintes.length) return false
    let pedidos
    try {
      this.perguntas++
      const res = await this.cloud.request('GET', '/api/proxies/pedidos?status=pendente&tipo=todos', { expect: [200] })
      pedidos = Array.isArray(res?.data?.pedidos) ? res.data.pedidos : []
    } catch (err) {
      if (err instanceof HttpError && [400, 403, 404].includes(err.status)) this.pausaAte = this.now() + this.t.semSiteMs
      else if (err?.kind !== 'reauth' && !isAbortError(err)) this.log('não consegui ver os pedidos:', err?.message)
      return false
    }
    let tem = false
    for (const o of this.ouvintes) {
      const meus = pedidos.filter((p) => (p?.tipo || 'proxy') === o.tipo && p?.status === 'pendente')
      if (!meus.length) continue
      tem = true
      // cada tipo faz no tempo dele: um proxy longo não segura a vez do Relay
      Promise.resolve()
        .then(() => o.consultar(meus))
        .catch((err) => this.log(`pedidos de ${o.tipo}:`, err?.message))
    }
    return tem
  }
}
