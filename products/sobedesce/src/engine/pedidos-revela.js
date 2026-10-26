// "Converter com a Revela" pedido pelo celular (docs/CONTAS.md §11): o celular escolhe o destino e o site guarda o
// pedido na mesma fila dos proxies (tipo "revela", ajustes { destino }). Este computador, com a mesma conta e o
// ffmpeg, pega um por vez, converte como o botão direito da tela Drive (src/media/revela.js: original da fila ou
// baixado do Drive) e conta `pronto` com o arquivo novo, que fica ao lado do vídeo.
//
//   a cada 30 s ──▶ GET /api/proxies/pedidos?status=pendente&tipo=revela ──▶ POST …/pegar (409 = outro levou)
//               ──▶ converterComRevela ──▶ PATCH pronto { resultado, proxyFileId } | erro
//
// Sinal de vida a cada 5 min; 404/409 nele (cancelado no celular, outro computador levou) para no meio. Fechar o app
// devolve o pedido para `pendente`. Sem ffmpeg, não pega nada. Site antigo (sem o tipo "revela"): pausa 30 min.
import { HttpError } from '../net/http.js'
import { isAbortError } from '../util/backoff.js'
import { converterComRevela, destinoRevela, originalLocal } from '../media/revela.js'
import { isVideoName } from '../media/previa.js'

const POLL_MS = 30_000
const VIDA_MS = 5 * 60_000
const SEM_SITE_MS = 30 * 60_000

const corta = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n)

export class PedidosRevela {
  /**
   * @param {object} o
   * @param {{ signedIn: boolean, request(method, path, opts): Promise<{ status, data }> }} o.cloud conta SOBEDESCE
   * @param {object} o.manager TransferManager (driveFor, previas, records)
   * Trocáveis nos testes: pollMs, vidaMs, converter (converterComRevela), log.
   */
  constructor({ cloud, manager, pollMs = POLL_MS, vidaMs = VIDA_MS, converter = converterComRevela, log } = {}) {
    this.cloud = cloud
    this.manager = manager
    this.pollMs = pollMs
    this.vidaMs = vidaMs
    this.converter = converter
    this.log = log || ((...a) => console.warn('[revela]', ...a))
    this.timer = null
    this.rodando = null
    this.atual = null // { id, ac }
    this.pausaAte = 0
    this.closed = false
  }

  start() {
    this.#planejar(12_000)
  }

  async close() {
    this.closed = true
    clearTimeout(this.timer)
    this.timer = null
    this.atual?.ac.abort()
    await this.rodando?.catch(() => {})
  }

  #planejar(ms = this.pollMs) {
    if (this.closed) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.consultar().catch(() => {})
    }, ms)
    this.timer.unref?.()
  }

  async #api(method, path, body) {
    const res = await this.cloud.request(method, path, { body, expect: [200, 201] })
    return res?.data && typeof res.data === 'object' ? res.data : {}
  }

  /** Pega e faz os pedidos pendentes, um por vez (os mais antigos primeiro). Devolve quantos terminaram aqui. */
  async consultar() {
    if (this.rodando) return this.rodando
    this.rodando = (async () => {
      try {
        const gerador = this.manager?.previas
        if (this.closed || !gerador || !this.cloud?.signedIn || Date.now() < this.pausaAte) return 0
        let pedidos
        try {
          const d = await this.#api('GET', '/api/proxies/pedidos?status=pendente&tipo=revela')
          pedidos = Array.isArray(d.pedidos) ? d.pedidos.filter(p => p?.tipo === 'revela') : []
        } catch (err) {
          if (err instanceof HttpError && [400, 403, 404].includes(err.status)) this.pausaAte = Date.now() + SEM_SITE_MS
          else if (err?.kind !== 'reauth' && !isAbortError(err)) this.log('não consegui ver os pedidos da Revela:', err?.message)
          return 0
        }
        if (!pedidos.length) return 0
        const motor = await gerador.motor().catch(() => null)
        if (!motor?.ffmpeg?.path) return 0 // sem conversor aqui: deixa para outro computador
        let feitos = 0
        for (const p of pedidos.slice().reverse()) {
          if (this.closed || !this.cloud.signedIn) break
          if (p.status !== 'pendente' || typeof p.id !== 'string') continue
          if (await this.#fazer(p, gerador)) feitos++
        }
        return feitos
      } finally {
        this.rodando = null
        this.#planejar()
      }
    })()
    return this.rodando
  }

  async #pegar(id) {
    try {
      await this.#api('POST', `/api/proxies/pedidos/${encodeURIComponent(id)}/pegar`, {})
      return true
    } catch (err) {
      if (err instanceof HttpError && (err.status === 409 || err.status === 404)) return false
      throw err
    }
  }

  async #contar(id, corpo) {
    await this.#api('PATCH', `/api/proxies/pedidos/${encodeURIComponent(id)}`, corpo).catch(err => this.log('não consegui avisar o site sobre o pedido da Revela:', err?.message))
  }

  async #fazer(p, gerador) {
    try {
      if (!(await this.#pegar(p.id))) return false
    } catch (err) {
      this.log('não consegui pegar o pedido da Revela:', err?.message)
      return false
    }
    const ac = new AbortController()
    this.atual = { id: p.id, ac }
    let largado = false
    const vida = setInterval(() => {
      this.#api('PATCH', `/api/proxies/pedidos/${encodeURIComponent(p.id)}`, { status: 'gerando' }).catch(err => {
        if (err instanceof HttpError && (err.status === 404 || err.status === 409)) {
          largado = true // cancelado no celular (ou outro computador levou): para aqui também
          ac.abort()
        }
      })
    }, this.vidaMs)
    vida.unref?.()
    try {
      const destino = p.ajustes?.destino
      if (!destinoRevela(destino)) throw new Error('Destino desconhecido. Atualize o SOBEDESCE do computador.')
      const accountId = `nuvem:${p.contaGoogleId}`
      const drive = this.manager.driveFor(accountId)
      const item = await drive.getItem(p.fileId, { signal: ac.signal, media: true })
      if (item.isFolder || !isVideoName(item.name)) throw new Error('Esse arquivo não é um vídeo.')
      const r = await this.converter({ gerador, drive, item, destino, localPath: await originalLocal(this.manager, accountId, item), signal: ac.signal, log: this.log })
      await this.#contar(p.id, { status: 'pronto', resultado: corta(r.nome, 200), proxyFileId: r.fileId })
      this.log(`pedido do celular: ${p.nome || p.fileId} → ${r.nome}`)
      return true
    } catch (err) {
      if (largado) return false
      if (ac.signal.aborted || isAbortError(err)) {
        await this.#contar(p.id, { status: 'pendente' }) // o app fechou: volta para a fila
        return false
      }
      await this.#contar(p.id, { status: 'erro', erro: corta(err?.message || 'Não deu para converter.', 300) })
      return true
    } finally {
      clearInterval(vida)
      this.atual = null
    }
  }
}
