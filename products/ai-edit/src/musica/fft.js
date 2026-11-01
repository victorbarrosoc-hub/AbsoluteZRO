// FFT de raiz 2 (Cooley–Tukey, no lugar), com as tabelas de seno e cosseno e a ordem dos bits feitas uma vez por
// tamanho: a análise da música roda milhares de janelas do mesmo tamanho. Puro, sem DOM: roda no worker e nos testes.

const cache = new Map()

/** Menor potência de 2 que cabe n. */
export function potencia2(n) {
  let p = 1
  while (p < n) p <<= 1
  return p
}

function tabelas(n) {
  let t = cache.get(n)
  if (t) return t
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('A FFT pede tamanho potência de 2.')
  const cos = new Float64Array(n / 2)
  const sen = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n)
    sen[k] = Math.sin((2 * Math.PI * k) / n)
  }
  const inv = new Uint32Array(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    inv[i] = j
  }
  t = { cos, sen, inv }
  cache.set(n, t)
  return t
}

/** Transforma re/im (Float64Array do mesmo tamanho, potência de 2) no lugar. inversa = true divide por n. */
export function fft(re, im, inversa = false) {
  const n = re.length
  const { cos, sen, inv } = tabelas(n)
  for (let i = 1; i < n; i++) {
    const j = inv[i]
    if (i < j) {
      let t = re[i]
      re[i] = re[j]
      re[j] = t
      t = im[i]
      im[i] = im[j]
      im[j] = t
    }
  }
  const s = inversa ? 1 : -1
  for (let tam = 2; tam <= n; tam <<= 1) {
    const meio = tam >> 1
    const passo = n / tam
    for (let i = 0; i < n; i += tam)
      for (let k = 0; k < meio; k++) {
        const wr = cos[k * passo]
        const wi = s * sen[k * passo]
        const a = i + k
        const b = a + meio
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
      }
  }
  if (inversa)
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
}

/**
 * Correlação cruzada de a com b pela FFT: r[k + (b.length - 1)] = Σ a[i + k] · b[i], para k de −(b.length − 1) até
 * a.length − 1 (k = quanto b começa depois de a). Float64Array de a.length + b.length − 1.
 */
export function correlacao(a, b) {
  const total = a.length + b.length - 1
  const n = potencia2(total)
  const ar = new Float64Array(n)
  const ai = new Float64Array(n)
  const br = new Float64Array(n)
  const bi = new Float64Array(n)
  ar.set(a)
  br.set(b)
  fft(ar, ai)
  fft(br, bi)
  // A · conj(B)
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i]
    const im = ai[i] * br[i] - ar[i] * bi[i]
    ar[i] = r
    ai[i] = im
  }
  fft(ar, ai, true)
  // ar[k] = Σ a[i + k] b[i] com k circular: os negativos ficam no fim
  const out = new Float64Array(total)
  for (let k = -(b.length - 1); k < a.length; k++) out[k + b.length - 1] = ar[(k + n) % n]
  return out
}
