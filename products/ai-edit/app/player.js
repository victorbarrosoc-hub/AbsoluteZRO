// Prévia da linha do tempo: dois <video> que se revezam (enquanto um toca, o outro já espera parado no começo do
// próximo clipe), então o corte troca na hora, sem esperar a busca. Zoom e ajustes do clipe (escala, posição,
// opacidade) pelo transform e pela opacidade do elemento (placa de vídeo), volume por um ganho do Web Audio, legenda num
// canvas por cima: as mesmas contas do render (src/quadro.js e src/legenda.js). Velocidade: o <video> toca na velocidade
// da curva contínua do clipe (src/velocidade.js, a mesma do render) e fica mudo fora de 100%. Os efeitos sonoros tocam
// pelo mesmo Web Audio, agendados a partir do ponto da linha a cada toque, busca ou edição, em qualquer velocidade. A
// trilha (src/trilha.js, a música do clipe musical) toca do mesmo jeito, do quadro 0 da linha, a partir do `desde` dela.
// Remover fundo verde: o <video> fica invisível e um canvas da placa (app/chroma.js, a conta do render) mostra o quadro
// recortado no mesmo lugar, com o mesmo transform e a mesma opacidade.

import { ajustesDe, posicoes, tamanho } from '../src/linha.js'
import { paraSegundos, paraQuadros, fpsNumero } from '../src/tempo.js'
import { ganho, posicionar, transformCssClipe, zoomEm } from '../src/quadro.js'
import { Recorte } from './chroma.js'
import { desenhar } from '../src/legenda.js'
import { efeitosNaLinha } from '../src/efeitos.js'
import { comSom, origemContinua, saidaContinua, velocidadeContinua } from '../src/velocidade.js'
import { correcaoEm, cssDaCorrecao } from '../src/estabilizar/aplicar.js'
import { faixasDoClipe, ganhoDaFaixa } from '../src/faixas.js'
import { trilhaNaLinha } from '../src/trilha.js'

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
    this.telaChroma = document.createElement('canvas')
    this.telaChroma.className = 'tela-chroma'
    tela.append(this.telaChroma)
    this.recorte = null
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
    // voz e instrumental separados pela NOSSOM (src/faixas.js): quem carrega as faixas (o editor, do disco do
    // navegador) e quais separações já estão prontas aqui (sem elas o clipe toca o som original)
    this.obterFaixas = null
    this.faixasProntas = new Set()
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
    this.fx = efeitosNaLinha(p).map((x) => ({ som: x.som.id, ini: paraSegundos(x.inicio, p.fps), dur: paraSegundos(x.quadros, p.fps), ganho: ganho(x.efeito.volume) }))
    // o clipe com voz e instrumental toca as duas faixas (cada uma no seu volume) no lugar do som do vídeo; só em 100%
    for (const seg of this.segs) {
      const f = this.#faixas(seg)
      if (!f) continue
      const g = ganho(ajustesDe(seg.clipe).volume)
      for (const parte of ['voz', 'instrumental']) {
        const gp = ganhoDaFaixa(f[parte]) * g
        if (gp > 0) this.fx.push({ som: `faixas:${f.sep.id}:${parte}`, ini: seg.linhaIni, dur: seg.dur, desloc: f.desloc, ganho: gp })
      }
    }
    // a trilha: a música inteira debaixo da linha, presa ao começo dela (não à imagem)
    const tl = trilhaNaLinha(p)
    if (tl) this.fx.push({ som: tl.midia.id, ini: 0, dur: tl.dur, desloc: tl.desde, ganho: ganho(tl.volume) })
    if (!this.tocando) this.irPara(this.t)
    else this.#agendarFx()
  }

  /** As faixas que valem no segmento agora (prontas neste navegador, clipe em 100%), ou null: toca o som do vídeo. */
  #faixas(seg) {
    if (!this.projeto || seg.clipe.velocidade) return null
    const f = faixasDoClipe(this.projeto, seg.clipe)
    return f && this.faixasProntas.has(f.sep.id) ? f : null
  }

  /** Decodifica o som do efeito uma vez (pela mesma URL da mídia). null se não deu (o vídeo segue sem ele). */
  async #buffer(id) {
    if (id.startsWith('faixas:')) {
      const [, sep, parte] = id.split(':')
      const fx = await this.obterFaixas?.(sep)?.catch(() => null)
      return fx?.[parte] || null
    }
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
      // faixa separada: começa no meio do arquivo dela (x.desloc = do começo da separação até o começo do clipe)
      const base = x.desloc || 0
      const cabe = Math.min(x.dur, buf.duration - base)
      if (desloc >= cabe) continue
      const no = this.ctxAudio.createBufferSource()
      no.buffer = buf
      const g = this.ctxAudio.createGain()
      g.gain.value = x.ganho
      no.connect(g).connect(this.ctxAudio.destination)
      no.start(this.ctxAudio.currentTime + Math.max(0, x.ini - agora), base + desloc, cabe - desloc)
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
    this.telaChroma.width = this.canvas.width
    this.telaChroma.height = this.canvas.height
  }

  /** O recorte de fundo roda neste computador? (WebGL2) */
  get recorteDisponivel() {
    this.recorte ??= new Recorte(this.telaChroma)
    return this.recorte.pronto
  }

  /** O quadro que a tela mostra agora (para medir a cor do fundo): { fonte, largura, altura } ou null. */
  quadroAtual() {
    const v = this.videos[this.ativo]
    return v && v.readyState >= 2 && v.videoWidth ? { fonte: v, largura: v.videoWidth, altura: v.videoHeight } : null
  }

  /** Desenha o quadro do vídeo recortado no canvas da placa, no retângulo em que o <video> o mostraria. */
  #recortar(v, aj, p, cw, ch) {
    if (v.readyState < 2 || !this.recorteDisponivel) return
    const base = posicionar(p.largura, p.altura, cw, ch, {}, { escala: 1, foco: { x: 0.5, y: 0.5 } })
    const k = this.telaChroma.width / p.largura
    this.recorte.desenhar(v, aj, { x: base.x * k, y: base.y * k, w: base.w * k, h: base.h * k })
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
    // (com voz e instrumental separados, o som vem das faixas: o do vídeo cala)
    const mudo = !comSom(this.#velocidade(seg, this.t)) || Boolean(this.#faixas(seg))
    const chroma = seg.clipe.chroma && this.recorteDisponivel ? seg.clipe.chroma : null
    if (chroma) this.#recortar(v, chroma, p, cw, ch)
    const chave = `${this.ativo}|${css}|${aj.opacidade}|${aj.volume}|${mudo}|${Boolean(chroma)}`
    if (chave === this.ultimoZoom) return
    this.ultimoZoom = chave
    const outro = this.videos[1 - this.ativo]
    v.style.transform = css === 'none' ? '' : css
    v.style.opacity = chroma ? '0' : String(aj.opacidade)
    this.telaChroma.style.transform = chroma && css !== 'none' ? css : ''
    this.telaChroma.style.opacity = chroma ? String(aj.opacidade) : '0'
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
