// Leitor próprio de DNG, sem dependência: diretórios TIFF, tags de cor do DNG e o mosaico do sensor (sem compressão,
// de 8 a 16 bits, e JPEG lossless). É o que dá ao motor o que o LibRaw não entrega (dois iluminantes, ForwardMatrix,
// BaselineExposure, NoiseProfile, opcodes) e é o plano B quando o WASM não carrega. O mosaico sai idêntico, bit a
// bit, ao do LibRaw nos DNG de teste.
//
// DNG que já vem sem mosaico (PhotometricInterpretation = LinearRaw, três amostras por pixel) também sai daqui, como
// Negativo de cfa 'linear': sem compressão, JPEG lossless (ProRAW do iPhone) e JPEG com perdas em blocos (o "DNG com
// perdas" do Lightroom, decodificado por jpeg.js). JPEG XL e Deflate são recusados dizendo o que fazer.
//
// Fontes: especificação DNG 1.4 (Adobe; tags, ordem de linearização, BlackLevel, ActiveArea), TIFF 6.0, TIFF/EP
// (CFAPattern), ITU-T T.81 anexo H (JPEG lossless: processo SOF3, preditores 1 a 7, intervalos de reinício) e
// EXIF 2.32 (LightSource). Nada de código de terceiros.
//
// Campos a mais que este leitor põe no Negativo (opcionais, fora do mínimo do contrato):
//   recorte    { x, y, largura, altura }  DefaultCrop, em pixels a partir do canto da área ativa
//   opcodes    { lista1?, lista2?, lista3? }  já lidos por opcodes.js
//   cor.matrizes[].calibracao   AnalogBalance · CameraCalibration, só quando não é a identidade (xyzParaCamera já a
//              inclui; com ForwardMatrix a conta é FM · diag(1/neutroRef) · calibracao⁻¹, DNG 1.4 cap. 6)
//   cor.matrizes[].cameraParaXyzD50   é a ForwardMatrix do arquivo: vale para a câmera JÁ equilibrada (neutro = 1,1,1)

import { criarNegativo, R, G, B } from './negativo.js'
import { criarFonte, abrirTiff, lerIfd, numeros, numero, lerExif, lerCamera } from './exif.js'
import { extrairPrevia } from './previa.js'
import { lerOpcodes, escreverOpcodes } from './opcodes.js'
import { decodificarJpeg } from './jpeg.js'
import { ErroRaw } from './erro.js'

export { ErroRaw }

const T = {
  subtipo: 0x00fe,
  largura: 0x0100,
  altura: 0x0101,
  bits: 0x0102,
  compressao: 0x0103,
  foto: 0x0106,
  tiras: 0x0111,
  amostras: 0x0115,
  linhasPorTira: 0x0116,
  tamanhoDasTiras: 0x0117,
  larguraDoBloco: 0x0142,
  alturaDoBloco: 0x0143,
  blocos: 0x0144,
  tamanhoDosBlocos: 0x0145,
  subIfds: 0x014a,
  formatoDaAmostra: 0x0153,
  cfaDim: 0x828d,
  cfaPadrao: 0x828e,
  versaoDng: 0xc612,
  cfaLayout: 0xc617,
  linearizacao: 0xc618,
  pretoDim: 0xc619,
  preto: 0xc61a,
  pretoDeltaH: 0xc61b,
  pretoDeltaV: 0xc61c,
  branco: 0xc61d,
  recorteOrigem: 0xc61f,
  recorteTamanho: 0xc620,
  matriz1: 0xc621,
  matriz2: 0xc622,
  calibracao1: 0xc623,
  calibracao2: 0xc624,
  balancoAnalogico: 0xc627,
  neutro: 0xc628,
  brancoXY: 0xc629,
  exposicaoBase: 0xc62a,
  iluminante1: 0xc65a,
  iluminante2: 0xc65b,
  areaAtiva: 0xc68d,
  direta1: 0xc714,
  direta2: 0xc715,
  opcodes1: 0xc740,
  opcodes2: 0xc741,
  opcodes3: 0xc74e,
  perfilRuido: 0xc761,
  planar: 0x011c,
}

const CFA = 32803
const LINEAR = 34892

const JPEG_COM_PERDAS = 34892
const JPEG_XL = 52546

/** O que dizer de uma compressão que este leitor não abre: o nome dela e, quando há saída, o que a pessoa pode fazer. */
function semCompressao(compressao) {
  if (compressao === JPEG_XL) {
    return new ErroRaw(
      'sem-suporte',
      'DNG gravado em JPEG XL: este leitor ainda não abre. No iPhone, grave o ProRAW como "JPEG sem perdas" (Ajustes › Câmera › Formatos); ' +
        'um DNG que já existe pode ser regravado no Adobe DNG Converter com compatibilidade anterior ao JPEG XL (DNG 1.4).',
    )
  }
  if (compressao === 8 || compressao === 32946) {
    return new ErroRaw(
      'sem-suporte',
      'DNG com compressão Deflate (ponto flutuante ou HDR): este leitor cobre sem compressão, JPEG lossless e JPEG com perdas. ' +
        'Regrave no Adobe DNG Converter sem a opção de dado em ponto flutuante.',
    )
  }
  return new ErroRaw('sem-suporte', `DNG com compressão de código ${compressao}: este leitor cobre sem compressão, JPEG lossless e JPEG com perdas.`)
}

// Temperatura de cada código de iluminante (EXIF 2.32, LightSource). As lâmpadas fluorescentes valem o meio da faixa
// que o EXIF dá a cada uma (D 5700–7100 K, N 4600–5400, W 3900–4500, WW 3200–3700, L 2600–3250), que é como a
// especificação DNG pede para interpolar entre os dois iluminantes.
const KELVIN_DO_ILUMINANTE = {
  1: 5500,
  2: 4200,
  3: 2850,
  4: 5500,
  9: 5500,
  10: 6500,
  11: 7500,
  12: 6400,
  13: 5000,
  14: 4200,
  15: 3450,
  16: 2925,
  17: 2850,
  18: 5500,
  19: 6500,
  20: 5500,
  21: 6500,
  22: 7500,
  23: 5000,
  24: 3200,
}
// Na escrita: o código padrão (A, D50, D55, D65, D75, estúdio) da temperatura mais próxima
const ILUMINANTES_DE_ESCRITA = [17, 24, 23, 20, 21, 22]

const mdc = (a, b) => (b ? mdc(b, a % b) : a)
const mmc = (a, b) => (a / mdc(a, b)) * b
const resto = (a, n) => ((a % n) + n) % n

