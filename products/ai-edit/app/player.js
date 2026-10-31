// Prévia da linha do tempo: dois <video> que se revezam (enquanto um toca, o outro já espera parado no começo do
// próximo clipe), então o corte troca na hora, sem esperar a busca. Zoom e ajustes do clipe (escala, posição,
// opacidade) pelo transform e pela opacidade do elemento (placa de vídeo), volume por um ganho do Web Audio, legenda num
// canvas por cima: as mesmas contas do render (src/quadro.js e src/legenda.js). Velocidade: o <video> toca na velocidade
// da curva contínua do clipe (src/velocidade.js, a mesma do render) e fica mudo fora de 100%.

import { ajustesDe, posicoes, tamanho } from '../src/linha.js'
import { paraSegundos, paraQuadros, fpsNumero } from '../src/tempo.js'
import { ganho, transformCssClipe, zoomEm } from '../src/quadro.js'
import { desenhar } from '../src/legenda.js'
import { comSom, origemContinua, saidaContinua, velocidadeContinua } from '../src/velocidade.js'
import { correcaoEm, cssDaCorrecao } from '../src/estabilizar/aplicar.js'

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
    // estabilização: a correção segue o quadro que a tela mostrou (o tempo de mídia de cada quadro apresentado), não o
    // relógio da página, senão a correção chega um quadro atrasada e a prévia treme
    for (const v of this.videos)
      if ('requestVideoFrameCallback' in v) {
        const quadro = (_agora, meta) => {
          v._tempoMidia = meta.mediaTime
          if (v === this.videos[this.ativo]) this.#zoom()
          v.requestVideoFrameCallback(quadro)
        }
        v.requestVideoFrameCallback(quadro)
      }
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
    if (!this.tocando) this.irPara(this.t)
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
    const alvo = this.#origem(seg, t)
    if (Math.abs(v.currentTime - alvo) > 0.02) v.currentTime = alvo
  }

  /** Instante da mídia (s) no instante t da linha, pela curva de velocidade do clipe. */
  #origem(seg, t) {
    const dt = Math.max(0, t - seg.linhaIni)
    if (!seg.clipe.velocidade) return seg.fonteIni + dt
    const fps = this.fps
    return origemContinua(seg.clipe, dt * fps) / fps
  }

  /** Instante da linha para o instante da mídia (o inverso de #origem). */
  #linhaDe(seg, tMidia) {
    if (!seg.clipe.velocidade) return seg.linhaIni + (tMidia - seg.fonteIni)
    const fps = this.fps
    return seg.linhaIni + saidaContinua(seg.clipe, tMidia * fps) / fps
  }

  /** Velocidade do clipe no instante t da linha. */
  #velocidade(seg, t) {
    return seg.clipe.velocidade ? velocidadeContinua(seg.clipe, Math.max(0, t - seg.linhaIni) * this.fps) : 1
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
    if (this.tocando) v.play().catch(() => {})
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
    this.#avisar()
  }

  pausar() {
    this.tocando = false
    this.fim = null
    for (const v of this.videos) v.pause()
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
      const t = this.#linhaDe(seg, v.currentTime)
      // o vídeo anda na velocidade da curva (o navegador aceita de 1/16 a 16×)
      const taxa = Math.min(16, Math.max(0.0625, this.#velocidade(seg, t)))
      if (Math.abs(v.playbackRate - taxa) > 1e-3) v.playbackRate = taxa
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
    const q = paraQuadros(this.#origem(seg, this.t), p.fps)
    const z = zoomEm(this.zooms, seg.midia, q)
    const aj = ajustesDe(seg.clipe)
    const cw = v.videoWidth || p.largura
    const ch = v.videoHeight || p.altura
    const clipeCss = transformCssClipe(p.largura, p.altura, cw, ch, aj, z)
    const est = seg.clipe.estabilizar ? cssDaCorrecao(p.largura, p.altura, cw, ch, correcaoEm(p, seg.clipe, p.midias.find((m) => m.id === seg.midia), v._tempoMidia ?? v.currentTime)) : ''
    const css = [clipeCss === 'none' ? '' : clipeCss, est].filter(Boolean).join(' ') || 'none'
    // som só em 100% (a regra do AEON): fora disso o ganho vai a zero
    const mudo = !comSom(this.#velocidade(seg, this.t))
    const chave = `${this.ativo}|${css}|${aj.opacidade}|${aj.volume}|${mudo}`
    if (chave === this.ultimoZoom) return
    this.ultimoZoom = chave
    const outro = this.videos[1 - this.ativo]
    v.style.transform = css === 'none' ? '' : css
    v.style.opacity = String(aj.opacidade)
    outro.style.transform = ''
    outro.style.opacity = '0'
    const g = mudo ? 0 : ganho(aj.volume)
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
