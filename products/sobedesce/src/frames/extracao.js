// Frames: tirar do vídeo, em alta, os quadros e os takes escolhidos (ffmpeg), com a logomarca se a pessoa quiser.
import { runTool } from '../media/previa.js'

/** "00-01-23-12" (hh-mm-ss-quadro), para nome de arquivo. */
export function timecode(t, fps = 25) {
  const q = Math.round(t * fps)
  const f = Math.round(fps)
  const fr = q % f
  let s = Math.floor(q / f)
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const dd = (x) => String(x).padStart(2, '0')
  return `${dd(h)}-${dd(m)}-${dd(s)}-${dd(fr)}`
}

/** Caminho da LUT dentro do filtro do ffmpeg (aspas, barras e o ":" do Windows escapados, como no Relay). */
const caminhoNoFiltro = (c) => `'${String(c).replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`

/**
 * A cor (docs/FRAMES.md, "Cor"): YUV → RGB de ponto flutuante com a matriz e a faixa explícitas (sem elas o ffmpeg
 * supõe BT.601 e o HD sai deslocado), depois a LUT montada (src/cor/grade.js), tetraédrica. `cor`: { lut, matriz,
 * faixa } ou null.
 */
export function filtroCor(cor) {
  if (!cor?.lut) return null
  const m = ['bt709', 'bt601', 'bt2020'].includes(cor.matriz) ? cor.matriz : 'bt709'
  const r = cor.faixa === 'pc' ? 'pc' : 'tv'
  return `scale=in_color_matrix=${m}:in_range=${r}:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrpf32le,lut3d=file=${caminhoNoFiltro(cor.lut)}:interp=tetrahedral`
}

/** Filtro da logomarca: largura `tamanho` (fração da imagem), canto, opacidade, margem de 3%. */
function filtroLogo(logo, entrada, saida) {
  const pos = {
    'inf-dir': 'x=W-w-W*0.03:y=H-h-H*0.03',
    'inf-esq': 'x=W*0.03:y=H-h-H*0.03',
    'sup-dir': 'x=W-w-W*0.03:y=H*0.03',
    'sup-esq': 'x=W*0.03:y=H*0.03',
    centro: 'x=(W-w)/2:y=(H-h)/2',
  }[logo.posicao || 'inf-dir']
  const op = Math.max(0.1, Math.min(1, logo.opacidade ?? 0.9)).toFixed(2)
  const lt = Math.max(0.04, Math.min(0.5, logo.tamanho ?? 0.14)).toFixed(3)
  return `[1:v]format=rgba,colorchannelmixer=aa=${op}[lg];[lg][${entrada}]scale2ref=w=main_w*${lt}:h=ow/mdar[lg2][base];[base][lg2]overlay=${pos}:format=auto${saida ? `[${saida}]` : ''}`
}

/**
 * Um frame em alta: o quadro exato em `t`, no tamanho do arquivo. JPEG (qualidade máxima, cor 4:4:4), PNG ou TIFF.
 */
export async function extrairFrame({ ffmpeg, video, t, destino, formato = 'jpg', logo = null, cor = null, largura = null, signal }) {
  const a = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', video]
  if (logo) a.push('-i', logo.path)
  a.push('-frames:v', '1', '-an', '-sn', '-dn')
  const pix = formato === 'jpg' ? 'yuvj444p' : formato === 'png' ? 'rgb24' : 'rgb24'
  // `largura`: só para a prévia da cor (o frame de verdade sai no tamanho do arquivo)
  const pre = [filtroCor(cor), largura ? `scale=${Math.round(largura)}:-2:flags=lanczos` : null].filter(Boolean).join(',')
  if (logo) a.push('-filter_complex', `${pre ? `[0:v]${pre}[g];` : ''}${filtroLogo(logo, pre ? 'g' : '0:v', 'v')};[v]format=${pix}[o]`, '-map', '[o]')
  else a.push('-map', '0:v:0', '-vf', `${pre ? `${pre},` : ''}format=${pix}`)
  if (formato === 'jpg') a.push('-c:v', 'mjpeg', '-q:v', '1', '-qmin', '1')
  else if (formato === 'png') a.push('-c:v', 'png')
  else a.push('-c:v', 'tiff', '-compression_algo', 'lzw')
  a.push(destino)
  const r = await runTool(ffmpeg, a, { timeoutMs: 120_000, signal, lowPriority: true })
  if (r.aborted) throw Object.assign(new Error('parado'), { name: 'AbortError' })
  if (r.code !== 0) throw new Error(`não consegui tirar o frame de ${t.toFixed(2)} s: ${(r.stderr || '').trim().split('\n').pop()}`)
}

/** Recorte para o formato do take (centro, ou o lado escolhido em `foco`: 0 = esquerda, 0,5 = centro, 1 = direita). */
function filtroRecorte(formato, foco = 0.5) {
  const proporcao = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1 }[formato]
  if (!proporcao) return null
  const f = Math.max(0, Math.min(1, foco)).toFixed(3)
  // Corta a largura (vídeo mais largo que o formato) ou a altura (mais alto), sempre par.
  return `crop=w='trunc(min(iw,ih*${proporcao})/2)*2':h='trunc(min(ih,iw/${proporcao})/2)*2':x='(iw-ow)*${f}':y='(ih-oh)/2'`
}

