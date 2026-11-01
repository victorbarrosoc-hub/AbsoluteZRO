// A montagem guiada pela música (o motor do Clipe e do Aftermovie): onde cortar e qual plano entra em cada corte.
//
// Onde cortar: cada parte da música tem um tamanho de plano em batidas (o preset do modo, vezes o ritmo escolhido);
// o corte cai sempre numa batida e a troca de parte é sempre corte. Com energia por compasso (aftermovie), o trecho
// mais forte encurta o plano: a montagem acelera na subida e solta no drop.
//
// Qual plano: a tomada de performance que cobre o trecho inteiro (em sincronia com a música) e tem a melhor nota ali;
// o B-roll entra na proporção pedida, nunca dois seguidos, e cada trecho de B-roll só é usado uma vez. Os trechos
// mais fortes da música escolhem primeiro (o melhor material vai para o refrão e o drop). A mesma tomada não entra
// duas vezes seguidas, e quem já entrou muito perde ponto. Tudo determinado pela semente: "outra versão" = outra
// semente. Puro, sem DOM.

import { notaNoTrecho } from './nota.js'

export const RITMOS = Object.freeze(['calmo', 'normal', 'rapido'])
export const NIVEIS_BROLL = Object.freeze(['nenhum', 'pouco', 'muito'])

