// "Gerar versões com o Relay" pedido pelo Maestro (docs/integration-contracts/relay.md, "Maestro → Relay"): o Maestro
// pede pela ponte do HUB, o site guarda na fila dos pedidos ao computador (tipo "relay", ajustes { preset, pastaId,
// ref }) e este computador, com a mesma conta, pega um por vez e converte com o Relay (src/media/relay.js: presets e
// plano copiados de products/relay, x264 em qualidade constante) na mesma vaga e na mesma lista do "Converter com o
// Relay" da tela. A versão sobe como arquivo novo na pasta pedida (`<original> (<preset>).<ext>`, nunca por cima); o
// original nunca muda.
//
//   a cada 20 s ──▶ GET /api/proxies/pedidos?status=pendente&tipo=relay ──▶ POST …/pegar (409 = outro levou)
//               ──▶ RelayJobs.start (baixa ou usa o original daqui, converte, confere a pasta, sobe, MD5)
//               ──▶ PATCH gerando { frac } (andamento, só cresce) … PATCH pronto { saida } | erro
//
// Regras do contrato:
//  - "pronto" só com o MD5 do Drive igual ao do convertido; sem MD5 para conferir, é erro (a versão fica na pasta).
//  - O estado só anda para a frente. Cancelado no Maestro: o sinal de vida (ou a conferência logo antes de subir)
//    recebe 409/404 e o trabalho para; nada sobe depois disso. Fechar o app antes de subir devolve para a fila; no
//    meio do envio, vira erro ("veja na pasta"): converter de novo sozinho seria um segundo arquivo.
//  - Preset com a cor da Revela (`cor`): recusado com o aviso (o computador ainda não aplica a cor igual ao navegador).
//  - Sem ffmpeg aqui, não pega nada (fica para outro computador). Site antigo (sem o tipo "relay"): pausa 30 min.
import { abortError, isAbortError, sleep } from '../util/backoff.js'
import { destinoRelay, originalLocal } from '../media/relay.js'

const POLL_MS = 20_000
const VIDA_MS = 30_000
const ANDAMENTO_MS = 10_000
const SEM_SITE_MS = 30 * 60_000

export const MSG = {
  destino: 'Este preset do Relay não existe neste computador. Atualize o SOBEDESCE.',
  cor: 'Preset com a cor da Revela ainda não converte no computador. Use o Relay no navegador para este.',
  sumiu: 'O original não está mais no Drive.',
  semMd5: 'O Drive não devolveu o MD5 para conferir. A versão está na pasta, sem conferência.',
  fechouEnviando: 'O app fechou no meio do envio. Veja na pasta se a versão chegou antes de pedir de novo.',
  canceladoAqui: 'Cancelado no computador.',
  falhou: 'Não deu para converter.',
}

/** Status HTTP da resposta de erro do site (HttpError de src/net/http.js), ou null (rede, tempo). Sem importar o
 * cliente HTTP: o teste do ciclo no site (web/tests/zro-relay-ciclo.test.mts) usa este arquivo sem o undici. */
const statusDe = err => (err?.name === 'HttpError' && typeof err.status === 'number' ? err.status : null)

const corta = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n)

/** Andamento total (0 a 1) a partir da fase do trabalho: baixar 15%, converter 70%, subir 13%, conferir o resto. */
export function fracTotal(fase, frac) {
  const f = typeof frac === 'number' && Number.isFinite(frac) ? Math.min(1, Math.max(0, frac)) : 0
  switch (fase) {
    case 'baixando':
      return 0.15 * f
    case 'analisando':
      return 0.15
    case 'convertendo':
      return 0.15 + 0.7 * f
    case 'enviando':
      return 0.85 + 0.13 * f
    case 'conferindo':
      return 0.98
    default:
      return 0
  }
}

