// Montagens no celular: abrir as fotos e os takes e gravar o vídeo, tudo no aparelho (nada passa por servidor).
//  - Foto: aberta uma vez e reduzida ao que precisa (miniatura da bandeja, prévia da tela, a pronta em alta).
//  - Take: lido com o Mediabunny (o mesmo do Relay, relay/vendor/, carregado só quando entra um vídeo), quadro a
//    quadro pelo WebCodecs, direto do arquivo da galeria ou do Drive aos pedaços (Range, com o token). Nada de <video>:
//    quadro certo em qualquer formato que o aparelho decodifica, sem esperar o vídeo tocar.
//  - Vídeo pronto: cada quadro é desenhado num canvas (os takes nos quadros deles e, por cima, a camada da tela com as
//    fotos, o fundo, o espaço e os cantos: igual à prévia) e gravado em H.264 num MP4 pelo WebCodecs. No iPhone
//    precisa do iOS 16.4 ou mais novo; sem ele, a tela diz que o vídeo fica para o computador.
import { ENDPOINTS } from './config.js'
import { getToken, invalidate } from './auth.js'
import { driveCall } from './drive.js'
import { FPS, LIMITES, leituraDoTake, quadrosDoVideo, tempoNoTake } from './montagens-celular.js'

let mb = null
/** O Mediabunny (≈ 700 KB) só carrega quando entra o primeiro take. */
export function carregarMB() {
  mb ??= import('../relay/vendor/mediabunny.min.mjs').catch((err) => {
    mb = null
    throw err
  })
  return mb
}

const parado = () => new DOMException('Parado', 'AbortError')

// ───── fotos ─────

