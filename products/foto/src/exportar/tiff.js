// TIFF RGB de 8 e 16 bits: o arquivo de impressão e de arquivo morto. Baseline, em tiras, sem compressão ou com
// Deflate e predição horizontal. Perfil ICC, XMP e EXIF vão nas tags de sempre, para qualquer programa achar.
//
// Especificação: TIFF 6.0 (Adobe, 1992).
//   seção 2   cabeçalho, diretório (IFD), tipos; entradas em ordem crescente de tag; valor de até 4 bytes mora na
//             própria entrada, o resto fica fora, em posição par
//   seção 6   RGB baseline: ImageWidth, ImageLength, BitsPerSample, Compression, PhotometricInterpretation = 2,
//             StripOffsets, SamplesPerPixel, RowsPerStrip, StripByteCounts, XResolution, YResolution, ResolutionUnit
//   seção 14  predição horizontal (Predictor = 2): diferença entre amostras vizinhas do mesmo canal; em 16 bits a
//             diferença é da palavra de 16 bits, não do byte
// Suplementos: Compression = 8 é o Deflate/zlib (TIFF Technical Note 2 e suplemento 2 da Adobe); ICCProfile = 34675
// (ICC.1:2010, anexo B.4); XMP = 700 (XMP parte 3, 3.2.3.1, tipo BYTE); ExifIFD = 34665 e GPS = 34853 (EXIF 2.32).
//
// O arquivo sai em ordem de bytes pequena ('II') com o diretório no começo e as tiras depois: quem lê só o início do
// arquivo (a ficha da foto na biblioteca) já acha tudo.
//
// As peças de diretório (`montarDiretorio`, `montarBlocoTiff`, `lerBlocoTiff`) são as mesmas que escrevem o bloco EXIF
// do JPEG em exif-escrever.js: EXIF é um TIFF pequeno.

import { comprimirZlib, conferirImagem, descomprimirZlib, temCompressao } from './png.js'

/** Tipos de campo do TIFF 6.0 (seção 2). */
export const TIPO = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RACIONAL: 5, INDEFINIDO: 7, SLONG: 9, SRACIONAL: 10 }
const TAMANHO = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8]

export const TAG = {
  largura: 256,
  altura: 257,
  bits: 258,
  compressao: 259,
  fotometria: 262,
  descricao: 270,
  fabricante: 271,
  modelo: 272,
  tiras: 273,
  orientacao: 274,
  amostras: 277,
  linhasPorTira: 278,
  bytesPorTira: 279,
  resolucaoX: 282,
  resolucaoY: 283,
  planos: 284,
  unidade: 296,
  programa: 305,
  data: 306,
  autor: 315,
  preditor: 317,
  xmp: 700,
  direitos: 33432,
  exif: 34665,
  icc: 34675,
  gps: 34853,
}

// Tags que apontam para outro diretório (EXIF 2.32, 4.6.3): Exif, GPS e Interoperabilidade
const FILHOS = new Set([34665, 34853, 40965])
// O que o EXIF traz no diretório principal e que um TIFF também leva no dele (o resto do diretório é a estrutura da imagem)
const DO_EXIF_NO_IFD0 = new Set([270, 271, 272, 305, 306, 315, 33432])

const TIRA = 1 << 20 // tiras de cerca de 1 MiB: nem uma tira do tamanho da foto, nem milhares de pedacinhos
const par = (n) => (n + 1) & ~1

// ─────────── diretórios: escrever ───────────

/**
 * Uma entrada de diretório é `{ tag, tipo, valores }`:
 *   ASCII               texto (vai em UTF-8 com o zero final; o EXIF pede ASCII, e ASCII puro é UTF-8)
 *   BYTE, INDEFINIDO    Uint8Array (ou lista de números)
 *   SHORT, LONG, SLONG  número ou lista
 *   RACIONAL, SRACIONAL par [numerador, denominador] ou lista de pares
 * ou `{ tag, filho: diretório }` para um diretório dentro do outro (ExifIFD, GPS).
 * Um diretório é `{ entradas: [...] }`.
 */
