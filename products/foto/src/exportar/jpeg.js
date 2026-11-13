// JPEG: a cirurgia de bytes (embutir perfil, EXIF e XMP; limpar tudo para a galeria do cliente) e um codificador
// baseline próprio. O navegador também codifica (canvas.convertToBlob), e o que sai de lá passa por `embutirNoJpeg`
// do mesmo jeito; mas o canvas do Chromium corta a croma pela metade (4:2:0) em qualquer qualidade abaixo de 100
// (medido), então a exportação de qualidade alta sai por aqui, com a croma inteira (4:4:4). É também o caminho de
// onde não há canvas: Node, testes, worker sem OffscreenCanvas.
//
// Especificações:
//   ITU-T T.81 (ISO 10918-1)  B.1 marcadores e segmentos; B.2.2 SOF0; B.2.3 SOS; B.2.4.1 DQT; B.2.4.2 DHT;
//                             A.3.3 DCT; F.1.2 código de Huffman (DC por diferença, AC por corrida e tamanho);
//                             K.1 tabelas de quantização de exemplo; K.3 tabelas de Huffman típicas
//   JFIF 1.02 (ITU-T T.871)   APP0 'JFIF', YCbCr de faixa cheia (BT.601), croma centrada
//   EXIF 2.32, 4.7.2          APP1 'Exif\0\0' + bloco TIFF, num segmento só (até 64 KB)
//   XMP parte 3, 1.1.3        APP1 'http://ns.adobe.com/xap/1.0/\0' + pacote
//   ICC.1:2010, anexo B.4     APP2 'ICC_PROFILE\0' + número do pedaço + total de pedaços + até 65519 bytes do perfil
//
// A escala da qualidade (1 a 100) é a do libjpeg (IJG): é a mesma régua de quase todo programa, então "92" aqui é o
// "92" que a pessoa conhece.

import { TIPO, lerBlocoTiff, montarBlocoTiff, valorDe } from './tiff.js'

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const APP0 = 0xe0
const APP1 = 0xe1
const APP2 = 0xe2
const APP14 = 0xee
const COM = 0xfe

const ASSINATURA_EXIF = 'Exif\0\0'
const ASSINATURA_XMP = 'http://ns.adobe.com/xap/1.0/\0'
const ASSINATURA_XMP_ESTENDIDO = 'http://ns.adobe.com/xmp/extension/\0'
const ASSINATURA_ICC = 'ICC_PROFILE\0'
const MAIOR_SEGMENTO = 65533 // o campo de tamanho (2 bytes) conta a si mesmo: sobram 65533 para os dados
const PEDACO_ICC = MAIOR_SEGMENTO - ASSINATURA_ICC.length - 2

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0))

function comecaCom(bytes, inicio, fim, assinatura) {
  if (fim - inicio < assinatura.length) return false
  for (let i = 0; i < assinatura.length; i++) if (bytes[inicio + i] !== assinatura.charCodeAt(i)) return false
  return true
}

function juntar(partes) {
  let total = 0
  for (const p of partes) total += p.length
  const saida = new Uint8Array(total)
  let q = 0
  for (const p of partes) {
    saida.set(p, q)
    q += p.length
  }
  return saida
}

function segmento(marcador, ...partes) {
  const dados = juntar(partes)
  if (dados.length > MAIOR_SEGMENTO) throw new Error(`JPEG: segmento de ${dados.length} bytes não cabe em 64 KB`)
  const saida = new Uint8Array(4 + dados.length)
  saida[0] = 0xff
  saida[1] = marcador
  saida[2] = (dados.length + 2) >> 8
  saida[3] = (dados.length + 2) & 0xff
  saida.set(dados, 4)
  return saida
}

// ─────────── percorrer ───────────

/**
 * Os segmentos de um JPEG, do SOI ao EOI: [{ marcador, inicio, fim, dados: [de, ate) }]. O segmento SOS leva junto os
 * dados comprimidos que vêm depois dele (até o próximo marcador que não seja RSTn). `resto` é o que sobra depois do
 * EOI (segunda imagem de um MPF, vídeo de foto com movimento…), ou -1 se o arquivo acaba sem EOI.
 */
