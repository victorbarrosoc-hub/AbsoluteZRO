// Apoio dos testes de src/raw: tudo fabricado com semente (nenhum binário no git). Os montadores daqui são
// independentes do código testado de propósito: o TIFF, o JPEG lossless e o CR3 de teste não usam dng.js nem
// previa.js, senão o teste conferiria o código com ele mesmo.

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const EXIGIR = process.env.FOTO_EXIGIR === '1'
// As amostras vêm de site de terceiros (scripts/amostras.mjs): a falta delas só é falha quando pedido à parte. FOTO_EXIGIR
// continua valendo para o LibRaw, que é dependência do pacote.
export const EXIGIR_AMOSTRAS = process.env.FOTO_EXIGIR_AMOSTRAS === '1'

// ------------------------------------------------------------------------------------------------- amostras

export const AMOSTRAS = [
  'adobe_5d3_lossy.dng',
  'canon_30d.cr2',
  'canon_5d3.dng',
  'canon_r6.cr3',
  'fuji_xt30ii.raf',
  'iphone_xs.dng',
  'nikon_d70s.nef',
  'pana_lx7.rw2',
  'pixel6pro.dng',
  'ricoh_gr.dng',
  'samsung_g973.dng',
  'sony_a7s.arw',
]

// FOTO_AMOSTRAS aponta outra pasta (ou uma que não existe, para conferir que os testes pulam em vez de falhar)
const pastaDasAmostras = process.env.FOTO_AMOSTRAS || path.join(raiz, '.amostras')
export const temAmostras = AMOSTRAS.every((a) => existsSync(path.join(pastaDasAmostras, a)))
export const caminhoDaAmostra = (nome) => path.join(pastaDasAmostras, nome)
export const lerAmostra = async (nome) => new Uint8Array(await readFile(caminhoDaAmostra(nome)))

/** Para um teste que precisa das amostras: pula com mensagem; com FOTO_EXIGIR_AMOSTRAS=1 a falta vira falha. */
export function precisaDeAmostras(t) {
  if (temAmostras) return true
  if (EXIGIR_AMOSTRAS) throw new Error('FOTO_EXIGIR_AMOSTRAS=1 e as amostras CC0 não estão em products/foto/.amostras (node scripts/amostras.mjs)')
  t.skip('sem as amostras CC0 em products/foto/.amostras (fora do git; node scripts/amostras.mjs baixa)')
  return false
}

let libraw
/** A classe LibRaw de node_modules, já inicializada; null se o pacote não estiver instalado. */
export async function carregarLibRaw() {
  if (libraw !== undefined) return libraw
  try {
    const { LibRaw } = await import('@colorhythm/libraw-wasm')
    await LibRaw.initialize()
    libraw = LibRaw
  } catch {
    libraw = null
  }
  return libraw
}

export function precisaDoLibRaw(t, LibRaw) {
  if (LibRaw) return true
  if (EXIGIR) throw new Error('FOTO_EXIGIR=1 e @colorhythm/libraw-wasm não carregou')
  t.skip('sem @colorhythm/libraw-wasm em node_modules')
  return false
}

// --------------------------------------------------------------------------------------------------- acaso

/** Gerador com semente (mulberry32): o mesmo número, a mesma sequência, em qualquer máquina. */
export function acaso(semente) {
  let a = semente >>> 0
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let guardado = null
  const normal = () => {
    if (guardado !== null) {
      const g = guardado
      guardado = null
      return g
    }
    const r = Math.sqrt(-2 * Math.log(1 - u()))
    const t = 2 * Math.PI * u()
    guardado = r * Math.sin(t)
    return r * Math.cos(t)
  }
  const poisson = (media) => {
    if (media <= 0) return 0
    if (media > 40) return Math.max(0, Math.round(media + Math.sqrt(media) * normal())) // aproximação normal
    const limite = Math.exp(-media)
    let k = 0
    let p = u()
    while (p > limite) {
      k++
      p *= u()
    }
    return k
  }
  return { u, normal, poisson }
}

// --------------------------------------------------------------------------------------------- negativo fabricado

