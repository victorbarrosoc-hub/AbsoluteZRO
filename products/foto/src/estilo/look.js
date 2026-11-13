// O look: uma LUT 3D como camada por cima da revelação, no CÓDIGO DA TELA (0..1, já com a curva da tela), que é onde
// as LUT de foto são feitas. Entra pelo gancho de `revelar` (`opcoes.look`), que mistura com a imagem na quantidade de
// `ajustes.look.quantidade` (0 a 200: fora = entra + q·(LUT(entra) − entra)) e prende o resultado em 0..1.
//
// LUT = { lado, dados: Float32Array (lado³ · 3) }, índice ((b·lado + g)·lado + r)·3: o vermelho varia mais rápido, como
// na .cube (cube.js).
//
// Interpolação tetraédrica: o cubo de cada célula é cortado em seis tetraedros pela ordem das frações (fr, fg, fb) e a
// cor sai de quatro vértices. Comparada à trilinear, não desvia o eixo cinza (a diagonal é aresta de todos os
// tetraedros) e custa menos — é o método das LUT de cor desde Kasson, Plouffe e Nin (1993), "A tetrahedral
// interpolation technique for color space conversion", Proc. SPIE 1909.
//
// Dentro da predefinição a LUT viaja compacta: 16 bits por canal, little-endian, em base64 (`compactar`). O passo de
// 1/65535 é menor que o de qualquer arquivo de 8 ou 16 bits que saia do app. Valores fora de 0..1 são presos.

import { baseDeImagem } from '../motor/base.js'
import { revelar } from '../motor/revelar.js'
import { temLocal, temRuido } from '../motor/local.js'
import { mexidos, misturar, neutro, normalizar } from '../motor/ajustes.js'
import { ajustesDe } from './predefinicao.js'

const limitar = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** LUT identidade de `lado` pontos; com `funcao(r, g, b, saida)`, a LUT daquela função amostrada na grade. */
export function criarLut(lado, funcao = null) {
  if (!Number.isInteger(lado) || lado < 2 || lado > 65) throw new Error('LUT: o lado vai de 2 a 65')
  const dados = new Float32Array(lado * lado * lado * 3)
  const cor = [0, 0, 0]
  const k = 1 / (lado - 1)
  let o = 0
  for (let b = 0; b < lado; b++) {
    for (let g = 0; g < lado; g++) {
      for (let r = 0; r < lado; r++, o += 3) {
        cor[0] = r * k
        cor[1] = g * k
        cor[2] = b * k
        if (funcao) funcao(cor[0], cor[1], cor[2], cor)
        dados[o] = cor[0]
        dados[o + 1] = cor[1]
        dados[o + 2] = cor[2]
      }
    }
  }
  return { lado, dados }
}

/**
 * A função do look para `revelar` (`opcoes.look`): (r, g, b, saida) → cor da LUT por interpolação tetraédrica.
 * A entrada é presa ao domínio da LUT (0..1, ou o DOMAIN_* da .cube).
 */
