// Prévia da linha do tempo: dois <video> que se revezam (enquanto um toca, o outro já espera parado no começo do
// próximo clipe), então o corte troca na hora, sem esperar a busca. Zoom e ajustes do clipe (escala, posição,
// opacidade) pelo transform e pela opacidade do elemento (placa de vídeo), volume por um ganho do Web Audio, legenda num
// canvas por cima: as mesmas contas do render (src/quadro.js e src/legenda.js). Os efeitos sonoros tocam pelo mesmo
// Web Audio, agendados a partir do ponto da linha a cada toque, busca ou edição.

import { ajustesDe, posicoes, tamanho } from '../src/linha.js'
import { paraSegundos, paraQuadros, fpsNumero } from '../src/tempo.js'
import { ganho, transformCssClipe, zoomEm } from '../src/quadro.js'
import { desenhar } from '../src/legenda.js'
import { efeitosNaLinha } from '../src/efeitos.js'

export class Player {
  /** tela: elemento que recebe os dois vídeos e o canvas; urlDe(midiaId) → URL tocável */
  constructor(tela, urlDe) {
    this.tela = tela
    this.urlDe = urlDe
    this.videos = [0, 1].map(() => {
      const v = document.createElement('video')
      v.playsInline = true
      v.preload = 'auto'
      v.className = 'tela-video'
      tela.append(v)
      return v
    })
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'tela-legenda'
    tela.append(this.canvas)
    this.ativo = 0
    this.segs = []
    this.t = 0
    this.tocando = false
    this.fim = null
    this.ouvintes = new Set()
    this.blocos = []
    this.legenda = { ligada: true, estilo: 'destaque', posicaoY: 0.8 }
    this.zooms = []
    this.projeto = null
    this.ultimoZoom = ''
    // efeitos sonoros: [{ som, ini, dur (s da linha), ganho }]; sons decodificados por id; nós tocando agora
    this.fx = []
    this.somFx = new Map()
    this.tocandoFx = []
    new ResizeObserver(() => this.#medir()).observe(tela)
    this.#medir()
    const loop = () => {
      this.#quadro()
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  aoMudar(fn) {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }
  #avisar() {
    for (const f of this.ouvintes) f(this)
  }

  get duracao() {
    const u = this.segs.at(-1)
    return u ? u.linhaIni + u.dur : 0
  }

  /** Projeto novo (ou mudado): refaz os segmentos sem perder o ponto. */
  carregar(p, { blocos, zooms, legenda }) {
    this.projeto = p
    this.blocos = blocos || []
    this.zooms = zooms || []
    if (legenda) this.legenda = { ...this.legenda, ...legenda }
    this.tela.style.setProperty('--ar', String(p.largura / p.altura))
    this.segs = posicoes(p.linha).map(({ clipe, inicio }) => ({
      clipe,
      midia: clipe.midia,
      fonteIni: paraSegundos(clipe.ini, p.fps),
      fonteFim: paraSegundos(clipe.fim, p.fps),
      linhaIni: paraSegundos(inicio, p.fps),
      dur: paraSegundos(tamanho(clipe), p.fps),
    }))
    this.t = Math.min(this.t, this.duracao)
    this.ultimoZoom = ''
    this.fx = efeitosNaLinha(p).map((x) => ({ som: x.som.id, ini: paraSegundos(x.inicio, p.fps), dur: paraSegundos(x.quadros, p.fps), ganho: ganho(x.efeito.volume) }))
    if (!this.tocando) this.irPara(this.t)
    else this.#agendarFx()
  }

  /** Decodifica o som do efeito uma vez (pela mesma URL da mídia). null se não deu (o vídeo segue sem ele). */
  async #buffer(id) {
    if (!this.somFx.has(id))
      this.somFx.set(
        id,
        (async () => {
          const url = this.urlDe(id)
          if (!url || !this.ctxAudio) return null
          const dados = await (await fetch(url)).arrayBuffer()
          return await this.ctxAudio.decodeAudioData(dados)
        })().catch(() => null),
      )
    const buf = await this.somFx.get(id)
    // sem arquivo ainda (projeto reaberto no navegador): tenta de novo quando a pessoa escolher o som
    if (!buf) this.somFx.delete(id)
    return buf
  }

  #pararFx() {
    for (const n of this.tocandoFx) n.stop()
    this.tocandoFx = []
  }

