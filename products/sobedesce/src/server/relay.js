// Rotas do "Converter com o Relay" (src/media/relay.js): os destinos, começar, acompanhar e parar. Cada vídeo é um
// trabalho; todos esperam a mesma vaga de conversão da prévia leve (um por vez). Progresso pelo SSE 'relay', no
// máximo 4×/s por trabalho. Fica fora de routes.js como as prévias (recebe dele o que precisa).
import { newId } from '../util/ids.js'
import { isAbortError } from '../util/backoff.js'
import { DESTINOS_RELAY, converterComRelay, destinoRelay, originalLocal } from '../media/relay.js'
import { isVideoName } from '../media/previa.js'

const AUDIO = /\.(wav|aiff?|flac|mp3|m4a|aac|ogg|opus|caf)$/i

const EVENT_MS = 250
const DRIVE_ID = /^[\w-]{1,200}$/
const MAX_GUARDADOS = 20 // terminados que ficam para a tela mostrar

/** O que a tela precisa de cada destino: id, nome, grupo, resumo e a forma (vertical, horizontal ou só áudio). */
export const destinosParaTela = () =>
  DESTINOS_RELAY.map(p => ({ id: p.id, nome: p.nome, grupo: p.grupo, resumo: p.resumo, forma: !p.video ? 'audio' : p.video.quadro && p.video.quadro.altura > p.video.quadro.largura ? 'vertical' : 'horizontal' }))

export class RelayJobs {
  /**
   * @param {object} ctx { manager, hub, log }
   * @param {object} o
   * @param {Function} [o.converter] troca o converterComRelay (testes)
   */
  constructor(ctx, { converter = converterComRelay } = {}) {
    this.ctx = ctx
    this.converter = converter
    this.jobs = new Map() // id → job (na ordem em que entraram)
  }

  /** Começa um trabalho. Devolve o id. `local`: o original neste computador (ou null para baixar). */
  start({ accountId, item, destino, local = null, origem = 'tela', onFim = null }) {
    const gerador = this.ctx.manager.previas
    if (!gerador?.emVaga) throw Object.assign(new Error('A conversão está desligada neste app.'), { status: 409 })
    const job = { id: newId('rly'), accountId, arquivo: { id: item.id, name: item.name, size: item.size ?? null }, destino, origem, status: 'running', fase: 'esperando', frac: null, resultado: null, error: null, ac: new AbortController(), lastSent: 0, timer: null }
    this.jobs.set(job.id, job)
    this.#guardarPoucos()
    this.#emit(job)
    ;(async () => {
      try {
        job.resultado = await this.converter({
          gerador,
          drive: this.ctx.manager.driveFor(accountId),
          item,
          destino,
          localPath: local,
          signal: job.ac.signal,
          log: (...a) => this.ctx.log?.(...a),
          onFase: (fase, frac) => this.#progress(job, fase, frac),
        })
        job.status = 'done'
      } catch (err) {
        if (job.ac.signal.aborted || isAbortError(err)) {
          job.status = 'canceled'
        } else {
          job.status = 'error'
          job.error = String(err?.message || err || 'Não deu para converter.').slice(0, 300)
          this.ctx.log?.(`relay: "${item.name}" falhou: ${job.error}`)
        }
      } finally {
        job.fase = null
        job.frac = null
        this.#emit(job)
        try {
          onFim?.(this.view(job))
        } catch {}
      }
    })()
    return job.id
  }

  #progress(job, fase, frac) {
    if (job.status !== 'running') return
    const mudou = job.fase !== fase
    job.fase = fase
    job.frac = frac ?? null
    const wait = job.lastSent + EVENT_MS - Date.now()
    if (mudou || wait <= 0) return this.#emit(job)
    job.timer ??= setTimeout(() => {
      job.timer = null
      if (job.status === 'running') this.#emit(job)
    }, wait)
    job.timer.unref?.()
  }

  #guardarPoucos() {
    const fim = [...this.jobs.values()].filter(j => j.status !== 'running')
    for (const j of fim.slice(0, Math.max(0, fim.length - MAX_GUARDADOS))) this.jobs.delete(j.id)
  }

  view(job) {
    if (!job) return null
    return { jobId: job.id, accountId: job.accountId, arquivo: job.arquivo, destino: job.destino, origem: job.origem, status: job.status, fase: job.fase, frac: job.frac, resultado: job.resultado, ...(job.error ? { error: job.error } : {}) }
  }

  list() {
    return [...this.jobs.values()].map(j => this.view(j))
  }

  #emit(job) {
    if (job.timer) clearTimeout(job.timer)
    job.timer = null
    job.lastSent = Date.now()
    this.ctx.hub?.send('relay', this.view(job))
  }

  cancel(id) {
    const job = this.jobs.get(id)
    job?.ac.abort()
    return !!job
  }

  close() {
    for (const j of this.jobs.values()) {
      j.ac.abort()
      if (j.timer) clearTimeout(j.timer)
    }
  }
}

/**
 * Registra as rotas. Devolve { jobs, view() (para /api/state), close() }.
 * @param {{ route: Function, ctx: object, account: (id) => object, HttpProblem: Function }} o
 */
export function registerRelay({ route, ctx, account, HttpProblem, jobsOptions }) {
  const jobs = new RelayJobs(ctx, jobsOptions)

  // Os destinos (a tela mostra os cartões) e se este computador converte.
  route('GET', '/api/relay', async () => {
    const m = ctx.manager.previas ? await ctx.manager.previas.motor() : null
    return { destinos: destinosParaTela(), pronto: Boolean(m?.ffmpeg?.path), motor: m?.label || m?.aviso || '' }
  })

  // "Converter com o Relay" de um vídeo (ou áudio) do Drive: { accountId, id, destino }.
  route('POST', '/api/relay/converter', async ({ body, signal }) => {
    const acc = account(body.accountId)
    if (typeof body.id !== 'string' || !DRIVE_ID.test(body.id) || !destinoRelay(body.destino)) throw new HttpProblem(400, 'Pedido inválido.')
    const drive = ctx.manager.driveFor(acc.id)
    const item = await drive.getItem(body.id, { signal, media: true })
    if (item.isFolder || !(isVideoName(item.name) || AUDIO.test(item.name))) throw new HttpProblem(400, 'Escolha um arquivo de vídeo ou de áudio.')
    try {
      return { jobId: jobs.start({ accountId: acc.id, item, destino: body.destino, local: await originalLocal(ctx.manager, acc.id, item) }) }
    } catch (err) {
      if (err?.status) throw new HttpProblem(err.status, err.message)
      throw err
    }
  })

  route('GET', '/api/relay/converter/:jobId', ({ params }) => {
    const job = jobs.jobs.get(params.jobId)
    if (!job) throw new HttpProblem(404, 'Essa conversão não existe mais.')
    return jobs.view(job)
  })

  route('DELETE', '/api/relay/converter/:jobId', ({ params }) => {
    if (!jobs.cancel(params.jobId)) throw new HttpProblem(404, 'Essa conversão não existe mais.')
    return {}
  })

  return { jobs, view: () => jobs.list(), close: () => jobs.close() }
}