export function aplicarLut(lut) {
  const { lado, dados } = lut
  const n1 = lado - 1
  const min = lut.dominio?.min ?? [0, 0, 0]
  const max = lut.dominio?.max ?? [1, 1, 1]
  const er = n1 / (max[0] - min[0])
  const eg = n1 / (max[1] - min[1])
  const eb = n1 / (max[2] - min[2])
  const [m0, m1, m2] = min
  const pr = 3
  const pg = 3 * lado
  const pb = 3 * lado * lado
  return (r, g, b, saida) => {
    let x = (r - m0) * er
    let y = (g - m1) * eg
    let z = (b - m2) * eb
    // NaN cai no zero (a comparação falha) e o resto fica na grade
    x = x > 0 ? (x < n1 ? x : n1) : 0
    y = y > 0 ? (y < n1 ? y : n1) : 0
    z = z > 0 ? (z < n1 ? z : n1) : 0
    let ix = x | 0
    let iy = y | 0
    let iz = z | 0
    if (ix === n1) ix = n1 - 1
    if (iy === n1) iy = n1 - 1
    if (iz === n1) iz = n1 - 1
    const fx = x - ix
    const fy = y - iy
    const fz = z - iz
    const o = (iz * lado + iy) * pg + ix * 3
    // vértices: o (000) e o + pr + pg + pb (111) entram sempre; os dois do meio dependem da ordem das frações
    let a
    let c
    let w0
    let w1
    let w2
    let w3
    if (fx >= fy) {
      if (fy >= fz) {
        a = o + pr
        c = o + pr + pg
        w0 = 1 - fx
        w1 = fx - fy
        w2 = fy - fz
        w3 = fz
      } else if (fx >= fz) {
        a = o + pr
        c = o + pr + pb
        w0 = 1 - fx
        w1 = fx - fz
        w2 = fz - fy
        w3 = fy
      } else {
        a = o + pb
        c = o + pr + pb
        w0 = 1 - fz
        w1 = fz - fx
        w2 = fx - fy
        w3 = fy
      }
    } else if (fz >= fy) {
      a = o + pb
      c = o + pg + pb
      w0 = 1 - fz
      w1 = fz - fy
      w2 = fy - fx
      w3 = fx
    } else if (fz >= fx) {
      a = o + pg
      c = o + pg + pb
      w0 = 1 - fy
      w1 = fy - fz
      w2 = fz - fx
      w3 = fx
    } else {
      a = o + pg
      c = o + pr + pg
      w0 = 1 - fy
      w1 = fy - fx
      w2 = fx - fz
      w3 = fz
    }
    const d = o + pr + pg + pb
    saida[0] = w0 * dados[o] + w1 * dados[a] + w2 * dados[c] + w3 * dados[d]
    saida[1] = w0 * dados[o + 1] + w1 * dados[a + 1] + w2 * dados[c + 1] + w3 * dados[d + 1]
    saida[2] = w0 * dados[o + 2] + w1 * dados[a + 2] + w2 * dados[c + 2] + w3 * dados[d + 2]
    return saida
  }
}

/**
 * Aplica a LUT num bloco de código de tela (Float32Array ou parecido, 3 por pixel), no lugar, na quantidade pedida
 * (0 a 200) e presa em 0..1: a mesma conta que `revelar` faz com `opcoes.look`.
 */
export function aplicarLutEm(lut, dados, quantidade = 100) {
  const f = aplicarLut(lut)
  const q = Math.max(0, Math.min(200, quantidade)) / 100
  const cor = [0, 0, 0]
  for (let i = 0; i + 2 < dados.length; i += 3) {
    f(dados[i], dados[i + 1], dados[i + 2], cor)
    dados[i] = limitar(dados[i] + (cor[0] - dados[i]) * q)
    dados[i + 1] = limitar(dados[i + 1] + (cor[1] - dados[i + 1]) * q)
    dados[i + 2] = limitar(dados[i + 2] + (cor[2] - dados[i + 2]) * q)
  }
  return dados
}

/** A mesma LUT em outro lado (reamostrada pela tetraédrica) e sempre no domínio 0..1. */
export function reamostrar(lut, lado) {
  const f = aplicarLut(lut)
  const min = lut.dominio?.min ?? [0, 0, 0]
  const max = lut.dominio?.max ?? [1, 1, 1]
  const foraDoPadrao = min.some((v) => v !== 0) || max.some((v) => v !== 1)
  if (lado === lut.lado && !foraDoPadrao) return { lado, dados: Float32Array.from(lut.dados) }
  return criarLut(lado, (r, g, b, saida) => f(r, g, b, saida))
}

// ─────────── compacta (dentro da predefinição) ───────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const DE_B64 = new Int16Array(128).fill(-1)
for (let i = 0; i < 64; i++) DE_B64[B64.charCodeAt(i)] = i

/** Bytes → base64 (RFC 4648), sem depender de Buffer nem de btoa. */
export function paraBase64(bytes) {
  const partes = []
  let trecho = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    trecho += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? B64[c & 63] : '=')
    if (trecho.length >= 8192) {
      partes.push(trecho)
      trecho = ''
    }
  }
  partes.push(trecho)
  return partes.join('')
}

/** base64 → bytes. Caractere fora do alfabeto lança erro. */
export function deBase64(texto) {
  const limpo = texto.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((limpo.length * 3) / 4))
  let acumulado = 0
  let bits = 0
  let o = 0
  for (let i = 0; i < limpo.length; i++) {
    const codigo = limpo.charCodeAt(i)
    const v = codigo < 128 ? DE_B64[codigo] : -1
    if (v < 0) throw new Error('base64 inválido')
    acumulado = (acumulado << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[o++] = (acumulado >> bits) & 255
    }
  }
  return bytes
}