export class PedidosRelay {
  /**
   * @param {object} o
   * @param {{ signedIn: boolean, request(method, path, opts): Promise<{ status, data }> }} o.cloud conta SOBEDESCE
   * @param {() => import('../server/relay.js').RelayJobs|null} o.relay os trabalhos do Relay (vêm com o servidor)
   * Trocáveis nos testes: pollMs, vidaMs, andamentoMs, esperaContarMs, log.
   */
  constructor({ cloud, relay, pollMs = POLL_MS, vidaMs = VIDA_MS, andamentoMs = ANDAMENTO_MS, esperaContarMs = 2_000, log } = {}) {
    this.cloud = cloud
    this.relay = relay
    this.pollMs = pollMs
    this.vidaMs = vidaMs
    this.andamentoMs = andamentoMs
    this.esperaContarMs = esperaContarMs
    this.log = log || ((...a) => console.warn('[relay]', ...a))
    this.timer = null
    this.rodando = null
    this.atual = null // { id, jobId }
    this.pausaAte = 0
    this.closed = false
  }

  start() {
    this.#planejar(8_000)
  }

  async close() {
    this.closed = true
    clearTimeout(this.timer)
    this.timer = null
    if (this.atual?.jobId) this.relay?.()?.cancel(this.atual.jobId)
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

  /** Pega e converte os pedidos pendentes, um por vez (os mais antigos primeiro). Devolve quantos terminaram aqui. */
  async consultar() {
    if (this.rodando) return this.rodando
    this.rodando = (async () => {
      try {
        const jobs = this.relay?.()
        if (this.closed || !jobs || !this.cloud?.signedIn || Date.now() < this.pausaAte) return 0
        let pedidos
        try {
          const d = await this.#api('GET', '/api/proxies/pedidos?status=pendente&tipo=relay')
          pedidos = Array.isArray(d.pedidos) ? d.pedidos.filter(p => p?.tipo === 'relay') : []
        } catch (err) {
          if ([400, 403, 404].includes(statusDe(err))) this.pausaAte = Date.now() + SEM_SITE_MS
          else if (err?.kind !== 'reauth' && !isAbortError(err)) this.log('não consegui ver as versões pedidas:', err?.message)
          return 0
        }
        if (!pedidos.length) return 0
        const motor = await jobs.ctx?.manager?.previas?.motor?.().catch(() => null)
        if (!motor?.ffmpeg?.path) return 0 // sem ffmpeg aqui: deixa para outro computador da conta
        let feitos = 0
        for (const p of pedidos.slice().reverse()) {
          if (this.closed || !this.cloud.signedIn) break
          if (p.status !== 'pendente' || typeof p.id !== 'string') continue
          if (await this.#fazer(p, jobs)) feitos++
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
      if ([404, 409].includes(statusDe(err))) return false
      throw err
    }
  }

  /**
   * Conta um estado final ao site. Repete algumas vezes se a rede falhar (é o mesmo estado, do mesmo computador:
   * repetir não muda nada); 409/404 = o pedido não é mais deste computador (cancelado), e para.
   */
  async #contar(id, corpo) {
    for (let i = 0; i < 3; i++) {
      try {
        await this.#api('PATCH', `/api/proxies/pedidos/${encodeURIComponent(id)}`, corpo)
        return true
      } catch (err) {
        if (statusDe(err) >= 400 && statusDe(err) < 500) {
          this.log(`o site recusou o estado da versão (${statusDe(err)}):`, corpo.status)
          return false
        }
        if (i === 2) this.log('não consegui avisar o site sobre a versão:', err?.message)
        else await sleep(this.esperaContarMs * (i + 1)).catch(() => {})
      }
    }
    return false
  }

  /** Um pedido: pega, converte e conta. false = não era para este computador (outro levou, ou falha ao pegar). */
  async #fazer(p, jobs) {
    try {
      if (!(await this.#pegar(p.id))) return false
    } catch (err) {
      this.log('não consegui pegar a versão pedida:', err?.message)
      return false
    }
    const a = p.ajustes ?? {}
    const destino = typeof a.preset === 'string' ? destinoRelay(a.preset) : null
    if (!destino || typeof a.preset !== 'string') {
      await this.#contar(p.id, { status: 'erro', erro: MSG.destino })
      return true
    }
    // a cor da Revela no computador ainda não sai igual à do navegador (products/relay: "Cor da Revela"): nunca
    // converte sem ela; recusa com o aviso
    if (destino.cor) {
      await this.#contar(p.id, { status: 'erro', erro: MSG.cor })
      return true
    }
    const accountId = `nuvem:${p.contaGoogleId}`
    const manager = jobs.ctx.manager
    let item
    try {
      item = await manager.driveFor(accountId).getItem(p.fileId, { media: true })
    } catch (err) {
      if (err?.status === 404) await this.#contar(p.id, { status: 'erro', erro: MSG.sumiu })
      else await this.#contar(p.id, { status: 'erro', erro: corta(err?.message || MSG.falhou, 300) })
      return true
    }
    if (item?.isFolder) {
      await this.#contar(p.id, { status: 'erro', erro: MSG.sumiu })
      return true
    }

    // o original daqui (o envio que subiu ele), se ainda estiver igual: não precisa baixar
    const local = await originalLocal(manager, accountId, item).catch(() => null)
    const caminho = `/api/proxies/pedidos/${encodeURIComponent(p.id)}`
    let frac = 0
    let largado = false // cancelado no Maestro (ou levado por outro): o site diz 404/409
    let subindo = false
    let jobId = null
    let ultimoEnvio = 0
    const sinal = async () => {
      try {
        await this.#api('PATCH', caminho, { status: 'gerando', frac: Math.round(frac * 1000) / 1000 })
        return true
      } catch (err) {
        if ([404, 409].includes(statusDe(err))) {
          largado = true
          if (jobId) jobs.cancel(jobId)
          return false
        }
        return true // sem resposta: segue (cancelar sem resposta não muda nada)
      }
    }
    const fim = new Promise(resolve => {
      try {
        jobId = jobs.start({
          accountId,
          item,
          destino: a.preset,
          local,
          origem: 'maestro',
          extra: {
            parentId: typeof a.pastaId === 'string' ? a.pastaId : null,
            pedido: p.id,
            // logo antes de subir: o pedido ainda é deste computador? cancelado = nada sobe
            antesDeSubir: async () => {
              if (!(await sinal())) throw abortError()
              subindo = true
            },
          },
          onAndamento: (fase, f) => {
            const t = fracTotal(fase, f)
            if (t > frac) frac = t
            if (Date.now() - ultimoEnvio >= this.andamentoMs) {
              ultimoEnvio = Date.now()
              sinal()
            }
          },
          onFim: resolve,
        })
        this.atual = { id: p.id, jobId }
      } catch (err) {
        resolve({ status: 'error', error: err?.message || MSG.falhou })
      }
    })
    const vida = setInterval(() => sinal(), this.vidaMs)
    vida.unref?.()
    try {
      const v = await fim
      if (largado) return false
      if (v.status === 'done') {
        const r = v.resultado ?? {}
        if (!r.conferido || !/^[0-9a-f]{32}$/.test(r.md5 ?? '') || !r.fileId || !r.pastaId) {
          await this.#contar(p.id, { status: 'erro', erro: MSG.semMd5 })
          return true
        }
        const saida = { arquivoId: r.fileId, nome: corta(r.nome, 300), tamanho: r.size, md5: r.md5, pastaId: r.pastaId }
        await this.#contar(p.id, { status: 'pronto', saida, resultado: 'Versão conferida no Drive' })
        this.log(`versão do Maestro: ${p.nome || p.fileId} → ${saida.nome}`)
        return true
      }
      if (v.status === 'canceled') {
        if (this.closed) await this.#contar(p.id, subindo ? { status: 'erro', erro: MSG.fechouEnviando } : { status: 'pendente' })
        else await this.#contar(p.id, { status: 'erro', erro: MSG.canceladoAqui })
        return false
      }
      await this.#contar(p.id, { status: 'erro', erro: corta(v.error || MSG.falhou, 300) })
      return true
    } finally {
      clearInterval(vida)
      this.atual = null
    }
  }
}
