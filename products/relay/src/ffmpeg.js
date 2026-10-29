// Motor do computador do Relay: o plano (src/plano.js) em linha de comando do ffmpeg, sem shell. Quem roda é o app de
// computador da família (hoje o SOBEDESCE, com o ffmpeg dele: products/sobedesce/src/relay/ é cópia conferida).
//
// Qualidade no nível do HandBrake, com o mesmo codificador dele:
//  - x264 `slow` com CRF (qualidade constante, como o "RF" do HandBrake). Teto de bitrate só nos presets em que o
//    tamanho importa (WhatsApp, proxy): no resto, cena difícil leva os bits que precisa.
//  - Tamanho máximo: duas passadas com bitrate médio, que acerta o tamanho (o "2-pass" do HandBrake).
//  - Redução em Lanczos com arredondamento preciso e croma em resolução cheia; matriz BT.709 e faixa de TV na saída,
//    marcado 1-1-1. Cadência pelo filtro `fps` (descarta quadros inteiros, sem mistura).
//  - Codificador de hardware (VideoToolbox, NVENC, Quick Sync, AMF) só no modo rápido: no mesmo tamanho, perde para o
//    x264 em detalhe (docs/QUALIDADE.md).

/** Formato de pixel que cada codificador aceita melhor (8 bits 4:2:0). */
const pixFor = (encoder) => (encoder === 'h264_qsv' || encoder === 'h264_mf' || encoder === 'hevc_qsv' ? 'nv12' : 'yuv420p')

const k = (bps) => `${Math.round(bps / 1000)}k`

/** Cadeia de filtros de vídeo: escala (Lanczos), encaixe na tela fixa, cadência e formato. */
export function filtroVideo(plano, encoder = 'libx264') {
  const v = plano.video
  const f = []
  const sws = 'flags=lanczos+accurate_rnd+full_chroma_int'
  // a matriz de entrada sempre explícita: sem ela o ffmpeg supõe BT.601 e o HD sai mais escuro (docs/QUALIDADE.md)
  const e = plano.entrada ?? { matriz: 'bt709', faixa: 'tv' }
  const saida = `in_color_matrix=${e.matriz}:in_range=${e.faixa}:out_color_matrix=bt709:out_range=tv`
  if (v.encaixe === 'contain') {
    f.push(`scale=${v.largura}:${v.altura}:force_original_aspect_ratio=decrease:force_divisible_by=2:${sws}:${saida}`)
    f.push(`pad=${v.largura}:${v.altura}:(ow-iw)/2:(oh-ih)/2:black`)
  } else if (v.encaixe === 'cover') {
    f.push(`scale=${v.largura}:${v.altura}:force_original_aspect_ratio=increase:${sws}:${saida}`)
    f.push(`crop=${v.largura}:${v.altura}`)
  } else f.push(`scale=${v.largura}:${v.altura}:${sws}:${saida}`)
  f.push('setsar=1')
  if (v.fps) f.push(`fps=${v.fps}`)
  f.push(`format=${pixFor(encoder)}`)
  return f.join(',')
}

