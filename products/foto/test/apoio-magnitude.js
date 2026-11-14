// Apoio dos testes da fila de dúvidas, das pessoas e da calibração: medidas, rostos e vetores fabricados (nada de
// rosto de verdade). As medidas seguem o formato de medir() (src/decupagem/medidas.js).

import { sorteio, normal } from './apoio-decupagem.js'

/** Medidas fabricadas: nítida, bem exposta e limpa, salvo o que for pedido. */
export function medidas({ q = 0.85, altas = 0, altas3 = 0, baixas = 0, p1 = 12, p99 = 235, ruido = 1, dhash, phash } = {}) {
  const cepstro = { z: -4, comprimento: 20, angulo: 30, anel: 0.1, lado: 512 }
  return {
    largura: 1024,
    altura: 683,
    nitidez: { q, s0: 2, s1: 2 / q, qLocal: q, mapa: null },
    borrao: q >= 0.7 ? { tipo: 'nenhum', grau: 'nenhum', cepstro } : { tipo: 'foco', grau: q >= 0.6 ? 'leve' : 'forte', cepstro },
    exposicao: { altas, altas3, baixas, p1, p50: 110, p99, media: 110 },
    ruido,
    dhash: dhash ?? '0000000000000000',
    phash: phash ?? '0000000000000000',
    horizonte: null,
  }
}

/** Um rosto como o catálogo guarda (o resumo de app/decupagem/compacto.js). */
export function rosto({
  x = 400,
  y = 200,
  largura = 120,
  olhos = 'abertos',
  ear = 0.3,
  nitidez = 0.85,
  chave = true,
  principal = true,
  guinada = 0,
  duvidoso = false,
} = {}) {
  return {
    caixa: { x, y, largura, altura: largura * 1.2 },
    confianca: 0.95,
    olhos,
    ear,
    piscada: olhos === 'fechados' ? 0.7 : 0.05,
    aperto: 0.1,
    sorriso: 0.1,
    guinada,
    nitidezOlhos: nitidez,
    nitidezRosto: nitidez,
    tamanho: largura / 1024,
    peso: largura / 1024,
    chave,
    principal,
    cortado: false,
    duvidoso,
    pontos: null,
  }
}

/** Um vetor unitário de 128 números (a "pessoa" de uma semente). */
export function vetorBase(semente) {
  const rnd = sorteio(semente)
  const v = Float32Array.from({ length: 128 }, () => normal(rnd))
  return unitario(v)
}

/** Um vetor perto de `base`, com cosseno ≈ `cos` (ruído ortogonal com semente). */
export function vetorPerto(base, cos, semente) {
  const r = vetorBase(semente)
  let p = 0
  for (let k = 0; k < 128; k++) p += r[k] * base[k]
  const orto = unitario(r.map((x, k) => x - p * base[k]))
  const s = Math.sqrt(1 - cos * cos)
  return unitario(base.map((b, k) => cos * b + s * orto[k]))
}

export function unitario(v) {
  let s = 0
  for (const x of v) s += x * x
  const n = Math.sqrt(s) || 1
  return Float32Array.from(v, (x) => x / n)
}

/** Int8Array como src/rosto/assinatura.js grava. */
export function int8(v) {
  let m = 0
  for (const x of v) m = Math.max(m, Math.abs(x))
  return Int8Array.from(v, (x) => Math.round((x / m) * 127))
}
