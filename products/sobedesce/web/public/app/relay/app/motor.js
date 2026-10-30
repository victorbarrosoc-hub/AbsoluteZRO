// Motor do navegador do Relay: lê o arquivo com o Mediabunny (ProRes pelo decodificador WASM), segue o plano
// (src/plano.js) e grava com WebCodecs, no hardware quando o aparelho deixa. Nada sai do aparelho.
//
// Onde a qualidade se ganha aqui:
//  - Redução de tamanho em Lanczos na placa de vídeo (app/escala.js), como o ffmpeg; sem placa, o
//    canvas do navegador em qualidade alta.
//  - Cor: o decodificador de ProRes entrega quadros sem a cor, e sem ela o navegador assume BT.601 (SD): o motor
//    marca a cor do arquivo antes de converter. Saída SDR marcada BT.709.
//  - Áudio: AAC do sistema quando existe (Mac, Windows, iPhone); senão o AAC do FFmpeg em WASM, nunca Opus num MP4
//    que o iPhone não toca. MP3 pelo LAME em WASM.
//  - Tamanho máximo: confere o arquivo pronto; se o codificador passou do limite, refaz uma vez com o bitrate
//    corrigido pela diferença medida (os de hardware passam do alvo).

import * as MB from '../vendor/mediabunny.min.mjs'
import { registerProresDecoder } from '../vendor/mediabunny-prores.min.mjs'
import { extensao, planejar } from '../src/plano.js'
import { preset as acharPreset } from '../src/presets.js'
import { criarEscala } from './escala.js'

registerProresDecoder()

const escalas = {}
let modoEscala = 'auto'
/** Redução na placa: 'auto' (placa de verdade), 'gpu' (mesmo em WebGL de software: testes) ou 'canvas' (desliga). */
export function usarEscala(modo = 'auto') {
  modoEscala = modo
}
const escalaAtual = () => (modoEscala === 'canvas' ? null : (escalas[modoEscala] ??= criarEscala(MB.VideoSample, { forcar: modoEscala === 'gpu' })))
let corAtual = null // a cor do arquivo em conversão (a escala sobe o quadro já com ela)
MB.registerVideoSampleTransformer((amostra, d) => escalaAtual()?.transformar(amostra, d, (a) => comCor(a, corAtual, { fechar: false })) ?? null)

// A cor da Revela tem a escala dela: na placa mesmo em WebGL de software (sem canvas de reserva: a LUT não existe lá)
let escalaDaCor = null
const escalaCor = () => (escalaDaCor ??= criarEscala(MB.VideoSample, { forcar: true }))

/** Volume em dB num pedaço de áudio (cópia em ponto flutuante, com limite em ±1). */
function comGanho(amostra, db) {
  const fator = 10 ** (db / 20)
  const n = amostra.numberOfFrames
  const canais = amostra.numberOfChannels
  const dados = new Float32Array(n * canais)
  const plano = new Float32Array(n)
  for (let c = 0; c < canais; c++) {
    amostra.copyTo(plano, { planeIndex: c, format: 'f32-planar' })
    for (let i = 0; i < n; i++) dados[c * n + i] = Math.max(-1, Math.min(1, plano[i] * fator))
  }
  const nova = new MB.AudioSample({ data: dados, format: 'f32-planar', numberOfChannels: canais, sampleRate: amostra.sampleRate, timestamp: amostra.timestamp })
  amostra.close()
  return nova
}

let aacPronto = null
let mp3Pronto = null
async function garantirCodificadorAudio(codec) {
  if (codec === 'aac' && !(await MB.canEncodeAudio('aac'))) {
    aacPronto ??= import('../vendor/mediabunny-aac-encoder.min.mjs').then((m) => m.registerAacEncoder())
    await aacPronto
    return 'wasm'
  }
  if (codec === 'mp3' && !(await MB.canEncodeAudio('mp3'))) {
    mp3Pronto ??= import('../vendor/mediabunny-mp3-encoder.min.mjs').then((m) => m.registerMp3Encoder())
    await mp3Pronto
    return 'wasm'
  }
  return 'sistema'
}

