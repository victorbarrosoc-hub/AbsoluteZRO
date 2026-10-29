// Mídia no app: abrir (arquivo escolhido, arrastado ou vindo do SOBEDESCE), ler as informações, tirar uma miniatura
// e extrair o áudio em 16 kHz mono para a análise e a transcrição. Tudo com WebCodecs pelo Mediabunny, na máquina.

import * as MB from '../vendor/mediabunny.min.mjs'
import { registerProresDecoder } from '../vendor/mediabunny-prores.min.mjs'

registerProresDecoder()
export { MB }

/** Entrada: { arquivo: File } ou { url, nome } (app de desktop, protocolo próprio com Range). */
export function abrirInput(e) {
  const source = e.arquivo ? new MB.BlobSource(e.arquivo) : new MB.UrlSource(e.url)
  return new MB.Input({ source, formats: MB.ALL_FORMATS })
}

/** Informações da mídia: duração, vídeo (fps, tamanho, codec), áudio (canais, taxa) e se o app consegue decodificar. */
export async function lerInfo(e) {
  const input = abrirInput(e)
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()])
    if (!video && !audio) throw new Error('sem vídeo e sem áudio')
    const duracao = await input.computeDuration()
    const info = { duracao, temVideo: Boolean(video), temAudio: Boolean(audio) }
    if (video) {
      const [largura, altura, estat, decodifica] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight(), video.computePacketStats(120), video.canDecode()])
      Object.assign(info, { largura, altura, fps: Math.round(estat.averagePacketRate * 1000) / 1000, codec: video.codec, decodificaVideo: decodifica })
    }
    if (audio) {
      const [decodifica] = await Promise.all([audio.canDecode()])
      Object.assign(info, { canais: audio.numberOfChannels, taxa: audio.sampleRate, codecAudio: audio.codec, decodificaAudio: decodifica })
    }
    return info
  } finally {
    input.dispose?.()
  }
}

/** Miniatura (canvas) de um instante do vídeo. */
export async function miniatura(e, t = 1, largura = 320) {
  const input = abrirInput(e)
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video || !(await video.canDecode())) return null
    const sink = new MB.CanvasSink(video, { width: largura, fit: 'contain' })
    const ini = await video.getFirstTimestamp()
    const dur = await video.computeDuration()
    const r = await sink.getCanvas(ini + Math.min(t, dur * 0.1))
    return r ? r.canvas : null
  } finally {
    input.dispose?.()
  }
}

/**
 * Áudio da mídia em mono e na taxa pedida (16 kHz para o Whisper). Reamostra em fluxo (média na janela, um passa-
 * baixa simples) para não guardar o áudio original inteiro na memória. aoProgresso(segundosLidos, total).
 */
export async function extrairAudio(e, { taxa = 16000, aoProgresso } = {}) {
  const input = abrirInput(e)
  try {
    const audio = await input.getPrimaryAudioTrack()
    if (!audio) return { pcm: new Float32Array(0), taxa, duracao: 0 }
    const total = await input.computeDuration()
    const saida = new Float32Array(Math.ceil(total * taxa) + taxa)
    let n = 0
    let fase = 0
    let soma = 0
    let cont = 0
    let ultimo = 0
    const sink = new MB.AudioBufferSink(audio)
    for await (const { buffer, timestamp } of sink.buffers()) {
      const passo = buffer.sampleRate / taxa
      const canais = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
      const k = 1 / canais.length
      // começa onde o pacote cai na linha do áudio (pacotes com buraco ou sobreposição se alinham pelo timestamp)
      const alvo = Math.max(0, Math.round(timestamp * taxa))
      if (alvo > n + 1) n = Math.min(saida.length, alvo)
      for (let i = 0; i < buffer.length; i++) {
        let s = 0
        for (const ch of canais) s += ch[i]
        soma += s * k
        cont++
        fase += 1
        if (fase >= passo) {
          fase -= passo
          if (n < saida.length) saida[n++] = soma / cont
          soma = 0
          cont = 0
        }
      }
      if (aoProgresso && timestamp - ultimo > 2) {
        ultimo = timestamp
        aoProgresso(timestamp + buffer.duration, total)
      }
    }
    aoProgresso?.(total, total)
    return { pcm: saida.subarray(0, Math.min(n, Math.round(total * taxa))), taxa, duracao: total }
  } finally {
    input.dispose?.()
  }
}