export function lerSegmentosJpeg(jpeg) {
  if (!(jpeg instanceof Uint8Array) || jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== SOI) throw new Error('JPEG: o arquivo não começa com SOI')
  const lista = [{ marcador: SOI, inicio: 0, fim: 2, dados: [2, 2] }]
  let p = 2
  let resto = -1
  while (p < jpeg.length) {
    if (jpeg[p] !== 0xff) throw new Error(`JPEG: esperava um marcador na posição ${p}`)
    let m = jpeg[p + 1]
    while (m === 0xff && p + 2 < jpeg.length) {
      p++ // bytes FF de enchimento antes do marcador (B.1.1.2)
      m = jpeg[p + 1]
    }
    if (m === EOI) {
      lista.push({ marcador: EOI, inicio: p, fim: p + 2, dados: [p + 2, p + 2] })
      resto = p + 2
      break
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      lista.push({ marcador: m, inicio: p, fim: p + 2, dados: [p + 2, p + 2] })
      p += 2
      continue
    }
    if (p + 4 > jpeg.length) throw new Error('JPEG: arquivo cortado no meio de um marcador')
    const tamanho = (jpeg[p + 2] << 8) | jpeg[p + 3]
    if (tamanho < 2 || p + 2 + tamanho > jpeg.length) throw new Error(`JPEG: segmento ${m.toString(16)} passa do fim do arquivo`)
    let fim = p + 2 + tamanho
    const dados = [p + 4, fim]
    if (m === SOS) {
      // dados comprimidos: FF 00 é um byte FF de verdade; FF D0..D7 é reinício; qualquer outro FF xx fecha a varredura
      while (fim < jpeg.length) {
        if (jpeg[fim] === 0xff && fim + 1 < jpeg.length) {
          const x = jpeg[fim + 1]
          if (x !== 0 && x !== 0xff && !(x >= 0xd0 && x <= 0xd7)) break
        }
        fim++
      }
    }
    lista.push({ marcador: m, inicio: p, fim, dados })
    p = fim
  }
  lista.resto = resto
  return lista
}

const eExif = (jpeg, s) => s.marcador === APP1 && comecaCom(jpeg, s.dados[0], s.dados[1], ASSINATURA_EXIF)
const eXmp = (jpeg, s) =>
  s.marcador === APP1 && (comecaCom(jpeg, s.dados[0], s.dados[1], ASSINATURA_XMP) || comecaCom(jpeg, s.dados[0], s.dados[1], ASSINATURA_XMP_ESTENDIDO))
const eIcc = (jpeg, s) => s.marcador === APP2 && comecaCom(jpeg, s.dados[0], s.dados[1], ASSINATURA_ICC)
const eJfif = (jpeg, s) => s.marcador === APP0 && comecaCom(jpeg, s.dados[0], s.dados[1], 'JFIF\0')

/**
 * O que um JPEG traz embutido: { icc, exif, xmp } (bytes do perfil remontado, bloco TIFF do EXIF e texto do pacote
 * XMP principal), cada um null quando não há.
 */
export function extrairDoJpeg(jpeg) {
  const saida = { icc: null, exif: null, xmp: null }
  const pedacos = []
  for (const s of lerSegmentosJpeg(jpeg)) {
    if (s.marcador === SOS) break
    if (eExif(jpeg, s) && !saida.exif) saida.exif = jpeg.slice(s.dados[0] + ASSINATURA_EXIF.length, s.dados[1])
    else if (s.marcador === APP1 && comecaCom(jpeg, s.dados[0], s.dados[1], ASSINATURA_XMP) && saida.xmp === null) {
      saida.xmp = new TextDecoder().decode(jpeg.subarray(s.dados[0] + ASSINATURA_XMP.length, s.dados[1]))
    } else if (eIcc(jpeg, s)) {
      const d = s.dados[0] + ASSINATURA_ICC.length
      pedacos.push({ numero: jpeg[d], total: jpeg[d + 1], bytes: jpeg.subarray(d + 2, s.dados[1]) })
    }
  }
  if (pedacos.length) {
    // os pedaços podem vir fora de ordem: vale o número de cada um (ICC.1:2010, B.4)
    pedacos.sort((a, b) => a.numero - b.numero)
    const inteiro = pedacos.length === pedacos[0].total && pedacos.every((p, i) => p.numero === i + 1)
    if (inteiro) saida.icc = juntar(pedacos.map((p) => p.bytes))
  }
  return saida
}