const vezes = (a, b) => {
  const m = new Array(9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return m
}

const inversa = (m) => {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const D = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * D + c * C
  return [
    A / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    D / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    C / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ]
}

const IDENTIDADE = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const ehIdentidade = (m) => m.every((v, i) => Math.abs(v - IDENTIDADE[i]) < 1e-9)

// ------------------------------------------------------------------------------------------------- diretórios

function abrir(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    throw new ErroRaw('nao-e-raw', 'O arquivo é um JPEG, não um DNG: não tem o dado do sensor.')
  }
  let tiff = null
  const fonte = criarFonte(u8)
  try {
    tiff = u8.length >= 8 ? abrirTiff(fonte, 0) : null
  } catch {
    tiff = null
  }
  if (!tiff || tiff.magia !== 42) throw new ErroRaw('nao-e-raw', 'O arquivo não é um DNG (não começa como TIFF).')
  const ifds = []
  const vistos = new Set()
  const visitar = (deslocamento, fundo) => {
    while (deslocamento && fundo < 4 && !vistos.has(deslocamento) && ifds.length < 64) {
      vistos.add(deslocamento)
      let d
      try {
        d = lerIfd(tiff, deslocamento)
      } catch {
        return
      }
      ifds.push(d.tags)
      try {
        for (const sub of numeros(tiff, d.tags.get(T.subIfds), 16)) visitar(sub, fundo + 1)
      } catch {
        // SubIFDs ilegível: segue com o que há
      }
      deslocamento = d.proximo
    }
  }
  visitar(tiff.primeiro, 0)
  if (ifds.length === 0) throw new ErroRaw('corrompido', 'DNG sem diretório legível.')
  const ifd0 = ifds[0]
  if (!ifd0.has(T.versaoDng)) throw new ErroRaw('nao-e-raw', 'O arquivo é um TIFF sem a marca de DNG (DNGVersion).')
  const um = (tags, tag) => numero(tiff, tags.get(tag))
  // o dado do sensor: NewSubFileType = 0 (imagem principal) com fotometria de mosaico (CFA) ou LinearRaw
  const cru = ifds.find((t) => (um(t, T.subtipo) ?? 0) === 0 && (um(t, T.foto) === CFA || um(t, T.foto) === LINEAR))
  return { u8, fonte, tiff, ifds, ifd0, cru, um }
}

function kelvinDe(codigo) {
  return KELVIN_DO_ILUMINANTE[codigo] || 0
}

/** Cor, exposição base, ruído, recorte e opcodes: tudo o que não depende de decodificar o mosaico. */
function tagsDeCor(a) {
  const { tiff, ifd0, cru, um } = a
  const acha = (tag) => (cru && cru.get(tag)) || ifd0.get(tag)
  const lista = (tag, n) => {
    const e = acha(tag)
    if (!e) return null
    const v = numeros(tiff, e, n)
    return v.length === n && v.every(Number.isFinite) ? v : null
  }
  const saida = { versao: numeros(tiff, ifd0.get(T.versaoDng), 4).join('.') }

  const ab = lista(T.balancoAnalogico, 3)
  const balanco = ab ? [ab[0], 0, 0, 0, ab[1], 0, 0, 0, ab[2]] : IDENTIDADE
  const matrizes = []
  for (const [tagM, tagC, tagF, tagI] of [
    [T.matriz1, T.calibracao1, T.direta1, T.iluminante1],
    [T.matriz2, T.calibracao2, T.direta2, T.iluminante2],
  ]) {
    const cm = lista(tagM, 9)
    if (!cm) continue
    const calibracao = vezes(balanco, lista(tagC, 9) || IDENTIDADE)
    const m = { kelvin: kelvinDe(um(ifd0, tagI)), xyzParaCamera: vezes(calibracao, cm) }
    const fm = lista(tagF, 9)
    if (fm) m.cameraParaXyzD50 = fm
    if (!ehIdentidade(calibracao)) m.calibracao = calibracao
    matrizes.push(m)
  }
  if (acha(T.matriz1) && matrizes.length === 0) throw new ErroRaw('sem-suporte', 'DNG de câmera com mais de três cores: este leitor só cobre RGB.')
  // Dois iluminantes só servem para interpolar se os dois têm temperatura conhecida e diferente. Iluminante
  // "desconhecido" numa matriz só não atrapalha (não há o que interpolar): vale D65 como nome, não como conta.
  let usadas = matrizes.filter((m) => m.kelvin > 0)
  if (usadas.length === 2 && usadas[0].kelvin === usadas[1].kelvin) usadas = [usadas[1]]
  if (usadas.length === 0 && matrizes.length > 0) usadas = [{ ...matrizes[matrizes.length - 1], kelvin: 6500 }]
  saida.cor = { origem: 'dng', matrizes: usadas }

  const neutro = lista(T.neutro, 3)
  saida.wb = {}
  if (neutro && neutro.every((v) => v > 0)) {
    saida.cor.neutroComoFotografado = neutro
    saida.wb.comoFotografado = [neutro[1] / neutro[0], 1, neutro[1] / neutro[2]]
  }
  const xy = lista(T.brancoXY, 2)
  if (xy) saida.brancoXY = xy

  saida.exposicaoBase = lista(T.exposicaoBase, 1)?.[0] ?? 0

  const ruido = acha(T.perfilRuido)
  if (ruido && (ruido.n === 2 || ruido.n === 6)) {
    const v = numeros(tiff, ruido, 6)
    if (v.every(Number.isFinite)) {
      saida.perfilRuido = [0, 1, 2].map((c) => ({ escala: v[ruido.n === 6 ? c * 2 : 0], deslocamento: v[ruido.n === 6 ? c * 2 + 1 : 1] }))
    }
  }

  const origem = lista(T.recorteOrigem, 2)
  const tamanho = lista(T.recorteTamanho, 2)
  if (origem && tamanho && tamanho[0] > 0 && tamanho[1] > 0) {
    saida.recorte = { x: Math.round(origem[0]), y: Math.round(origem[1]), largura: Math.round(tamanho[0]), altura: Math.round(tamanho[1]) }
  }

  const opcodes = {}
  for (const [nome, tag] of [
    ['lista1', T.opcodes1],
    ['lista2', T.opcodes2],
    ['lista3', T.opcodes3],
  ]) {
    const e = cru && cru.get(tag)
    if (e && e.n >= 4) opcodes[nome] = lerOpcodes(a.fonte.fatia(e.onde, e.onde + e.n))
  }
  if (Object.keys(opcodes).length) saida.opcodes = opcodes

  if (cru) {
    saida.linear = um(cru, T.foto) === LINEAR
    saida.compressao = um(cru, T.compressao) ?? 1
  }
  return saida
}