/**
 * LUT → o campo `look` da predefinição: { nome, lado, dados } com 16 bits por canal em base64. LUT com domínio fora
 * de 0..1 é reamostrada para 0..1 antes; valores fora de 0..1 são presos (`cortados` diz quantos, para o aviso).
 */
export function compactar(lut, nome = lut.titulo || 'Look') {
  const base = lut.dominio ? reamostrar(lut, lut.lado) : lut
  const n = base.dados.length
  const bytes = new Uint8Array(n * 2)
  let cortados = 0
  for (let i = 0; i < n; i++) {
    const v = base.dados[i]
    if (!(v >= 0 && v <= 1)) cortados++
    const q = Math.round(limitar(Number.isFinite(v) ? v : 0) * 65535)
    bytes[i * 2] = q & 255
    bytes[i * 2 + 1] = q >> 8
  }
  return { look: { nome: String(nome).slice(0, 80) || 'Look', lado: base.lado, dados: paraBase64(bytes) }, cortados: Math.round(cortados / 3) }
}

/** O campo `look` da predefinição → LUT { lado, dados: Float32Array, titulo }. */
export function descompactar(look) {
  const { lado } = look
  const bytes = deBase64(look.dados)
  const n = lado * lado * lado * 3
  if (bytes.length !== n * 2) throw new Error('look: tamanho dos dados diferente do lado declarado')
  const dados = new Float32Array(n)
  for (let i = 0; i < n; i++) dados[i] = (bytes[i * 2] | (bytes[i * 2 + 1] << 8)) / 65535
  return { lado, dados, titulo: look.nome ?? '' }
}

const prontos = new WeakMap()

/** A função `opcoes.look` de `revelar` para o look desta predefinição (null quando ela não tem look). */
export function lookDaPredefinicao(predefinicao) {
  if (!predefinicao?.look) return null
  if (!prontos.has(predefinicao.look)) prontos.set(predefinicao.look, aplicarLut(descompactar(predefinicao.look)))
  return prontos.get(predefinicao.look)
}

// ─────────── assar: a predefinição inteira numa LUT ───────────

/**
 * "Assa" uma predefinição numa LUT 3D (para escrever uma .cube e usar fora): cada ponto da grade é um código de tela
 * que volta à cena pela inversa da tela neutra, passa pelo motor com o estilo e sai de novo em código de tela.
 * Aplicada sobre uma foto revelada no neutro, a LUT dá o que o estilo daria — menos o que depende de vizinhança
 * (clareza, textura, neblina, nitidez, ruído, grão, vinheta), que não cabe em LUT: sai em `deFora`.
 *
 * `opcoes`: lado (17, 33 ou 65; padrão 33), tela ('srgb' | 'p3'), intensidade (0..200).
 * Devolve { lut: { lado, dados, titulo }, deFora: [caminhos dos controles que ficaram de fora] }.
 */
export function assar(predefinicao, { lado = 33, tela = 'srgb', intensidade = 100 } = {}) {
  const estilo = ajustesDe(predefinicao)
  // a intensidade é a do motor: mistura com o neutro
  const ajustes = intensidade === 100 ? normalizar(estilo) : misturar(neutro(), estilo, intensidade / 100)
  const n = lado * lado * lado
  const codigos = new Uint16Array(n * 3)
  const k = 65535 / (lado - 1)
  let o = 0
  for (let b = 0; b < lado; b++) for (let g = 0; g < lado; g++) for (let r = 0; r < lado; r++, o += 3) {
    codigos[o] = Math.round(r * k)
    codigos[o + 1] = Math.round(g * k)
    codigos[o + 2] = Math.round(b * k)
  }
  const base = baseDeImagem({ largura: lado * lado, altura: lado, dados: codigos, canais: 3, espaco: tela })
  const look = lookDaPredefinicao(predefinicao)
  if (look) ajustes.look.quantidade = Math.max(0, Math.min(200, (estilo.look.quantidade * intensidade) / 100))
  const imagem = revelar(base, ajustes, { tela, semLocal: true, look })
  const deFora = temLocal(ajustes) || temRuido(ajustes) ? mexidos(ajustes).filter((c) => /^(presenca|detalhe|efeitos\.(grao|vinheta))/.test(c)) : []
  return { lut: { lado, dados: imagem.dados, titulo: predefinicao.nome ?? '' }, deFora }
}
