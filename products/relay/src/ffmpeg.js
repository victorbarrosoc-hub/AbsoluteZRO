// Motor do computador do Relay: o plano (src/plano.js) em linha de comando do ffmpeg, sem shell. Quem roda é o app de
// computador da família (hoje o SOBEDESCE, com o ffmpeg dele: products/sobedesce/src/relay/ é cópia conferida).
//
// Qualidade: o x264 bem configurado (medido em docs/QUALIDADE.md):
//  - x264 `slow` com CRF (qualidade constante). Teto de bitrate só nos presets em que o
//    tamanho importa (WhatsApp, proxy): no resto, cena difícil leva os bits que precisa.
//  - Tamanho máximo e bitrate médio da pessoa: duas passadas, que acertam o número. Bitrate constante: CBR do x264.
//  - Redução em Lanczos com arredondamento preciso e croma em resolução cheia; matriz BT.709 e faixa de TV na saída,
//    marcado 1-1-1. Cadência pelo filtro `fps` (descarta quadros inteiros, sem mistura), em fração (24000/1001) quando
//    é NTSC: 23,976 escrito como decimal sai 2997/125 e escorrega com o tempo.
//  - Cor da Revela: a LUT assada (src/cor.js, `assarParaFfmpeg`) entra no `lut3d` tetraédrico em RGB de ponto
//    flutuante, antes da escala.
//  - Codificador de hardware (VideoToolbox, NVENC, Quick Sync, AMF) só no modo rápido: no mesmo tamanho, perde para o
//    x264 em detalhe (docs/QUALIDADE.md).

/** Formato de pixel que cada codificador aceita melhor (8 bits 4:2:0). */
const pixFor = (encoder) => (encoder === 'h264_qsv' || encoder === 'h264_mf' || encoder === 'hevc_qsv' ? 'nv12' : 'yuv420p')

const k = (bps) => `${Math.round(bps / 1000)}k`

/** 23,976 → "24000/1001"; 25 → "25". */
export function fracaoFps(fps) {
  const n = Math.round(fps * 1.001)
  if (!Number.isInteger(fps) && Math.abs(fps * 1.001 - n) < 0.002) return `${n * 1000}/1001`
  return String(fps)
}

/** Caminho dentro de um filtro do ffmpeg (aspas simples; dois-pontos e barra invertida escapados). */
const caminhoNoFiltro = (c) => `'${String(c).replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`

const RUIDO = [null, 'hqdn3d=2:1.5:3:2.25', 'hqdn3d=4:3:6:4.5', 'hqdn3d=7:5.25:10.5:7.9']
const NITIDEZ = [null, 'unsharp=5:5:0.4:5:5:0', 'unsharp=5:5:0.8:5:5:0']

/**
 * Cadeia de filtros de vídeo: desentrelaçar, giro, espelho, recorte, ruído, cor da Revela (LUT), escala (Lanczos),
 * encaixe na tela fixa, nitidez, cadência e formato. `lut`: caminho do .cube assado (obrigatório com receita de cor).
 */
export function filtroVideo(plano, encoder = 'libx264', lut = null) {
  const v = plano.video
  const c = plano.computador ?? {}
  const f = []
  const sws = 'flags=lanczos+accurate_rnd+full_chroma_int'
  // a matriz de entrada sempre explícita: sem ela o ffmpeg supõe BT.601 e o HD sai mais escuro (docs/QUALIDADE.md)
  const e = plano.entrada ?? { matriz: 'bt709', faixa: 'tv' }
  if (c.desentrelacar) f.push('bwdif=mode=send_frame:parity=auto:deint=interlaced')
  if (v.giro === 90) f.push('transpose=clock')
  else if (v.giro === 180) f.push('hflip', 'vflip')
  else if (v.giro === 270) f.push('transpose=cclock')
  if (v.espelhar) f.push('hflip')
  if (v.recorte) {
    const r = v.recorte
    f.push(`crop=iw-${r.esquerda + r.direita}:ih-${r.cima + r.baixo}:${r.esquerda}:${r.cima}`)
  }
  if (RUIDO[c.ruido]) f.push(RUIDO[c.ruido])
  let saida = `in_color_matrix=${e.matriz}:in_range=${e.faixa}:out_color_matrix=bt709:out_range=tv`
  if (plano.receitaCor) {
    if (!lut) throw new Error('A cor da Revela precisa da LUT assada (src/cor.js, assarParaFfmpeg).')
    // YUV → RGB de ponto flutuante na faixa cheia (a LUT desfaz a faixa de vídeo por dentro), LUT tetraédrica
    f.push(`scale=in_color_matrix=${e.matriz}:in_range=${e.faixa}:out_range=pc:flags=accurate_rnd+full_chroma_int`, 'format=gbrpf32le', `lut3d=file=${caminhoNoFiltro(lut)}:interp=tetrahedral`)
    saida = 'out_color_matrix=bt709:out_range=tv'
  }
  if (v.encaixe === 'contain') {
    f.push(`scale=${v.largura}:${v.altura}:force_original_aspect_ratio=decrease:force_divisible_by=2:${sws}:${saida}`)
    f.push(`pad=${v.largura}:${v.altura}:(ow-iw)/2:(oh-ih)/2:black`)
  } else if (v.encaixe === 'cover') {
    f.push(`scale=${v.largura}:${v.altura}:force_original_aspect_ratio=increase:${sws}:${saida}`)
    f.push(`crop=${v.largura}:${v.altura}`)
  } else f.push(`scale=${v.largura}:${v.altura}:${sws}:${saida}`)
  if (NITIDEZ[c.nitidez]) f.push(NITIDEZ[c.nitidez])
  f.push('setsar=1')
  if (v.fps) f.push(`fps=${fracaoFps(v.fps)}`)
  // interpretar: todos os quadros, com o tempo de cada um multiplicado (e a cadência nova marcada no arquivo)
  if (v.conforme && v.conforme.fator !== 1) f.push(`setpts=PTS*${fracaoFps(v.conforme.de)}/(${fracaoFps(v.conforme.para)})`, `fps=${fracaoFps(v.conforme.para)}`)
  f.push(`format=${pixFor(encoder)}`)
  // marca cada quadro 1-1-1: do ffmpeg 8 em diante o codificador lê a cor dos quadros, e as opções -color_* sozinhas
  // não bastam (a saída perdia primárias e transferência). O mesmo que a Revela faz (products/finishing).
  f.push('setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv')
  return f.join(',')
}