// ─────────── embutir ───────────

function segmentosDoIcc(icc) {
  const total = Math.ceil(icc.length / PEDACO_ICC)
  if (total > 255) throw new Error('JPEG: perfil ICC grande demais para 255 pedaços')
  const saida = []
  for (let i = 0; i < total; i++) {
    saida.push(segmento(APP2, ascii(ASSINATURA_ICC), Uint8Array.of(i + 1, total), icc.subarray(i * PEDACO_ICC, (i + 1) * PEDACO_ICC)))
  }
  return saida
}

function segmentoDoExif(exif) {
  // aceita o bloco TIFF puro ou já com o prefixo
  const bloco = comecaCom(exif, 0, exif.length, ASSINATURA_EXIF) ? exif.subarray(ASSINATURA_EXIF.length) : exif
  const ordem = (bloco[0] << 8) | bloco[1]
  if (ordem !== 0x4949 && ordem !== 0x4d4d) throw new Error('JPEG: o EXIF precisa ser um bloco TIFF')
  if (bloco.length > MAIOR_SEGMENTO - ASSINATURA_EXIF.length) throw new Error('JPEG: o EXIF não cabe num segmento de 64 KB')
  return segmento(APP1, ascii(ASSINATURA_EXIF), bloco)
}

function segmentoDoXmp(xmp) {
  const pacote = typeof xmp === 'string' ? new TextEncoder().encode(xmp) : xmp
  if (pacote.length > MAIOR_SEGMENTO - ASSINATURA_XMP.length) throw new Error('JPEG: o pacote XMP passa de 64 KB (XMP estendido não é escrito aqui)')
  return segmento(APP1, ascii(ASSINATURA_XMP), pacote)
}

/**
 * Embute perfil ICC, EXIF e XMP num JPEG, sem tocar na imagem. O que for passado SUBSTITUI o que o arquivo já tinha
 * do mesmo tipo (nunca fica duplicado); o que não for passado fica como estava.
 *   icc    bytes do perfil (vai em quantos APP2 forem precisos, numerados)
 *   exif   bloco TIFF de `montarExif`
 *   xmp    texto (ou bytes) do pacote
 * Ordem de saída: SOI, JFIF (se havia), EXIF, XMP, ICC e o resto como estava. É a ordem que os leitores esperam: os
 * metadados antes das tabelas, o perfil antes do primeiro SOF.
 */
export function embutirNoJpeg(jpeg, { icc, exif, xmp } = {}) {
  const lista = lerSegmentosJpeg(jpeg)
  const corte = lista.findIndex((s) => s.marcador === SOS || s.marcador === EOI)
  if (corte < 0) throw new Error('JPEG: não achei o começo da imagem')
  const cabeca = lista.slice(1, corte)
  const bytesDe = (s) => jpeg.subarray(s.inicio, s.fim)

  const partes = [Uint8Array.of(0xff, SOI)]
  const jfif = cabeca.find((s) => eJfif(jpeg, s))
  if (jfif) partes.push(bytesDe(jfif))
  if (exif) partes.push(segmentoDoExif(exif))
  else for (const s of cabeca) if (eExif(jpeg, s)) partes.push(bytesDe(s))
  if (xmp) partes.push(segmentoDoXmp(xmp))
  else for (const s of cabeca) if (eXmp(jpeg, s)) partes.push(bytesDe(s))
  if (icc) partes.push(...segmentosDoIcc(icc))
  else for (const s of cabeca) if (eIcc(jpeg, s)) partes.push(bytesDe(s))
  for (const s of cabeca) {
    if (s === jfif || eExif(jpeg, s) || eXmp(jpeg, s) || eIcc(jpeg, s)) continue
    partes.push(bytesDe(s))
  }
  partes.push(jpeg.subarray(lista[corte].inicio))
  return juntar(partes)
}

// ─────────── limpar ───────────

