// Nota de cada momento de um plano, medida na imagem (não é IA): nitidez (a variância do laplaciano na luminância:
// imagem em foco tem borda forte), luz (exposição perto do meio, sem estourar nem afundar) e firmeza (pouca diferença
// entre um quadro e o próximo: câmera tremendo ou borrada perde ponto). Cada modo pesa as três do seu jeito (o
// aftermovie quer movimento, o casamento quer firmeza). Medido no worker em miniaturas (96 × 54) a 2 quadros por
// segundo; guardado no projeto em base64 de bytes (0–255).

export const PADRAO_NOTA = Object.freeze({ pesos: { nitidez: 0.45, luz: 0.3, firmeza: 0.25 }, luz_ideal: [0.3, 0.7], estouro_max: 0.08, movimento_max: 0.12, movimento_bom: null })

/**
 * Medidas de um quadro (rgba de ImageData, w × h): { nitidez, luz (0–1), estouro (fração de pixel queimado ou
 * preto), movimento (diferença média para o quadro anterior, 0–1; 0 sem anterior), cinza (para o próximo) }.
 */
export function medirQuadro(rgba, w, h, anterior = null) {
  const n = w * h
  const cinza = new Float32Array(n)
  let soma = 0
  let estouro = 0
  for (let i = 0; i < n; i++) {
    const y = (0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]) / 255
    cinza[i] = y
    soma += y
    if (y > 0.98 || y < 0.02) estouro++
  }
  let lm = 0
  let l2 = 0
  let k = 0
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = 255 * (4 * cinza[i] - cinza[i - 1] - cinza[i + 1] - cinza[i - w] - cinza[i + w])
      lm += l
      l2 += l * l
      k++
    }
  lm /= k || 1
  let mov = 0
  if (anterior && anterior.length === n) {
    for (let i = 0; i < n; i++) mov += Math.abs(cinza[i] - anterior[i])
    mov /= n
  }
  return { nitidez: Math.max(0, l2 / (k || 1) - lm * lm), luz: soma / n, estouro: estouro / n, movimento: mov, cinza }
}

/** A nitidez de referência de um conjunto de medidas (o percentil 90, em log): a "nitidez boa" daquele material. */
export function referenciaDeNitidez(listas) {
  const todas = listas.flat().map((m) => Math.log10(1 + m.nitidez))
  if (!todas.length) return 1
  todas.sort((a, b) => a - b)
  return Math.max(0.5, todas[Math.floor(todas.length * 0.9)])
}

const entre = (v) => Math.max(0, Math.min(1, v))

/** Nota 0–1 de um momento. ref = referenciaDeNitidez; o = preset.nota do modo. */
export function notaDe(m, ref, o = PADRAO_NOTA) {
  const p = o.pesos
  const nit = entre(Math.log10(1 + m.nitidez) / ref)
  const [a, b] = o.luz_ideal
  const luz = m.luz < a ? entre(m.luz / a) : m.luz > b ? entre((1 - m.luz) / (1 - b)) : 1
  // firmeza: sem movimento é 1; o aftermovie pede movimento (movimento_bom): quanto mais perto dele, melhor
  const firmeza = o.movimento_bom != null ? entre(1 - Math.abs(m.movimento - o.movimento_bom) / o.movimento_bom) : entre(1 - m.movimento / o.movimento_max)
  const queimado = entre((m.estouro - o.estouro_max) / (1 - o.estouro_max))
  const total = p.nitidez + p.luz + p.firmeza || 1
  return entre(((p.nitidez * nit + p.luz * luz + p.firmeza * firmeza) / total) * (1 - queimado))
}

/** Notas de uma mídia em bytes (0–255), na ordem das medidas. */
export const notasEmBytes = (medidas, ref, o) => Uint8Array.from(medidas, (m) => Math.round(255 * notaDe(m, ref, o)))

export function bytesParaBase64(b) {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
export function base64ParaBytes(t) {
  const s = atob(t || '')
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return b
}

const cache = new Map()
/** As notas guardadas ({ hz, b64 }) prontas para conta: Float32Array 0–1 (com cache, porque a montagem lê muito). */
export function notasDe(guardadas) {
  if (!guardadas?.b64) return null
  let f = cache.get(guardadas.b64)
  if (!f) {
    f = Float32Array.from(base64ParaBytes(guardadas.b64), (v) => v / 255)
    if (cache.size > 64) cache.clear()
    cache.set(guardadas.b64, f)
  }
  return f
}

/** Nota média de [a, b) s da mídia (notas a hz por segundo). Sem medida: 0,5 (neutra). */
export function notaNoTrecho(notas, hz, a, b) {
  if (!notas?.length) return 0.5
  const i = Math.max(0, Math.floor(a * hz))
  const j = Math.min(notas.length, Math.max(i + 1, Math.ceil(b * hz)))
  if (i >= notas.length) return 0.5
  let s = 0
  for (let k = i; k < j; k++) s += notas[k]
  return s / (j - i)
}
