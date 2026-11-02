// Batida da música: o andamento (BPM) pela autocorrelação dos ataques (suavizada, com o pente de 2 e 4 batidas e uma
// preferência suave por volta de 120 BPM, como as bibliotecas de análise musical fazem), as batidas pelo caminho que
// mais acerta ataques sem fugir do andamento (programação dinâmica de Ellis, 2007) e o compasso de 4 tempos pelo
// primeiro tempo: onde entra o grave (bumbo, baixo) e o acorde muda. É medida do som, não IA: a tela diz "batida
// medida" e a pessoa ajusta se quiser.

import { ataques } from './sinal.js'

const BPM_MIN = 60
const BPM_MAX = 200

function suavizar(x, sigma) {
  const n = x.length
  const r = Math.ceil(3 * sigma)
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-0.5 * ((i - r) / sigma) ** 2))
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = -r; j <= r; j++) {
      const q = i + j
      if (q >= 0 && q < n) s += x[q] * k[j + r]
    }
    out[i] = s
  }
  return out
}

/** Autocorrelação (média por par) do sinal até o atraso max, interpolável em atraso fracionário. */
function autocorrelacao(x, max) {
  const n = x.length
  const ac = new Float64Array(max + 2)
  for (let l = 0; l <= max + 1 && l < n; l++) {
    let s = 0
    for (let i = 0; i + l < n; i++) s += x[i] * x[i + l]
    ac[l] = s / (n - l)
  }
  return (l) => {
    const a = Math.floor(l)
    if (a + 1 >= ac.length) return 0
    const f = l - a
    return ac[a] * (1 - f) + ac[a + 1] * f
  }
}

/**
 * Andamento (BPM) dos ataques a hz janelas por segundo. A batida certa costuma ser a que a autocorrelação marca em 1,
 * 2 e 4 batidas ao mesmo tempo (o bumbo e a caixa se alternam: só 2 batidas sozinhas dá metade do andamento).
 * Sem ataque nenhum: o centro (120).
 */
export function andamento(forca, hz, { centro = 120, oitavas = 1 } = {}) {
  const n = forca.length
  const lMin = (60 * hz) / BPM_MAX
  const lMax = (60 * hz) / BPM_MIN
  if (n < 4 * lMax) return centro
  const ac = autocorrelacao(suavizar(forca, 1.5), Math.ceil(4 * lMax) + 2)
  let melhor = -Infinity
  let lMelhor = 0
  for (let l = lMin; l <= lMax; l += 0.25) {
    const bpm = (60 * hz) / l
    const peso = Math.exp(-0.5 * (Math.log2(bpm / centro) / oitavas) ** 2)
    const v = (ac(l) + 0.5 * ac(2 * l) + 0.25 * ac(4 * l)) * peso
    if (v > melhor) {
      melhor = v
      lMelhor = l
    }
  }
  return melhor > 0 ? (60 * hz) / lMelhor : centro
}

/**
 * As batidas (índices das janelas) pelo andamento: cada batida soma o ataque dela e perde pontos quanto mais o
 * intervalo foge do período (aperto = quanto foge pesa).
 */
export function seguirBatidas(forca, hz, bpm, { aperto = 100, t0 = 0 } = {}) {
  const n = forca.length
  if (!n) return []
  const periodo = (60 * hz) / bpm
  const local = suavizar(forca, Math.max(1, periodo / 32))
  let max = 0
  for (let i = 0; i < n; i++) if (local[i] > max) max = local[i]
  if (max <= 0) return []
  for (let i = 0; i < n; i++) local[i] /= max
  const placar = new Float64Array(n)
  const veio = new Int32Array(n).fill(-1)
  const lo = Math.max(1, Math.round(periodo / 2))
  const hi = Math.round(periodo * 2)
  for (let t = 0; t < n; t++) {
    let melhor = -Infinity
    let de = -1
    for (let tau = Math.max(0, t - hi); tau <= t - lo; tau++) {
      const v = placar[tau] - aperto * Math.log((t - tau) / periodo) ** 2
      if (v > melhor) {
        melhor = v
        de = tau
      }
    }
    placar[t] = local[t] + (de >= 0 && melhor > 0 ? melhor : 0)
    veio[t] = de >= 0 && melhor > 0 ? de : -1
  }
  // termina na melhor batida do último período
  let fim = n - 1
  for (let t = Math.max(0, n - Math.round(periodo)); t < n; t++) if (placar[t] > placar[fim]) fim = t
  const out = []
  for (let t = fim; t >= 0; t = veio[t]) {
    out.push(t)
    if (veio[t] < 0) break
  }
  out.reverse()
  // completa o começo e o fim no período (a introdução sem ataque também tem batida); a janela i é o instante
  // t0 + i / hz, então a primeira pode ter índice negativo e ainda cair depois do zero
  while (out.length && out[0] - periodo >= -t0 * hz) out.unshift(Math.round(out[0] - periodo))
  while (out.length && out.at(-1) + periodo < n) out.push(Math.round(out.at(-1) + periodo))
  return out
}

