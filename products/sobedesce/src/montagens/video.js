// Montagem em vídeo (Estúdio › Montagens): os takes tocam nos quadros e o resto (fotos, fundo, espaço e cantos) vem
// pronto da tela numa imagem PNG com buracos transparentes onde ficam os vídeos. O ffmpeg põe cada trecho no lugar
// (recorte e escala calculados na tela, iguais ao desenho) e cobre tudo com essa imagem: os cantos arredondados e o
// espaço entre as fotos saem idênticos à prévia. Só H.264 em MP4, o que as redes aceitam.
import { runTool } from '../media/previa.js'
import { h264Alta } from '../frames/extracao.js'

export const FPS = 30
export const DURACOES = [3, 5, 8, 15]

const par = (n) => Math.max(2, Math.round(n / 2) * 2)
const f3 = (n) => Number(n).toFixed(3)

/**
 * Os argumentos do ffmpeg para uma montagem.
 * @param {{ w: number, h: number, fundo: string, duracao: number, base: string, quadros: { p: string, inicio: number,
 *   lento?: boolean, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number }[],
 *   som?: number|null, encoder?: string, destino: string }} o
 */
export function argsMontagem({ w, h, fundo, duracao, base, quadros, som = null, encoder = 'libx264', destino }) {
  const W = par(w)
  const H = par(h)
  const a = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']
  quadros.forEach((q) => {
    const fonte = q.lento ? duracao / 2 : duracao
    // -stream_loop: um vídeo mais curto que a montagem volta do começo em vez de congelar.
    a.push('-ss', f3(q.inicio), '-stream_loop', '-1', '-t', f3(fonte + 0.5), '-i', q.p)
  })
  a.push('-loop', '1', '-t', f3(duracao), '-i', base)
  const cor = /^#[0-9a-f]{6}$/i.test(fundo || '') ? `0x${fundo.slice(1)}` : 'black'
  const f = [`color=c=${cor}:s=${W}x${H}:r=${FPS}:d=${f3(duracao)}[f0]`]
  quadros.forEach((q, i) => {
    const vel = q.lento ? 'setpts=2*(PTS-STARTPTS)' : 'setpts=PTS-STARTPTS'
    const cw = par(q.w)
    const ch = par(q.h)
    f.push(
      `[${i}:v]${vel},fps=${FPS},crop=${Math.max(2, Math.round(q.sw))}:${Math.max(2, Math.round(q.sh))}:${Math.max(0, Math.round(q.sx))}:${Math.max(0, Math.round(q.sy))},scale=${cw}:${ch}:flags=lanczos,setsar=1[v${i}]`,
    )
    f.push(`[f${i}][v${i}]overlay=${Math.round(q.x)}:${Math.round(q.y)}:eof_action=repeat:shortest=0[f${i + 1}]`)
  })
  const n = quadros.length
  const pix = encoder === 'h264_qsv' || encoder === 'h264_mf' ? 'nv12' : 'yuv420p'
  f.push(`[${n}:v]format=rgba,scale=${W}:${H}[base]`)
  f.push(`[f${n}][base]overlay=0:0:format=auto,format=${pix}[v]`)
  let audio = null
  if (som != null && quadros[som]) {
    audio = `[${som}:a]${quadros[som].lento ? 'atempo=0.5,' : ''}asetpts=PTS-STARTPTS,aresample=48000[a]`
    f.push(audio)
  }
  a.push('-filter_complex', f.join(';'), '-map', '[v]')
  if (audio) a.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k')
  else a.push('-an')
  a.push('-t', f3(duracao), '-r', String(FPS), ...h264Alta(encoder, H), '-movflags', '+faststart', '-f', 'mp4', destino)
  return a
}

/** Gera a montagem em vídeo. `onProgress` recebe de 0 a 1. */
export async function gerarMontagemVideo({ ffmpeg, signal, onProgress, ...o }) {
  const r = await runTool(ffmpeg, argsMontagem(o), {
    timeoutMs: Math.max(180_000, o.duracao * 60_000),
    stallMs: 120_000,
    signal,
    lowPriority: true,
    onStdout: (txt) => {
      const m = /out_time_us=(\d+)/.exec(txt)
      if (m) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / o.duracao))
    },
  })
  if (r.aborted) throw Object.assign(new Error('parado'), { name: 'AbortError' })
  if (r.code !== 0) throw new Error(`não consegui gerar o vídeo da montagem: ${(r.stderr || '').trim().split('\n').pop()}`)
}
