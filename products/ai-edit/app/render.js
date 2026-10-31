// Vídeo final: decodifica cada trecho da linha, aplica os ajustes do clipe e o zoom e desenha a legenda no mesmo canvas da prévia,
// e grava H.264 com o som (AAC quando o sistema tem codificador, como no Mac e no Windows; senão Opus) com WebCodecs.
// O som de cada corte ganha 4 ms de rampa nas pontas: sem estalo na emenda. Velocidade: cada quadro de saída pega o
// instante exato da origem pela curva contínua do clipe (src/velocidade.js › origemContinua), então uma fonte de 60 qps
// numa linha de 24 qps entrega quadros diferentes até 40%; o som só toca em 100% (silêncio fora). Onde a origem não
// tem quadro no instante pedido (câmera lenta além do que a câmera gravou), o modo do clipe decide: fluxo óptico (um
// quadro novo pelo movimento, app/fluxo.js; o padrão), mistura dos dois vizinhos ou o quadro mais próximo. Corte de cena
// entre os dois vizinhos nunca é interpolado. Sem o motor de fluxo (não carregou), vai o quadro mais próximo, e o
// resultado diz quantos quadros saíram de cada jeito.

import { MB, abrirInput } from './midia.js'
import { segmentos } from '../src/exportar/comum.js'
import { origemContinua, saidaNoClipe } from '../src/velocidade.js'
import { correcaoEm, corrigirNoCanvas } from '../src/estabilizar/aplicar.js'
import { paraSegundos, fpsNumero } from '../src/tempo.js'
import { ganho, posicionar } from '../src/quadro.js'
import { desenhar } from '../src/legenda.js'

const RAMPA_S = 0.004

/** Codecs que esta máquina grava: { video, audio, formato: 'mp4' } */
export async function codecsDaMaquina(largura, altura) {
  const video = (await MB.canEncodeVideo('avc', { width: largura, height: altura })) ? 'avc' : (await MB.canEncodeVideo('vp9', { width: largura, height: altura })) ? 'vp9' : null
  const audio = (await MB.canEncodeAudio('aac')) ? 'aac' : (await MB.canEncodeAudio('opus')) ? 'opus' : null
  return { video, audio, formato: 'mp4' }
}

/**
 * Renderiza o projeto. entradas: Map(midia → entrada do midia.js); destino: Target do Mediabunny (BufferTarget ou
 * StreamTarget); blocos da legenda (ou []); legenda: { estilo, posicaoY }. aoProgresso(frac, info). sinal: AbortSignal.
 */