const CFAS = { RGGB: [0, 1, 1, 2], GRBG: [1, 0, 2, 1], GBRG: [1, 2, 0, 1], BGGR: [2, 1, 1, 0] }
// X-Trans (o padrão 6×6 do X-T30 II, como o LibRaw o devolve)
export const XTRANS = Uint8Array.from('110112112110201021112110110112021201', Number)

/**
 * Sinal sem ruído (DN acima do preto) da cena de teste, por canal: escada exponencial de `stops` stops na
 * horizontal (faixas lisas, como um alvo de teste), quatro degraus na vertical e uma cor diferente por canal, de
 * modo que o topo estoure primeiro o verde, depois o azul e por fim o vermelho.
 */
export function cena(u, v, c, { pico, stops = 15, faixas = 60 }) {
  const degrau = Math.floor(u * faixas) / (faixas - 1)
  const vertical = 0.55 + 0.15 * Math.floor(v * 4)
  return pico * 2 ** (-stops * (1 - Math.min(1, degrau))) * vertical * [0.5, 1, 0.72][c]
}

/**
 * Negativo sintético com tudo conhecido: preto, margens mascaradas, ganho (DN² por DN), ruído de leitura (DN) e
 * nível de corte do sensor (que pode ficar abaixo do branco declarado, como na Canon 30D).
 * Cada sensel: elétrons ~ Poisson(sinal/ganho) → DN = elétrons·ganho + N(0, leitura) + preto, cortado em [0, corte].
 */
export function fabricarNegativo({
  largura = 600,
  altura = 400,
  esquerda = 0,
  topo = 0,
  direita = 0,
  cfa = 'RGGB',
  preto = 512,
  pretoPadrao = null,
  ganho = 0.5,
  leitura = 3,
  corte = 16383,
  declarado = 16383,
  pico = 4,
  stops = 15,
  semente = 1,
  exposicaoBase = 0,
  enchimento = null,
  sinal = cena,
} = {}) {
  const rng = acaso(semente)
  const xtrans = cfa === 'XTRANS'
  const lado = xtrans ? 6 : 2
  const padrao = xtrans ? XTRANS : Uint8Array.from(CFAS[cfa])
  const L = esquerda + largura + direita
  const A = topo + altura
  const dados = new Uint16Array(L * A)
  const faixa = corte - preto
  const pretoEm = (l, c) => preto + (pretoPadrao ? pretoPadrao.valores[(l % pretoPadrao.linhas) * pretoPadrao.colunas + (c % pretoPadrao.colunas)] : 0)
  for (let l = 0; l < A; l++) {
    for (let c = 0; c < L; c++) {
      const naImagem = l >= topo && c >= esquerda && c < esquerda + largura
      let v
      if (!naImagem && enchimento !== null) v = enchimento
      else {
        let s = 0
        if (naImagem) {
          const k = padrao[((l - topo) % lado) * lado + ((c - esquerda) % lado)]
          s = sinal((c - esquerda) / largura, (l - topo) / altura, k, { pico: pico * faixa, stops })
        }
        v = pretoEm(l, c) + rng.poisson(s / ganho) * ganho + leitura * rng.normal()
      }
      dados[l * L + c] = Math.max(0, Math.min(corte, Math.round(v)))
    }
  }
  const n = {
    tipo: 'raw',
    formato: 'dng',
    fabricante: 'ZRO',
    modelo: 'Sintetica',
    exif: { orientacao: 1 },
    sensor: { largura: L, altura: A, dados },
    area: { x: esquerda, y: topo, largura, altura },
    cfa: { tipo: xtrans ? 'xtrans' : 'bayer', lado, padrao },
    preto: { porCanal: [preto, preto, preto] },
    branco: { declarado: [declarado, declarado, declarado] },
    wb: { comoFotografado: [2, 1, 1.5] },
    cor: { origem: 'dng', matrizes: [{ kelvin: 6500, xyzParaCamera: [0.8, -0.2, -0.1, -0.4, 1.2, 0.2, -0.1, 0.2, 0.6] }] },
    exposicaoBase,
  }
  if (pretoPadrao) n.preto.padrao = pretoPadrao
  return n
}

// ------------------------------------------------------------------------------------------------------- JPEG

/**
 * JPEG de mentira com estrutura de verdade: SOI, APP0, quadro (SOFn) com as medidas, início de varredura, dados
 * sem FF e EOI. É o que a extração de prévia lê (ela não decodifica imagem).
 */