function corpo(entrada) {
  const { tipo, valores } = entrada
  if (tipo === TIPO.ASCII) {
    const texto = new TextEncoder().encode(String(valores))
    const bytes = new Uint8Array(texto.length + 1)
    bytes.set(texto)
    return { n: bytes.length, bytes }
  }
  if (tipo === TIPO.BYTE || tipo === TIPO.INDEFINIDO) {
    const bytes = valores instanceof Uint8Array ? valores : Uint8Array.from(valores)
    return { n: bytes.length, bytes }
  }
  const racional = tipo === TIPO.RACIONAL || tipo === TIPO.SRACIONAL
  let lista = Array.isArray(valores) ? valores : [valores]
  if (racional && !Array.isArray(lista[0])) lista = [lista]
  const bytes = new Uint8Array(lista.length * TAMANHO[tipo])
  const v = new DataView(bytes.buffer)
  lista.forEach((x, i) => {
    if (tipo === TIPO.SHORT) v.setUint16(i * 2, x, true)
    else if (tipo === TIPO.LONG) v.setUint32(i * 4, x, true)
    else if (tipo === TIPO.SLONG) v.setInt32(i * 4, x, true)
    else if (tipo === TIPO.RACIONAL) {
      v.setUint32(i * 8, x[0], true)
      v.setUint32(i * 8 + 4, x[1], true)
    } else if (tipo === TIPO.SRACIONAL) {
      v.setInt32(i * 8, x[0], true)
      v.setInt32(i * 8 + 4, x[1], true)
    } else if (tipo === 6) v.setInt8(i, x)
    else if (tipo === 8) v.setInt16(i * 2, x, true)
    else if (tipo === 11) v.setFloat32(i * 4, x, true)
    else if (tipo === 12) v.setFloat64(i * 8, x, true)
    else throw new Error(`TIFF: tipo de campo ${tipo} não é escrito aqui`)
  })
  return { n: lista.length, bytes }
}

function preparar(diretorio) {
  const entradas = diretorio.entradas
    .filter((e) => e && (e.filho ? e.filho.entradas.length > 0 : e.valores !== undefined && e.valores !== null))
    .map((e) => (e.filho ? { tag: e.tag, filho: preparar(e.filho) } : { tag: e.tag, tipo: e.tipo, ...corpo(e) }))
    .sort((a, b) => a.tag - b.tag)
  for (let i = 1; i < entradas.length; i++) if (entradas[i].tag === entradas[i - 1].tag) throw new Error(`TIFF: tag ${entradas[i].tag} repetida no diretório`)
  let tamanho = 2 + entradas.length * 12 + 4
  for (const e of entradas) tamanho += e.filho ? e.filho.tamanho : e.bytes.length > 4 ? par(e.bytes.length) : 0
  return { entradas, tamanho: par(tamanho) }
}

function gravar(saida, v, pos, base, pronto) {
  const { entradas } = pronto
  v.setUint16(pos, entradas.length, true)
  let fora = pos + 2 + entradas.length * 12 + 4 // "próximo diretório" fica em zero: não há outro
  entradas.forEach((e, i) => {
    const p = pos + 2 + i * 12
    v.setUint16(p, e.tag, true)
    if (e.filho) {
      v.setUint16(p + 2, TIPO.LONG, true)
      v.setUint32(p + 4, 1, true)
      v.setUint32(p + 8, base + fora, true)
      gravar(saida, v, fora, base, e.filho)
      fora += e.filho.tamanho
      return
    }
    v.setUint16(p + 2, e.tipo, true)
    v.setUint32(p + 4, e.n, true)
    if (e.bytes.length <= 4) saida.set(e.bytes, p + 8)
    else {
      v.setUint32(p + 8, base + fora, true)
      saida.set(e.bytes, fora)
      fora += par(e.bytes.length)
    }
  })
}

/**
 * Serializa um diretório (com os filhos e os valores que não cabem na entrada) para ser posto na posição
 * `deslocamento` de um TIFF de ordem pequena. Sempre com número par de bytes.
 */
export function montarDiretorio(diretorio, deslocamento = 8) {
  const pronto = preparar(diretorio)
  const saida = new Uint8Array(pronto.tamanho)
  gravar(saida, new DataView(saida.buffer), 0, deslocamento, pronto)
  return saida
}

/** Quantos bytes `montarDiretorio` vai ocupar (para saber onde começam as tiras antes de escrever). */
export const tamanhoDoDiretorio = (diretorio) => preparar(diretorio).tamanho

const CABECALHO = [0x49, 0x49, 42, 0, 8, 0, 0, 0] // 'II', 42, primeiro diretório na posição 8