/**
 * Tira de um JPEG tudo o que não é imagem: EXIF (com GPS, número de série e miniatura), XMP, IPTC/Photoshop (APP13),
 * MPF e demais APPn, comentários, miniatura do JFIF/JFXX e o que houver depois do fim da imagem. É o que a galeria
 * do cliente exige antes de subir uma prévia.
 *
 * Fica só o que muda a cor ou a posição dos pixels:
 *   - o perfil ICC, com `manterIcc` (padrão): sem ele uma foto em Display P3 apareceria lavada;
 *   - o APP14 da Adobe (diz como os componentes viram cor);
 *   - a orientação, com `manterOrientacao` (padrão), quando o EXIF original pedia giro: vai num EXIF novo que só tem
 *     essa tag. Sem isso a foto deitaria.
 */
export function limparJpeg(jpeg, { manterIcc = true, manterOrientacao = true } = {}) {
  const lista = lerSegmentosJpeg(jpeg)
  const partes = [Uint8Array.of(0xff, SOI)]
  let orientacao = 1
  if (manterOrientacao) {
    const comExif = lista.find((s) => eExif(jpeg, s))
    if (comExif) {
      try {
        const o = valorDe(lerBlocoTiff(jpeg.subarray(comExif.dados[0] + ASSINATURA_EXIF.length, comExif.dados[1])).diretorio, 0x0112)
        if (o >= 2 && o <= 8) orientacao = o
      } catch {
        orientacao = 1 // EXIF estragado não diz nada sobre giro
      }
    }
  }
  const corpo = []
  let jfif = null
  for (const s of lista.slice(1)) {
    const m = s.marcador
    if (m === EOI) break
    if (m === APP0) {
      // JFIF fica, sem a miniatura (bytes 12 e 13 dos dados são o tamanho dela); JFXX é só miniatura: sai
      if (eJfif(jpeg, s) && !jfif && s.dados[1] - s.dados[0] >= 14) {
        const base = jpeg.slice(s.dados[0], s.dados[0] + 14)
        base[12] = 0
        base[13] = 0
        jfif = segmento(APP0, base)
      }
      continue
    }
    if (m === APP2 && manterIcc && eIcc(jpeg, s)) {
      corpo.push(jpeg.subarray(s.inicio, s.fim))
      continue
    }
    if (m === APP14 && comecaCom(jpeg, s.dados[0], s.dados[1], 'Adobe')) {
      corpo.push(jpeg.subarray(s.inicio, s.fim))
      continue
    }
    if ((m >= APP0 && m <= 0xef) || m === COM) continue
    corpo.push(jpeg.subarray(s.inicio, s.fim))
  }
  if (jfif) partes.push(jfif)
  if (orientacao !== 1) {
    partes.push(segmentoDoExif(montarBlocoTiff({ entradas: [{ tag: 0x0112, tipo: TIPO.SHORT, valores: orientacao }] })))
  }
  partes.push(...corpo, Uint8Array.of(0xff, EOI))
  return juntar(partes)
}

// ─────────── codificar ───────────

// T.81, K.1: tabelas de quantização de exemplo (luz e croma), em ordem natural (linha a linha)
const Q_LUZ = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103,
  77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]
const Q_CROMA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
]

// T.81, K.3: tabelas de Huffman típicas. `bits[i]` = quantos códigos têm i + 1 bits; `valores` na ordem dos códigos.
const HUFFMAN = {
  dcLuz: { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], valores: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  dcCroma: { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], valores: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  acLuz: {
    bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
    valores: [
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23,
      0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a,
      0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
      0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
      0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2,
      0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8,
      0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
    ],
  },
  acCroma: {
    bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
    valores: [
      0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1,
      0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28,
      0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63,
      0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92,
      0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9,
      0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7,
      0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
    ],
  },
}

/** As tabelas de Huffman típicas (T.81, K.3), para quem quiser conferir ou decodificar. */
export const TABELAS_DE_HUFFMAN = HUFFMAN

/** Ordem em ziguezague (T.81, figura A.6): posição k da sequência → índice na matriz 8×8, linha a linha. */
export const ZIGUEZAGUE = (() => {
  const z = []
  for (let soma = 0; soma < 15; soma++) {
    const de = Math.max(0, soma - 7)
    const ate = Math.min(soma, 7)
    // diagonais de soma par sobem (a linha diminui); as ímpares descem
    if (soma % 2 === 0) for (let l = ate; l >= de; l--) z.push(l * 8 + (soma - l))
    else for (let l = de; l <= ate; l++) z.push(l * 8 + (soma - l))
  }
  return z
})()

