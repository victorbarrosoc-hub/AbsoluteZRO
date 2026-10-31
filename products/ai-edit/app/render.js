// Vídeo final: decodifica cada trecho da linha, aplica os ajustes do clipe e o zoom e desenha a legenda no mesmo canvas da prévia,
// e grava H.264 com o som (AAC quando o sistema tem codificador, como no Mac e no Windows; senão Opus) com WebCodecs.
// O som de cada corte ganha 4 ms de rampa nas pontas: sem estalo na emenda. Os efeitos sonoros entram por cima, no
// quadro exato em que começam (src/efeitos.js), com o volume de cada um.

import { MB, abrirInput } from './midia.js'
import { segmentos } from '../src/exportar/comum.js'
import { paraSegundos, fpsNumero } from '../src/tempo.js'
import { ganho, posicionar } from '../src/quadro.js'
import { desenhar } from '../src/legenda.js'
import { efeitosNaLinha, misturarEfeitos } from '../src/efeitos.js'

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
export async function renderizar(p, { entradas, destino, blocos = [], legenda = {}, aoProgresso, sinal, largura, altura }) {
  const L = largura || p.largura
  const A = altura || p.altura
  const fps = fpsNumero(p.fps)
  const codecs = await codecsDaMaquina(L, A)
  if (!codecs.video) throw new Error('Este computador não grava vídeo H.264 nem VP9 pelo navegador do app.')
  const segs = segmentos(p)
  const total = segs.reduce((s, x) => s + (x.fim - x.ini), 0)

  const tela = new OffscreenCanvas(L, A)
  const ctx = tela.getContext('2d', { alpha: false })
  const saida = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: false }), target: destino })
  const fonteVideo = new MB.CanvasSource(tela, { codec: codecs.video, bitrate: MB.QUALITY_HIGH, keyFrameInterval: 2, latencyMode: 'quality' })
  saida.addVideoTrack(fonteVideo, { frameRate: fps })
  const efeitos = efeitosNaLinha(p)
  const temAudio = (p.midias.some((m) => m.temAudio) || efeitos.length > 0) && codecs.audio
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
    o.canvas = o.video ? new MB.CanvasSink(o.video, { poolSize: 2 }) : null
    o.som = o.audio ? new MB.AudioBufferSink(o.audio) : null
    abertos.set(id, o)
    return o
  }

  // cada som de efeito decodificado uma vez, em estéreo na taxa de saída
  const somFx = new Map()
  if (fonteAudio)
    for (const { som } of efeitos) {
      if (somFx.has(som.id)) continue
      const entrada = entradas.get(som.id)
      if (!entrada) throw new Error(`O som "${som.nome}" não está neste computador. Escolha o arquivo de novo ou tire o efeito.`)
      const o = await abrir(som.id)
      somFx.set(som.id, await somDoTrecho(o, 0, som.duracao, taxaSaida, 1, false))
    }

  const t0 = performance.now()
  let feitos = 0
  let quadroSaida = 0
  let tAudio = 0
  try {
    for (const s of segs) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError')
      const o = await abrir(s.midia)
      const n = s.fim - s.ini
      const iniS = paraSegundos(s.ini, p.fps)
      // vídeo: um quadro de origem para cada quadro de saída
      // tempo de apresentação do arquivo (o mesmo do <video>.currentTime da prévia)
      const instantes = Array.from({ length: n }, (_, k) => iniS + k / fps)
      const quadros = o.canvas ? o.canvas.canvasesAtTimestamps(instantes) : null
      for (let k = 0; k < n; k++) {
        const r = quadros ? (await quadros.next()).value : null
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, L, A)
        if (r?.canvas) {
          const c = r.canvas
          // ajustes do clipe (escala, posição) e depois o zoom do momento: a mesma conta da prévia (src/quadro.js)
          const ret = posicionar(L, A, c.width, c.height, s.ajustes, { escala: s.escala, foco: s.foco })
          ctx.globalAlpha = s.ajustes.opacidade
          ctx.drawImage(c, ret.x, ret.y, ret.w, ret.h)
          ctx.globalAlpha = 1
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
        const buf = await somDoTrecho(o, iniS, dur, taxaSaida, ganho(s.ajustes.volume))
        misturarEfeitos(buf, efeitos, somFx, paraSegundos(s.linha, p.fps), p.fps)
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
  return { segundos, quadros: feitos, duracao: quadroSaida / fps, audio: tAudio, codecs }
}

/**
 * O som exato de [ini, ini+dur) da mídia, em estéreo na taxa de saída, com rampa nas pontas (silêncio se não há som).
 * rampa = false para o som inteiro de um efeito (ele já começa e acaba como foi feito).
 */
async function somDoTrecho(o, ini, dur, taxaSaida, g = 1, rampa = true) {
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
    const r = rampa ? Math.min(Math.floor(amostras / 2), Math.round(RAMPA_S * taxa)) : 0
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