/** Parâmetros do codificador de vídeo. `passe`: null (uma passada), 1 ou 2. */
export function argsCodificador(plano, encoder = 'libx264', passe = null, log = null) {
  const v = plano.video
  const hevc = v.codec === 'hevc'
  // CRF livre: o teto (VBV) só onde o tamanho importa (WhatsApp, proxy). Medido: com o teto, o x264 perdia para a
  // referência de duas passadas no mesmo tamanho; sem ele, ganha (docs/QUALIDADE.md)
  const teto = v.teto ? ['-maxrate', k(v.bitrate * v.teto), '-bufsize', k(v.bitrate * v.teto * 2)] : []
  const vbr = ['-b:v', k(v.bitrate), '-maxrate', k(v.bitrate * 1.5), '-bufsize', k(v.bitrate * 2)]
  if (encoder === 'libx264' || encoder === 'libx265') {
    const c = plano.computador ?? {}
    const lib = hevc ? 'libx265' : 'libx264'
    const a = ['-c:v', lib, '-preset', c.velocidade ?? 'slow']
    if (c.ajuste && (!hevc || c.ajuste !== 'film')) a.push('-tune', c.ajuste) // o x265 não tem "film"
    if (passe) {
      a.push('-b:v', k(v.bitrate), '-pass', String(passe))
      if (log) a.push('-passlogfile', log)
      if (hevc) a.push('-x265-params', `pass=${passe}:stats=${log ?? 'x265'}.log`)
    } else if (v.cbr) {
      a.push('-b:v', k(v.bitrate), '-minrate', k(v.bitrate), '-maxrate', k(v.bitrate), '-bufsize', k(v.bitrate))
      a.push(hevc ? '-x265-params' : '-x264-params', hevc ? 'strict-cbr=1' : 'nal-hrd=cbr')
    } else a.push('-crf', String(v.crf ?? 18), ...teto)
    if (!hevc) a.push('-profile:v', c.perfil ?? 'high')
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
  const filtros = [a.conforme ? `asetrate=${Math.round(a.taxa / a.conforme)},aresample=${a.taxa}` : null, a.ganho ? `volume=${a.ganho}dB` : null, a.loudness ? `loudnorm=I=${a.loudness}:TP=-1.5:LRA=11` : null].filter(Boolean)
  const comum = [...(filtros.length ? ['-af', filtros.join(',')] : []), '-ar', String(a.taxa), '-ac', String(a.canais)]
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
 * Linhas de comando do ffmpeg para um plano: uma (CRF ou CBR) ou duas (tamanho máximo e bitrate médio, 2 passadas).
 * `o`: { input, output, origem (fps), encoder ('libx264' padrão), hwDecode, log (prefixo do log das passadas),
 *   lut (caminho do .cube da receita de cor) }
 */
export function argsFfmpeg(plano, { input, output, origem = {}, encoder = 'libx264', hwDecode = false, log = null, lut = null }) {
  const base = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']
  if (hwDecode) base.push('-hwaccel', 'videotoolbox')
  // trecho: busca antes da entrada (exata ao recodificar) e a duração na saída
  const t = plano.trecho
  if (t?.inicio) base.push('-ss', String(t.inicio))
  base.push('-i', input)
  if (t?.fim != null) base.push('-t', String(Math.max(0.01, t.fim - (t.inicio ?? 0))))
  if (!plano.video) return [[...base, '-map', '0:a:0', '-vn', '-dn', '-sn', '-map_metadata', '0', ...argsAudio(plano), ...MUX[plano.formato], output]]

  const v = plano.video
  const fps = v.fps ?? origem.fps ?? 30
  const gop = ['-g', String(Math.max(1, Math.round(fps * v.gop))), '-keyint_min', String(Math.max(1, Math.round(fps * Math.min(v.gop, 1))))]
  const cor = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv']
  const mapa = ['-map', '0:v:0', ...(plano.audio ? ['-map', '0:a:0?'] : []), '-dn', '-sn', '-map_chapters', '-1']
  const video = (passe) => ['-vf', filtroVideo(plano, encoder, lut), ...argsCodificador(plano, encoder, passe, log), ...gop, ...cor]
  // tamanho máximo ou bitrate médio escolhido pela pessoa: duas passadas acertam o número (CBR vai numa)
  const duasPassadas = (plano.tamanhoMax || (v.fixo && !v.cbr)) && (encoder === 'libx264' || encoder === 'libx265')
  if (!duasPassadas) return [[...base, ...mapa, ...video(null), ...argsAudio(plano), ...MUX[plano.formato], output]]
  return [
    [...base, '-map', '0:v:0', ...video(1), '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    [...base, ...mapa, ...video(2), ...argsAudio(plano), ...MUX[plano.formato], output],
  ]
}