/**
 * Tabela de quantização para uma qualidade de 1 a 100, pela escala do libjpeg: fator 5000/q abaixo de 50 e
 * 200 − 2q acima; cada passo é (base·fator + 50)/100, de 1 a 255.
 */
export function tabelaDeQuantizacao(base, qualidade) {
  const q = Math.max(1, Math.min(100, Math.round(qualidade)))
  const fator = q < 50 ? Math.floor(5000 / q) : 200 - 2 * q
  return Uint8Array.from(base, (b) => Math.max(1, Math.min(255, Math.floor((b * fator + 50) / 100))))
}

// Códigos de uma tabela (T.81, anexo C): os códigos de cada tamanho são consecutivos, e o primeiro de um tamanho é o
// seguinte ao último do tamanho anterior, deslocado um bit.
function codigosDe({ bits, valores }) {
  const codigo = new Uint16Array(256)
  const tamanho = new Uint8Array(256)
  let c = 0
  let k = 0
  for (let n = 1; n <= 16; n++) {
    for (let i = 0; i < bits[n - 1]; i++) {
      codigo[valores[k]] = c++
      tamanho[valores[k]] = n
      k++
    }
    c <<= 1
  }
  return { codigo, tamanho }
}

// DCT direta de Arai, Agui e Nakajima (1988): 5 multiplicações por passada de 8 pontos. A saída vem multiplicada por
// 8·s[u]·s[v], com s[0] = 1 e s[k] = √2·cos(kπ/16); esse fator entra no divisor da quantização, então a conta inteira
// custa o mesmo que só a DCT.
const C4 = Math.cos(Math.PI / 4)
const C6 = Math.cos((3 * Math.PI) / 8)
const C2_MENOS_C6 = Math.cos(Math.PI / 8) - C6
const C2_MAIS_C6 = Math.cos(Math.PI / 8) + C6
const ESCALA_AAN = Array.from({ length: 8 }, (_, k) => (k === 0 ? 1 : Math.SQRT2 * Math.cos((k * Math.PI) / 16)))

function dct(b) {
  for (let i = 0; i < 64; i += 8) {
    const t0 = b[i] + b[i + 7]
    const t7 = b[i] - b[i + 7]
    const t1 = b[i + 1] + b[i + 6]
    const t6 = b[i + 1] - b[i + 6]
    const t2 = b[i + 2] + b[i + 5]
    const t5 = b[i + 2] - b[i + 5]
    const t3 = b[i + 3] + b[i + 4]
    const t4 = b[i + 3] - b[i + 4]
    const t10 = t0 + t3
    const t13 = t0 - t3
    const t11 = t1 + t2
    const t12 = t1 - t2
    b[i] = t10 + t11
    b[i + 4] = t10 - t11
    const z1 = (t12 + t13) * C4
    b[i + 2] = t13 + z1
    b[i + 6] = t13 - z1
    const u10 = t4 + t5
    const u11 = t5 + t6
    const u12 = t6 + t7
    const z5 = (u10 - u12) * C6
    const z2 = C2_MENOS_C6 * u10 + z5
    const z4 = C2_MAIS_C6 * u12 + z5
    const z3 = u11 * C4
    const z11 = t7 + z3
    const z13 = t7 - z3
    b[i + 5] = z13 + z2
    b[i + 3] = z13 - z2
    b[i + 1] = z11 + z4
    b[i + 7] = z11 - z4
  }
  for (let i = 0; i < 8; i++) {
    const t0 = b[i] + b[i + 56]
    const t7 = b[i] - b[i + 56]
    const t1 = b[i + 8] + b[i + 48]
    const t6 = b[i + 8] - b[i + 48]
    const t2 = b[i + 16] + b[i + 40]
    const t5 = b[i + 16] - b[i + 40]
    const t3 = b[i + 24] + b[i + 32]
    const t4 = b[i + 24] - b[i + 32]
    const t10 = t0 + t3
    const t13 = t0 - t3
    const t11 = t1 + t2
    const t12 = t1 - t2
    b[i] = t10 + t11
    b[i + 32] = t10 - t11
    const z1 = (t12 + t13) * C4
    b[i + 16] = t13 + z1
    b[i + 48] = t13 - z1
    const u10 = t4 + t5
    const u11 = t5 + t6
    const u12 = t6 + t7
    const z5 = (u10 - u12) * C6
    const z2 = C2_MENOS_C6 * u10 + z5
    const z4 = C2_MAIS_C6 * u12 + z5
    const z3 = u11 * C4
    const z11 = t7 + z3
    const z13 = t7 - z3
    b[i + 40] = z13 + z2
    b[i + 24] = z13 - z2
    b[i + 8] = z11 + z4
    b[i + 56] = z11 - z4
  }
}