export async function renderizar(p, { entradas, destino, blocos = [], legenda = {}, aoProgresso, sinal, largura, altura, fluxo = null }) {
  const L = largura || p.largura
  const A = altura || p.altura
  const fps = fpsNumero(p.fps)
  const codecs = await codecsDaMaquina(L, A)
  if (!codecs.video) throw new Error('Este computador não grava vídeo H.264 nem VP9 pelo navegador do app.')
  const segs = segmentos(p)
  const total = segs.reduce((s, x) => s + x.saida, 0)

  const tela = new OffscreenCanvas(L, A)
  const ctx = tela.getContext('2d', { alpha: false })
  const saida = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: false }), target: destino })
  const fonteVideo = new MB.CanvasSource(tela, { codec: codecs.video, bitrate: MB.QUALITY_HIGH, keyFrameInterval: 2, latencyMode: 'quality' })
  saida.addVideoTrack(fonteVideo, { frameRate: fps })
  const temAudio = p.midias.some((m) => m.temAudio) && codecs.audio
  const fonteAudio = temAudio ? new MB.AudioBufferSource({ codec: codecs.audio, bitrate: 192_000 }) : null
  if (fonteAudio) saida.addAudioTrack(fonteAudio)
  await saida.start()
  // som de saída: estéreo, na taxa da primeira mídia com áudio (as outras são convertidas)
  let taxaSaida = 48000
  for (const m of p.midias) if (m.temAudio && m.taxa) {
    taxaSaida = m.taxa
    break
  }

  // um Input aberto por mídia, reaproveitado entre os trechos
  const abertos = new Map()
  const abrir = async (id) => {
    if (abertos.has(id)) return abertos.get(id)
    const input = abrirInput(entradas.get(id))
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    const o = { input, video: v && (await v.canDecode()) ? v : null, audio: a && (await a.canDecode()) ? a : null }
    o.canvas = o.video ? new MB.CanvasSink(o.video, { poolSize: 4 }) : null
    o.som = o.audio ? new MB.AudioBufferSink(o.audio) : null
    abertos.set(id, o)
    return o
  }

  const clipes = new Map(p.linha.clipes.map((c) => [c.id, c]))
  // quantos quadros da câmera lenta saíram de cada jeito (real = a origem tinha o quadro)
  const retempo = { real: 0, fluxo: 0, mistura: 0, proximo: 0, corte: 0 }
  const tela2 = new OffscreenCanvas(1, 1)
  const ctx2 = tela2.getContext('2d', { alpha: false, willReadFrequently: true })
  /** O quadro entre a e b na fração f (0 < f < 1), pelo modo do clipe. */
  async function entreQuadros(modo, a, b, f) {
    if (corteEntre(a, b)) {
      retempo.corte++
      return f < 0.5 ? a : b
    }
    if (modo === 'fluxo' && fluxo) {
      try {
        const r = await fluxo.interpolar(a, b, f)
        retempo.fluxo++
        return r
      } catch (err) {
        console.warn('fluxo óptico falhou neste quadro:', err)
      }
    }
    if (modo === 'mistura') {
      tela2.width = a.width
      tela2.height = a.height
      ctx2.globalAlpha = 1
      ctx2.drawImage(a, 0, 0)
      ctx2.globalAlpha = f
      ctx2.drawImage(b, 0, 0, a.width, a.height)
      ctx2.globalAlpha = 1
      retempo.mistura++
      return tela2
    }
    retempo.proximo++
    return f < 0.5 ? a : b
  }
  const t0 = performance.now()
  let feitos = 0
  let quadroSaida = 0
  let tAudio = 0
  try {
    for (const s of segs) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError')
      const o = await abrir(s.midia)
      const n = s.saida
      const iniS = paraSegundos(s.ini, p.fps)
      // vídeo: o instante de origem de cada quadro de saída, pela curva contínua do clipe (o mesmo da prévia), no tempo
      // de apresentação do arquivo; + 0,1 ms para o quadro que começa exatamente ali não cair no anterior
      const c = clipes.get(s.clipe)
      const k0 = c?.velocidade ? Math.round(saidaNoClipe(c, s.ini)) : 0
      // (o limite é o do clipe, não o do degrau: a curva contínua atravessa as bordas dos degraus sem segurar quadro)
      const origem = (k) => (c?.velocidade ? Math.min(c.fim - 0.01, Math.max(c.ini, origemContinua(c, k0 + k))) : s.ini + k)
      const instantes = Array.from({ length: n }, (_, k) => origem(k) / fps + 1e-4)
      // câmera lenta com mistura ou fluxo: para cada instante, o quadro de antes e o seguinte da origem
      const m = p.midias.find((x) => x.id === s.midia)
      const passoFonte = 1 / (m?.fps || fps)
      // (só quando a origem não tem quadro novo para cada quadro de saída: v × qps da mídia < qps da linha; uma fonte de
      // 60 qps numa linha de 24 qps só precisa abaixo de 40%; acima disso vai o quadro real, sem risco de artefato)
      const entre = Boolean(c?.velocidade) && s.v < 1 && s.v * (m?.fps || fps) < fps - 1e-6 && s.modo !== 'quadro' && Boolean(o.canvas)
      const pedidos = entre ? instantes.flatMap((t) => [t, t + passoFonte]) : instantes
      const quadros = o.canvas ? o.canvas.canvasesAtTimestamps(pedidos) : null
      for (let k = 0; k < n; k++) {
        const r = quadros ? (await quadros.next()).value : null
        const r2 = entre ? (await quadros.next()).value : null
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, L, A)
        let img = r?.canvas || null
        if (img && r2?.canvas && r2.timestamp > r.timestamp + 1e-6) {
          const f = (instantes[k] - r.timestamp) / (r2.timestamp - r.timestamp)
          if (f >= 0.97) img = r2.canvas
          if (f >= 0.97 || f <= 0.03) retempo.real++
          else img = await entreQuadros(s.modo, r.canvas, r2.canvas, f)
        } else if (entre && img) retempo.real++
        if (img) {
          // ajustes do clipe (escala, posição) e depois o zoom do momento: a mesma conta da prévia (src/quadro.js); a
          // estabilização (src/estabilizar/aplicar.js) vem antes, no centro da imagem, pelo instante de origem
          const ret = posicionar(L, A, img.width, img.height, s.ajustes, { escala: s.escala, foco: s.foco })
          ctx.save()
          corrigirNoCanvas(ctx, ret, c?.estabilizar ? correcaoEm(p, c, m, instantes[k]) : null)
          ctx.globalAlpha = s.ajustes.opacidade
          ctx.drawImage(img, ret.x, ret.y, ret.w, ret.h)
          ctx.restore()
        }
        const t = quadroSaida / fps
        if (blocos.length && legenda.ligada !== false) desenhar(ctx, blocos, t, L, A, legenda)
        await fonteVideo.add(t, 1 / fps)
        quadroSaida++
        feitos++
        if (feitos % 15 === 0) {
          const seg = (performance.now() - t0) / 1000
          aoProgresso?.(feitos / total, { quadros: feitos, total, fps: feitos / seg, restante: ((total - feitos) / feitos) * seg })
        }
        if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError')
      }
      await quadros?.return?.()
      // som: o trecho exato, colado no anterior, com rampa nas pontas
      if (fonteAudio) {
        const dur = n / fps
        const buf = s.som ? await somDoTrecho(o, iniS, dur, taxaSaida, ganho(s.ajustes.volume)) : new AudioBuffer({ length: Math.max(1, Math.round(dur * taxaSaida)), numberOfChannels: 2, sampleRate: taxaSaida })
        await fonteAudio.add(buf)
        tAudio += dur
      }
    }
    await saida.finalize()
  } catch (err) {
    await saida.cancel().catch(() => {})
    throw err
  } finally {
    for (const o of abertos.values()) o.input.dispose?.()
  }
  const segundos = (performance.now() - t0) / 1000
  aoProgresso?.(1, { quadros: feitos, total, fps: feitos / segundos, restante: 0 })
  return { segundos, quadros: feitos, duracao: quadroSaida / fps, audio: tAudio, codecs, retempo }
}

