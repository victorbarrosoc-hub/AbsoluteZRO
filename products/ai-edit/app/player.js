// Prévia da linha do tempo: dois <video> que se revezam (enquanto um toca, o outro já espera parado no começo do
// próximo clipe), então o corte troca na hora, sem esperar a busca. Zoom pelo transform (placa de vídeo) e legenda num
// canvas por cima, com as mesmas contas do render (src/quadro.js e src/legenda.js).

import { posicoes, tamanho } from '../src/linha.js'
import { paraSegundos, paraQuadros, fpsNumero } from '../src/tempo.js'
import { transformCss, zoomEm } from '../src/quadro.js'
import { desenhar } from '../src/legenda.js'

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
    if (this.tocando) v.play().catch(() => {})
    this.#avisar()
  }

  async tocar() {
    if (!this.segs.length) return
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
    const css = transformCss(p.largura, p.altura, z)
    const chave = `${this.ativo}|${css}`
    if (chave === this.ultimoZoom) return
    this.ultimoZoom = chave
    v.style.transform = css === 'none' ? '' : css
    this.videos[1 - this.ativo].style.transform = ''
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