/** Um TIFF só de diretório: cabeçalho + diretório. É o bloco EXIF que vai no APP1 do JPEG e no eXIf do PNG. */
export function montarBlocoTiff(diretorio) {
  const dir = montarDiretorio(diretorio, 8)
  const saida = new Uint8Array(8 + dir.length)
  saida.set(CABECALHO)
  saida.set(dir, 8)
  return saida
}

// ─────────── diretórios: ler ───────────

function lerDiretorio(bytes, v, le, pos, base, fundo) {
  if (pos + 2 > bytes.length) throw new Error('TIFF: diretório fora do arquivo')
  const n = v.getUint16(pos, le)
  if (pos + 2 + n * 12 > bytes.length) throw new Error('TIFF: diretório cortado')
  const diretorio = { entradas: [], filhos: {}, proximo: 0 }
  for (let i = 0; i < n; i++) {
    const p = pos + 2 + i * 12
    const tag = v.getUint16(p, le)
    const tipo = v.getUint16(p + 2, le)
    const qtd = v.getUint32(p + 4, le)
    const tam = (TAMANHO[tipo] ?? 1) * qtd
    const onde = tam <= 4 ? p + 8 : base + v.getUint32(p + 8, le)
    if (onde + tam > bytes.length) throw new Error(`TIFF: valor da tag ${tag} fora do arquivo`)
    let valores
    if (tipo === TIPO.ASCII) {
      let fim = onde
      while (fim < onde + tam && bytes[fim] !== 0) fim++
      valores = new TextDecoder().decode(bytes.subarray(onde, fim))
    } else if (tipo === TIPO.BYTE || tipo === TIPO.INDEFINIDO || !TAMANHO[tipo]) valores = bytes.slice(onde, onde + tam)
    else {
      valores = new Array(qtd)
      for (let k = 0; k < qtd; k++) {
        const q = onde + k * TAMANHO[tipo]
        if (tipo === TIPO.SHORT) valores[k] = v.getUint16(q, le)
        else if (tipo === TIPO.LONG) valores[k] = v.getUint32(q, le)
        else if (tipo === TIPO.SLONG) valores[k] = v.getInt32(q, le)
        else if (tipo === TIPO.RACIONAL) valores[k] = [v.getUint32(q, le), v.getUint32(q + 4, le)]
        else if (tipo === TIPO.SRACIONAL) valores[k] = [v.getInt32(q, le), v.getInt32(q + 4, le)]
        else if (tipo === 6) valores[k] = v.getInt8(q)
        else if (tipo === 8) valores[k] = v.getInt16(q, le)
        else if (tipo === 11) valores[k] = v.getFloat32(q, le)
        else valores[k] = v.getFloat64(q, le)
      }
    }
    diretorio.entradas.push({ tag, tipo, n: qtd, valores })
    if (FILHOS.has(tag) && fundo < 3 && typeof valores[0] === 'number') {
      try {
        diretorio.filhos[tag] = lerDiretorio(bytes, v, le, base + valores[0], base, fundo + 1)
      } catch {
        // ponteiro estragado para um diretório opcional: segue sem ele
      }
    }
  }
  const fim = pos + 2 + n * 12
  if (fim + 4 <= bytes.length) diretorio.proximo = v.getUint32(fim, le)
  return diretorio
}

/**
 * Lê o diretório principal de um bloco TIFF (um arquivo .tif ou o bloco EXIF de um JPEG), nas duas ordens de bytes.
 * → { le, diretorio: { entradas: [{ tag, tipo, n, valores }], filhos: { 34665: diretório, … }, proximo } }
 */
export function lerBlocoTiff(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) throw new Error('TIFF: bloco curto demais')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ordem = v.getUint16(0)
  if (ordem !== 0x4949 && ordem !== 0x4d4d) throw new Error('TIFF: ordem de bytes desconhecida')
  const le = ordem === 0x4949
  if (v.getUint16(2, le) !== 42) throw new Error('TIFF: número mágico errado')
  return { le, diretorio: lerDiretorio(bytes, v, le, v.getUint32(4, le), 0, 0) }
}

/** A entrada de uma tag num diretório lido (ou undefined). */
export const entradaDe = (diretorio, tag) => diretorio?.entradas.find((e) => e.tag === tag)