export function jpegFalso({ largura, altura, processo = 0, bits = 8, canais = 3, corpo = 4000, semente = 7, exif = null } = {}) {
  const rng = acaso(semente)
  const partes = [[0xff, 0xd8]]
  if (exif) partes.push([0xff, 0xe1, (exif.length + 8) >> 8, (exif.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0], exif)
  else partes.push([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const sof = [0xff, 0xc0 + processo, 0, 8 + 3 * canais, bits, altura >> 8, altura & 255, largura >> 8, largura & 255, canais]
  for (let c = 0; c < canais; c++) sof.push(c + 1, 0x11, 0)
  partes.push(sof, [0xff, 0xda, 0, 6 + 2 * canais, canais, ...Array.from({ length: canais }, (_, c) => [c + 1, 0]).flat(), 0, 63, 0])
  partes.push(Uint8Array.from({ length: corpo }, () => Math.floor(rng.u() * 255))) // nunca 0xFF
  partes.push([0xff, 0xd9])
  return juntar(partes)
}

export function juntar(partes) {
  const lista = partes.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)))
  const saida = new Uint8Array(lista.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of lista) {
    saida.set(p, o)
    o += p.length
  }
  return saida
}

// ------------------------------------------------------------------------------------------------------- TIFF

const TAM = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 12: 8, 13: 4 }

/**
 * Montador de TIFF para os testes. `blocos` é uma lista, na ordem em que vão para o arquivo:
 *   { nome, ifd: [[tag, tipo, valor]], proximo?: 'nome' }   diretório
 *   { nome, bytes }                                         dado solto (JPEG, tira, marcas do fabricante)
 * `valor`: número, lista, texto (tipo 2), Uint8Array (tipos 1 e 7), pares [n, d] (tipos 5 e 10), ou referências
 * { pos: 'nome' } (posição do bloco, contada de `base`) e { tam: 'nome' } (tamanho do bloco).
 * O primeiro bloco tem de ser o IFD0. `cabecalho` troca os 8 bytes do começo (marcas da Olympus: 12 bytes).
 * Devolve { bytes, pos: { nome → posição } }.
 */
export function montarTiff({ le = true, magia = 42, blocos, cabecalho = null }) {
  const inicio = cabecalho ? cabecalho.length : 8
  const tamDoValor = (tipo, valor) => {
    if (tipo === 2) return String(valor).length + 1
    if (valor instanceof Uint8Array) return valor.length
    const n = Array.isArray(valor) ? valor.length : 1
    return n * TAM[tipo]
  }
  const par = (n) => n + (n & 1)
  const tamanho = (b) =>
    b.bytes
      ? b.bytes.length
      : 2 + b.ifd.length * 12 + 4 + b.ifd.reduce((s, [, tipo, valor]) => s + (tamDoValor(tipo, valor) > 4 ? par(tamDoValor(tipo, valor)) : 0), 0)
  const pos = {}
  let p = inicio
  for (const b of blocos) {
    pos[b.nome] = p
    p = par(p + tamanho(b))
  }
  const bytes = new Uint8Array(p)
  const v = new DataView(bytes.buffer)
  if (cabecalho) bytes.set(cabecalho)
  else {
    bytes.set(le ? [0x49, 0x49] : [0x4d, 0x4d])
    v.setUint16(2, magia, le)
    v.setUint32(4, pos[blocos[0].nome], le)
  }
  const resolver = (x) =>
    x && typeof x === 'object' && 'pos' in x ? pos[x.pos] : x && typeof x === 'object' && 'tam' in x ? tamanho(blocos.find((b) => b.nome === x.tam)) : x
  const gravar = (onde, tipo, valor) => {
    if (tipo === 2) {
      const s = String(valor)
      for (let i = 0; i < s.length; i++) bytes[onde + i] = s.charCodeAt(i)
      return
    }
    if (valor instanceof Uint8Array) {
      bytes.set(valor, onde)
      return
    }
    const lista = Array.isArray(valor) ? valor : [valor]
    lista.forEach((bruto, i) => {
      const x = resolver(bruto)
      const q = onde + i * TAM[tipo]
      if (tipo === 1 || tipo === 7) v.setUint8(q, x)
      else if (tipo === 3) v.setUint16(q, x, le)
      else if (tipo === 4 || tipo === 13) v.setUint32(q, x, le)
      else if (tipo === 9) v.setInt32(q, x, le)
      else if (tipo === 12) v.setFloat64(q, x, le)
      else if (tipo === 5) {
        v.setUint32(q, x[0], le)
        v.setUint32(q + 4, x[1], le)
      } else if (tipo === 10) {
        v.setInt32(q, x[0], le)
        v.setInt32(q + 4, x[1], le)
      }
    })
  }
  for (const b of blocos) {
    const base = pos[b.nome]
    if (b.bytes) {
      bytes.set(b.bytes, base)
      continue
    }
    const entradas = [...b.ifd].sort((x, y) => x[0] - y[0])
    v.setUint16(base, entradas.length, le)
    let fora = base + 2 + entradas.length * 12 + 4
    entradas.forEach(([tag, tipo, valor], i) => {
      const e = base + 2 + i * 12
      const tam = tamDoValor(tipo, valor)
      v.setUint16(e, tag, le)
      v.setUint16(e + 2, tipo, le)
      v.setUint32(e + 4, tipo === 2 || valor instanceof Uint8Array ? tam : Array.isArray(valor) ? valor.length : 1, le)
      if (tam <= 4) gravar(e + 8, tipo, valor)
      else {
        v.setUint32(e + 8, fora, le)
        gravar(fora, tipo, valor)
        fora += par(tam)
      }
    })
    v.setUint32(base + 2 + entradas.length * 12, b.proximo ? pos[b.proximo] : 0, le)
  }
  return { bytes, pos }
}