/** Abre a imagem inteira (ImageBitmap; sem ele, <img>). */
async function abrirImagem(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      // HEIC num navegador sem suporte, ou o Safari antigo: tenta pelo <img>
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('Este aparelho não abre esta foto.')
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

const larguraDe = (x) => x.naturalWidth || x.videoWidth || x.width
const alturaDe = (x) => x.naturalHeight || x.videoHeight || x.height

/** Um canvas com a imagem em `w`×`h`, que o desenho da montagem trata como <img> (naturalWidth/naturalHeight). */
export function emCanvas(fonte, w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const g = c.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(fonte, 0, 0, c.width, c.height)
  c.naturalWidth = c.width
  c.naturalHeight = c.height
  return c
}

/**
 * Abre a foto e devolve as reduções pedidas: `lados` é uma lista de { w, h } (ou de números: lado maior), na ordem.
 * Também devolve o tamanho original. A foto inteira sai da memória logo depois.
 */
export async function lerFoto(blob, lados) {
  const img = await abrirImagem(blob)
  try {
    const iw = larguraDe(img)
    const ih = alturaDe(img)
    const out = lados.map((l) => {
      if (typeof l === 'number') {
        const k = Math.min(1, l / Math.max(iw, ih))
        return emCanvas(img, iw * k, ih * k)
      }
      return emCanvas(img, l.w, l.h)
    })
    return { largura: iw, altura: ih, canvases: out }
  } finally {
    img.close?.()
  }
}

/** A foto do Drive, inteira (até LIMITES.fotoBytes). */
export async function baixarFoto(file, signal) {
  if (Number(file.size) > LIMITES.fotoBytes) throw new Error('Foto grande demais para o celular.')
  const res = await driveCall(`/files/${encodeURIComponent(file.id)}`, { query: { alt: 'media', supportsAllDrives: true }, raw: true, signal, retries: 2 })
  return res.blob()
}

// ───── takes ─────

/** fetch com o token do Drive em cada pedido; 401 pede outro token e tenta de novo uma vez. */
function fetchDoDrive() {
  return async (input, init = {}) => {
    for (let tentativa = 0; ; tentativa++) {
      const t = await getToken()
      const headers = new Headers(init.headers || undefined)
      headers.set('Authorization', `Bearer ${t}`)
      const res = await fetch(input, { ...init, headers, credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (res.status === 401 && tentativa === 0) {
        invalidate?.(t)
        continue
      }
      return res
    }
  }
}

/**
 * Abre um take: `{ blob }` (galeria) ou `{ file }` (Drive, lido aos pedaços). Devolve
 * { info: { duracao, largura, altura, audio }, quadro(t, lado) → canvas, fechar() }.
 */
export async function abrirTake(origem) {
  const MB = await carregarMB()
  const source = origem.blob
    ? new MB.BlobSource(origem.blob)
    : new MB.UrlSource(`${ENDPOINTS.api}/files/${encodeURIComponent(origem.file.id)}?alt=media&supportsAllDrives=true`, { fetchFn: fetchDoDrive(), parallelism: 2 })
  const input = new MB.Input({ source, formats: MB.ALL_FORMATS })
  let track
  try {
    track = await input.getPrimaryVideoTrack()
  } catch {
    throw new Error('Este aparelho não lê este vídeo.')
  }
  if (!track) throw new Error('Esse arquivo não tem vídeo.')
  if (!(await track.canDecode())) throw new Error('Este aparelho não abre o formato deste vídeo.')
  const audio = await input.getPrimaryAudioTrack().catch(() => null)
  const info = { duracao: await input.computeDuration(), largura: track.displayWidth, altura: track.displayHeight, audio: Boolean(audio) }
  const sinks = new Map()
  const sinkDe = (w, h) => {
    const k = `${w}x${h}`
    if (!sinks.has(k)) sinks.set(k, new MB.CanvasSink(track, { width: w, height: h, fit: 'fill' }))
    return sinks.get(k)
  }
  return {
    info,
    MB,
    input,
    track,
    audio,
    sinkDe,
    /** O quadro em `t` (s), com `lado` px no lado maior: um canvas novo (como <img>, para o desenho). */
    async quadro(t, lado = 1280) {
      const k = Math.min(1, lado / Math.max(info.largura, info.altura))
      const w = Math.max(2, Math.round(info.largura * k))
      const h = Math.max(2, Math.round(info.altura * k))
      const r = await sinkDe(w, h).getCanvas(Math.max(0, Math.min(t, Math.max(0, info.duracao - 0.05))))
      if (!r) throw new Error('Não achei esse quadro.')
      return emCanvas(r.canvas, w, h)
    },
    fechar() {
      sinks.clear()
      input.dispose?.()
    },
  }
}

// ───── vídeo pronto ─────

let aacPronto = null
async function aacNoAparelho(MB) {
  if (await MB.canEncodeAudio('aac')) return true
  // Sem o AAC do sistema (Linux, Safari antigo): o do FFmpeg em WebAssembly, o mesmo do Relay.
  aacPronto ??= import('../relay/vendor/mediabunny-aac-encoder.min.mjs').then((m) => m.registerAacEncoder())
  await aacPronto.catch(() => null)
  return MB.canEncodeAudio('aac')
}

/**
 * O que este aparelho grava: { ok, codec, motivo }. Sem WebCodecs (iPhone antes do iOS 16.4), `ok` é falso e o motivo
 * vai para a tela, sem fingir.
 */
export async function suporteVideo(w = 1080, h = 1920) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined')
    return { ok: false, motivo: 'Este aparelho ainda não grava vídeo no navegador (no iPhone, iOS 16.4 ou mais novo).' }
  try {
    const MB = await carregarMB()
    const codec = await MB.getFirstEncodableVideoCodec(['avc', 'hevc'], { width: w, height: h })
    if (!codec) return { ok: false, motivo: 'Este aparelho não grava H.264 no navegador.' }
    return { ok: true, codec }
  } catch {
    return { ok: false, motivo: 'Não consegui preparar o gravador de vídeo.' }
  }
}

/** Corta um AudioBuffer em [ini, fim) amostras. */
function cortarAudio(buf, ini, fim) {
  const n = Math.max(0, Math.min(buf.length, fim) - Math.max(0, ini))
  if (n <= 0) return null
  if (ini <= 0 && fim >= buf.length) return buf
  const out = new AudioBuffer({ length: n, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(Math.max(0, ini), Math.max(0, ini) + n), c)
  return out
}

/**
 * Grava a montagem em vídeo. `base`: canvas W×H da tela já desenhada com os buracos dos takes (desenharMontagem com
 * `buracos`). `takes`: [{ leitor (abrirTake), trecho (trechoDe), encaixe (encaixeDoTake, px do vídeo) }].
 * `som`: índice do take que dá o som (ou null). Devolve { blob, capa (JPEG de um quadro, para a folha), codec, semSom: motivo | null }.
 */
export async function gravarVideo({ base, fundo, duracao, takes, som = null, codec = 'avc', signal, onProgress }) {
  const MB = await carregarMB()
  const W = base.width
  const H = base.height
  const tela = document.createElement('canvas')
  tela.width = W
  tela.height = H
  const ctx = tela.getContext('2d', { alpha: false })
  ctx.imageSmoothingQuality = 'high'
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() })
  const fonte = new MB.CanvasSource(tela, { codec, bitrate: MB.QUALITY_HIGH, keyFrameInterval: 2 })
  output.addVideoTrack(fonte, { frameRate: FPS })

  // o som: só de um take em velocidade normal, se o aparelho lê e grava o áudio
  let semSom = null
  let audio = null
  const t = som != null ? takes[som] : null
  if (t) {
    if (t.trecho.lento) semSom = 'Na câmera lenta o vídeo sai sem som.'
    else if (!t.leitor.audio) semSom = 'Esse take não tem som.'
    else if (!(await t.leitor.audio.canDecode().catch(() => false))) semSom = 'Este aparelho não lê o som desse take.'
    else if (!(await aacNoAparelho(MB))) semSom = 'Este aparelho não grava o som.'
    else {
      audio = new MB.AudioBufferSource({ codec: 'aac', bitrate: 192e3 })
      output.addAudioTrack(audio)
    }
  }
  let capa = null
  await output.start()
  try {
    if (audio) {
      const ini = t.trecho.inicio
      const fim = ini + duracao
      for await (const { buffer, timestamp } of new MB.AudioBufferSink(t.leitor.audio).buffers(ini, fim)) {
        if (signal?.aborted) throw parado()
        const sr = buffer.sampleRate
        const pedaco = cortarAudio(buffer, Math.round((ini - timestamp) * sr), Math.round((fim - timestamp) * sr))
        if (pedaco) await audio.add(pedaco)
      }
      audio.close()
    }
    const N = quadrosDoVideo(duracao)
    const leituras = takes.map((x) => {
      const l = leituraDoTake(x.leitor.info, x.encaixe)
      const tempos = Array.from({ length: N }, (_, k) => tempoNoTake(k, FPS, x.trecho, x.leitor.info.duracao))
      return { ...x, l, it: x.leitor.sinkDe(l.w, l.h).canvasesAtTimestamps(tempos)[Symbol.asyncIterator]() }
    })
    for (let k = 0; k < N; k++) {
      if (signal?.aborted) throw parado()
      ctx.fillStyle = fundo
      ctx.fillRect(0, 0, W, H)
      for (const x of leituras) {
        const { value } = await x.it.next()
        if (!value?.canvas) continue
        const e = x.encaixe
        const kx = value.canvas.width / x.leitor.info.largura
        const ky = value.canvas.height / x.leitor.info.altura
        ctx.drawImage(value.canvas, e.sx * kx, e.sy * ky, e.sw * kx, e.sh * ky, e.x, e.y, e.w, e.h)
      }
      ctx.drawImage(base, 0, 0)
      // a capa da folha "Pronta" (só para mostrar; o vídeo não toca na prévia por causa da CSP)
      if (k === Math.floor(N / 3)) capa = await new Promise((ok) => tela.toBlob(ok, 'image/jpeg', 0.85))
      await fonte.add(k / FPS, 1 / FPS)
      onProgress?.((k + 1) / N)
    }
    for (const x of leituras) await x.it.return?.()
    fonte.close()
    await output.finalize()
  } catch (err) {
    await output.cancel?.().catch(() => {})
    throw err
  }
  return { blob: new Blob([output.target.buffer], { type: 'video/mp4' }), capa, codec, semSom }
}