  /** Agenda os efeitos que ainda vão tocar (ou estão no meio) a partir do ponto atual. */
  async #agendarFx() {
    this.#pararFx()
    if (!this.tocando || !this.ctxAudio || !this.fx.length) return
    const marca = (this.agendaFx = (this.agendaFx || 0) + 1)
    const t0 = this.t
    const c0 = this.ctxAudio.currentTime
    for (const x of this.fx) {
      if (x.ini + x.dur <= t0) continue
      const buf = await this.#buffer(x.som)
      if (marca !== this.agendaFx || !this.tocando) return
      if (!buf) continue
      // o tempo andou enquanto decodificava: agenda pelo relógio do áudio
      const agora = t0 + (this.ctxAudio.currentTime - c0)
      const desloc = Math.max(0, agora - x.ini)
      if (desloc >= Math.min(x.dur, buf.duration)) continue
      const no = this.ctxAudio.createBufferSource()
      no.buffer = buf
      const g = this.ctxAudio.createGain()
      g.gain.value = x.ganho
      no.connect(g).connect(this.ctxAudio.destination)
      no.start(this.ctxAudio.currentTime + Math.max(0, x.ini - agora), desloc, Math.min(x.dur, buf.duration) - desloc)
      this.tocandoFx.push(no)
    }
  }

  #segEm(t) {
    for (let i = 0; i < this.segs.length; i++) if (t < this.segs[i].linhaIni + this.segs[i].dur - 1e-6) return i
    return this.segs.length - 1
  }

  #posicionar(v, seg, t) {
    const url = this.urlDe(seg.midia)
    if (!url) {
      // mídia sem arquivo ainda: tela vazia até a pessoa escolher o vídeo de novo
      if (v.dataset.url) {
        v.removeAttribute('src')
        v.load()
        delete v.dataset.url
      }
      return
    }
    if (v.dataset.url !== url) {
      v.src = url
      v.dataset.url = url
    }
    const alvo = seg.fonteIni + Math.max(0, t - seg.linhaIni)
    if (Math.abs(v.currentTime - alvo) > 0.02) v.currentTime = alvo
  }

  #preparar(i) {
    const prox = this.segs[i + 1]
    const espera = this.videos[1 - this.ativo]
    if (prox) this.#posicionar(espera, prox, prox.linhaIni)
    this.preparado = prox ? i + 1 : -1
  }

  #mostrar(k) {
    this.ativo = k
    this.videos.forEach((v, j) => v.classList.toggle('visivel', j === k))
  }

  irPara(t) {
    this.t = Math.max(0, Math.min(t, this.duracao))
    if (!this.segs.length) return this.#avisar()
    this.i = this.#segEm(this.t)
    const v = this.videos[this.ativo]
    this.#posicionar(v, this.segs[this.i], this.t)
    this.#mostrar(this.ativo)
    this.#preparar(this.i)
    if (this.tocando) {
      v.play().catch(() => {})
      this.#agendarFx()
    }
    this.#avisar()
  }

  /** Ganho por elemento (Web Audio): permite volume acima de 0 dB. Criado no primeiro toque (gesto da pessoa). */
  #audio() {
    if (this.ganhos || typeof AudioContext === 'undefined') return
    try {
      this.ctxAudio = new AudioContext()
      this.ganhos = this.videos.map((v) => {
        const g = this.ctxAudio.createGain()
        this.ctxAudio.createMediaElementSource(v).connect(g).connect(this.ctxAudio.destination)
        return g
      })
    } catch {
      this.ganhos = null
    }
  }

  async tocar() {
    if (!this.segs.length) return
    this.#audio()
    this.ctxAudio?.resume?.()
    if (this.t >= this.duracao - 0.05) this.irPara(0)
    this.tocando = true
    this.fim = null
    await this.videos[this.ativo].play().catch(() => (this.tocando = false))
    this.#agendarFx()
    this.#avisar()
  }

  pausar() {
    this.tocando = false
    this.fim = null
    for (const v of this.videos) v.pause()
    this.#pararFx()
    this.#avisar()
  }

  alternar() {
    if (this.tocando) this.pausar()
    else this.tocar()
  }

  /** Toca um trecho da linha e para (Revisar: ouvir o corte proposto com um pouco antes e depois). */
  tocarTrecho(ini, fim) {
    this.irPara(ini)
    this.tocar()
    this.fim = fim
  }

  #medir() {
    const r = this.tela.getBoundingClientRect()
    const dpr = Math.min(2, devicePixelRatio || 1)
    this.canvas.width = Math.max(1, Math.round(r.width * dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * dpr))
  }

  #quadro() {
    const v = this.videos[this.ativo]
    const seg = this.segs[this.i]
    if (this.tocando && seg) {
      const t = seg.linhaIni + (v.currentTime - seg.fonteIni)
      if (v.currentTime >= seg.fonteFim - 0.008 || v.ended) {
        // fim do clipe: o outro vídeo já está no começo do próximo
        if (this.preparado === this.i + 1) {
          const outro = this.videos[1 - this.ativo]
          outro.play().catch(() => {})
          v.pause()
          this.#mostrar(1 - this.ativo)
          this.i++
          this.t = this.segs[this.i].linhaIni
          this.#preparar(this.i)
        } else {
          this.t = this.duracao
          this.pausar()
        }
      } else this.t = Math.max(seg.linhaIni, t)
      if (this.fim != null && this.t >= this.fim) this.pausar()
      this.#avisar()
    }
    this.#zoom()
    this.#legenda()
  }

  #zoom() {
    const p = this.projeto
    const seg = this.segs[this.i]
    if (!p || !seg) return
    const v = this.videos[this.ativo]
    const q = paraQuadros(seg.fonteIni + (this.t - seg.linhaIni), p.fps)
    const z = zoomEm(this.zooms, seg.midia, q)
    const aj = ajustesDe(seg.clipe)
    const css = transformCssClipe(p.largura, p.altura, v.videoWidth || p.largura, v.videoHeight || p.altura, aj, z)
    const chave = `${this.ativo}|${css}|${aj.opacidade}|${aj.volume}`
    if (chave === this.ultimoZoom) return
    this.ultimoZoom = chave
    const outro = this.videos[1 - this.ativo]
    v.style.transform = css === 'none' ? '' : css
    v.style.opacity = String(aj.opacidade)
    outro.style.transform = ''
    outro.style.opacity = '0'
    const g = ganho(aj.volume)
    if (this.ganhos) {
      this.ganhos[this.ativo].gain.value = g
      this.ganhos[1 - this.ativo].gain.value = 0
    } else v.volume = Math.min(1, g)
  }

  #legenda() {
    const ctx = this.canvas.getContext('2d')
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (this.legenda.ligada && this.blocos.length) desenhar(ctx, this.blocos, this.t, this.canvas.width, this.canvas.height, this.legenda)
  }

  /** quadros por segundo da prévia (para passo de quadro no teclado) */
  get fps() {
    return this.projeto ? fpsNumero(this.projeto.fps) : 30
  }
}