/**
 * De onde ler: um File/Blob do aparelho, ou { nome, fonte: (MB) => fonte do Mediabunny } (o Drive aos pedaços, no
 * SOBEDESCE: `new MB.UrlSource(url, { fetchFn })`).
 */
const fonteDe = (arquivo) => (typeof Blob !== 'undefined' && arquivo instanceof Blob ? new MB.BlobSource(arquivo) : arquivo.fonte(MB))

const SDR = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }

/**
 * A cor de verdade de cada quadro. O decodificador de ProRes entrega os quadros marcados como BT.601 (ou sem marca),
 * mesmo quando o arquivo diz BT.709: o navegador converte errado e a imagem escurece (medido: docs/QUALIDADE.md).
 * Vale a cor que o contêiner declara; sem ela, a do próprio quadro; sem nenhuma, BT.709 para HD e BT.601 para SD
 * (o mesmo palpite do ffmpeg). Só remarca: os valores já estão na matriz certa.
 */
export function corDoArquivo(info) {
  if (info?.cor?.matrix) return { primaries: info.cor.primaries ?? 'bt709', transfer: info.cor.transfer ?? 'bt709', matrix: info.cor.matrix, fullRange: Boolean(info.cor.fullRange) }
  return null
}
const palpite = (l, a) => (Math.max(l, a) >= 1280 || Math.min(l, a) >= 720 ? SDR : { primaries: 'smpte170m', transfer: 'bt709', matrix: 'smpte170m', fullRange: false })

/** Remarca a cor do quadro (cópia). `fechar`: fecha o original quando troca. */
export async function comCor(amostra, cor, { fechar = true } = {}) {
  const alvo = cor ?? (amostra.colorSpace?.matrix ? null : palpite(amostra.codedWidth, amostra.codedHeight))
  if (!alvo || (amostra.colorSpace?.matrix === alvo.matrix && Boolean(amostra.colorSpace?.fullRange) === alvo.fullRange)) return amostra
  const dados = new Uint8Array(amostra.allocationSize())
  const layout = await amostra.copyTo(dados)
  const nova = new MB.VideoSample(dados, {
    format: amostra.format,
    codedWidth: amostra.codedWidth,
    codedHeight: amostra.codedHeight,
    timestamp: amostra.timestamp,
    duration: amostra.duration,
    layout,
    colorSpace: alvo,
    rotation: amostra.rotation,
  })
  if (fechar) amostra.close()
  return nova
}

/**
 * 10/12 bits (ProRes, celulares em HDR) → I420 de 8 bits com ARREDONDAMENTO. O codificador do navegador trunca na
 * conversão, e o vídeo inteiro escurece meio nível (medido: docs/QUALIDADE.md). Croma 4:2:2 e 4:4:4 vira 4:2:0 pela
 * média. Devolve a própria amostra se já for 8 bits.
 */
export async function para8bits(amostra, cor) {
  const m = /^I4(20|22|44)P(10|12)$/.exec(amostra.format ?? '')
  if (!m) return amostra
  const [sub, bits] = [m[1], Number(m[2])]
  const w = amostra.codedWidth
  const h = amostra.codedHeight
  const bruto = new Uint8Array(amostra.allocationSize())
  const layout = await amostra.copyTo(bruto)
  const u16 = (i) => new Uint16Array(bruto.buffer, layout[i].offset, (layout[i].stride / 2) * (i === 0 || sub !== '20' ? h : h / 2))
  const desloc = bits - 8
  const meio = 1 << (desloc - 1)
  const saida = new Uint8Array((w * h * 3) / 2)
  // luma
  const Y = u16(0)
  const passoY = layout[0].stride / 2
  for (let y = 0; y < h; y++) {
    const o = y * w
    const i = y * passoY
    for (let x = 0; x < w; x++) saida[o + x] = Math.min(255, (Y[i + x] + meio) >> desloc)
  }
  // croma
  const cw = w / 2
  const ch = h / 2
  for (let p = 1; p <= 2; p++) {
    const C = u16(p)
    const passo = layout[p].stride / 2
    const base = p === 1 ? w * h : w * h + cw * ch
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        let v
        if (sub === '20') v = (C[y * passo + x] + meio) >> desloc
        else if (sub === '22') v = (C[2 * y * passo + x] + C[(2 * y + 1) * passo + x] + 2 * meio) >> (desloc + 1)
        else {
          const a = 2 * y * passo + 2 * x
          v = (C[a] + C[a + 1] + C[a + passo] + C[a + passo + 1] + 4 * meio) >> (desloc + 2)
        }
        saida[base + y * cw + x] = Math.min(255, v)
      }
  }
  const nova = new MB.VideoSample(saida, {
    format: 'I420',
    codedWidth: w,
    codedHeight: h,
    timestamp: amostra.timestamp,
    duration: amostra.duration,
    colorSpace: cor ?? amostra.colorSpace?.toJSON?.() ?? amostra.colorSpace,
    rotation: amostra.rotation,
  })
  amostra.close()
  return nova
}

