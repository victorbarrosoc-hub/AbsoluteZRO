// Revela · Meus looks: um clone (src/cor/clonar.js) salvo com nome, para usar em qualquer frame como os looks da
// Revela. Fica só neste navegador (localStorage): não vai para o site, para o repositório nem para outras pessoas.
//
// Guardado como LUT 33³ em 16 bits (base64, ~290 KB por look). Na hora de usar, a intensidade mistura o frame com a
// LUT, como nos outros looks.

import { aplicar as aplicarLut, assar } from './cube.js'
import { codigoParaOklab } from './oklab.js'

export const PREFIXO = 'meu-'
export const MAX_LOOKS = 8
const TAMANHO = 33

const paraBase64 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))

/** `f(r, g, b) → [r, g, b]` (o look inteiro, intensidade 1) → registro pronto para guardar. */
export function empacotar(f, nome, agora = Date.now()) {
  const lut = assar(f, TAMANHO)
  const v = new Uint16Array(lut.dados.length)
  for (let i = 0; i < v.length; i++) v[i] = Math.round(Math.min(1, Math.max(0, lut.dados[i])) * 65535)
  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Meu look'
  return { id: `${PREFIXO}${agora.toString(36)}`, nome: limpo, tamanho: TAMANHO, dados: paraBase64(new Uint8Array(v.buffer)) }
}

/** Registro guardado → LUT. Lança erro se estiver corrompido. */
export function desempacotar(salvo) {
  const bytes = deBase64(salvo.dados)
  const n = salvo.tamanho
  if (bytes.length !== n ** 3 * 3 * 2) throw new Error('Look salvo incompleto')
  const v = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
  return { tamanho: n, dados: Float32Array.from(v, (x) => x / 65535) }
}

/** O look salvo no mesmo formato dos looks da Revela (`aplicar(r, g, b, intensidade)` e `resumo`). */
export function lookSalvo(salvo) {
  const lut = desempacotar(salvo)
  const aplicar = (r, g, b, t = 1) => {
    const o = aplicarLut(lut, r, g, b)
    return [r + (o[0] - r) * t, g + (o[1] - g) * t, b + (o[2] - b) * t]
  }
  const luz = (v) => codigoParaOklab(...aplicar(v, v, v))[0]
  return {
    preset: salvo.id,
    nome: salvo.nome,
    aplicar,
    resumo: {
      intensidade: 1,
      tom: { preto: luz(0), cinza: luz(0.5), branco: luz(1) },
      frases: ['Seu look, clonado dos seus frames.', 'Fica só neste navegador.'],
    },
  }
}