/** Croma médio de um trecho de janelas [a, b), normalizado. */
export function cromaMedio(croma, a, b) {
  const out = new Float64Array(12)
  for (let t = a; t < b; t++) for (let j = 0; j < 12; j++) out[j] += croma[t * 12 + j]
  let s = 0
  for (let j = 0; j < 12; j++) s += out[j] * out[j]
  s = Math.sqrt(s) || 1
  for (let j = 0; j < 12; j++) out[j] /= s
  return out
}

/**
 * O ataque que a batida segue: o espectro inteiro e o grave, cada um na sua escala (pelo desvio), somados. Só o
 * espectro inteiro deixa a caixa (2 e 4) mandar e o andamento sai pela metade; o grave sozinho perde a caixa.
 */
export function forcaDosAtaques(todos, grave) {
  const dp = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / (x.length || 1)) || 1
  const a = dp(todos)
  const g = dp(grave)
  return todos.map((v, i) => v / a + grave[i] / g)
}

/**
 * A batida da música inteira a partir das medidas (sinal.js › medir): { bpm, batidas (s), compassos (s, a primeira
 * batida de cada compasso de 4), fase (qual das 4 batidas abre o compasso) }. Os instantes já contam o t0 das
 * medidas: a batida cai no ataque.
 */
export function batidaDa(medidas, { centro = 120, tempos = 4 } = {}) {
  const { hz, fluxo, grave, croma, n } = medidas
  const t0 = medidas.t0 || 0
  const grv = ataques(grave || fluxo, hz)
  const forca = forcaDosAtaques(ataques(fluxo, hz), grv)
  const bpm = andamento(forca, hz, { centro })
  const idx = seguirBatidas(forca, hz, bpm, { t0 })
  const periodo = (60 * hz) / bpm
  // o primeiro tempo: onde o acorde muda e o grave (bumbo, baixo) entra. Cada pista é comparada entre as 4 fases na
  // escala dela (z), e a harmonia pesa mais: a caixa do 2 e do 4 ataca mais que o bumbo, e o grave sozinho também
  // engana (um baixo que entra no 3)
  const meia = Math.max(1, Math.round(periodo))
  const pistas = Array.from({ length: tempos }, (_, f) => {
    let g = 0
    let h = 0
    let k = 0
    for (let i = f; i < idx.length; i += tempos) {
      const t = idx[i]
      if (t < 0 || t >= n) continue
      const antes = cromaMedio(croma, Math.max(0, t - 2 * meia), t)
      const depois = cromaMedio(croma, t, Math.min(n, t + 2 * meia))
      let dot = 0
      for (let j = 0; j < 12; j++) dot += antes[j] * depois[j]
      g += grv[t]
      h += 1 - dot
      k++
    }
    return k ? { g: g / k, h: h / k } : { g: 0, h: 0 }
  })
  const z = (xs) => {
    const m = xs.reduce((s, v) => s + v, 0) / xs.length
    const d = Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length) || 1
    return xs.map((v) => (v - m) / d)
  }
  const zg = z(pistas.map((x) => x.g))
  const zh = z(pistas.map((x) => x.h))
  let fase = 0
  for (let f = 1; f < tempos; f++) if (zg[f] + 1.5 * zh[f] > zg[fase] + 1.5 * zh[fase]) fase = f
  const s3 = (i) => Math.max(0, Math.round((t0 + i / hz) * 1000) / 1000)
  const batidas = idx.map(s3)
  return { bpm: Math.round(bpm * 10) / 10, batidas, compassos: batidas.filter((_, i) => i >= fase && (i - fase) % tempos === 0), fase }
}

const r3 = (x) => Math.round(x * 1000) / 1000

/**
 * A pessoa corrige o andamento (a batida medida saiu pela metade ou em dobro): ×2 põe uma batida no meio de cada par e
 * um compasso no meio de cada par de compassos; ÷2 fica com uma batida a cada duas (as do compasso) e um compasso a
 * cada dois. As partes não mudam (são instantes da música). analise: { bpm, batidas, compassos }.
 */
export function corrigirAndamento(analise, fator) {
  const { batidas, compassos } = analise
  if (fator === 2) {
    const meio = (xs) => xs.flatMap((t, i) => (i + 1 < xs.length ? [t, r3((t + xs[i + 1]) / 2)] : [t]))
    return { ...analise, bpm: Math.round(analise.bpm * 20) / 10, batidas: meio(batidas), compassos: meio(compassos) }
  }
  if (fator === 0.5) {
    const primeira = batidas.findIndex((t) => compassos.some((c) => Math.abs(c - t) < 1e-3))
    const p = primeira < 0 ? 0 : primeira % 2
    return { ...analise, bpm: Math.round(analise.bpm * 5) / 10, batidas: batidas.filter((_, i) => i % 2 === p), compassos: compassos.filter((_, i) => i % 2 === 0) }
  }
  return analise
}