// Plano B da leitura. Há navegador que recusa o H.264/HEVC do jeito que o arquivo descreve (nível acima do que ele
// declara, cor que ele não aceita), mas decodifica se a gente pedir de outro jeito. O Relay testa de verdade: só vale a
// configuração que devolveu um quadro do próprio arquivo; aí um decodificador do Mediabunny passa a usá-la.
const ACEITAS = new Map()
const hex = (d) => (d ? Array.from(d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength), (b) => b.toString(16).padStart(2, '0')).join('') : '')
const chaveDe = (c) => `${c.codec}|${c.codedWidth}x${c.codedHeight}|${hex(c.description)}`

class DecodificadorAlternativo extends MB.CustomVideoDecoder {
  static supports(_codec, config) {
    return ACEITAS.has(chaveDe(config))
  }
  init() {
    this.d = new VideoDecoder({ output: (q) => this.onSample(new MB.VideoSample(q)), error: (e) => this.onError(e) })
    this.d.configure(ACEITAS.get(chaveDe(this.config)))
  }
  decode(pacote) {
    this.d.decode(pacote.toEncodedVideoChunk())
  }
  flush() {
    return this.d.flush()
  }
  close() {
    if (this.d?.state !== 'closed') this.d?.close()
  }
}
MB.registerDecoder(DecodificadorAlternativo)

/** Outras formas de pedir o mesmo vídeo: sem a cor, só codec e descrição, decodificação por software, nível menor. */
export function alternativas(cfg) {
  const base = { codec: cfg.codec, description: cfg.description }
  const lista = [{ ...cfg, colorSpace: undefined }, base, { ...base, hardwareAcceleration: 'prefer-software' }]
  const avc = /^(avc[13])\.([0-9a-f]{4})([0-9a-f]{2})$/i.exec(cfg.codec)
  if (avc) for (const nivel of ['33', '32', '2a', '28']) if (parseInt(nivel, 16) < parseInt(avc[3], 16)) lista.push({ ...base, codec: `${avc[1]}.${avc[2]}${nivel}` })
  return lista
}

/** Um quadro de verdade sai com esta configuração? (com prazo: decodificador travado conta como não) */
async function devolveQuadro(config, pacote) {
  const aceita = await VideoDecoder.isConfigSupported(config).then((r) => r.supported === true, () => false)
  if (!aceita) return false
  return new Promise((pronto) => {
    let quadro = false
    const d = new VideoDecoder({ output: (q) => ((quadro = true), q.close()), error: () => pronto(false) })
    const prazo = setTimeout(() => (d.state !== 'closed' && d.close(), pronto(false)), 5000)
    try {
      d.configure(config)
      d.decode(pacote.toEncodedVideoChunk())
      d.flush().then(
        () => (clearTimeout(prazo), d.close(), pronto(quadro)),
        () => (clearTimeout(prazo), pronto(false)),
      )
    } catch {
      clearTimeout(prazo)
      pronto(false)
    }
  })
}

async function lerDeOutroJeito(video) {
  if (typeof VideoDecoder === 'undefined' || !['avc', 'hevc'].includes(video.codec)) return false
  const cfg = await video.getDecoderConfig().catch(() => null)
  const pacote = cfg && (await new MB.EncodedPacketSink(video).getFirstPacket().catch(() => null))
  if (!pacote) return false
  for (const outra of alternativas(cfg))
    if (await devolveQuadro(outra, pacote)) {
      ACEITAS.set(chaveDe(cfg), outra)
      return true
    }
  return false
}