/** Parâmetros do codificador de vídeo. `passe`: null (uma passada), 1 ou 2. */
export function argsCodificador(plano, encoder = 'libx264', passe = null, log = null) {
  const v = plano.video
  const hevc = v.codec === 'hevc'
  // CRF livre, como o HandBrake: o teto (VBV) só onde o tamanho importa (WhatsApp, proxy). Medido: o teto é o que
  // fazia o x264 perder para o HandBrake no mesmo tamanho; sem ele, ganha (docs/QUALIDADE.md)
  const teto = v.teto ? ['-maxrate', k(v.bitrate * v.teto), '-bufsize', k(v.bitrate * v.teto * 2)] : []
  const vbr = ['-b:v', k(v.bitrate), '-maxrate', k(v.bitrate * 1.5), '-bufsize', k(v.bitrate * 2)]
  if (encoder === 'libx264' || encoder === 'libx265') {
    const lib = hevc ? 'libx265' : 'libx264'
    const a = ['-c:v', lib, '-preset', 'slow']
    if (passe) {
      a.push('-b:v', k(v.bitrate), '-pass', String(passe))
      if (log) a.push('-passlogfile', log)
      if (hevc) a.push('-x265-params', `pass=${passe}:stats=${log ?? 'x265'}.log`)
    } else a.push('-crf', String(v.crf ?? 18), ...teto)
    if (!hevc) a.push('-profile:v', 'high')
    else a.push('-tag:v', 'hvc1')
    return a
  }
  const tag = hevc ? ['-tag:v', 'hvc1'] : ['-profile:v', 'high']
  switch (encoder) {
    case 'h264_videotoolbox':
    case 'hevc_videotoolbox':
      return ['-c:v', encoder, '-b:v', k(v.bitrate), '-allow_sw', '1', '-realtime', '0', ...tag]
    case 'h264_nvenc':
    case 'hevc_nvenc':
      return ['-c:v', encoder, '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-multipass', 'fullres', ...vbr, ...tag]
    case 'h264_qsv':
    case 'hevc_qsv':
      return ['-c:v', encoder, '-preset', 'veryslow', ...vbr, ...tag]
    case 'h264_amf':
    case 'hevc_amf':
      return ['-c:v', encoder, '-quality', 'quality', '-rc', 'vbr_peak', ...vbr, ...tag]
    case 'h264_mf':
      return ['-c:v', encoder, '-hw_encoding', '1', '-rate_control', 'u_vbr', '-b:v', k(v.bitrate)]
    default:
      throw new Error(`codificador desconhecido: ${encoder}`)
  }
}

/** Parâmetros de áudio. */
export function argsAudio(plano) {
  const a = plano.audio
  if (!a) return ['-an']
  const comum = ['-ar', String(a.taxa), '-ac', String(a.canais)]
  switch (a.codec) {
    case 'aac':
      return ['-c:a', 'aac', '-b:a', k(a.bitrate), ...comum]
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-b:a', k(a.bitrate), '-id3v2_version', '3', ...comum]
    case 'pcm-s24':
      return ['-c:a', 'pcm_s24le', ...comum]
    case 'pcm-s16':
      return ['-c:a', 'pcm_s16le', ...comum]
    default:
      throw new Error(`áudio desconhecido: ${a.codec}`)
  }
}

const MUX = { mp4: ['-movflags', '+faststart', '-f', 'mp4'], m4a: ['-movflags', '+faststart', '-f', 'ipod'], mp3: ['-f', 'mp3'], wav: ['-f', 'wav'] }

/**
 * Linhas de comando do ffmpeg para um plano: uma (CRF) ou duas (tamanho máximo, 2 passadas com x264).
 * `o`: { input, output, origem (fps), encoder ('libx264' padrão), hwDecode, log (prefixo do log das passadas) }
 */
export function argsFfmpeg(plano, { input, output, origem = {}, encoder = 'libx264', hwDecode = false, log = null }) {
  const base = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']
  if (hwDecode) base.push('-hwaccel', 'videotoolbox')
  base.push('-i', input)
  if (!plano.video) return [[...base, '-map', '0:a:0', '-vn', '-dn', '-sn', '-map_metadata', '0', ...argsAudio(plano), ...MUX[plano.formato], output]]

  const v = plano.video
  const fps = v.fps ?? origem.fps ?? 30
  const gop = ['-g', String(Math.max(1, Math.round(fps * v.gop))), '-keyint_min', String(Math.max(1, Math.round(fps * Math.min(v.gop, 1))))]
  const cor = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv']
  const mapa = ['-map', '0:v:0', ...(plano.audio ? ['-map', '0:a:0?'] : []), '-dn', '-sn', '-map_chapters', '-1']
  const video = (passe) => ['-vf', filtroVideo(plano, encoder), ...argsCodificador(plano, encoder, passe, log), ...gop, ...cor]
  // tamanho máximo ou bitrate escolhido pela pessoa: duas passadas acertam o número (o "bitrate médio" do HandBrake)
  const duasPassadas = (plano.tamanhoMax || v.fixo) && (encoder === 'libx264' || encoder === 'libx265')
  if (!duasPassadas) return [[...base, ...mapa, ...video(null), ...argsAudio(plano), ...MUX[plano.formato], output]]
  return [
    [...base, '-map', '0:v:0', ...video(1), '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    [...base, ...mapa, ...video(2), ...argsAudio(plano), ...MUX[plano.formato], output],
  ]
}