/**
 * Só os campos de cor de um DNG, sem tocar no mosaico (serve também para os DNG que este leitor não decodifica):
 * { versao, cor: { origem: 'dng', matrizes, neutroComoFotografado? }, wb, exposicaoBase, perfilRuido?, recorte?,
 *   opcodes?, brancoXY?, linear?, compressao?, mosaico?: { largura, altura, bits, area, cfa, preto, branco } }.
 */
export function lerTagsDng(bytes) {
  const a = abrir(bytes)
  const tags = tagsDeCor(a)
  // com mosaico de verdade, também a descrição dele (o LibRaw arredonda o preto do DNG para inteiro; aqui é o racional)
  if (a.cru && !tags.linear) tags.mosaico = geometria(a)
  return tags
}

// ------------------------------------------------------------------------------------------------ JPEG lossless

const tabelas = new Map()

// Tabela de Huffman como consulta direta de 16 bits: (comprimento << 8) | categoria. Os blocos de um DNG repetem a
// mesma tabela centenas de vezes; por isso fica guardada pela própria definição.
export function tabelaHuffman(u8, q, total) {
  let chave = ''
  for (let i = q; i < q + 16 + total; i++) chave += String.fromCharCode(u8[i])
  let lut = tabelas.get(chave)
  if (lut) return lut
  lut = new Uint16Array(65536)
  let codigo = 0
  let k = q + 16
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < u8[q + l - 1]; i++, k++) {
      const primeiro = codigo << (16 - l)
      lut.fill((l << 8) | u8[k], primeiro, primeiro + (1 << (16 - l)))
      codigo++
    }
    codigo <<= 1
  }
  if (tabelas.size > 64) tabelas.clear()
  tabelas.set(chave, lut)
  return lut
}

/**
 * JPEG lossless (ITU-T T.81, processo SOF3, Huffman) de `tamanho` bytes a partir de `inicio`.
 * Devolve { dados: Uint16Array (linhas × colunas × componentes, intercalados), colunas, linhas, componentes, bits,
 * preditor }. Cobre os preditores 1 a 7, transformação de ponto e intervalos de reinício (H.1.2.1: a primeira linha
 * de cada intervalo prevê pelo vizinho da esquerda e a primeira amostra por 2^(P−Pt−1)).
 */
export function decodificarJpegSemPerdas(u8, inicio = 0, tamanho = u8.length - inicio) {
  const fim = inicio + tamanho
  const erro = (m) => new ErroRaw('corrompido', `JPEG lossless inválido: ${m}`)
  const u16 = (p) => (u8[p] << 8) | u8[p + 1]
  if (tamanho < 4 || u16(inicio) !== 0xffd8) throw erro('sem o marcador de início')
  let p = inicio + 2
  const huff = []
  const seletor = []
  let bitsDaAmostra = 0
  let linhas = 0
  let colunas = 0
  let nc = 0
  let preditor = 1
  let pt = 0
  let reinicio = 0
  for (;;) {
    if (p + 4 > fim) throw erro('cabeçalho truncado')
    const marcador = u16(p)
    const tam = u16(p + 2)
    const seg = p + 4
    if (marcador === 0xffc3) {
      bitsDaAmostra = u8[seg]
      linhas = u16(seg + 1)
      colunas = u16(seg + 3)
      nc = u8[seg + 5]
    } else if (marcador === 0xffc4) {
      let q = seg
      while (q + 17 <= p + 2 + tam) {
        let total = 0
        for (let i = 0; i < 16; i++) total += u8[q + 1 + i]
        huff[u8[q] & 15] = tabelaHuffman(u8, q + 1, total)
        q += 17 + total
      }
    } else if (marcador === 0xffdd) reinicio = u16(seg)
    else if (marcador === 0xffda) {
      const n = u8[seg]
      for (let i = 0; i < n; i++) seletor[i] = u8[seg + 2 + i * 2] >> 4
      preditor = u8[seg + 1 + n * 2]
      pt = u8[seg + 3 + n * 2] & 15
      p += 2 + tam
      break
    } else if ((marcador & 0xfff0) === 0xffc0 && marcador !== 0xffc8 && marcador !== 0xffcc) {
      throw new ErroRaw('sem-suporte', `JPEG com perdas no lugar do mosaico (processo SOF${marcador & 15}).`)
    } else if ((marcador & 0xff00) !== 0xff00) throw erro('marcador fora do lugar')
    p += 2 + tam
  }
  if (!(linhas > 0 && colunas > 0 && nc > 0 && nc <= 4 && bitsDaAmostra >= 2 && bitsDaAmostra <= 16)) throw erro('quadro sem medidas')
  if (preditor < 1 || preditor > 7) throw erro(`preditor ${preditor}`)
  const luts = []
  for (let c = 0; c < nc; c++) {
    if (!huff[seletor[c]]) throw erro('componente sem tabela de Huffman')
    luts.push(huff[seletor[c]])
  }
  const porLinha = colunas * nc
  const saida = new Uint16Array(linhas * porLinha)
  const inicial = 1 << (bitsDaAmostra - pt - 1)
  const linhasPorIntervalo = reinicio > 0 ? reinicio / colunas : 0
  if (reinicio > 0 && !Number.isInteger(linhasPorIntervalo))
    throw new ErroRaw('sem-suporte', 'JPEG lossless com intervalo de reinício que não fecha linhas inteiras.')
  let bits = 0
  let nbits = 0
  let i = 0
  for (let y = 0; y < linhas; y++) {
    const topo = y === 0 || (linhasPorIntervalo > 0 && y % linhasPorIntervalo === 0)
    if (topo && y > 0) {
      // reinício: joga fora os bits de enchimento e pula o marcador RSTn
      bits = 0
      nbits = 0
      while (p + 1 < fim && !(u8[p] === 0xff && u8[p + 1] >= 0xd0 && u8[p + 1] <= 0xd7)) p++
      p += 2
    }
    for (let x = 0, c = 0; x < porLinha; x++, i++) {
      let px
      if (x < nc) px = topo ? inicial : saida[i - porLinha]
      else if (topo || preditor === 1) px = saida[i - nc]
      else {
        const ra = saida[i - nc]
        const rb = saida[i - porLinha]
        const rc = saida[i - porLinha - nc]
        if (preditor === 2) px = rb
        else if (preditor === 3) px = rc
        else if (preditor === 4) px = ra + rb - rc
        else if (preditor === 5) px = ra + ((rb - rc) >> 1)
        else if (preditor === 6) px = rb + ((ra - rc) >> 1)
        else px = (ra + rb) >> 1
      }
      // garante 16 bits no acumulador; FF 00 é o byte FF, e qualquer outro marcador encerra os dados (entra zero)
      while (nbits <= 16) {
        let b = p < fim ? u8[p++] : 0
        if (b === 0xff) {
          if (u8[p] === 0) p++
          else {
            p--
            b = 0
          }
        }
        bits = ((bits << 8) | b) >>> 0
        nbits += 8
      }
      const e = luts[c][(bits >>> (nbits - 16)) & 0xffff]
      const s = e & 255
      if (e === 0) throw erro('código de Huffman desconhecido')
      nbits -= e >> 8
      let d = 0
      if (s === 16) d = 32768
      else if (s > 0) {
        while (nbits <= 16) {
          let b = p < fim ? u8[p++] : 0
          if (b === 0xff) {
            if (u8[p] === 0) p++
            else {
              p--
              b = 0
            }
          }
          bits = ((bits << 8) | b) >>> 0
          nbits += 8
        }
        d = (bits >>> (nbits - s)) & ((1 << s) - 1)
        nbits -= s
        if (d < 1 << (s - 1)) d -= (1 << s) - 1
      }
      saida[i] = px + d
      if (++c === nc) c = 0
    }
  }
  if (pt > 0) for (let k = 0; k < saida.length; k++) saida[k] <<= pt
  return { dados: saida, colunas, linhas, componentes: nc, bits: bitsDaAmostra, preditor }
}