/** Para a mensagem de erro: o que o arquivo pede, em uma linha. */
async function descreverVideo(video) {
  const cfg = await video.getDecoderConfig().catch(() => null)
  const qual = cfg ? `${cfg.codec} · ${cfg.codedWidth}×${cfg.codedHeight}` : `${video.codec ?? '?'} sem descrição`
  return typeof VideoDecoder === 'undefined' ? `${qual} · sem WebCodecs` : qual
}

/** O que o plano precisa saber do arquivo. */
export async function lerArquivo(arquivo) {
  const input = new MB.Input({ source: fonteDe(arquivo), formats: MB.ALL_FORMATS })
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()])
    if (!video && !audio) throw Object.assign(new Error('Não abre como vídeo nem áudio.'), { codigo: 'formato' })
    const duracao = await input.computeDuration()
    const info = { duracao, temVideo: Boolean(video), temAudio: Boolean(audio), formato: (await input.getFormat()).name }
    if (video) {
      const [largura, altura, cor, estat, decodifica] = await Promise.all([
        video.getDisplayWidth(),
        video.getDisplayHeight(),
        video.getColorSpace(),
        video.computePacketStats(120),
        video.canDecode(),
      ])
      Object.assign(info, { codec: video.codec, largura, altura, cor, fps: Math.round(estat.averagePacketRate * 1000) / 1000, decodifica })
      if (!decodifica) {
        info.decodifica = await lerDeOutroJeito(video)
        if (!info.decodifica) info.detalheCodec = await descreverVideo(video)
      }
    }
    if (audio) {
      const [decodificaAudio] = await Promise.all([audio.canDecode()])
      Object.assign(info, { codecAudio: audio.codec, canais: audio.numberOfChannels, taxa: audio.sampleRate, decodificaAudio })
    }
    return info
  } finally {
    input.dispose?.()
  }
}

/** Um quadro perto do começo, com a cor certa, desenhado no canvas (miniatura). */
export async function miniatura(arquivo, tela, info) {
  const input = new MB.Input({ source: fonteDe(arquivo), formats: MB.ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video || !(await video.canDecode())) return false
    const inicio = await video.getFirstTimestamp()
    const amostra = await new MB.VideoSampleSink(video).getSample(inicio + Math.min(1, (info?.duracao ?? 0) * 0.1))
    if (!amostra) return false
    const certa = await comCor(amostra, corDoArquivo(info))
    certa.drawWithFit(tela.getContext('2d'), { fit: 'cover' })
    certa.close()
    return true
  } finally {
    input.dispose?.()
  }
}

/** Codecs que este aparelho grava: { avc, hevc, aac } (true/false). */
export async function capacidades() {
  const [avc, hevc, aac] = await Promise.all([MB.canEncodeVideo('avc'), MB.canEncodeVideo('hevc'), MB.canEncodeAudio('aac')])
  return { avc, hevc, aac }
}