export function sorteio(semente) {
  let s = semente | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r3 = (x) => Math.round(x * 1000) / 1000

/** A parte da música em que o instante t cai (índice). */
export const parteEm = (partes, t) => Math.max(0, partes.findIndex((p) => t >= p.ini && t < p.fim))

/** Energia do compasso em que t cai (dB) e a média da música. */
function energiaEm(analise, t) {
  const cs = analise.compassos
  const es = analise.energias || []
  if (!cs?.length || !es.length) return null
  let i = 0
  while (i + 1 < cs.length && cs[i + 1] <= t) i++
  return es[Math.min(i, es.length - 1)]
}

/**
 * Os trechos [a, b) (s da música) de cada plano entre desde e ate. analise: { duracao, batidas, compassos, partes,
 * energias? }. o: preset do modo (ritmo, broll…). rng: sorteio().
 */
export function cortesNaMusica(analise, { ritmo = 'normal', desde = 0, ate = analise.duracao } = {}, o, rng = sorteio(1)) {
  const R = o.ritmo
  const mult = R.multiplicador[ritmo] ?? 1
  const batidas = analise.batidas.filter((t) => t >= desde && t < ate)
  const es = (analise.energias || []).filter(Number.isFinite)
  const media = es.length ? es.reduce((s, v) => s + v, 0) / es.length : null
  const cortes = [desde]
  for (const p of analise.partes) {
    const a = Math.max(p.ini, desde)
    const b = Math.min(p.fim, ate)
    if (b - a <= 1e-3) continue
    if (a > cortes.at(-1) + 1e-3) cortes.push(a)
    const bs = batidas.filter((t) => t > a + 1e-3 && t < b - 1e-3)
    const base = Math.max(R.min_batidas, Math.round((R.batidas_por_plano[p.tipo] ?? 8) * mult))
    let k = 0
    let ultimo = a
    while (k < bs.length) {
      let L = base
      if (R.por_energia && media !== null) {
        const e = energiaEm(analise, bs[k])
        if (e !== null) L = Math.round(base * 2 ** (-(e - media) / R.por_energia))
      }
      if (rng() < R.variacao) L = rng() < 0.5 ? L * 2 : Math.round(L / 2)
      L = Math.max(R.min_batidas, Math.min(base * 2, L))
      const prox = k + L - 1
      // o resto da parte que não dá meio plano fica com o plano atual
      if (prox >= bs.length - Math.floor(L / 2)) break
      const t = bs[prox]
      if (t - ultimo >= R.min_s) {
        cortes.push(t)
        ultimo = t
      }
      k = prox + 1
    }
  }
  if (ate > cortes.at(-1) + 1e-3) cortes.push(ate)
  const out = []
  for (let i = 0; i < cortes.length - 1; i++) out.push([r3(cortes[i]), r3(cortes[i + 1])])
  return out
}

/** As tomadas que cobrem [a, b) inteiro em sincronia (performance). */
const cobrem = (tomadas, a, b) => tomadas.filter((t) => t.tipo === 'performance' && t.inicio <= a + 1e-3 && t.inicio + t.duracao >= b - 1e-3)

/** O melhor trecho de d s de uma tomada usada como imagem livre (sem sincronia), fora dos trechos já usados. */
function melhorJanela(t, d, usados = [], margem = 0.5, passo = 0.25) {
  if (t.duracao <= 0) return null
  if (t.duracao < d) return usados.length ? null : { de: 0, len: t.duracao, nota: notaNoTrecho(t.notas, t.hz, 0, t.duracao) }
  let melhor = null
  for (let de = 0; de + d <= t.duracao + 1e-6; de += passo) {
    if (usados.some(([x, y]) => de < y + margem && de + d > x - margem)) continue
    const n = notaNoTrecho(t.notas, t.hz, de, de + d)
    if (!melhor || n > melhor.nota) melhor = { de, len: d, nota: n }
  }
  return melhor
}

/**
 * Quem entra em cada trecho: [{ ini, fim (s da música), midia, de (s da mídia), tipo: 'performance' | 'broll' |
 * 'livre', parte }]. tomadas: [{ midia, tipo, inicio (s da música no 0 da tomada, só performance), duracao, notas
 * (Float32Array 0–1 ou null), hz }].
 */
export function escolherPlanos(trechos, tomadas, analise, { broll = 'pouco', semente = 1 } = {}, o) {
  const rng = sorteio(semente * 7919 + 13)
  const B = o.broll
  const Rp = o.repeticao
  const brolls = tomadas.filter((t) => t.tipo === 'broll' || o.so_broll)
  const usados = new Map()
  const uso = new Map()
  const feitos = new Array(trechos.length).fill(null)
  // os trechos mais fortes escolhem primeiro (refrão, drop); empate: na ordem da música
  const forca = (i) => analise.partes[parteEm(analise.partes, trechos[i][0])]?.energia ?? 0
  const ordem = trechos.map((_, i) => i).sort((x, y) => forca(y) - forca(x) || x - y)
  const vizinhos = (i) => [feitos[i - 1], feitos[i + 1]].filter(Boolean).flat()
  const total = trechos.length || 1
  const penal = (midia, i) => (vizinhos(i).some((v) => v.midia === midia) ? Rp.mesma_tomada : 0) + Rp.uso * ((uso.get(midia) || 0) / total)

  for (const i of ordem) {
    const [a, b] = trechos[i]
    const pi = parteEm(analise.partes, a)
    const parte = analise.partes[pi]
    const d = b - a
    const viz = vizinhos(i)
    let pB = o.so_broll ? 1 : (B.parte[broll] ?? 0) * (parte?.tipo === 'refrao' ? B.no_refrao : 1)
    if (!o.so_broll && B.nunca_seguido && viz.some((v) => v.tipo !== 'performance')) pB = 0
    const querBroll = rng() < pB
    const jitter = () => rng() * 0.02
    let perf = null
    if (!o.so_broll)
      for (const t of cobrem(tomadas, a, b)) {
        const n = notaNoTrecho(t.notas, t.hz, a - t.inicio, b - t.inicio) - penal(t.midia, i) + jitter()
        if (!perf || n > perf.nota) perf = { midia: t.midia, de: a - t.inicio, len: d, nota: n, tipo: 'performance' }
      }
    const melhorBroll = (lista, tipo, repetir = false) => {
      let m = null
      for (const t of lista) {
        const j = melhorJanela(t, d, repetir ? [] : usados.get(t.midia))
        if (!j) continue
        const n = j.nota - penal(t.midia, i) + jitter()
        if (!m || n > m.nota) m = { midia: t.midia, de: j.de, len: j.len, nota: n, tipo }
      }
      return m
    }
    // a única performance que cobre é a do vizinho: um B-roll (se cabe aqui) evita o corte para a mesma tomada
    const repete = perf && viz.some((v) => v.tipo === 'performance' && v.midia === perf.midia)
    let esc = ((querBroll || (repete && pB > 0)) && melhorBroll(brolls, 'broll')) || perf || melhorBroll(brolls, 'broll')
    // nada cobre: qualquer tomada como imagem livre (a sincronia não vale aqui)
    if (!esc) esc = melhorBroll(tomadas.filter((t) => t.tipo === 'performance'), 'livre')
    // tudo já usado: repete o melhor trecho (um buraco tiraria a linha de sincronia com a música)
    if (!esc) esc = melhorBroll(tomadas, 'livre', true)
    if (!esc) continue
    // um B-roll mais curto que o trecho: entra inteiro e o resto vai para o próximo melhor
    const pedacos = []
    let ini = a
    let e = esc
    for (let guarda = 0; e && guarda < 8; guarda++) {
      const fim = Math.min(b, ini + e.len)
      pedacos.push({ ini: r3(ini), fim: r3(fim), midia: e.midia, de: r3(e.de), tipo: e.tipo, parte: pi })
      if (e.tipo !== 'performance') usados.set(e.midia, [...(usados.get(e.midia) || []), [e.de, e.de + (fim - ini)]])
      uso.set(e.midia, (uso.get(e.midia) || 0) + 1)
      ini = fim
      if (ini >= b - 1e-3) break
      const resto = b - ini
      e = melhorBroll(brolls.filter((t) => !pedacos.some((p) => p.midia === t.midia)), 'broll') || melhorBroll(tomadas, 'livre', true)
      if (e) e.len = Math.min(e.len, resto)
    }
    feitos[i] = pedacos
  }
  // a mesma performance em dois trechos seguidos é um plano só (ela continua em sincronia: cortar ali não troca nada)
  const out = []
  for (const x of feitos.filter(Boolean).flat()) {
    const u = out.at(-1)
    if (u && u.midia === x.midia && u.tipo === x.tipo && x.tipo !== 'broll' && Math.abs(u.de + (u.fim - u.ini) - x.de) < 1e-3) u.fim = x.fim
    else out.push({ ...x })
  }
  return out
}

/**
 * Outras opções para o trecho [a, b) (a troca de plano da revisão): as performances que cobrem o trecho e o melhor
 * trecho de cada B-roll, pela nota, sem a que está agora. [{ midia, de, tipo, nota }] (até n).
 */
export function alternativasEm(tomadas, a, b, { atual = null, n = 4 } = {}) {
  const d = b - a
  const out = []
  for (const t of cobrem(tomadas, a, b)) out.push({ midia: t.midia, de: r3(a - t.inicio), tipo: 'performance', nota: notaNoTrecho(t.notas, t.hz, a - t.inicio, b - t.inicio) })
  for (const t of tomadas.filter((x) => x.tipo === 'broll' && x.duracao >= d)) {
    const j = melhorJanela(t, d)
    if (j) out.push({ midia: t.midia, de: r3(j.de), tipo: 'broll', nota: j.nota })
  }
  return out
    .filter((x) => !(atual && x.midia === atual.midia && Math.abs(x.de - atual.de) < 0.05))
    .sort((x, y) => y.nota - x.nota)
    .slice(0, n)
    .map((x) => ({ ...x, nota: Math.round(x.nota * 100) / 100 }))
}