// ------------------------------------------------------------------------------------------------------ mosaico

// DNG 1.4: amostras de 8 e 16 bits seguem a ordem dos bytes do arquivo; as demais (10, 12, 14) vêm empacotadas com
// o bit mais significativo primeiro, e cada linha começa em byte inteiro.
function desempacotar(u8, pos, bits, n, le, saida, o) {
  if (bits === 16) {
    if (le) for (let i = 0, q = pos; i < n; i++, q += 2) saida[o + i] = u8[q] | (u8[q + 1] << 8)
    else for (let i = 0, q = pos; i < n; i++, q += 2) saida[o + i] = (u8[q] << 8) | u8[q + 1]
    return
  }
  if (bits === 8) {
    for (let i = 0; i < n; i++) saida[o + i] = u8[pos + i]
    return
  }
  const mascara = (1 << bits) - 1
  let acumulado = 0
  let tem = 0
  let q = pos
  for (let i = 0; i < n; i++) {
    while (tem < bits) {
      acumulado = ((acumulado << 8) | u8[q++]) >>> 0
      tem += 8
    }
    saida[o + i] = (acumulado >>> (tem - bits)) & mascara
    tem -= bits
  }
}

function decodificarMosaico(a) {
  const { u8, tiff, cru, um } = a
  const largura = um(cru, T.largura)
  const altura = um(cru, T.altura)
  const bits = um(cru, T.bits)
  const compressao = um(cru, T.compressao) ?? 1
  if (!(largura > 0 && altura > 0)) throw new ErroRaw('corrompido', 'DNG sem as medidas do sensor.')
  if ((um(cru, T.amostras) ?? 1) !== 1) throw new ErroRaw('sem-suporte', 'DNG com mais de uma amostra por pixel no dado do sensor.')
  if ((um(cru, T.formatoDaAmostra) ?? 1) !== 1 || !(bits >= 8 && bits <= 16))
    throw new ErroRaw('sem-suporte', `DNG com ${bits} bits ou ponto flutuante: este leitor cobre inteiros de 8 a 16 bits.`)
  if (compressao === JPEG_COM_PERDAS) throw new ErroRaw('sem-suporte', 'DNG com o mosaico em JPEG com perdas: este leitor só cobre o JPEG com perdas na imagem já sem mosaico.')
  if (compressao !== 1 && compressao !== 7) throw semCompressao(compressao)
  const emBlocos = cru.has(T.blocos)
  const posicoes = numeros(tiff, cru.get(emBlocos ? T.blocos : T.tiras), 1 << 20)
  const tamanhos = numeros(tiff, cru.get(emBlocos ? T.tamanhoDosBlocos : T.tamanhoDasTiras), 1 << 20)
  const lb = emBlocos ? um(cru, T.larguraDoBloco) : largura
  const ab = emBlocos ? um(cru, T.alturaDoBloco) : Math.min(um(cru, T.linhasPorTira) ?? altura, altura)
  const semPosicao = !(lb > 0 && ab > 0) || posicoes.length === 0 || tamanhos.length < posicoes.length
  if (semPosicao) throw new ErroRaw('corrompido', 'DNG sem a posição do dado do sensor.')
  const porLinha = Math.ceil(largura / lb)
  const dados = new Uint16Array(largura * altura)
  const bytesPorLinha = Math.ceil((lb * bits) / 8)
  const temp = new Uint16Array(lb)
  for (let i = 0; i < posicoes.length; i++) {
    const x0 = (i % porLinha) * lb
    const y0 = Math.floor(i / porLinha) * ab
    if (y0 >= altura) break
    const l = Math.min(lb, largura - x0)
    if (posicoes[i] + tamanhos[i] > u8.length) throw new ErroRaw('corrompido', 'DNG truncado: o dado do sensor passa do fim do arquivo.')
    if (compressao === 1) {
      const linhas = Math.min(ab, altura - y0)
      if (linhas * bytesPorLinha > tamanhos[i]) throw new ErroRaw('corrompido', 'DNG com tira menor que o declarado.')
      for (let y = 0; y < linhas; y++) {
        if (l === lb) desempacotar(u8, posicoes[i] + y * bytesPorLinha, bits, lb, tiff.le, dados, (y0 + y) * largura + x0)
        else {
          desempacotar(u8, posicoes[i] + y * bytesPorLinha, bits, lb, tiff.le, temp, 0)
          dados.set(temp.subarray(0, l), (y0 + y) * largura + x0)
        }
      }
    } else {
      // O quadro do JPEG pode ter outro formato que o bloco (2 componentes com metade da largura; o dobro da largura
      // e metade da altura): o que vale é a sequência de amostras, redobrada na largura do bloco.
      const j = decodificarJpegSemPerdas(u8, posicoes[i], tamanhos[i])
      const linhas = Math.min(Math.floor(j.dados.length / lb), altura - y0)
      for (let y = 0; y < linhas; y++) dados.set(j.dados.subarray(y * lb, y * lb + l), (y0 + y) * largura + x0)
    }
  }
  const tabela = cru.get(T.linearizacao)
  if (tabela && tabela.n > 0) {
    const curva = Uint16Array.from(numeros(tiff, tabela, 65536))
    const ultimo = curva.length - 1
    for (let i = 0; i < dados.length; i++) dados[i] = curva[dados[i] < ultimo ? dados[i] : ultimo]
  }
  return { largura, altura, dados, bits }
}

