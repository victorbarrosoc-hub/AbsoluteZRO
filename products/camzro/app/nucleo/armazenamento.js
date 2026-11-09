// CAMZRO · quanto cabe. Contas puras.
//
// - Tamanho = (bitrate do vídeo + bitrate do áudio) × duração / 8, mais ~1% do contêiner (caixas moof/mdat).
// - Minutos que cabem = espaço livre / (bitrate total / 8) / 60. O espaço livre é o que o navegador deixa este site
//   usar (navigator.storage.estimate(): quota − uso), não o disco inteiro.
// - PCM: taxa × bits × canais (48 kHz × 24 bits × 2 = 2,304 Mb/s).

export const SOBRA_CONTAINER = 1.01

/** Bitrate do áudio em bits/s. PCM: taxa × bits × canais. AAC/Opus: o configurado. */
export function bitrateAudio({ codec = 'pcm-s24', taxa = 48000, canais = 2, bitrate = 256_000 } = {}) {
  const bits = { 'pcm-s16': 16, 'pcm-s24': 24, 'pcm-s32': 32, 'pcm-f32': 32 }[codec]
  return bits ? taxa * bits * canais : bitrate
}

/** Bytes de `segundos` de gravação. */
export const bytesDe = (segundos, bpsVideo, bpsAudio = 0) => ((bpsVideo + bpsAudio) * segundos * SOBRA_CONTAINER) / 8

/** Segundos que cabem em `bytesLivres`. */
export const segundosQueCabem = (bytesLivres, bpsVideo, bpsAudio = 0) => (bytesLivres * 8) / ((bpsVideo + bpsAudio) * SOBRA_CONTAINER)

/** "4,2 GB", "820 MB", "12 KB" (base 1000, como o iPhone e o macOS mostram). */
export function bytesTexto(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const un = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1000 && i < un.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 && i > 1 ? 1 : 0 })} ${un[i]}`
}

/** "1 h 12 min", "38 min", "45 s". */
export function tempoTexto(segundos) {
  if (!Number.isFinite(segundos) || segundos < 0) return '—'
  const t = Math.floor(segundos)
  if (t < 60) return `${t} s`
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** "50 Mb/s". */
export const bitrateTexto = (bps) => `${(bps / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: bps < 10e6 ? 1 : 0 })} Mb/s`

/**
 * Bitrate sugerido (bits/s) para um tamanho e cadência, pela densidade em bits por pixel por quadro (bpp). Referência:
 * o HEVC das câmeras de celular grava 4K30 a ~50 Mb/s (≈ 0,2 bpp); H.264 pede ~1,6× o HEVC para a mesma imagem.
 * Níveis: 'padrao' (≈ câmera do celular), 'alta' (≈ 2×, para cor e recorte) e 'maxima' (≈ 3,5×, perto de intra).
 */
export function bitrateSugerido({ largura, altura, fps, codec = 'avc', nivel = 'alta' }) {
  const bppHevc = { padrao: 0.2, alta: 0.4, maxima: 0.7 }[nivel] ?? 0.4
  const porCodec = { hevc: 1, av1: 0.8, vp9: 1.1, avc: 1.6 }[codec] ?? 1.6
  const bps = largura * altura * fps * bppHevc * porCodec
  // arredonda para um número de câmera (5 Mb/s) e respeita teto e piso práticos dos codificadores de hardware
  return Math.min(400e6, Math.max(4e6, Math.round(bps / 5e6) * 5e6))
}

/** Estado do espaço para o aviso na tela: 'ok', 'pouco' (< 10 min) ou 'acabando' (< 2 min). */
export function nivelDoEspaco(segundosRestantes) {
  if (segundosRestantes < 120) return 'acabando'
  if (segundosRestantes < 600) return 'pouco'
  return 'ok'
}