// ----------------------------------------------------------------------------------------------- JPEG lossless

/**
 * Codificador de JPEG lossless (ITU-T T.81 anexo H) só para fabricar entrada de teste. Tabela de Huffman fixa:
 * categorias 0 a 15 com 5 bits e a 16 com 6. `amostras` vem intercalado por componente.
 */
export function codificarJpegSemPerdas(amostras, { colunas, linhas, componentes = 1, bits = 14, preditor = 1, linhasPorIntervalo = 0 }) {
  const nc = componentes
  const saida = []
  const u16 = (x) => saida.push(x >> 8, x & 255)
  saida.push(0xff, 0xd8)
  saida.push(0xff, 0xc3)
  u16(8 + 3 * nc)
  saida.push(bits)
  u16(linhas)
  u16(colunas)
  saida.push(nc)
  for (let c = 0; c < nc; c++) saida.push(c + 1, 0x11, 0)
  saida.push(0xff, 0xc4)
  u16(2 + 1 + 16 + 17)
  saida.push(0, 0, 0, 0, 0, 16, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  for (let s = 0; s <= 16; s++) saida.push(s)
  if (linhasPorIntervalo > 0) {
    saida.push(0xff, 0xdd)
    u16(4)
    u16(linhasPorIntervalo * colunas)
  }
  saida.push(0xff, 0xda)
  u16(6 + 2 * nc)
  saida.push(nc)
  for (let c = 0; c < nc; c++) saida.push(c + 1, 0)
  saida.push(preditor, 0, 0)

  let acumulado = 0
  let quantos = 0
  const bitsFora = (valor, n) => {
    for (let i = n - 1; i >= 0; i--) {
      acumulado = (acumulado << 1) | ((valor >> i) & 1)
      if (++quantos === 8) {
        saida.push(acumulado)
        if (acumulado === 0xff) saida.push(0)
        acumulado = 0
        quantos = 0
      }
    }
  }
  const porLinha = colunas * nc
  const inicial = 1 << (bits - 1)
  let intervalo = 0
  for (let y = 0; y < linhas; y++) {
    const topo = y === 0 || (linhasPorIntervalo > 0 && y % linhasPorIntervalo === 0)
    if (topo && y > 0) {
      while (quantos !== 0) bitsFora(1, 1)
      saida.push(0xff, 0xd0 + (intervalo++ & 7))
    }
    for (let x = 0; x < porLinha; x++) {
      const i = y * porLinha + x
      let px
      if (x < nc) px = topo ? inicial : amostras[i - porLinha]
      else if (topo) px = amostras[i - nc]
      else {
        const a = amostras[i - nc]
        const b = amostras[i - porLinha]
        const c = amostras[i - porLinha - nc]
        px = [a, b, c, a + b - c, a + ((b - c) >> 1), b + ((a - c) >> 1), (a + b) >> 1][preditor - 1]
      }
      let d = (amostras[i] - px) & 0xffff
      if (d > 32768) d -= 65536
      if (d === 0) bitsFora(0, 5)
      else if (d === 32768) bitsFora(32, 6)
      else {
        const s = 32 - Math.clz32(Math.abs(d))
        bitsFora(s, 5)
        bitsFora(d > 0 ? d : d + (1 << s) - 1, s)
      }
    }
  }
  while (quantos !== 0) bitsFora(1, 1)
  saida.push(0xff, 0xd9)
  return Uint8Array.from(saida)
}

// -------------------------------------------------------------------------------------------------------- CR3

const be32 = (x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]
const be16 = (x) => [(x >> 8) & 255, x & 255]
const quatro = (s) => Array.from(s, (ch) => ch.charCodeAt(0))
export const caixa = (tipo, ...partes) => {
  const corpo = juntar(partes)
  return juntar([be32(8 + corpo.length), quatro(tipo), corpo])
}
const hex = (s) => s.match(/../g).map((b) => parseInt(b, 16))

/**
 * CR3 mínimo (ISO BMFF) com o que a Canon grava: `moov` com a caixa `uuid` de metadados (CMT1, CMT2, THMB) e duas
 * trilhas (JPEG do tamanho inteiro e o sensor), a caixa `uuid` da prévia (PRVW) e `mdat` com as amostras.
 */
export function montarCr3({ cmt1, cmt2, miniatura, previa, inteira, sensor }) {
  const trilha = ({ largura, altura, tamanho, posicao, filhas }) =>
    caixa(
      'trak',
      caixa(
        'mdia',
        caixa(
          'minf',
          caixa(
            'stbl',
            // entrada de amostra: 8 de caixa + 78 da entrada de vídeo + 4 que a Canon acrescenta, e então as filhas
            caixa(
              'stsd',
              be32(0),
              be32(1),
              caixa('CRAW', new Uint8Array(6), be16(1), new Uint8Array(16), be16(largura), be16(altura), new Uint8Array(50), be16(3), be16(0), filhas),
            ),
            caixa('stsz', be32(0), be32(tamanho), be32(1)),
            caixa('co64', be32(0), be32(1), be32(0), be32(posicao)),
          ),
        ),
      ),
    )
  const montarMoov = (posInteira, posSensor) =>
    caixa(
      'moov',
      caixa(
        'uuid',
        hex('85c0b687820f11e08111f4ce462b6a48'),
        caixa('CMT1', cmt1),
        caixa('CMT2', cmt2),
        caixa('THMB', be32(0), be16(miniatura.largura), be16(miniatura.altura), be32(miniatura.jpeg.length), be16(1), be16(0), miniatura.jpeg),
      ),
      trilha({ ...inteira, tamanho: inteira.jpeg.length, posicao: posInteira, filhas: caixa('JPEG', be32(0)) }),
      trilha({ largura: sensor.largura, altura: sensor.altura, tamanho: sensor.dados.length, posicao: posSensor, filhas: caixa('CMP1', new Uint8Array(52)) }),
    )
  const ftyp = caixa('ftyp', quatro('crx '), be32(1), quatro('crx '), quatro('isom'))
  const uuidPrevia = caixa(
    'uuid',
    hex('eaf42b5e1c984b88b9fbb7dc406e4d16'),
    be32(0),
    be32(1),
    caixa('PRVW', be32(0), be16(1), be16(previa.largura), be16(previa.altura), be16(1), be32(previa.jpeg.length), previa.jpeg),
  )
  const antes = ftyp.length + montarMoov(0, 0).length + uuidPrevia.length + 8
  const moov = montarMoov(antes, antes + inteira.jpeg.length)
  return juntar([ftyp, moov, uuidPrevia, caixa('mdat', inteira.jpeg, sensor.dados)])
}