// DNG LinearRaw: a imagem já sem mosaico, três amostras por pixel entrelaçadas (PlanarConfiguration = 1), em tiras
// ou blocos. Sem compressão (8 a 16 bits), JPEG lossless de três componentes (o ProRAW do iPhone: DNG 1.6, cap.
// "Compression") ou JPEG com perdas de 8 bits em blocos ("lossy DNG", DNG 1.4: Compression 34892; a curva que devolve
// os 8 bits ao linear vem na OpcodeList2, como MapPolynomial, e é aplicada por quem revela).
function decodificarLinear(a) {
  const { u8, tiff, cru, um } = a
  const largura = um(cru, T.largura)
  const altura = um(cru, T.altura)
  const bits = um(cru, T.bits)
  const compressao = um(cru, T.compressao) ?? 1
  const amostras = um(cru, T.amostras) ?? 1
  if (!(largura > 0 && altura > 0)) throw new ErroRaw('corrompido', 'DNG sem as medidas da imagem.')
  if (amostras !== 3) {
    const oQue = amostras === 1 ? 'monocromático' : `com ${amostras} amostras por pixel`
    throw new ErroRaw('sem-suporte', `DNG já revelado ${oQue} (LinearRaw): este leitor cobre três cores.`)
  }
  if ((um(cru, T.planar) ?? 1) !== 1) throw new ErroRaw('sem-suporte', 'DNG já revelado com os canais em planos separados: este leitor cobre os canais entrelaçados.')
  if (compressao !== 1 && compressao !== 7 && compressao !== JPEG_COM_PERDAS) throw semCompressao(compressao)
  if ((um(cru, T.formatoDaAmostra) ?? 1) !== 1 || !(bits >= 8 && bits <= 16))
    throw new ErroRaw('sem-suporte', `DNG com ${bits} bits ou ponto flutuante: este leitor cobre inteiros de 8 a 16 bits.`)
  const emBlocos = cru.has(T.blocos)
  const posicoes = numeros(tiff, cru.get(emBlocos ? T.blocos : T.tiras), 1 << 20)
  const tamanhos = numeros(tiff, cru.get(emBlocos ? T.tamanhoDosBlocos : T.tamanhoDasTiras), 1 << 20)
  const lb = emBlocos ? um(cru, T.larguraDoBloco) : largura
  const ab = emBlocos ? um(cru, T.alturaDoBloco) : Math.min(um(cru, T.linhasPorTira) ?? altura, altura)
  if (!(lb > 0 && ab > 0) || posicoes.length === 0 || tamanhos.length < posicoes.length) throw new ErroRaw('corrompido', 'DNG sem a posição da imagem.')
  const porLinha = Math.ceil(largura / lb)
  const dados = new Uint16Array(largura * altura * 3)
  const bytesPorLinha = Math.ceil((lb * 3 * bits) / 8)
  const temp = new Uint16Array(lb * 3)
  for (let i = 0; i < posicoes.length; i++) {
    const x0 = (i % porLinha) * lb
    const y0 = Math.floor(i / porLinha) * ab
    if (y0 >= altura) break
    const l = Math.min(lb, largura - x0)
    const linhas = Math.min(ab, altura - y0)
    if (posicoes[i] + tamanhos[i] > u8.length) throw new ErroRaw('corrompido', 'DNG truncado: a imagem passa do fim do arquivo.')
    if (compressao === 1) {
      if (linhas * bytesPorLinha > tamanhos[i]) throw new ErroRaw('corrompido', 'DNG com tira menor que o declarado.')
      for (let y = 0; y < linhas; y++) {
        if (l === lb) desempacotar(u8, posicoes[i] + y * bytesPorLinha, bits, lb * 3, tiff.le, dados, ((y0 + y) * largura + x0) * 3)
        else {
          desempacotar(u8, posicoes[i] + y * bytesPorLinha, bits, lb * 3, tiff.le, temp, 0)
          dados.set(temp.subarray(0, l * 3), ((y0 + y) * largura + x0) * 3)
        }
      }
    } else if (compressao === 7) {
      // como no mosaico: vale a sequência de amostras do quadro, redobrada na largura do bloco (3 por pixel)
      const j = decodificarJpegSemPerdas(u8, posicoes[i], tamanhos[i])
      const cabem = Math.min(Math.floor(j.dados.length / (lb * 3)), linhas)
      if (cabem < linhas) throw new ErroRaw('corrompido', 'DNG com bloco de JPEG lossless menor que o declarado.')
      for (let y = 0; y < linhas; y++) dados.set(j.dados.subarray(y * lb * 3, y * lb * 3 + l * 3), ((y0 + y) * largura + x0) * 3)
    } else {
      const j = decodificarJpeg(u8, { inicio: posicoes[i], fim: posicoes[i] + tamanhos[i] })
      if (j.canais !== 3 || j.largura < l || j.altura < linhas) throw new ErroRaw('corrompido', 'DNG com bloco de JPEG de tamanho diferente do declarado.')
      for (let y = 0; y < linhas; y++) {
        const o = ((y0 + y) * largura + x0) * 3
        const q = y * j.largura * 3
        for (let k = 0; k < l * 3; k++) dados[o + k] = j.dados[q + k]
      }
    }
  }
  const tabela = cru.get(T.linearizacao)
  if (tabela && tabela.n > 0) {
    const curva = Uint16Array.from(numeros(tiff, tabela, 65536))
    const ultimo = curva.length - 1
    for (let i = 0; i < dados.length; i++) dados[i] = curva[dados[i] < ultimo ? dados[i] : ultimo]
  }
  // área ativa, preto e branco por amostra (DNG 1.4: BlackLevel tem RepeatRows·RepeatCols·SamplesPerPixel valores)
  const ativa = cru.has(T.areaAtiva) ? numeros(tiff, cru.get(T.areaAtiva), 4) : [0, 0, altura, largura]
  const area = { x: ativa[1], y: ativa[0], largura: ativa[3] - ativa[1], altura: ativa[2] - ativa[0] }
  const rep = cru.has(T.pretoDim) ? numeros(tiff, cru.get(T.pretoDim), 2) : [1, 1]
  const delta = (tag) => cru.has(tag) && numeros(tiff, cru.get(tag), 65536).some((v) => v !== 0)
  if (rep[0] !== 1 || rep[1] !== 1 || delta(T.pretoDeltaH) || delta(T.pretoDeltaV))
    throw new ErroRaw('sem-suporte', 'DNG já revelado com nível de preto que muda de pixel para pixel: este leitor cobre um preto por canal.')
  const niveis = cru.has(T.preto) ? numeros(tiff, cru.get(T.preto), 3) : [0]
  const brancos = cru.has(T.branco) ? numeros(tiff, cru.get(T.branco), 3) : [(1 << bits) - 1]
  const tres = (v) => [v[0], v[1] ?? v[0], v[2] ?? v[0]]
  return { largura, altura, dados, bits, area, preto: { porCanal: tres(niveis) }, branco: { declarado: tres(brancos) }, compressao }
}