/** Corte de cena entre dois quadros vizinhos (diferença média grande numa miniatura): não se interpola através dele. */
const mini = new OffscreenCanvas(32, 18)
const ctxMini = mini.getContext('2d', { willReadFrequently: true })
export function corteEntre(a, b, limite = 48) {
  ctxMini.drawImage(a, 0, 0, 32, 18)
  const da = ctxMini.getImageData(0, 0, 32, 18).data
  ctxMini.drawImage(b, 0, 0, 32, 18)
  const db = ctxMini.getImageData(0, 0, 32, 18).data
  let s = 0
  for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
  return s / ((da.length / 4) * 3) > limite
}

/** O som exato de [ini, ini+dur) da mídia, em estéreo na taxa de saída, com rampa nas pontas (silêncio se não há som). */
async function somDoTrecho(o, ini, dur, taxaSaida, g = 1) {
  const taxa = o.audio?.sampleRate || taxaSaida
  const amostras = Math.max(1, Math.round(dur * taxa))
  let buf = new AudioBuffer({ length: amostras, numberOfChannels: 2, sampleRate: taxa })
  if (o.som) {
    for await (const { buffer, timestamp } of o.som.buffers(ini, ini + dur)) {
      const desloc = Math.round((timestamp - ini) * taxa)
      for (let c = 0; c < 2; c++) {
        const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))
        const dst = buf.getChannelData(c)
        for (let i = Math.max(0, -desloc); i < src.length && desloc + i < amostras; i++) dst[desloc + i] = src[i]
      }
    }
    const r = Math.min(Math.floor(amostras / 2), Math.round(RAMPA_S * taxa))
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      if (g !== 1) for (let i = 0; i < amostras; i++) d[i] = Math.max(-1, Math.min(1, d[i] * g))
      for (let i = 0; i < r; i++) {
        d[i] *= i / r
        d[amostras - 1 - i] *= i / r
      }
    }
  }
  if (taxa !== taxaSaida) {
    const off = new OfflineAudioContext(2, Math.max(1, Math.round(dur * taxaSaida)), taxaSaida)
    const no = off.createBufferSource()
    no.buffer = buf
    no.connect(off.destination)
    no.start()
    buf = await off.startRendering()
  }
  return buf
}