/** Parâmetros de alta qualidade para cada codificador de H.264 (os mesmos que a prévia detecta, sem o teto dela). */
export function h264Alta(encoder, altura) {
  const mbps = altura > 1600 ? 50 : altura > 1100 ? 30 : 20
  switch (encoder) {
    case 'h264_videotoolbox':
      return ['-c:v', encoder, '-b:v', `${mbps}M`, '-profile:v', 'high', '-allow_sw', '1', '-realtime', '0']
    case 'h264_nvenc':
      return ['-c:v', encoder, '-preset', 'p6', '-rc', 'vbr', '-cq', '18', '-b:v', `${mbps}M`, '-maxrate', `${mbps * 1.5}M`, '-profile:v', 'high']
    case 'h264_qsv':
      return ['-c:v', encoder, '-preset', 'slow', '-global_quality', '20', '-profile:v', 'high']
    case 'h264_amf':
      return ['-c:v', encoder, '-quality', 'quality', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '20', '-profile:v', 'high']
    case 'h264_mf':
      return ['-c:v', encoder, '-hw_encoding', '1', '-b:v', `${mbps}M`]
    default:
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-profile:v', 'high']
  }
}

/**
 * Um take: `dur` segundos a partir de `ini`, no formato pedido (original, 9:16, 4:5, 1:1), com ou sem som, fade curto
 * na entrada e na saída, logomarca opcional. `codec`: 'h264' (redes) ou 'prores' (edição, ProRes 422 HQ).
 */
export async function extrairTake({ ffmpeg, encoder = 'libx264', video, ini, dur, destino, formato = 'original', foco = 0.5, audio = true, fade = true, codec = 'h264', logo = null, cor = null, altura = 1080, signal, onProgress }) {
  const a = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-ss', ini.toFixed(3), '-t', dur.toFixed(3), '-i', video]
  if (logo) a.push('-i', logo.path)
  const vf = []
  const fc = filtroCor(cor)
  if (fc) vf.push(fc)
  const corte = filtroRecorte(formato, foco)
  if (corte) vf.push(corte)
  if (fade) vf.push(`fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, dur - 0.25).toFixed(3)}:d=0.25`)
  const pix = codec === 'prores' ? 'yuv422p10le' : encoder === 'h264_qsv' || encoder === 'h264_mf' ? 'nv12' : 'yuv420p'
  // com cor, a volta para YUV com a matriz BT.709 explícita (sem ela o ffmpeg usa BT.601 e o verde escurece)
  if (fc) vf.push('scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int')
  vf.push(`format=${pix}`)
  if (logo) {
    a.push('-filter_complex', `[0:v]${vf.slice(0, -1).join(',') || 'null'}[b];${filtroLogo(logo, 'b', 'c')};[c]format=${pix}[v]`, '-map', '[v]')
  } else a.push('-map', '0:v:0', '-vf', vf.join(','))
  if (audio) {
    a.push('-map', '0:a:0?')
    if (fade) a.push('-af', `afade=t=in:st=0:d=0.25,afade=t=out:st=${Math.max(0, dur - 0.25).toFixed(3)}:d=0.25`)
  } else a.push('-an')
  // o take graduado já é Rec.709: marcado assim, todo player mostra a mesma cor
  if (fc) a.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv')
  if (codec === 'prores') {
    a.push('-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0')
    if (audio) a.push('-c:a', 'pcm_s16le')
    a.push('-f', 'mov', destino)
  } else {
    a.push(...h264Alta(encoder, altura))
    if (audio) a.push('-c:a', 'aac', '-b:a', '256k')
    a.push('-movflags', '+faststart', '-f', 'mp4', destino)
  }
  const r = await runTool(ffmpeg, a, {
    timeoutMs: Math.max(120_000, dur * 60_000),
    stallMs: 90_000,
    signal,
    lowPriority: true,
    onStdout: (txt) => {
      const m = /out_time_us=(\d+)/.exec(txt)
      if (m) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / dur))
    },
  })
  if (r.aborted) throw Object.assign(new Error('parado'), { name: 'AbortError' })
  if (r.code !== 0) throw new Error(`não consegui gerar o take de ${ini.toFixed(1)} s: ${(r.stderr || '').trim().split('\n').pop()}`)
}

/** Miniatura para a tela (480 px): de um frame já tirado ou de um take (quadro do meio, `t`). */
export async function miniatura({ ffmpeg, entrada, destino, t = null, largura = 480, signal }) {
  const a = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error']
  if (t != null) a.push('-ss', t.toFixed(3))
  a.push('-i', entrada, '-frames:v', '1', '-an', '-vf', `scale=${largura}:-2:flags=lanczos,format=yuvj420p`, '-c:v', 'mjpeg', '-q:v', '3', destino)
  const r = await runTool(ffmpeg, a, { timeoutMs: 60_000, signal, lowPriority: true })
  if (r.aborted) throw Object.assign(new Error('parado'), { name: 'AbortError' })
  if (r.code !== 0) throw new Error(`não consegui fazer a miniatura: ${(r.stderr || '').trim().split('\n').pop()}`)
}