/** O valor de uma tag: o texto, os bytes, ou o primeiro número (`todos: true` devolve a lista). */
export function valorDe(diretorio, tag, { todos = false } = {}) {
  const e = entradaDe(diretorio, tag)
  if (!e) return undefined
  if (typeof e.valores === 'string' || e.valores instanceof Uint8Array) return e.valores
  return todos ? e.valores : e.valores[0]
}

// ─────────── escrever a imagem ───────────

const MAQUINA_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

// Predição horizontal (seção 14), do fim para o começo de cada linha, canal a canal. Não toca na entrada.
function prever8(linhas, largura, canais) {
  const passo = largura * canais
  for (let inicio = 0; inicio < linhas.length; inicio += passo) {
    for (let i = inicio + passo - 1; i >= inicio + canais; i--) linhas[i] = (linhas[i] - linhas[i - canais]) & 0xff
  }
  return linhas
}

function prever16(linhas, largura, canais) {
  const passo = largura * canais
  for (let inicio = 0; inicio < linhas.length; inicio += passo) {
    for (let i = inicio + passo - 1; i >= inicio + canais; i--) linhas[i] = (linhas[i] - linhas[i - canais]) & 0xffff
  }
  return linhas
}

// Amostras de 16 bits → bytes em ordem pequena (a do arquivo)
function bytesDe16(amostras) {
  if (MAQUINA_LE) return new Uint8Array(amostras.buffer, amostras.byteOffset, amostras.byteLength)
  const saida = new Uint8Array(amostras.length * 2)
  for (let i = 0, j = 0; i < amostras.length; i++, j += 2) {
    saida[j] = amostras[i] & 0xff
    saida[j + 1] = amostras[i] >>> 8
  }
  return saida
}

// Linhas [y0, y1) como RGB de 8 bits sem alfa. Com entrada RGB devolve uma vista (sem cópia) quando `copiar` é falso.
function linhas8(dados, largura, entrada, y0, y1, copiar) {
  if (entrada === 3) {
    const vista = dados.subarray(y0 * largura * 3, y1 * largura * 3)
    return copiar ? Uint8Array.from(vista) : vista
  }
  const saida = new Uint8Array((y1 - y0) * largura * 3)
  for (let i = y0 * largura * 4, j = 0; j < saida.length; i += 4, j += 3) {
    saida[j] = dados[i]
    saida[j + 1] = dados[i + 1]
    saida[j + 2] = dados[i + 2]
  }
  return saida
}

function diretorioDoExif(exif) {
  if (!exif) return null
  if (exif instanceof Uint8Array) return lerBlocoTiff(exif).diretorio
  if (Array.isArray(exif.entradas)) return exif
  throw new Error('TIFF: exif precisa ser o bloco de montarExif ou um diretório')
}

// Um diretório lido volta a ser um diretório de escrever (os filhos viram entradas com `filho`)
function deLido(diretorio) {
  const entradas = diretorio.entradas.filter((e) => !FILHOS.has(e.tag)).map((e) => ({ tag: e.tag, tipo: e.tipo, valores: e.valores }))
  for (const [tag, filho] of Object.entries(diretorio.filhos ?? {})) entradas.push({ tag: Number(tag), filho: deLido(filho) })
  return { entradas }
}

/**
 * Escreve um TIFF RGB.
 *   dados        Uint8Array RGB (ou o RGBA de `paraBytes`; o alfa é descartado) com `bits: 8`; Uint16Array RGB com `bits: 16`
 *   compressao   'nenhuma' (padrão) ou 'deflate' (zlib com predição horizontal). Aparelho sem CompressionStream
 *                grava sem compressão: a tag Compression diz sempre o que foi feito
 *   icc          bytes do perfil (tag 34675)        xmp   texto ou bytes do pacote (tag 700)
 *   exif         o bloco de `montarExif` (ou o diretório de `camposExif`): câmera, programa, data, autor e direitos vão
 *                para o diretório principal; exposição, lente e afins para o ExifIFD; local, se houver, para o GPS
 *   orientacao   1..8 (EXIF/TIFF); o padrão é 1, porque a exportação já entrega os pixels de pé
 *   ppi          resolução declarada. 300 é a convenção de impressão; é só a dica de tamanho físico, não muda pixel
 * Devolve uma promessa (a compressão do aparelho é assíncrona).
 */
