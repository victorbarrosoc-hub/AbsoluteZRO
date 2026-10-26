// Fala sintética: "palavras" (tons com envelope), pausas de silêncio com ruído baixo e um respiro (ruído médio entre
// duas palavras). Determinística: o teste sempre dá o mesmo resultado.
import { readFileSync } from 'node:fs'
import { prepararPreset } from '../src/preset.js'

export const PRESET = prepararPreset(JSON.parse(readFileSync(new URL('../presets/fala.v1.json', import.meta.url), 'utf8')))

export function aleatorio(semente) {
  let t = semente >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Roteiro: [tipo, duração]. p = palavra, s = silêncio, r = respiro. */
const ROTEIRO = [
  ['s', 0.3],
  ['p', 0.5],
  ['p', 0.4],
  ['s', 1.2],
  ['p', 0.6],
  ['r', 0.35],
  ['p', 0.5],
  ['s', 0.8],
  ['p', 0.7],
  ['p', 0.3],
  ['s', 2.0],
  ['p', 0.5],
]

export function fala(taxa = 16000) {
  const rnd = aleatorio(7)
  const total = ROTEIRO.reduce((s, [, d]) => s + d, 0)
  const pcm = new Float32Array(Math.round(total * taxa))
  const palavras = []
  const pausas = []
  let respiro = null
  let t = 0
  let k = 0
  for (const [tipo, d] of ROTEIRO) {
    const a = Math.round(t * taxa)
    const b = Math.round((t + d) * taxa)
    for (let i = a; i < b; i++) {
      const x = (i - a) / taxa
      if (tipo === 'p') {
        const env = Math.sin((Math.PI * (i - a)) / (b - a)) ** 0.3
        pcm[i] = 0.3 * env * Math.sin(2 * Math.PI * (180 + 40 * k) * x) + 0.004 * (rnd() - 0.5)
      } else if (tipo === 'r') pcm[i] = 0.05 * (rnd() - 0.5)
      else pcm[i] = 0.002 * (rnd() - 0.5)
    }
    if (tipo === 'p') palavras.push({ texto: `palavra${++k}`, ini: t, fim: t + d })
    else if (tipo === 'r') respiro = { ini: t, fim: t + d }
    else if (d >= 0.45) pausas.push({ ini: t, fim: t + d })
    t += d
  }
  return { pcm, taxa, palavras, pausas, respiro }
}
