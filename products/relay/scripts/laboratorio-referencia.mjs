// Referência do laboratório de aparelhos: as mesmas cenas (src/cenas.js) codificadas pelo x264 de referência (fast,
// duas passadas) em vários bitrates, medidas com o mesmo SSIM (src/ssim.js). Gera app/laboratorio-referencia.js, que a
// página /laboratorio usa para comparar o aparelho no mesmo bitrate. Interno. node scripts/laboratorio-referencia.mjs

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALTURA, CENAS, FPS, LARGURA, QUADROS, quadro } from '../src/cenas.js'
import { ssimY } from '../src/ssim.js'

export const BITRATES = [3000, 4500, 6000, 9000, 12000, 16000, 24000]
const TAM = (LARGURA * ALTURA * 3) / 2
const dir = mkdtempSync(join(tmpdir(), 'relay-labref-'))
const saida = {}
try {
  for (const c of CENAS) {
    const bruto = join(dir, `${c.id}.yuv`)
    const fd = openSync(bruto, 'w')
    const buf = new Uint8Array(TAM)
    for (let i = 0; i < QUADROS; i++) writeSync(fd, quadro(c.id, i, buf))
    closeSync(fd)
    const entrada = ['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${LARGURA}x${ALTURA}`, '-r', String(FPS), '-i', bruto]
    saida[c.id] = []
    for (const kbps of BITRATES) {
      const mp4 = join(dir, `${c.id}-${kbps}.mp4`)
      const comum = ['-v', 'error', '-y', ...entrada, '-c:v', 'libx264', '-preset', 'fast', '-b:v', `${kbps}k`, '-g', String(FPS * 2), '-passlogfile', join(dir, 'p')]
      execFileSync('ffmpeg', [...comum, '-pass', '1', '-f', 'null', '/dev/null'])
      execFileSync('ffmpeg', [...comum, '-pass', '2', mp4])
      const dec = join(dir, `${c.id}-${kbps}.yuv`)
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', dec])
      const d = readFileSync(dec)
      let soma = 0
      let n = 0
      for (let i = 0; i < QUADROS; i += 3) {
        soma += ssimY(quadro(c.id, i, buf).subarray(0, LARGURA * ALTURA), d.subarray(i * TAM, i * TAM + LARGURA * ALTURA), LARGURA, ALTURA)
        n++
      }
      const real = Math.round((readFileSync(mp4).length * 8) / (QUADROS / FPS) / 1000)
      saida[c.id].push({ kbps: real, ssim: Math.round((soma / n) * 1e5) / 1e5 })
      console.log(c.id, kbps, real, (soma / n).toFixed(4))
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
const hoje = new Date().toISOString().slice(0, 10)
writeFileSync(
  new URL('../app/laboratorio-referencia.js', import.meta.url),
  `// Gerado por scripts/laboratorio-referencia.mjs em ${hoje} (x264 fast, duas passadas). Não edite à mão.\nexport const MEDIDO_EM = '${hoje}'\nexport const REFERENCIA = ${JSON.stringify(saida, null, 2)}\n`,
)
