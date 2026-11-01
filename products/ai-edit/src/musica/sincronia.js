// Sincronia pelo som (como o "sincronizar por áudio" dos editores): cada tomada que tem a música tocando no áudio dela
// cai num ponto exato da música. Primeiro a correlação dos ataques das duas (FFT, janela de 16 ms), normalizada pela
// sobreposição de cada deslocamento; depois o acerto fino, ao milissegundo, no envelope de energia. A tomada sem a
// música no áudio (o B-roll) não acha pico que se destaque e fica como B-roll. Puro: roda no worker e nos testes.

import { correlacao } from './fft.js'
import { ataques, envelopeFino } from './sinal.js'

function zscore(x) {
  const n = x.length
  let m = 0
  for (let i = 0; i < n; i++) m += x[i]
  m /= n || 1
  let v = 0
  for (let i = 0; i < n; i++) v += (x[i] - m) ** 2
  const d = Math.sqrt(v / (n || 1)) || 1
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = (x[i] - m) / d
  return out
}

function acumulado2(x) {
  const q = new Float64Array(x.length + 1)
  for (let i = 0; i < x.length; i++) q[i + 1] = q[i] + x[i] * x[i]
  return q
}

/** Pico da parábola pelos três pontos em volta (y0 é o maior): quanto o pico de verdade sai do ponto do meio. */
const parabola = (ym, y0, yp) => {
  const d = ym - 2 * y0 + yp
  return d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (ym - yp)) / d)) : 0
}

/**
 * Onde a tomada cai na música: { inicio (s da música no instante 0 da tomada; negativo = a tomada começou antes da
 * música), ncc (a nota do pico, 0 a 1: ataques e harmonia, vezes a raiz da fração sobreposta), destaque (quantos desvios o pico fica acima dos outros
 * deslocamentos), ambigua (outro ponto, a mais de 1 s, quase tão bom: um refrão igual ao outro), sobreposicao (s) }.
 * O deslocamento escolhido é o de maior correlação normalizada (dos ataques e da harmonia, o croma, juntos) vezes a
 * raiz da fração sobreposta: música com bateria repetida casa os ataques em qualquer compasso, e só o ponto certo
 * casa os acordes e a tomada toda. Os ataques dão a precisão; o croma tira a dúvida entre partes.
 * musica e tomada: { hz, fluxo, croma? } de medir(), na mesma taxa.
 * null sem dados.
 */
export function alinhar(musica, tomada, { sobreposicaoMinS = 4 } = {}) {
  const hz = musica.hz
  if (Math.abs(tomada.hz - hz) > 1e-6) throw new Error('A música e a tomada precisam da mesma taxa de análise.')
  const a = zscore(ataques(musica.fluxo, hz))
  const b = zscore(ataques(tomada.fluxo, hz))
  const na = a.length
  const nb = b.length
  if (na < 8 || nb < 8) return null
  const r = correlacao(a, b)
  const qa = acumulado2(a)
  const qb = acumulado2(b)
  const h = harmonia(musica, tomada)
  const menor = Math.min(na, nb)
  const minSob = Math.min(menor, Math.round(sobreposicaoMinS * hz))
  const nota = new Float64Array(r.length).fill(NaN)
  let melhor = -Infinity
  let kMelhor = 0
  let soma = 0
  let soma2 = 0
  let cont = 0
  for (let k = -(nb - 1); k < na; k++) {
    const i0 = Math.max(0, k)
    const i1 = Math.min(na, k + nb)
    if (i1 - i0 < minSob) continue
    const ea = qa[i1] - qa[i0]
    const eb = qb[i1 - k] - qb[i0 - k]
    const at = r[k + nb - 1] / Math.sqrt(ea * eb + 1e-12)
    const v = (h ? (at + h(k, i0, i1)) / 2 : at) * Math.sqrt((i1 - i0) / menor)
    nota[k + nb - 1] = v
    soma += v
    soma2 += v * v
    cont++
    if (v > melhor) {
      melhor = v
      kMelhor = k
    }
  }
  if (!cont) return null
  const media = soma / cont
  const dp = Math.sqrt(Math.max(1e-12, soma2 / cont - media * media))
  const j = kMelhor + nb - 1
  const ym = nota[j - 1]
  const yp = nota[j + 1]
  const frac = Number.isFinite(ym) && Number.isFinite(yp) ? parabola(ym, melhor, yp) : 0
  // segundo melhor ponto longe do primeiro
  let segundo = -Infinity
  const longe = Math.round(hz)
  for (let i = 0; i < nota.length; i++) if (Math.abs(i - j) > longe && nota[i] > segundo) segundo = nota[i]
  const sob = Math.min(na, kMelhor + nb) - Math.max(0, kMelhor)
  return { inicio: (kMelhor + frac) / hz, ncc: Math.max(0, Math.min(1, melhor)), destaque: (melhor - media) / dp, ambigua: segundo >= melhor * 0.97, sobreposicao: sob / hz }
}

