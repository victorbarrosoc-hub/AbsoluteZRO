// "Converter com a Revela" no celular: o vídeo do Drive vira a versão de um destino (YouTube, Vimeo, Reels, TikTok)
// NO PRÓPRIO APARELHO, e o arquivo novo sobe na mesma pasta pela fila de envios de sempre. Quem decide codec, bitrate,
// tamanho e áudio é a Revela (lib/revela/, cópia de products/finishing conferida por test/revela.test.js). O vídeo é
// lido do Drive aos pedaços (pedidos com Range, o token em cada um), decodificado e codificado pelo navegador
// (WebCodecs, hardware quando o aparelho deixa; ProRes pelo decodificador WASM) e marcado BT.709. Nada passa por
// servidor. O arquivo novo é montado na memória: acima de ~1,5 GB, o computador é o lugar.
import { DESTINOS_CONVERSAO, LIMITE_MEMORIA, nomeSaida, planejar } from './revela/conversao/plano.js'

export { LIMITE_MEMORIA }
export const DESTINOS_REVELA = DESTINOS_CONVERSAO
export const NOMES_CODEC = { prores: 'ProRes', avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8', aac: 'AAC', opus: 'Opus' }

let mb = null
/** As bibliotecas (≈ 1 MB) só carregam quando alguém converte. */
function carregar() {
  mb ??= Promise.all([import('../vendor/mediabunny.min.mjs'), import('../vendor/mediabunny-prores.min.mjs')])
    .then(([m, prores]) => {
      prores.registerProresDecoder()
      return m
    })
    .catch((err) => {
      mb = null
      throw err
    })
  return mb
}

/** fetch com o token do Drive em cada pedido; 401 pede outro token e tenta de novo uma vez (conversão longa). */
export function fetchComToken({ token, invalidar }) {
  return async (input, init = {}) => {
    for (let tentativa = 0; ; tentativa++) {
      const t = await token()
      const headers = new Headers(init.headers || undefined)
      headers.set('Authorization', `Bearer ${t}`)
      const res = await fetch(input, { ...init, headers, credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (res.status === 401 && tentativa === 0) {
        invalidar?.(t)
        continue
      }
      return res
    }
  }
}

/** O decodificador de ProRes entrega quadros sem a cor; sem ela o navegador assume BT.601 (SD). */
async function comCor(MB, amostra, cor) {
  if (amostra.colorSpace?.matrix) return amostra
  const dados = new Uint8Array(amostra.allocationSize())
  const layout = await amostra.copyTo(dados)
  const nova = new MB.VideoSample(dados, {
    format: amostra.format,
    codedWidth: amostra.codedWidth,
    codedHeight: amostra.codedHeight,
    timestamp: amostra.timestamp,
    duration: amostra.duration,
    layout,
    colorSpace: cor,
  })
  amostra.close()
  return nova
}

/**
 * Converte no aparelho. Devolve { file, avisos, codecs: 'H.264 + AAC', tamanhoEstimado }.
 * @param {object} o
 * @param {string} o.url endereço do conteúdo (Drive: files/<id>?alt=media)
 * @param {string} o.nome nome do original ("Master.mov" → "Master-youtube.mp4")
 * @param {string} o.destino youtube | vimeo | reels | tiktok
 * @param {() => Promise<string>} o.token token do Drive (válido)
 * @param {(token: string) => void} [o.invalidar] o Drive recusou este token
 * @param {(fase: 'carregando'|'lendo'|'convertendo', frac?: number, plano?: object) => void} [o.onFase]
 */
export async function converterNoAparelho({ url, nome, destino, token, invalidar, signal, onFase }) {
  const d = DESTINOS_CONVERSAO.find((x) => x.id === destino)
  if (!d) throw new Error('Destino desconhecido.')
  onFase?.('carregando')
  const MB = await carregar()
  if (signal?.aborted) throw new DOMException('Parado', 'AbortError')
  const input = new MB.Input({ source: new MB.UrlSource(url, { fetchFn: fetchComToken({ token, invalidar }), parallelism: 2 }), formats: MB.ALL_FORMATS })
  try {
    onFase?.('lendo')
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('Não achei imagem neste arquivo.')
    const audio = await input.getPrimaryAudioTrack()
    const [largura, altura, duracao, cor, estat, decodifica] = await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.computeDuration(),
      video.getColorSpace(),
      video.computePacketStats(120),
      video.canDecode(),
    ])
    if (!decodifica) throw new Error(`Este aparelho não lê ${NOMES_CODEC[video.codec] ?? video.codec}.`)
    const origem = { largura, altura, duracao, fps: Math.round(estat.averagePacketRate * 1000) / 1000, cor, temAudio: Boolean(audio) }
    const plano = planejar(origem, d)
    const avisos = [...plano.avisos]
    const tam = { width: plano.video.largura, height: plano.video.altura }
    const vcodec = (await MB.canEncodeVideo(plano.video.codec, tam)) ? plano.video.codec : await MB.getFirstEncodableVideoCodec(['avc', 'hevc'], tam)
    if (!vcodec) throw new Error('Este aparelho não gera H.264 neste tamanho.')
    if (vcodec !== plano.video.codec) avisos.push(`Vídeo em ${NOMES_CODEC[vcodec]}: este aparelho não gera ${NOMES_CODEC[plano.video.codec]}.`)
    const acodec = plano.audio ? await MB.getFirstEncodableAudioCodec(plano.audio.codecs) : null
    if (plano.audio && acodec !== plano.audio.codecs[0]) avisos.push(`Áudio em ${NOMES_CODEC[acodec] ?? acodec}: este aparelho não gera ${NOMES_CODEC[plano.audio.codecs[0]]}.`)
    onFase?.('convertendo', 0, plano)

    const target = new MB.BufferTarget()
    const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
    const corOrigem = cor?.matrix ? cor : plano.cor
    const conversao = await MB.Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: vcodec,
        width: plano.video.largura,
        height: plano.video.altura,
        fit: 'contain',
        quality: new MB.Quality({ bitrate: plano.video.bitrate }),
        forceTranscode: true,
        hardwareAcceleration: 'no-preference',
        process: (amostra) => comCor(MB, amostra, corOrigem),
      },
      audio: acodec ? { codec: acodec, quality: new MB.Quality({ bitrate: plano.audio.bitrate }), sampleRate: plano.audio.taxa, forceTranscode: true } : { discard: true },
    })
    if (!conversao.isValid) throw new Error('Não deu para montar a conversão neste aparelho.')
    const parar = () => conversao.cancel()
    signal?.addEventListener('abort', parar, { once: true })
    conversao.onProgress = (f) => onFase?.('convertendo', f, plano)
    try {
      await conversao.execute()
    } catch (err) {
      if (err instanceof MB.ConversionCanceledError) throw new DOMException('Parado', 'AbortError')
      throw err
    } finally {
      signal?.removeEventListener('abort', parar)
    }
    const file = new File([target.buffer], nomeSaida(nome, d), { type: 'video/mp4', lastModified: Date.now() })
    return { file, avisos, codecs: [NOMES_CODEC[vcodec], acodec && NOMES_CODEC[acodec]].filter(Boolean).join(' + '), tamanhoEstimado: plano.tamanhoEstimado }
  } finally {
    input.dispose?.()
  }
}