/**
 * Preto do contrato a partir de uma função que dá o preto de cada sensel em coordenadas da ÁREA ATIVA (é como o DNG
 * e o LibRaw definem o padrão repetido). `linhas` × `colunas` é o período (múltiplo do lado do CFA) já em
 * coordenadas do sensor. Devolve { porCanal, padrao? }: porCanal é a média por cor e o padrão guarda só a sobra.
 */
export function pretoDoPadrao({ linhas, colunas, valor, cfa, area }) {
  const total = new Float64Array(linhas * colunas)
  const cor = new Uint8Array(linhas * colunas)
  const soma = [0, 0, 0]
  const conta = [0, 0, 0]
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const la = l - area.y
      const ca = c - area.x
      const k = cfa.padrao[resto(la, cfa.lado) * cfa.lado + resto(ca, cfa.lado)]
      const v = valor(la, ca)
      total[l * colunas + c] = v
      cor[l * colunas + c] = k
      soma[k] += v
      conta[k]++
    }
  }
  const porCanal = [0, 1, 2].map((k) => (conta[k] ? soma[k] / conta[k] : 0))
  const valores = new Float32Array(linhas * colunas)
  let sobra = 0
  for (let i = 0; i < valores.length; i++) {
    valores[i] = total[i] - porCanal[cor[i]]
    sobra = Math.max(sobra, Math.abs(valores[i]))
  }
  return sobra > 1e-6 ? { porCanal, padrao: { linhas, colunas, valores } } : { porCanal }
}

/**
 * Área ativa, CFA, preto e branco declarados: o que descreve o mosaico sem decodificá-lo.
 * { largura, altura, bits, area, cfa, preto, branco }
 */
function geometria(a) {
  const { tiff, cru, um } = a
  const largura = um(cru, T.largura)
  const altura = um(cru, T.altura)
  const bits = um(cru, T.bits)
  const ativa = cru.has(T.areaAtiva) ? numeros(tiff, cru.get(T.areaAtiva), 4) : [0, 0, altura, largura]
  const area = { x: ativa[1], y: ativa[0], largura: ativa[3] - ativa[1], altura: ativa[2] - ativa[0] }

  if ((um(cru, T.cfaLayout) ?? 1) !== 1) throw new ErroRaw('sem-suporte', 'DNG com mosaico deslocado (CFALayout diferente de 1).')
  const dim = numeros(tiff, cru.get(T.cfaDim), 2)
  const lado = dim[0]
  if (dim[0] !== dim[1] || (lado !== 2 && lado !== 6))
    throw new ErroRaw('sem-suporte', `DNG com mosaico ${dim.join('×')}: este leitor cobre Bayer (2×2) e X-Trans (6×6).`)
  const padrao = Uint8Array.from(numeros(tiff, cru.get(T.cfaPadrao), lado * lado))
  if (padrao.length !== lado * lado || !padrao.every((v) => v === R || v === G || v === B))
    throw new ErroRaw('sem-suporte', 'DNG com filtro que não é vermelho, verde e azul.')
  const cfa = { tipo: lado === 2 ? 'bayer' : 'xtrans', lado, padrao }

  // Preto (DNG 1.4): BlackLevel[linha mod R][coluna mod C] + DeltaH[coluna] + DeltaV[linha], tudo a partir do canto
  // da área ativa. O contrato conta o padrão do canto do sensor: pretoDoPadrao faz a troca.
  const rep = cru.has(T.pretoDim) ? numeros(tiff, cru.get(T.pretoDim), 2) : [1, 1]
  const niveis = cru.has(T.preto) ? numeros(tiff, cru.get(T.preto), rep[0] * rep[1]) : [0]
  const deltaH = cru.has(T.pretoDeltaH) ? numeros(tiff, cru.get(T.pretoDeltaH), area.largura) : null
  const deltaV = cru.has(T.pretoDeltaV) ? numeros(tiff, cru.get(T.pretoDeltaV), area.altura) : null
  const temH = !!deltaH && deltaH.some((v) => v !== 0)
  const temV = !!deltaV && deltaV.some((v) => v !== 0)
  const preto = pretoDoPadrao({
    linhas: temV ? altura : mmc(rep[0], lado),
    colunas: temH ? largura : mmc(rep[1], lado),
    cfa,
    area,
    valor: (la, ca) =>
      (niveis[resto(la, rep[0]) * rep[1] + resto(ca, rep[1])] ?? niveis[0]) +
      (temH && ca >= 0 && ca < deltaH.length ? deltaH[ca] : 0) +
      (temV && la >= 0 && la < deltaV.length ? deltaV[la] : 0),
  })

  const w = cru.has(T.branco) ? numero(tiff, cru.get(T.branco)) : (1 << bits) - 1
  return { largura, altura, bits, area, cfa, preto, branco: { declarado: [w, w, w] } }
}

/**
 * DNG → Negativo, com leitor próprio. Com mosaico (CFA) sai o Negativo de sempre; já sem mosaico (LinearRaw: ProRAW,
 * "DNG com perdas") sai o Negativo de cfa 'linear', com três amostras por pixel. Lança `ErroRaw` com o motivo quando
 * o arquivo não é DNG ou usa compressão que este leitor não cobre (Deflate, JPEG XL), dizendo o que fazer.
 */