/**
 * A correlação normalizada do croma (cada uma das 12 notas, sem a média dela) para cada deslocamento k, somada nas 12:
 * (k, i0, i1) → −1 a 1. null sem croma.
 */
function harmonia(musica, tomada) {
  if (!musica.croma || !tomada.croma) return null
  const na = musica.croma.length / 12
  const nb = tomada.croma.length / 12
  const soma = new Float64Array(na + nb - 1)
  const qa = new Float64Array(na + 1)
  const qb = new Float64Array(nb + 1)
  for (let j = 0; j < 12; j++) {
    const x = new Float64Array(na)
    const y = new Float64Array(nb)
    let mx = 0
    let my = 0
    for (let i = 0; i < na; i++) mx += x[i] = musica.croma[i * 12 + j]
    for (let i = 0; i < nb; i++) my += y[i] = tomada.croma[i * 12 + j]
    mx /= na
    my /= nb
    for (let i = 0; i < na; i++) x[i] -= mx
    for (let i = 0; i < nb; i++) y[i] -= my
    const r = correlacao(x, y)
    for (let i = 0; i < r.length; i++) soma[i] += r[i]
    for (let i = 0; i < na; i++) qa[i + 1] += x[i] * x[i]
    for (let i = 0; i < nb; i++) qb[i + 1] += y[i] * y[i]
  }
  for (let i = 0; i < na; i++) qa[i + 1] += qa[i]
  for (let i = 0; i < nb; i++) qb[i + 1] += qb[i]
  return (k, i0, i1) => soma[k + nb - 1] / Math.sqrt((qa[i1] - qa[i0]) * (qb[i1 - k] - qb[i0 - k]) + 1e-12)
}

/**
 * Acerta o início dentro de ±buscaMs pelo envelope fino (1 ms), no trecho em que a tomada e a música se sobrepõem (até
 * trechoS no meio dele, para ficar rápido). pcm mono das duas na mesma taxa. Devolve o início acertado (s).
 */
export function refinar(pcmMusica, pcmTomada, taxa, inicio, { buscaMs = 40, trechoS = 60 } = {}) {
  const durM = pcmMusica.length / taxa
  const durT = pcmTomada.length / taxa
  const t0 = Math.max(0, -inicio)
  const t1 = Math.min(durT, durM - inicio)
  if (t1 - t0 < 1) return inicio
  const meio = (t0 + t1) / 2
  const metade = Math.min(trechoS, t1 - t0) / 2
  const ta = meio - metade
  const tb = meio + metade
  const folga = buscaMs / 1000 + 0.01
  const et = envelopeFino(pcmTomada, taxa, ta * taxa, tb * taxa)
  const em = envelopeFino(pcmMusica, taxa, (ta + inicio - folga) * taxa, (tb + inicio + folga) * taxa)
  const passo = taxa / et.hz
  // índice em em do ponto 0 de et, sem deslocamento
  const o0 = Math.round(((et.desde / taxa + inicio) * taxa - em.desde) / passo)
  const busca = Math.round((buscaMs / 1000) * et.hz)
  const media = (x) => x.reduce((s, v) => s + v, 0) / (x.length || 1)
  const mt = media(et.env)
  const mm = media(em.env)
  let melhor = -Infinity
  let dMelhor = 0
  const vals = new Map()
  for (let d = -busca; d <= busca; d++) {
    let s = 0
    let ea = 0
    let eb = 0
    for (let i = 0; i < et.env.length; i++) {
      const k = o0 + d + i
      if (k < 0 || k >= em.env.length) continue
      const x = et.env[i] - mt
      const y = em.env[k] - mm
      s += x * y
      ea += x * x
      eb += y * y
    }
    const v = s / Math.sqrt(ea * eb + 1e-12)
    vals.set(d, v)
    if (v > melhor) {
      melhor = v
      dMelhor = d
    }
  }
  if (!Number.isFinite(melhor)) return inicio
  const frac = vals.has(dMelhor - 1) && vals.has(dMelhor + 1) ? parabola(vals.get(dMelhor - 1), melhor, vals.get(dMelhor + 1)) : 0
  return inicio + (dMelhor + frac) / et.hz
}

/** Performance (a música toca no áudio da tomada e o pico se destaca) ou B-roll. r de alinhar(); s = preset.sincronia. */
export function tipoDaTomada(r, s) {
  return r && r.ncc >= s.confianca_min && r.destaque >= s.destaque_min ? 'performance' : 'broll'
}
