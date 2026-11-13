// Rosto em evento · assinatura: o vetor de 128 números do SFace, normalizado (L2), guardado em int8 (128 bytes) e
// comparado por cosseno. Puro: Node e navegador.
//
// int8: escala pelo maior componente (|v|máx → 127), arredonda; o cosseno renormaliza. Medido na pesquisa
// (docs/estudo/rosto-em-evento.md, C.12): cos(fp32, int8 do mesmo vetor) ≥ 0,99994 e a mesma busca até a 2ª casa.
// O vetor continua sendo dado biométrico (não é "hash irreversível"): só sai do aparelho onde o modo do evento manda.

export const DIMENSOES = 128

export function normalizar(v) {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  const n = Math.sqrt(s) || 1
  const o = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) o[i] = v[i] / n
  return o
}

/** Cosseno entre dois vetores quaisquer (int8 ou float), renormalizando. */
export function cosseno(a, b) {
  let s = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? s / Math.sqrt(na * nb) : 0
}

/** float → Int8Array (o maior componente vira ±127). */
export function quantizar(v) {
  let m = 0
  for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]))
  const q = new Int8Array(v.length)
  if (!m) return q
  for (let i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((v[i] / m) * 127)))
  return q
}

/** Int8Array → Float32Array normalizado. */
export const desquantizar = (q) => normalizar(Float32Array.from(q))

/**
 * Vetor bem-formado: 128 inteiros entre −127 e 127, o maior em módulo exatamente 127 (é como `quantizar` grava) e
 * espalhado (norma ≥ 2 × 127: nenhum componente passa de metade do vetor normalizado). Não prova que veio de
 * câmera (docs/estudo, B.5): só barra lixo.
 */
export function vetorValido(q) {
  if (!(q instanceof Int8Array) || q.length !== DIMENSOES) return false
  let m = 0
  let s = 0
  for (let i = 0; i < q.length; i++) {
    if (q[i] < -127) return false
    m = Math.max(m, Math.abs(q[i]))
    s += q[i] * q[i]
  }
  return m === 127 && s >= 254 * 254
}

// ───────── base64 (sem Buffer: o mesmo no navegador) ─────────

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VALOR = new Map([...ALFABETO].map((c, i) => [c, i]))

export function paraBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63]
    s += i + 1 < b.length ? ALFABETO[(n >> 6) & 63] : '='
    s += i + 2 < b.length ? ALFABETO[n & 63] : '='
  }
  return s
}

/** base64 → Uint8Array, ou null se não for base64 bem-formado. */
export function deBase64(texto) {
  if (typeof texto !== 'string' || texto.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) return null
  const pad = texto.endsWith('==') ? 2 : texto.endsWith('=') ? 1 : 0
  const o = new Uint8Array((texto.length / 4) * 3 - pad)
  let j = 0
  for (let i = 0; i < texto.length; i += 4) {
    const n = (VALOR.get(texto[i]) << 18) | (VALOR.get(texto[i + 1]) << 12) | ((VALOR.get(texto[i + 2]) ?? 0) << 6) | (VALOR.get(texto[i + 3]) ?? 0)
    if (j < o.length) o[j++] = (n >> 16) & 255
    if (j < o.length) o[j++] = (n >> 8) & 255
    if (j < o.length) o[j++] = n & 255
  }
  return o
}

/** Int8Array → base64 (172 caracteres para 128 dimensões). */
export const vetorParaTexto = (q) => paraBase64(new Uint8Array(q.buffer, q.byteOffset, q.byteLength))

/** base64 → Int8Array bem-formado, ou null. */
export function vetorDeTexto(texto) {
  if (typeof texto !== 'string' || texto.length !== 172) return null
  const b = deBase64(texto)
  if (!b || b.length !== DIMENSOES) return null
  const q = new Int8Array(b.buffer, b.byteOffset, b.length)
  return vetorValido(q) ? q : null
}