// Para cada posição k do ziguezague: 1 / (passo · 8 · s[linha] · s[coluna]) — quantizar vira uma multiplicação
function divisores(tabela) {
  const d = new Float64Array(64)
  for (let k = 0; k < 64; k++) {
    const i = ZIGUEZAGUE[k]
    d[k] = 1 / (tabela[i] * 8 * ESCALA_AAN[i >> 3] * ESCALA_AAN[i & 7])
  }
  return d
}

/**
 * Codifica um JPEG baseline (DCT sequencial, 8 bits, Huffman com as tabelas típicas), YCbCr no padrão JFIF.
 *   rgb8            Uint8Array RGB (3 por pixel) ou o RGBA de `paraBytes` (4 por pixel; o alfa é ignorado)
 *   qualidade       1 a 100, escala do libjpeg (padrão 90)
 *   subamostragem   '444' (croma inteira, padrão: é exportação de foto) ou '420' (croma pela metade nos dois eixos)
 * Devolve só a imagem com o APP0 do JFIF; perfil, EXIF e XMP entram depois, por `embutirNoJpeg`.
 */
export function codificarJpeg({ largura, altura, rgb8, qualidade = 90, subamostragem = '444' }) {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 1 || altura < 1 || largura > 65535 || altura > 65535) {
    throw new Error('JPEG: largura e altura precisam ser inteiros de 1 a 65535')
  }
  if (!(rgb8 instanceof Uint8Array || rgb8 instanceof Uint8ClampedArray)) throw new Error('JPEG: rgb8 precisa ser Uint8Array ou Uint8ClampedArray')
  const canais = rgb8.length === largura * altura * 3 ? 3 : rgb8.length === largura * altura * 4 ? 4 : 0
  if (!canais) throw new Error('JPEG: rgb8 não tem largura × altura × 3 (nem × 4) amostras')
  if (subamostragem !== '444' && subamostragem !== '420') throw new Error(`JPEG: subamostragem desconhecida: ${subamostragem}`)
  const meio = subamostragem === '420'

  const qLuz = tabelaDeQuantizacao(Q_LUZ, qualidade)
  const qCroma = tabelaDeQuantizacao(Q_CROMA, qualidade)
  const divLuz = divisores(qLuz)
  const divCroma = divisores(qCroma)
  const dcLuz = codigosDe(HUFFMAN.dcLuz)
  const acLuz = codigosDe(HUFFMAN.acLuz)
  const dcCroma = codigosDe(HUFFMAN.dcCroma)
  const acCroma = codigosDe(HUFFMAN.acCroma)

  // ── cabeçalhos ──
  const cabeca = [Uint8Array.of(0xff, SOI)]
  // APP0 JFIF 1.02, sem unidade (proporção 1:1), sem miniatura
  cabeca.push(segmento(APP0, ascii('JFIF\0'), Uint8Array.of(1, 2, 0, 0, 1, 0, 1, 0, 0)))
  const dqt = (id, tabela) =>
    segmento(
      0xdb,
      Uint8Array.of(id),
      Uint8Array.from(ZIGUEZAGUE, (i) => tabela[i]),
    )
  cabeca.push(dqt(0, qLuz), dqt(1, qCroma))
  const amostragemLuz = meio ? 0x22 : 0x11
  // SOF0: precisão 8, altura, largura, 3 componentes (id, fatores H|V, tabela de quantização)
  cabeca.push(segmento(0xc0, Uint8Array.of(8, altura >> 8, altura & 0xff, largura >> 8, largura & 0xff, 3, 1, amostragemLuz, 0, 2, 0x11, 1, 3, 0x11, 1)))
  const dht = (classeEId, t) => segmento(0xc4, Uint8Array.of(classeEId), Uint8Array.from(t.bits), Uint8Array.from(t.valores))
  cabeca.push(dht(0x00, HUFFMAN.dcLuz), dht(0x10, HUFFMAN.acLuz), dht(0x01, HUFFMAN.dcCroma), dht(0x11, HUFFMAN.acCroma))
  // SOS: 3 componentes (id, tabelas DC|AC), seleção espectral 0..63, aproximação 0
  cabeca.push(segmento(SOS, Uint8Array.of(3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0)))

  // ── dados comprimidos ──
  let saida = new Uint8Array(Math.max(65536, (largura * altura) >> 1))
  let pos = 0
  let acumulador = 0
  let pendentes = 0
  const escrever = (codigo, n) => {
    acumulador = (acumulador << n) | codigo
    pendentes += n
    while (pendentes >= 8) {
      const b = (acumulador >>> (pendentes - 8)) & 0xff
      saida[pos++] = b
      if (b === 0xff) saida[pos++] = 0 // byte de enchimento (F.1.2.3)
      pendentes -= 8
    }
    acumulador &= (1 << pendentes) - 1
  }

  const bloco = new Float64Array(64)
  const coef = new Int32Array(64)
  // Um bloco 8×8 de um plano (já com −128), DCT, quantização e Huffman. Devolve o DC, para a diferença do próximo.
  function codificarBloco(plano, inicio, passo, div, dcAnterior, dc, ac) {
    for (let l = 0, o = inicio, d = 0; l < 8; l++, o += passo, d += 8) {
      bloco[d] = plano[o]
      bloco[d + 1] = plano[o + 1]
      bloco[d + 2] = plano[o + 2]
      bloco[d + 3] = plano[o + 3]
      bloco[d + 4] = plano[o + 4]
      bloco[d + 5] = plano[o + 5]
      bloco[d + 6] = plano[o + 6]
      bloco[d + 7] = plano[o + 7]
    }
    dct(bloco)
    let ultimo = 0
    for (let k = 0; k < 64; k++) {
      const v = bloco[ZIGUEZAGUE[k]] * div[k]
      const q = v < 0 ? -((0.5 - v) | 0) : (v + 0.5) | 0
      coef[k] = q
      if (q !== 0) ultimo = k
    }
    // DC: categoria (quantos bits tem a diferença) e depois os bits; negativo vai em complemento de um (F.1.2.1)
    const diferenca = coef[0] - dcAnterior
    if (diferenca === 0) escrever(dc.codigo[0], dc.tamanho[0])
    else {
      const abs = diferenca < 0 ? -diferenca : diferenca
      const n = 32 - Math.clz32(abs)
      escrever(dc.codigo[n], dc.tamanho[n])
      escrever(diferenca < 0 ? (diferenca - 1) & ((1 << n) - 1) : diferenca, n)
    }
    // AC: (corrida de zeros, categoria); 16 zeros seguidos = F0; fim de bloco = 00 (F.1.2.2)
    let zeros = 0
    for (let k = 1; k <= ultimo; k++) {
      const v = coef[k]
      if (v === 0) {
        zeros++
        continue
      }
      while (zeros > 15) {
        escrever(ac.codigo[0xf0], ac.tamanho[0xf0])
        zeros -= 16
      }
      const abs = v < 0 ? -v : v
      const n = 32 - Math.clz32(abs)
      const simbolo = (zeros << 4) | n
      escrever(ac.codigo[simbolo], ac.tamanho[simbolo])
      escrever(v < 0 ? (v - 1) & ((1 << n) - 1) : v, n)
      zeros = 0
    }
    if (ultimo < 63) escrever(ac.codigo[0], ac.tamanho[0])
    return coef[0]
  }

  const lado = meio ? 16 : 8 // lado da unidade mínima (MCU) em pixels
  const colunas = Math.ceil(largura / lado)
  const linhasDeMcu = Math.ceil(altura / lado)
  const larguraCheia = colunas * lado
  const larguraCroma = meio ? larguraCheia >> 1 : larguraCheia
  // uma faixa de MCUs por vez: Y em resolução cheia; Cb e Cr cheios (4:4:4) ou pela metade (4:2:0)
  const Y = new Float32Array(larguraCheia * lado)
  const Cb = new Float32Array(larguraCroma * 8)
  const Cr = new Float32Array(larguraCroma * 8)
  const cbLinha = new Float32Array(larguraCheia)
  const crLinha = new Float32Array(larguraCheia)
  const porBloco = 6 * 1024 // folga de saída por MCU: o pior caso de um bloco fica abaixo de 512 bytes
  let dcY = 0
  let dcCb = 0
  let dcCr = 0

  for (let my = 0; my < linhasDeMcu; my++) {
    if (meio) {
      Cb.fill(0)
      Cr.fill(0)
    }
    for (let l = 0; l < lado; l++) {
      const y = Math.min(altura - 1, my * lado + l)
      const yo = l * larguraCheia
      let i = y * largura * canais
      // RGB → YCbCr de faixa cheia (JFIF), já com o deslocamento de −128 do nível
      for (let x = 0; x < largura; x++, i += canais) {
        const r = rgb8[i]
        const g = rgb8[i + 1]
        const b = rgb8[i + 2]
        Y[yo + x] = 0.299 * r + 0.587 * g + 0.114 * b - 128
        cbLinha[x] = -0.168735892 * r - 0.331264108 * g + 0.5 * b
        crLinha[x] = 0.5 * r - 0.418687589 * g - 0.081312411 * b
      }
      // borda: repete o último pixel até fechar o bloco
      for (let x = largura; x < larguraCheia; x++) {
        Y[yo + x] = Y[yo + largura - 1]
        cbLinha[x] = cbLinha[largura - 1]
        crLinha[x] = crLinha[largura - 1]
      }
      if (meio) {
        // croma: média de 2×2 (o centro dos quatro pixels, que é onde o JFIF põe a amostra)
        const co = (l >> 1) * larguraCroma
        for (let x = 0, c = 0; x < larguraCheia; x += 2, c++) {
          Cb[co + c] += (cbLinha[x] + cbLinha[x + 1]) * 0.25
          Cr[co + c] += (crLinha[x] + crLinha[x + 1]) * 0.25
        }
      } else {
        Cb.set(cbLinha, yo)
        Cr.set(crLinha, yo)
      }
    }
    for (let mx = 0; mx < colunas; mx++) {
      if (pos + porBloco > saida.length) {
        const maior = new Uint8Array(saida.length * 2)
        maior.set(saida.subarray(0, pos))
        saida = maior
      }
      if (meio) {
        const x = mx * 16
        dcY = codificarBloco(Y, x, larguraCheia, divLuz, dcY, dcLuz, acLuz)
        dcY = codificarBloco(Y, x + 8, larguraCheia, divLuz, dcY, dcLuz, acLuz)
        dcY = codificarBloco(Y, 8 * larguraCheia + x, larguraCheia, divLuz, dcY, dcLuz, acLuz)
        dcY = codificarBloco(Y, 8 * larguraCheia + x + 8, larguraCheia, divLuz, dcY, dcLuz, acLuz)
        dcCb = codificarBloco(Cb, mx * 8, larguraCroma, divCroma, dcCb, dcCroma, acCroma)
        dcCr = codificarBloco(Cr, mx * 8, larguraCroma, divCroma, dcCr, dcCroma, acCroma)
      } else {
        const x = mx * 8
        dcY = codificarBloco(Y, x, larguraCheia, divLuz, dcY, dcLuz, acLuz)
        dcCb = codificarBloco(Cb, x, larguraCheia, divCroma, dcCb, dcCroma, acCroma)
        dcCr = codificarBloco(Cr, x, larguraCheia, divCroma, dcCr, dcCroma, acCroma)
      }
    }
  }
  // fecha o último byte com bits 1 (F.1.2.3)
  if (pendentes > 0) escrever((1 << (8 - pendentes)) - 1, 8 - pendentes)
  return juntar([...cabeca, saida.subarray(0, pos), Uint8Array.of(0xff, EOI)])
}