export async function escreverTiff({ largura, altura, dados, canais = 3, bits = 8, icc, exif, xmp, orientacao = 1, compressao = 'nenhuma', ppi = 300 }) {
  const entrada = conferirImagem({ largura, altura, dados, bits, canais }, 'TIFF')
  if (compressao !== 'nenhuma' && compressao !== 'deflate') throw new Error(`TIFF: compressão desconhecida: ${compressao}`)
  if (!(orientacao >= 1 && orientacao <= 8)) throw new Error('TIFF: orientação precisa ser de 1 a 8')
  const comprimir = compressao === 'deflate' && temCompressao()
  const bytesPorLinha = largura * 3 * (bits / 8)
  const linhasPorTira = Math.max(1, Math.min(altura, Math.floor(TIRA / bytesPorLinha)))
  const quantas = Math.ceil(altura / linhasPorTira)

  // as tiras: vistas sobre a entrada (sem compressão) ou os fluxos zlib (Deflate)
  const tiras = []
  for (let t = 0; t < quantas; t++) {
    const y0 = t * linhasPorTira
    const y1 = Math.min(altura, y0 + linhasPorTira)
    let bytes
    if (bits === 8) {
      bytes = linhas8(dados, largura, entrada, y0, y1, comprimir)
      if (comprimir) prever8(bytes, largura, 3)
    } else {
      const amostras = dados.subarray(y0 * largura * 3, y1 * largura * 3)
      bytes = bytesDe16(comprimir ? prever16(Uint16Array.from(amostras), largura, 3) : amostras)
    }
    tiras.push(comprimir ? await comprimirZlib(bytes) : bytes)
  }

  const E = (tag, tipo, valores) => ({ tag, tipo, valores })
  const pacote = typeof xmp === 'string' ? new TextEncoder().encode(xmp) : xmp
  const entradas = [
    E(TAG.largura, TIPO.LONG, largura),
    E(TAG.altura, TIPO.LONG, altura),
    E(TAG.bits, TIPO.SHORT, [bits, bits, bits]),
    E(TAG.compressao, TIPO.SHORT, comprimir ? 8 : 1),
    E(TAG.fotometria, TIPO.SHORT, 2),
    E(
      TAG.tiras,
      TIPO.LONG,
      tiras.map(() => 0),
    ), // posições de verdade entram depois de medir o diretório
    E(TAG.orientacao, TIPO.SHORT, orientacao),
    E(TAG.amostras, TIPO.SHORT, 3),
    E(TAG.linhasPorTira, TIPO.LONG, linhasPorTira),
    E(
      TAG.bytesPorTira,
      TIPO.LONG,
      tiras.map((t) => t.length),
    ),
    E(TAG.resolucaoX, TIPO.RACIONAL, [Math.round(ppi), 1]),
    E(TAG.resolucaoY, TIPO.RACIONAL, [Math.round(ppi), 1]),
    E(TAG.planos, TIPO.SHORT, 1),
    E(TAG.unidade, TIPO.SHORT, 2), // polegada
  ]
  if (comprimir) entradas.push(E(TAG.preditor, TIPO.SHORT, 2))
  if (pacote?.length) entradas.push(E(TAG.xmp, TIPO.BYTE, pacote))
  if (icc?.length) entradas.push(E(TAG.icc, TIPO.INDEFINIDO, icc))
  const doExif = diretorioDoExif(exif)
  if (doExif) {
    // bloco lido traz os filhos à parte; diretório de `camposExif` já os traz como entradas
    const d = doExif.filhos ? deLido(doExif) : doExif
    for (const e of d.entradas) {
      if (e.filho) entradas.push(e)
      else if (DO_EXIF_NO_IFD0.has(e.tag)) entradas.push(e)
    }
  }

  const diretorio = { entradas }
  let pos = 8 + tamanhoDoDiretorio(diretorio)
  const posicoes = tiras.map((t) => {
    const onde = pos
    pos += par(t.length)
    return onde
  })
  entradas.find((e) => e.tag === TAG.tiras).valores = posicoes
  if (pos > 0xffffffff) throw new Error('TIFF: a imagem passa de 4 GiB (seria preciso BigTIFF)')

  const saida = new Uint8Array(pos)
  saida.set(CABECALHO)
  saida.set(montarDiretorio(diretorio, 8), 8)
  tiras.forEach((t, i) => saida.set(t, posicoes[i]))
  return saida
}