export function lerDng(bytes, { nome } = {}) {
  const a = abrir(bytes)
  const { cru, um } = a
  if (!cru) throw new ErroRaw('sem-suporte', 'DNG sem o dado do sensor (nenhum diretório com mosaico ou imagem linear).')
  const linear = um(cru, T.foto) === LINEAR
  const lido = linear ? decodificarLinear(a) : null
  const sensor = lido ? { largura: lido.largura, altura: lido.altura, dados: lido.dados, amostras: 3 } : decodificarMosaico(a)
  const { area, cfa, preto, branco } = lido ? { area: lido.area, cfa: { tipo: 'linear' }, preto: lido.preto, branco: lido.branco } : geometria(a)
  const cor = tagsDeCor(a)
  if (cor.cor.matrizes.length === 0) throw new ErroRaw('sem-suporte', 'DNG sem matriz de cor (ColorMatrix).')
  const camera = lerCamera(a.u8)
  const previa = extrairPrevia(a.u8)

  const n = {
    tipo: 'raw',
    formato: 'dng',
    fabricante: camera.fabricante,
    modelo: camera.modelo,
    exif: lerExif(a.u8),
    sensor: lido ? sensor : { largura: sensor.largura, altura: sensor.altura, dados: sensor.dados },
    area,
    cfa,
    preto,
    branco,
    wb: cor.wb,
    cor: cor.cor,
    exposicaoBase: cor.exposicaoBase,
  }
  if (cor.perfilRuido) n.perfilRuido = cor.perfilRuido
  if (cor.recorte) n.recorte = cor.recorte
  if (cor.opcodes) n.opcodes = cor.opcodes
  // cópia: o negativo não pode segurar o arquivo inteiro na memória por causa de uma vista da prévia
  if (previa && previa.jpeg) n.previa = { jpeg: previa.jpeg.slice(), largura: previa.largura, altura: previa.altura }
  if (nome) n.nome = nome
  return criarNegativo(n)
}

// ------------------------------------------------------------------------------------------------------ escrita

const ASCII = 2
const CURTO = 3
const LONGO = 4
const RACIONAL = 5
const INDEFINIDO = 7
const SRACIONAL = 10
const DUPLO = 12
const BYTE = 1
const TAMANHO = { [BYTE]: 1, [ASCII]: 1, [CURTO]: 2, [LONGO]: 4, [RACIONAL]: 8, [INDEFINIDO]: 1, [SRACIONAL]: 8, [DUPLO]: 8 }

/** Fração n/d de um número: exata quando ele tem até seis casas, ou quando é o inverso de um inteiro (1/250 s). */
function fracao(v) {
  const inv = 1 / v
  if (v > 0 && v < 1 && Math.abs(inv - Math.round(inv)) < 1e-9 * inv) return [1, Math.round(inv)]
  let d = 1
  while (d < 1000000 && Math.abs(v * d - Math.round(v * d)) > 1e-9 * Math.max(1, Math.abs(v * d))) d *= 10
  return [Math.round(v * d), d]
}

function entrada(tag, tipo, valores) {
  let dados
  let n
  if (tipo === ASCII) {
    const s = String(valores)
    dados = new Uint8Array(s.length + 1)
    for (let i = 0; i < s.length; i++) dados[i] = s.charCodeAt(i) & 0x7f
    n = dados.length
  } else if (tipo === BYTE || tipo === INDEFINIDO) {
    dados = Uint8Array.from(valores)
    n = dados.length
  } else {
    const v = Array.isArray(valores) ? valores : [valores]
    n = v.length
    dados = new Uint8Array(n * TAMANHO[tipo])
    const vista = new DataView(dados.buffer)
    v.forEach((x, i) => {
      if (tipo === CURTO) vista.setUint16(i * 2, x, true)
      else if (tipo === LONGO) vista.setUint32(i * 4, x, true)
      else if (tipo === DUPLO) vista.setFloat64(i * 8, x, true)
      else {
        const [num, den] = fracao(x)
        if (tipo === RACIONAL) vista.setUint32(i * 8, num, true)
        else vista.setInt32(i * 8, num, true)
        vista.setUint32(i * 8 + 4, den, true)
      }
    })
  }
  return { tag, tipo, n, dados }
}

const par = (n) => n + (n & 1)
const tamanhoDoIfd = (entradas) => 2 + entradas.length * 12 + 4 + entradas.reduce((s, e) => s + (e.dados.length > 4 ? par(e.dados.length) : 0), 0)

function gravarIfd(saida, vista, pos, entradas) {
  entradas.sort((a, b) => a.tag - b.tag)
  vista.setUint16(pos, entradas.length, true)
  let fora = pos + 2 + entradas.length * 12 + 4
  entradas.forEach((e, i) => {
    const p = pos + 2 + i * 12
    vista.setUint16(p, e.tag, true)
    vista.setUint16(p + 2, e.tipo, true)
    vista.setUint32(p + 4, e.n, true)
    if (e.dados.length <= 4) saida.set(e.dados, p + 8)
    else {
      vista.setUint32(p + 8, fora, true)
      saida.set(e.dados, fora)
      fora += par(e.dados.length)
    }
  })
}

function iluminanteDe(kelvin) {
  let melhor = 21
  let distancia = Infinity
  for (const codigo of ILUMINANTES_DE_ESCRITA) {
    const d = Math.abs(1 / KELVIN_DO_ILUMINANTE[codigo] - 1 / kelvin)
    if (d < distancia) {
      distancia = d
      melhor = codigo
    }
  }
  return melhor
}

/**
 * Negativo → DNG (mosaico CFA de 16 bits sem compressão, uma tira, com as tags de cor). Existe para os testes
 * fabricarem um RAW conhecido e conferirem a leitura de volta; o arquivo é um DNG 1.4 válido (o LibRaw o abre).
 * Grava o que o contrato tem: sensor, área ativa, CFA, preto com padrão, branco, matrizes (com ForwardMatrix e
 * calibração se houver), neutro, exposição base, perfil de ruído, recorte, opcodes, EXIF básico e a prévia.
 * O branco do DNG é um número só: vale o menor dos três canais.
 */
