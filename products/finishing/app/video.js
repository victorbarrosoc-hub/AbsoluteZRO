// Revela · vídeo no navegador: o Mediabunny lê o arquivo (ProRes pelo decodificador WASM) e daqui saem a cor certa de
// cada quadro, um quadro para o Lab e o que o arquivo conta de si (câmera, curva, fps). Nada sai do aparelho.

import * as MB from '../vendor/mediabunny.min.mjs'
import { registerProresDecoder } from '../vendor/mediabunny-prores.min.mjs'

registerProresDecoder()

export { MB }

const REC709 = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }

/**
 * A cor de cada quadro. O decodificador de ProRes lê a do cabeçalho do quadro, que pode faltar (aí o navegador assume
 * BT.601, de SD) ou contradizer o contêiner. A do contêiner manda, como no QuickTime; sem nenhuma, Rec.709.
 */
export async function comCor(amostra, conteiner) {
  const atual = amostra.colorSpace
  const cor = conteiner?.matrix ? conteiner : atual?.matrix ? null : REC709
  const igual = (k) => atual?.[k] === cor[k]
  if (!cor || (igual('primaries') && igual('transfer') && igual('matrix') && Boolean(atual.fullRange) === Boolean(cor.fullRange))) return amostra
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

// curvas de câmera que um texto do arquivo pode citar (nome do encoder, comentário, tag do fabricante) → entrada do CST
const CURVAS_NO_TEXTO = [
  [/log3g10|redlog|redwidegamut|\bred\b.*ipp2/i, 'red-log3g10'],
  [/logc4|awg4|wide ?gamut ?4/i, 'arri-logc4'],
  [/logc3?|awg3?\b|alexa|amira/i, 'arri-logc3'],
  [/s-?log3.*cine|sgamut3\.?cine/i, 'sony-slog3-cine'],
  [/s-?log3/i, 'sony-slog3'],
  [/s-?log2/i, 'sony-slog2'],
  [/c-?log ?3|canon ?log ?3/i, 'canon-clog3'],
  [/c-?log ?2|canon ?log ?2/i, 'canon-clog2'],
  [/v-?log/i, 'panasonic-vlog'],
  [/film gen ?5|blackmagic.*film/i, 'bmd-gen5'],
  [/f-?log ?2/i, 'fuji-flog2'],
  [/f-?log/i, 'fuji-flog'],
  [/n-?log/i, 'nikon-nlog'],
  [/d-?log(?! ?m)/i, 'dji-dlog'],
]
const CHAVES_CAMERA = /make|model|camera|manufacturer|fabricante|device/i

/** O que as tags do arquivo dizem da câmera e da curva (só o que está lá: sem tag, sem câmera). */
export function cameraDasTags(tags) {
  const raw = tags?.raw ?? {}
  const textos = []
  let fabricante = null
  let modelo = null
  for (const [k, v] of Object.entries(raw)) {
    const t = typeof v === 'string' ? v.trim() : typeof v?.toString === 'function' && !(v instanceof Uint8Array) ? String(v) : ''
    if (!t || t.length > 120) continue
    textos.push(t)
    if (/make|manufacturer/i.test(k)) fabricante ??= t
    else if (/model/i.test(k)) modelo ??= t
    else if (CHAVES_CAMERA.test(k)) modelo ??= t
  }
  for (const k of ['comment', 'description', 'title']) if (typeof tags?.[k] === 'string') textos.push(tags[k])
  const camera = [fabricante, modelo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null
  const tudo = textos.join(' · ')
  const curva = CURVAS_NO_TEXTO.find(([re]) => re.test(tudo))?.[1] ?? null
  const encoder = Object.entries(raw).find(([k]) => /encoder|©too|software/i.test(k))?.[1]
  return { camera, curva, encoder: typeof encoder === 'string' ? encoder : null }
}

const NOMES_CODEC = { prores: 'ProRes', avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' }

/**
 * Um quadro do vídeo (a um terço da duração, onde a cena já está montada) num canvas do tamanho pedido, e a ficha do
 * arquivo: { canvas, info: { codec, largura, altura, fps, camera, curva, encoder } }.
 */
export async function lerQuadro(arquivo, lado = 1280) {
  const input = new MB.Input({ source: new MB.BlobSource(arquivo), formats: MB.ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('Esse arquivo não tem vídeo.')
    if (!(await video.canDecode())) throw new Error(`Este navegador não lê ${NOMES_CODEC[video.codec] ?? video.codec}.`)
    const [largura, altura, duracao, cor, estat, tags, inicio] = await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.computeDuration(),
      video.getColorSpace(),
      video.computePacketStats(60),
      input.getMetadataTags().catch(() => ({})),
      video.getFirstTimestamp(),
    ])
    const amostra = await new MB.VideoSampleSink(video).getSample(inicio + duracao / 3)
    if (!amostra) throw new Error('Não deu para ler um quadro desse vídeo.')
    const certa = await comCor(amostra, cor)
    const escala = Math.min(1, lado / Math.max(largura, altura))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(largura * escala))
    canvas.height = Math.max(1, Math.round(altura * escala))
    certa.drawWithFit(canvas.getContext('2d'), { fit: 'fill' })
    certa.close()
    return {
      canvas,
      info: { codec: NOMES_CODEC[video.codec] ?? video.codec, largura, altura, fps: Math.round(estat.averagePacketRate * 1000) / 1000, ...cameraDasTags(tags) },
    }
  } finally {
    input.dispose?.()
  }
}

/** O arquivo é vídeo? (o tipo pode vir vazio para .mov e .mxf em alguns sistemas) */
export const ehVideo = (arquivo) => arquivo.type.startsWith('video/') || /\.(mov|mp4|m4v|mkv|webm)$/i.test(arquivo.name)
