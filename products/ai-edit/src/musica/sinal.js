// O que se mede do som para o clipe musical, em janelas curtas (STFT): o fluxo espectral (quanto o som "ataca" em cada
// janela: batida, nota nova, sílaba), a energia (dB) e o croma (a força de cada uma das 12 notas, sem oitava, para achar
// trechos que se repetem como o refrão). Uma passada só pelo áudio mono (o mesmo que o app já extrai para a
// transcrição, 16 kHz). Puro: roda no worker e nos testes.

import { fft } from './fft.js'

export const JANELA = 1024
export const SALTO = 256

const FREQ_CROMA = [55, 2000]

/** Grave (bumbo, baixo): até esta frequência, para achar o primeiro tempo do compasso. */
const FREQ_GRAVE = 160

/**
 * Medidas do som: { hz (janelas por segundo), t0 (s do instante que a janela 0 representa), n, fluxo, grave (o fluxo
 * só do grave), energia (dB), croma (n × 12, cada janela com norma 1) }. A janela i representa o instante t0 + i / hz:
 * o ataque aparece no fluxo quando entra na janela, então o instante é o fim dela (menos meio salto), não o começo.
 * pcm: Float32Array mono; taxa em Hz.
 */
export function medir(pcm, taxa, { janela = JANELA, salto = SALTO } = {}) {
  const n = Math.max(0, Math.floor((pcm.length - janela) / salto) + 1)
  const hz = taxa / salto
  const fluxo = new Float32Array(n)
  const grave = new Float32Array(n)
  const energia = new Float32Array(n)
  const croma = new Float32Array(n * 12)
  const meio = janela / 2
  const hann = new Float64Array(janela)
  for (let i = 0; i < janela; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / janela)
  // cada faixa da FFT → nota (0 = Lá), só no meio do teclado onde o croma é confiável
  const nota = new Int8Array(meio).fill(-1)
  const kGrave = Math.max(1, Math.floor((FREQ_GRAVE * janela) / taxa))
  for (let k = 1; k < meio; k++) {
    const f = (k * taxa) / janela
    if (f >= FREQ_CROMA[0] && f <= FREQ_CROMA[1]) nota[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12) % 12
  }
  const re = new Float64Array(janela)
  const im = new Float64Array(janela)
  let ant = new Float64Array(meio)
  let atual = new Float64Array(meio)
  for (let t = 0; t < n; t++) {
    const o = t * salto
    let e = 0
    for (let i = 0; i < janela; i++) {
      const x = pcm[o + i]
      e += x * x
      re[i] = x * hann[i]
      im[i] = 0
    }
    energia[t] = 10 * Math.log10(e / janela + 1e-10)
    fft(re, im)
    let fl = 0
    let fg = 0
    const c = t * 12
    for (let k = 1; k < meio; k++) {
      const mag = Math.hypot(re[k], im[k])
      // compressão logarítmica: o ataque de um som baixo conta, sem o som alto mandar sozinho
      const l = Math.log1p(100 * mag)
      atual[k] = l
      const d = l - ant[k]
      if (d > 0) {
        fl += d
        if (k <= kGrave) fg += d
      }
      if (nota[k] >= 0) croma[c + nota[k]] += mag
    }
    fluxo[t] = t === 0 ? 0 : fl
    grave[t] = t === 0 ? 0 : fg
    let s = 0
    for (let j = 0; j < 12; j++) s += croma[c + j] * croma[c + j]
    s = Math.sqrt(s)
    if (s > 1e-9) for (let j = 0; j < 12; j++) croma[c + j] /= s
    const tr = ant
    ant = atual
    atual = tr
  }
  return { hz, t0: (janela - salto / 2) / taxa, n, fluxo, grave, energia, croma }
}

/**
 * Força de ataque (onset): o fluxo menos a média local (meio segundo) e só a parte positiva. É o que se correlaciona na
 * sincronia e o que a batida segue.
 */
export function ataques(fluxo, hz, janelaS = 0.5) {
  const n = fluxo.length
  const w = Math.max(1, Math.round(janelaS * hz))
  const out = new Float32Array(n)
  let soma = 0
  const ini = (i) => Math.max(0, i - w)
  const fim = (i) => Math.min(n - 1, i + w)
  // média móvel centrada por soma acumulada
  const acc = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) acc[i + 1] = acc[i] + fluxo[i]
  for (let i = 0; i < n; i++) {
    const a = ini(i)
    const b = fim(i)
    soma = (acc[b + 1] - acc[a]) / (b - a + 1)
    const v = fluxo[i] - soma
    out[i] = v > 0 ? v : 0
  }
  return out
}

/**
 * Envelope fino de ataques, um valor por milissegundo (taxa / 1000 amostras por ponto): a energia em dB de cada
 * milissegundo, derivada e só a subida. Para acertar a sincronia abaixo da janela da STFT (16 ms) sem outra FFT.
 * ini/fim em amostras (o trecho que interessa); devolve { hz: 1000, desde (amostra inicial), env }.
 */
export function envelopeFino(pcm, taxa, ini = 0, fim = pcm.length) {
  const passo = Math.max(1, Math.round(taxa / 1000))
  const a = Math.max(0, Math.floor(ini))
  const b = Math.min(pcm.length, Math.floor(fim))
  const n = Math.max(0, Math.floor((b - a) / passo))
  const env = new Float32Array(n)
  let ant = null
  for (let t = 0; t < n; t++) {
    let e = 0
    const o = a + t * passo
    for (let i = 0; i < passo; i++) e += pcm[o + i] * pcm[o + i]
    const db = 10 * Math.log10(e / passo + 1e-10)
    env[t] = ant === null ? 0 : Math.max(0, db - ant)
    ant = db
  }
  return { hz: taxa / passo, desde: a, env }
}