// ─────────── ler a imagem (o bastante para a ida e volta) ───────────

/**
 * Lê um TIFF RGB (ou RGBA) de 8 ou 16 bits em tiras, sem compressão ou com Deflate, com ou sem predição horizontal,
 * nas duas ordens de bytes.
 * → { largura, altura, bits, canais, dados, compressao: 'nenhuma' | 'deflate', preditor, orientacao, ppi, icc, xmp,
 *     exif (o diretório ExifIFD, ou null), gps, diretorio, le }
 */
export async function lerTiff(bytes) {
  const { le, diretorio } = lerBlocoTiff(bytes)
  const um = (tag, padrao) => valorDe(diretorio, tag) ?? padrao
  const largura = um(TAG.largura)
  const altura = um(TAG.altura)
  const bitsPorAmostra = valorDe(diretorio, TAG.bits, { todos: true }) ?? [1]
  const bits = bitsPorAmostra[0]
  const canais = um(TAG.amostras, 1)
  const codigo = um(TAG.compressao, 1)
  const preditor = um(TAG.preditor, 1)
  if (!largura || !altura) throw new Error('TIFF: falta o tamanho da imagem')
  if (um(TAG.fotometria) !== 2 || (canais !== 3 && canais !== 4)) throw new Error('TIFF: só RGB')
  if ((bits !== 8 && bits !== 16) || bitsPorAmostra.some((b) => b !== bits)) throw new Error('TIFF: só 8 ou 16 bits por amostra')
  if (um(TAG.planos, 1) !== 1) throw new Error('TIFF: só amostras entrelaçadas (PlanarConfiguration = 1)')
  if (codigo !== 1 && codigo !== 8 && codigo !== 32946) throw new Error(`TIFF: compressão ${codigo} não é lida aqui`)
  if (preditor !== 1 && preditor !== 2) throw new Error(`TIFF: predição ${preditor} não é lida aqui`)
  const posicoes = valorDe(diretorio, TAG.tiras, { todos: true })
  const tamanhos = valorDe(diretorio, TAG.bytesPorTira, { todos: true })
  if (!posicoes || !tamanhos || posicoes.length !== tamanhos.length) throw new Error('TIFF: só imagem em tiras')

  const bytesPorAmostra = bits / 8
  const cru = new Uint8Array(largura * altura * canais * bytesPorAmostra)
  let q = 0
  for (let t = 0; t < posicoes.length; t++) {
    if (posicoes[t] + tamanhos[t] > bytes.length) throw new Error('TIFF: tira fora do arquivo')
    let tira = bytes.subarray(posicoes[t], posicoes[t] + tamanhos[t])
    if (codigo !== 1) tira = await descomprimirZlib(tira)
    if (q + tira.length > cru.length) throw new Error('TIFF: as tiras têm mais dados do que a imagem')
    cru.set(tira, q)
    q += tira.length
  }
  if (q !== cru.length) throw new Error('TIFF: as tiras têm menos dados do que a imagem')

  let dados
  if (bits === 8) dados = cru
  else {
    dados = new Uint16Array(largura * altura * canais)
    const v = new DataView(cru.buffer)
    for (let i = 0; i < dados.length; i++) dados[i] = v.getUint16(i * 2, le)
  }
  if (preditor === 2) {
    const passo = largura * canais
    const mascara = bits === 8 ? 0xff : 0xffff
    for (let inicio = 0; inicio < dados.length; inicio += passo) {
      for (let i = inicio + canais; i < inicio + passo; i++) dados[i] = (dados[i] + dados[i - canais]) & mascara
    }
  }
  const resolucao = valorDe(diretorio, TAG.resolucaoX)
  const pacote = valorDe(diretorio, TAG.xmp)
  return {
    largura,
    altura,
    bits,
    canais,
    dados,
    compressao: codigo === 1 ? 'nenhuma' : 'deflate',
    preditor,
    orientacao: um(TAG.orientacao, 1),
    ppi: resolucao ? resolucao[0] / resolucao[1] : null,
    icc: valorDe(diretorio, TAG.icc) ?? null,
    xmp: pacote instanceof Uint8Array ? new TextDecoder().decode(pacote) : (pacote ?? null),
    exif: diretorio.filhos[TAG.exif] ?? null,
    gps: diretorio.filhos[TAG.gps] ?? null,
    diretorio,
    le,
  }
}