const MIME = { mp4: 'video/mp4', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' }

function formatoSaida(formato, emDisco) {
  if (formato === 'mp3') return new MB.Mp3OutputFormat()
  if (formato === 'wav') return new MB.WavOutputFormat()
  // M4A é MP4 só com áudio; início rápido (moov na frente) quando monta na memória
  return new MB.Mp4OutputFormat({ fastStart: emDisco ? false : 'in-memory' })
}

/**
 * Converte um arquivo (File/Blob ou { nome, fonte }) para um preset. `opcoes`: as do plano (resolucao, preencher,
 * tamanhoMB) e { info (de lerArquivo), destino: FileSystemDirectoryHandle | null, nome, aoProgredir(f),
 * aoComecar(conversao), sinal: AbortSignal, lerLook(id) → Promise<texto do .cube> (a receita de cor com look) }.
 * Devolve { blob | null (salvo na pasta), bytes, extensao, plano, avisos, codecVideo, codecAudio, segundos }.
 */
export async function converterArquivo(arquivo, p, opcoes = {}) {
  const preset = typeof p === 'string' ? acharPreset(p) : p
  const info = opcoes.info ?? (await lerArquivo(arquivo))
  if (info.temVideo && preset.video && !info.decodifica) throw Object.assign(new Error(`Este navegador não lê ${info.codec}.`), { codigo: 'decodificar' })
  let plano = planejar(info, preset, { ...opcoes, motor: 'navegador' })
  const avisos = [...plano.avisos]
  const inicio = performance.now()
  escalaAtual()?.zerar()

  let codecVideo = null
  if (plano.video) {
    const tam = { width: plano.video.largura, height: plano.video.altura }
    codecVideo = (await MB.canEncodeVideo(plano.video.codec, tam)) ? plano.video.codec : await MB.getFirstEncodableVideoCodec(['avc', 'hevc'], tam)
    if (!codecVideo) throw Object.assign(new Error('Este aparelho não grava H.264 nem HEVC neste tamanho.'), { codigo: 'codificar' })
    if (codecVideo !== plano.video.codec) avisos.push(`Vídeo em ${codecVideo === 'avc' ? 'H.264' : 'HEVC'}: este aparelho não grava ${plano.video.codec === 'hevc' ? 'HEVC' : 'H.264'}.`)
  }
  let codecAudio = null
  let origemAudio = null
  if (plano.audio) {
    const pedido = plano.audio.codec
    if (pedido.startsWith('pcm')) codecAudio = pedido
    else {
      origemAudio = await garantirCodificadorAudio(pedido)
      codecAudio = (await MB.canEncodeAudio(pedido)) ? pedido : null
      if (!codecAudio) throw Object.assign(new Error(`Este navegador não grava ${pedido.toUpperCase()}.`), { codigo: 'codificar' })
    }
  }

  // cor da Revela: a receita vira as etapas da placa (src/cor.js), uma vez por conversão
  let etapasCor = null
  if (plano.video && plano.receitaCor) {
    const Cor = await import('../src/cor.js')
    const r = plano.receitaCor
    const look = r.look ? Cor.lerLook(await (opcoes.lerLook?.(r.look.id) ?? Promise.reject(Object.assign(new Error(`O look "${r.look.nome}" não está neste aparelho.`), { codigo: 'look' })))) : null
    etapasCor = Cor.etapasParaPlaca(r, look)
  }

  const executar = async (plano) => {
    const emDisco = Boolean(opcoes.destino)
    let gravavel = null
    let target
    if (emDisco) {
      const h = await opcoes.destino.getFileHandle(opcoes.nome, { create: true })
      gravavel = await h.createWritable()
      target = new MB.StreamTarget(gravavel, { chunked: true })
    } else target = new MB.BufferTarget()

    const input = new MB.Input({ source: fonteDe(arquivo), formats: MB.ALL_FORMATS })
    const output = new MB.Output({ format: formatoSaida(plano.formato, emDisco), target })
    const corOrigem = corDoArquivo(info)
    corAtual = corOrigem
    const v = plano.video
    // giro e espelho da pessoa somam aos do arquivo; o recorte é na imagem já girada (pixels de tela)
    const giroArquivo = v ? await (await input.getPrimaryVideoTrack())?.getRotation?.() ?? 0 : 0
    const [lw, lh] = v && v.giro % 180 ? [info.altura, info.largura] : [info.largura, info.altura]
    const recorte = v?.recorte ? { left: v.recorte.esquerda, top: v.recorte.cima, width: lw - v.recorte.esquerda - v.recorte.direita, height: lh - v.recorte.cima - v.recorte.baixo } : undefined
    const comum = v
      ? {
          codec: codecVideo,
          frameRate: v.fps ?? undefined,
          keyFrameInterval: v.gop,
          quality: new MB.Quality({ bitrate: v.bitrate, bitrateMode: v.modo === 'constante' ? 'constant' : 'variable' }),
          forceTranscode: true,
          hardwareAcceleration: 'no-preference', // o navegador usa o hardware quando existe; exigir falha onde não há
        }
      : null
    let video = { discard: true }
    if (v && etapasCor) {
      // cor da Revela: o Relay faz giro, recorte, escala e LUT de uma vez na placa, do quadro decodificado (10 bits em
      // meia precisão) até o I420; o Mediabunny não mexe no quadro (o giro do arquivo é desfeito aqui e refeito lá)
      const escala = escalaCor()
      escala.definirCor(etapasCor, !corOrigem?.fullRange)
      const d = { width: v.largura, height: v.altura, fit: v.encaixe ?? 'fill', flip: v.espelhar, crop: recorte ?? { left: 0, top: 0, width: lw, height: lh } }
      video = {
        ...comum,
        rotate: (360 - giroArquivo) % 360,
        processedWidth: v.largura,
        processedHeight: v.altura,
        process: async (amostra) => {
          const r = await escala.transformar(amostra, { ...d, rotation: (((amostra.rotation ?? 0) + v.giro) % 360 + 360) % 360 }, (a) => comCor(a, corOrigem, { fechar: false }))
          if (!r) throw Object.assign(new Error('Sem WebGL2 neste navegador: a cor da Revela não roda aqui.'), { codigo: 'cor' })
          return r
        },
      }
    } else if (v) {
      video = {
        ...comum,
        width: v.largura,
        height: v.altura,
        fit: v.encaixe ?? 'fill',
        ...(v.giro ? { rotate: v.giro } : {}),
        ...(v.espelhar ? { flip: true } : {}),
        ...(recorte ? { crop: recorte } : {}),
        // o que não passou pela escala (mesmo tamanho) chega aqui como saiu do decodificador
        process: async (amostra) => para8bits(await comCor(amostra, corOrigem), corOrigem),
      }
    }
    const a = plano.audio
    const conversao = await MB.Conversion.init({
      input,
      output,
      tracks: 'primary',
      ...(plano.trecho ? { trim: { ...(plano.trecho.inicio ? { start: plano.trecho.inicio } : {}), ...(plano.trecho.fim != null ? { end: plano.trecho.fim } : {}) } } : {}),
      video,
      audio: a
        ? {
            codec: codecAudio,
            ...(a.bitrate ? { quality: new MB.Quality({ bitrate: a.bitrate }) } : {}),
            sampleRate: a.taxa,
            numberOfChannels: a.canais,
            forceTranscode: true,
            ...(a.ganho ? { process: (amostra) => comGanho(amostra, a.ganho) } : {}),
          }
        : { discard: true },
    })
    if (!conversao.isValid) {
      input.dispose?.()
      throw Object.assign(new Error('Não deu para montar a conversão: ' + conversao.discardedTracks.map((t) => t.reason).join(', ')), { codigo: 'montar' })
    }
    opcoes.aoComecar?.(conversao)
    if (opcoes.aoProgredir) conversao.onProgress = opcoes.aoProgredir
    const parar = () => conversao.cancel()
    opcoes.sinal?.addEventListener('abort', parar, { once: true })
    try {
      if (opcoes.sinal?.aborted) await conversao.cancel()
      await conversao.execute()
    } finally {
      opcoes.sinal?.removeEventListener('abort', parar)
      input.dispose?.()
    }
    if (emDisco) {
      const f = await (await opcoes.destino.getFileHandle(opcoes.nome)).getFile()
      return { blob: null, bytes: f.size }
    }
    const blob = new Blob([target.buffer], { type: MIME[plano.formato] ?? 'application/octet-stream' })
    return { blob, bytes: blob.size }
  }

  let r = await executar(plano)
  // passou do limite: refaz uma vez, com o bitrate corrigido pelo que o codificador realmente gastou
  if (plano.tamanhoMax && r.bytes > plano.tamanhoMax && plano.video) {
    const fator = (plano.tamanhoMax * 0.97) / r.bytes
    plano = { ...plano, video: { ...plano.video, bitrate: Math.round(plano.video.bitrate * fator) } }
    avisos.push('O codificador passou do limite na primeira vez: refiz com menos bitrate.')
    r = await executar(plano)
    if (r.bytes > plano.tamanhoMax) avisos.push('Ainda acima do limite: este aparelho não segura o bitrate.')
  }
  return {
    ...r,
    extensao: extensao(plano.formato),
    plano,
    avisos,
    codecVideo,
    codecAudio,
    audioWasm: origemAudio === 'wasm',
    escala: etapasCor ? 'lanczos' : (escalaAtual()?.usada() ?? 'canvas'),
    segundos: (performance.now() - inicio) / 1000,
  }
}

export { MB }