export function escreverDng(negativo) {
  const n = negativo
  const { largura, altura, dados } = n.sensor
  const { lado, padrao } = n.cfa
  const area = n.area

  // preto de volta para coordenadas da área ativa, num bloco que fecha o período do CFA e do padrão
  const p = n.preto.padrao
  if (p && (p.linhas > 64 || p.colunas > 64)) throw new Error('escreverDng: padrão de preto grande demais (use um padrão repetido pequeno)')
  const linhas = mmc(lado, p ? p.linhas : 1)
  const colunas = mmc(lado, p ? p.colunas : 1)
  const niveis = []
  for (let la = 0; la < linhas; la++) {
    for (let ca = 0; ca < colunas; ca++) {
      const base = n.preto.porCanal[padrao[(la % lado) * lado + (ca % lado)]]
      niveis.push(base + (p ? p.valores[((la + area.y) % p.linhas) * p.colunas + ((ca + area.x) % p.colunas)] : 0))
    }
  }

  const exif = n.exif || {}
  const e0 = [
    entrada(T.subtipo, LONGO, 0),
    entrada(T.largura, LONGO, largura),
    entrada(T.altura, LONGO, altura),
    entrada(T.bits, CURTO, 16),
    entrada(T.compressao, CURTO, 1),
    entrada(T.foto, CURTO, CFA),
    entrada(0x010f, ASCII, n.fabricante || 'ZRO'),
    entrada(0x0110, ASCII, n.modelo || 'Sintetica'),
    entrada(T.tiras, LONGO, 0),
    entrada(0x0112, CURTO, exif.orientacao || 1),
    entrada(T.amostras, CURTO, 1),
    entrada(T.linhasPorTira, LONGO, altura),
    entrada(T.tamanhoDasTiras, LONGO, largura * altura * 2),
    entrada(0x011c, CURTO, 1),
    entrada(T.cfaDim, CURTO, [lado, lado]),
    entrada(T.cfaPadrao, BYTE, padrao),
    entrada(0x8769, LONGO, 0),
    entrada(T.versaoDng, BYTE, [1, 4, 0, 0]),
    entrada(0xc613, BYTE, n.opcodes ? [1, 3, 0, 0] : [1, 1, 0, 0]),
    entrada(0xc614, ASCII, `${n.fabricante || 'ZRO'} ${n.modelo || 'Sintetica'}`.trim()),
    entrada(0xc616, BYTE, [0, 1, 2]),
    entrada(T.cfaLayout, CURTO, 1),
    entrada(T.pretoDim, CURTO, [linhas, colunas]),
    entrada(T.preto, RACIONAL, niveis),
    entrada(T.branco, LONGO, Math.min(...n.branco.declarado)),
    entrada(T.areaAtiva, LONGO, [area.y, area.x, area.y + area.altura, area.x + area.largura]),
    entrada(T.exposicaoBase, SRACIONAL, n.exposicaoBase || 0),
  ]
  n.cor.matrizes.forEach((m, i) => {
    const cm = m.calibracao ? vezes(inversa(m.calibracao), m.xyzParaCamera) : m.xyzParaCamera
    e0.push(entrada(i ? T.matriz2 : T.matriz1, SRACIONAL, cm))
    e0.push(entrada(i ? T.iluminante2 : T.iluminante1, CURTO, iluminanteDe(m.kelvin)))
    if (m.calibracao) e0.push(entrada(i ? T.calibracao2 : T.calibracao1, SRACIONAL, m.calibracao))
    if (m.cameraParaXyzD50) e0.push(entrada(i ? T.direta2 : T.direta1, SRACIONAL, m.cameraParaXyzD50))
  })
  const wb = n.wb && n.wb.comoFotografado
  const neutro = n.cor.neutroComoFotografado || (wb ? [1 / wb[0], 1, 1 / wb[2]] : null)
  if (neutro) e0.push(entrada(T.neutro, RACIONAL, neutro))
  if (n.perfilRuido)
    e0.push(
      entrada(
        T.perfilRuido,
        DUPLO,
        n.perfilRuido.flatMap((c) => [c.escala, c.deslocamento]),
      ),
    )
  if (n.recorte) {
    e0.push(entrada(T.recorteOrigem, LONGO, [n.recorte.x, n.recorte.y]))
    e0.push(entrada(T.recorteTamanho, LONGO, [n.recorte.largura, n.recorte.altura]))
  }
  for (const [nome, tag] of [
    ['lista1', T.opcodes1],
    ['lista2', T.opcodes2],
    ['lista3', T.opcodes3],
  ]) {
    if (n.opcodes && n.opcodes[nome]) e0.push(entrada(tag, INDEFINIDO, escreverOpcodes(n.opcodes[nome])))
  }

  const ex = []
  if (exif.tempo > 0) ex.push(entrada(0x829a, RACIONAL, exif.tempo))
  if (exif.abertura > 0) ex.push(entrada(0x829d, RACIONAL, exif.abertura))
  if (exif.iso > 0) ex.push(exif.iso < 65535 ? entrada(0x8827, CURTO, exif.iso) : entrada(0x8833, LONGO, exif.iso))
  if (exif.data) ex.push(entrada(0x9003, ASCII, exif.data.replace(/-/g, ':').replace('T', ' ')))
  if (exif.subsegundo !== undefined) ex.push(entrada(0x9291, ASCII, String(exif.subsegundo).replace(/^0\./, '').slice(0, 9) || '0'))
  if (exif.focal > 0) ex.push(entrada(0x920a, RACIONAL, exif.focal))
  if (exif.lente) ex.push(entrada(0xa434, ASCII, exif.lente))
  if (ex.length === 0) ex.push(entrada(0x9000, INDEFINIDO, [0x30, 0x32, 0x33, 0x32])) // ExifVersion: um IFD não pode ser vazio

  // prévia: SubIFD com NewSubFileType = 1 e o JPEG numa tira (é assim que os DNG de câmera a guardam)
  const jpeg = n.previa && n.previa.jpeg
  const sub = jpeg
    ? [
        entrada(T.subtipo, LONGO, 1),
        entrada(T.largura, LONGO, n.previa.largura || 0),
        entrada(T.altura, LONGO, n.previa.altura || 0),
        entrada(T.bits, CURTO, [8, 8, 8]),
        entrada(T.compressao, CURTO, 7),
        entrada(T.foto, CURTO, 6),
        entrada(T.tiras, LONGO, 0),
        entrada(T.amostras, CURTO, 3),
        entrada(T.linhasPorTira, LONGO, n.previa.altura || 0),
        entrada(T.tamanhoDasTiras, LONGO, jpeg.length),
        entrada(0x011c, CURTO, 1),
      ]
    : null
  if (sub) e0.push(entrada(T.subIfds, LONGO, 0))

  const posExif = 8 + tamanhoDoIfd(e0)
  const posSub = posExif + tamanhoDoIfd(ex)
  const posJpeg = posSub + (sub ? tamanhoDoIfd(sub) : 0)
  const posDados = par(posJpeg + (jpeg ? jpeg.length : 0))
  const ponteiro = (lista, tag, valor) => new DataView(lista.find((e) => e.tag === tag).dados.buffer).setUint32(0, valor, true)
  ponteiro(e0, 0x8769, posExif)
  ponteiro(e0, T.tiras, posDados)
  if (sub) {
    ponteiro(e0, T.subIfds, posSub)
    ponteiro(sub, T.tiras, posJpeg)
  }

  const saida = new Uint8Array(posDados + largura * altura * 2)
  const vista = new DataView(saida.buffer)
  saida.set([0x49, 0x49, 42, 0, 8, 0, 0, 0])
  gravarIfd(saida, vista, 8, e0)
  gravarIfd(saida, vista, posExif, ex)
  if (sub) {
    gravarIfd(saida, vista, posSub, sub)
    saida.set(jpeg, posJpeg)
  }
  for (let i = 0, q = posDados; i < dados.length; i++, q += 2) {
    saida[q] = dados[i] & 255
    saida[q + 1] = dados[i] >> 8
  }
  return saida
}
