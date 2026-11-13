// PNG RGB de 8 e 16 bits com perfil ICC embutido (iCCP). Sem perda: é a saída para quem vai continuar o trabalho em
// outro programa ou precisa de 16 bits num formato que todo navegador abre.
//
// Especificação: PNG (W3C, 3ª edição / ISO 15948).
//   5.2   assinatura            5.3   pedaço = tamanho, tipo, dados, CRC-32 (do tipo + dados)       5.6   ordem dos pedaços
//   9     filtros por linha (0 nenhum, 1 Sub, 2 Up, 3 Average, 4 Paeth), com a escolha pelo menor Σ|byte| (12.8)
//   10    IDAT = zlib (RFC 1950) do fluxo filtrado      11.3.2.3  iCCP (nome em Latin-1, perfil comprimido)
//   11.3.3.4  iTXt (XMP vai com a palavra-chave 'XML:com.adobe.xmp', XMP parte 3)      11.3.3.5  eXIf
// Amostras de 16 bits vão com o byte alto primeiro.
//
// A compressão é a do aparelho (CompressionStream, zlib de verdade). Onde ela não existe, o zlib sai em blocos
// "guardados" (RFC 1951, 3.2.4): válido em qualquer leitor, só não encolhe. Este arquivo também é a casa das contas
// de zlib que o TIFF com Deflate reaproveita.

import { lerIcc } from './icc.js'

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PEDACO_IDAT = 1 << 20 // 1 MiB por IDAT: leitor em fluxo não precisa de um pedaço do tamanho da foto

// ─────────── somas e zlib ───────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (ISO 3309, o do PNG e do zip). `anterior` permite continuar a soma de um trecho para o outro. */
export function crc32(bytes, anterior = 0) {
  let c = ~anterior >>> 0
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

/** Adler-32 (RFC 1950): a soma que fecha um fluxo zlib. */
export function adler32(bytes) {
  let a = 1
  let b = 0
  // 5552 é o maior trecho em que as somas não passam de 32 bits antes do resto por 65521
  for (let i = 0; i < bytes.length;) {
    const fim = Math.min(i + 5552, bytes.length)
    for (; i < fim; i++) {
      a += bytes[i]
      b += a
    }
    a %= 65521
    b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

/** True quando o aparelho tem CompressionStream e DecompressionStream (Node 18+, todo navegador atual, workers). */
export const temCompressao = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

async function pelaCorrente(bytes, corrente) {
  const saida = new Blob([bytes]).stream().pipeThrough(corrente)
  return new Uint8Array(await new Response(saida).arrayBuffer())
}

/** zlib sem compressão: cabeçalho 78 01, blocos guardados de até 65535 bytes e Adler-32. */
export function zlibGuardado(bytes) {
  const blocos = Math.max(1, Math.ceil(bytes.length / 65535))
  const saida = new Uint8Array(2 + blocos * 5 + bytes.length + 4)
  const v = new DataView(saida.buffer)
  saida[0] = 0x78
  saida[1] = 0x01
  let p = 2
  for (let b = 0; b < blocos; b++) {
    const inicio = b * 65535
    const n = Math.min(65535, bytes.length - inicio)
    saida[p] = b === blocos - 1 ? 1 : 0
    v.setUint16(p + 1, n, true)
    v.setUint16(p + 3, ~n & 0xffff, true)
    saida.set(bytes.subarray(inicio, inicio + n), p + 5)
    p += 5 + n
  }
  v.setUint32(p, adler32(bytes))
  return saida
}

// Desfaz um zlib de blocos guardados (o que zlibGuardado escreve). Bloco comprimido precisa do DecompressionStream.
function zlibDesguardar(bytes) {
  const partes = []
  let total = 0
  let p = 2
  for (;;) {
    const cabeca = bytes[p]
    if ((cabeca & 6) !== 0) throw new Error('zlib: bloco comprimido e este aparelho não tem DecompressionStream')
    const n = bytes[p + 1] | (bytes[p + 2] << 8)
    partes.push(bytes.subarray(p + 5, p + 5 + n))
    total += n
    p += 5 + n
    if (cabeca & 1) break
  }
  const saida = new Uint8Array(total)
  let q = 0
  for (const parte of partes) {
    saida.set(parte, q)
    q += parte.length
  }
  return saida
}

/**
 * Bytes → fluxo zlib (RFC 1950). `guardar: true` (ou aparelho sem CompressionStream) devolve blocos guardados.
 */
export async function comprimirZlib(bytes, { guardar = false } = {}) {
  if (guardar || !temCompressao()) return zlibGuardado(bytes)
  return pelaCorrente(bytes, new CompressionStream('deflate'))
}

/** Fluxo zlib → bytes. Lança se o fluxo estiver estragado. */
export async function descomprimirZlib(bytes) {
  if (!temCompressao()) return zlibDesguardar(bytes)
  return pelaCorrente(bytes, new DecompressionStream('deflate'))
}

// ─────────── escrever ───────────

function pedaco(tipo, dados) {
  const saida = new Uint8Array(12 + dados.length)
  const v = new DataView(saida.buffer)
  v.setUint32(0, dados.length)
  for (let i = 0; i < 4; i++) saida[4 + i] = tipo.charCodeAt(i)
  saida.set(dados, 8)
  v.setUint32(8 + dados.length, crc32(saida.subarray(4, 8 + dados.length)))
  return saida
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

const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

// Nome do perfil no iCCP: 1 a 79 caracteres Latin-1 imprimíveis, sem espaço nas pontas nem dois seguidos (11.3.2.3)
function nomeIccp(nome) {
  const limpo = String(nome ?? '')
    .replace(/[^\x20-\x7e\xa1-\xff]/g, '')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, 79)
  return limpo || 'ICC'
}

/**
 * As linhas da imagem como o PNG as quer: um byte de filtro e depois as amostras (16 bits com o byte alto primeiro).
 * `adaptativo` escolhe, linha a linha, o filtro de menor soma de valores absolutos (a heurística da especificação);
 * sem ele vai tudo com filtro 0, que é o certo quando o zlib não vai comprimir.
 */
function filtrar(dados, largura, altura, bits, entrada, adaptativo) {
  const bpp = (3 * bits) / 8
  const passo = largura * bpp
  const saida = new Uint8Array((passo + 1) * altura)
  const atual = new Uint8Array(passo)
  let anterior = new Uint8Array(passo)
  let linha = atual
  const candidatos = adaptativo ? [1, 2, 3, 4].map(() => new Uint8Array(passo)) : []
  for (let y = 0; y < altura; y++) {
    // amostras desta linha, já sem o alfa (quando a entrada é RGBA) e em ordem de rede
    if (bits === 8) {
      if (entrada === 3) linha = dados.subarray(y * passo, (y + 1) * passo)
      else {
        for (let x = 0, i = y * largura * 4, j = 0; x < largura; x++, i += 4, j += 3) {
          atual[j] = dados[i]
          atual[j + 1] = dados[i + 1]
          atual[j + 2] = dados[i + 2]
        }
      }
    } else {
      for (let k = 0, i = y * largura * 3, j = 0; k < largura * 3; k++, i++, j += 2) {
        const v = dados[i]
        atual[j] = v >>> 8
        atual[j + 1] = v & 0xff
      }
    }
    const destino = y * (passo + 1)
    if (!adaptativo) {
      saida[destino] = 0
      saida.set(linha, destino + 1)
    } else {
      const [sub, up, media, paeth] = candidatos
      let s0 = 0
      let s1 = 0
      let s2 = 0
      let s3 = 0
      let s4 = 0
      for (let i = 0; i < passo; i++) {
        const x = linha[i]
        const a = i >= bpp ? linha[i - bpp] : 0
        const b = anterior[i]
        const c = i >= bpp ? anterior[i - bpp] : 0
        const v1 = (x - a) & 0xff
        const v2 = (x - b) & 0xff
        const v3 = (x - ((a + b) >> 1)) & 0xff
        // Paeth (9.4): o vizinho mais perto de a + b − c
        const pa = b > c ? b - c : c - b
        const pb = a > c ? a - c : c - a
        const pc0 = a + b - 2 * c
        const pc = pc0 < 0 ? -pc0 : pc0
        const v4 = (x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
        sub[i] = v1
        up[i] = v2
        media[i] = v3
        paeth[i] = v4
        s0 += x < 128 ? x : 256 - x
        s1 += v1 < 128 ? v1 : 256 - v1
        s2 += v2 < 128 ? v2 : 256 - v2
        s3 += v3 < 128 ? v3 : 256 - v3
        s4 += v4 < 128 ? v4 : 256 - v4
      }
      const somas = [s0, s1, s2, s3, s4]
      let melhor = 0
      for (let f = 1; f < 5; f++) if (somas[f] < somas[melhor]) melhor = f
      saida[destino] = melhor
      saida.set(melhor === 0 ? linha : candidatos[melhor - 1], destino + 1)
    }
    anterior.set(linha)
  }
  return saida
}

/** Confere o que os escritores de PNG e TIFF recebem; devolve quantas amostras por pixel a entrada tem (3 ou 4). */
export function conferirImagem({ largura, altura, dados, bits, canais }, formato) {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 1 || altura < 1)
    throw new Error(`${formato}: largura e altura precisam ser inteiros positivos`)
  if (canais !== 3) throw new Error(`${formato}: só RGB (canais: 3)`)
  const n = largura * altura
  if (bits === 16) {
    if (!(dados instanceof Uint16Array) || dados.length !== n * 3) throw new Error(`${formato}: 16 bits pede Uint16Array RGB com largura × altura × 3 amostras`)
    return 3
  }
  if (bits !== 8) throw new Error(`${formato}: bits precisa ser 8 ou 16`)
  if (!(dados instanceof Uint8Array || dados instanceof Uint8ClampedArray)) throw new Error(`${formato}: 8 bits pede Uint8Array ou Uint8ClampedArray`)
  if (dados.length === n * 3) return 3
  if (dados.length === n * 4) return 4 // o RGBA de paraBytes entra direto; o alfa é descartado
  throw new Error(`${formato}: os dados não têm largura × altura × 3 (nem × 4) amostras`)
}

/**
 * Escreve um PNG RGB. `dados`: Uint8Array RGB (ou o RGBA de `paraBytes`, cujo alfa é descartado) com `bits: 8`;
 * Uint16Array RGB com `bits: 16`. `icc` (bytes do perfil) vai no iCCP; `exif` (bloco TIFF de `montarExif`) no eXIf;
 * `xmp` (texto do pacote) num iTXt. `compressao: 'nenhuma'` força o zlib guardado.
 */
export async function escreverPng({ largura, altura, dados, bits = 8, canais = 3, icc, nomeDoPerfil, exif, xmp, compressao = 'auto' }) {
  const entrada = conferirImagem({ largura, altura, dados, bits, canais }, 'PNG')
  const guardar = compressao === 'nenhuma' || !temCompressao()
  const partes = [Uint8Array.from(ASSINATURA)]

  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, largura)
  v.setUint32(4, altura)
  ihdr[8] = bits
  ihdr[9] = 2 // tipo de cor 2: RGB
  partes.push(pedaco('IHDR', ihdr)) // 10 compressão, 11 filtro, 12 entrelaçamento: zero

  if (icc) {
    let nome = nomeDoPerfil
    if (!nome) {
      try {
        nome = lerIcc(icc).tags.desc?.texto
      } catch {
        nome = ''
      }
    }
    const comprimido = await comprimirZlib(icc, { guardar })
    partes.push(pedaco('iCCP', juntar([latin1(nomeIccp(nome)), Uint8Array.of(0, 0), comprimido])))
  }
  if (exif) partes.push(pedaco('eXIf', exif))
  if (xmp) {
    const texto = typeof xmp === 'string' ? new TextEncoder().encode(xmp) : xmp
    // palavra-chave, 0, marca de compressão (0), método (0), língua vazia, 0, palavra traduzida vazia, 0, texto
    partes.push(pedaco('iTXt', juntar([latin1('XML:com.adobe.xmp'), Uint8Array.of(0, 0, 0, 0, 0), texto])))
  }

  const fluxo = await comprimirZlib(filtrar(dados, largura, altura, bits, entrada, !guardar), { guardar })
  for (let p = 0; p < fluxo.length; p += PEDACO_IDAT) partes.push(pedaco('IDAT', fluxo.subarray(p, Math.min(p + PEDACO_IDAT, fluxo.length))))
  partes.push(pedaco('IEND', new Uint8Array(0)))
  return juntar(partes)
}

// ─────────── ler (o bastante para conferir a ida e volta) ───────────

function desfiltrar(fluxo, largura, altura, bpp) {
  const passo = largura * bpp
  if (fluxo.length !== (passo + 1) * altura) throw new Error('PNG: o fluxo de imagem não tem o tamanho que o cabeçalho pede')
  const saida = new Uint8Array(passo * altura)
  for (let y = 0; y < altura; y++) {
    const filtro = fluxo[y * (passo + 1)]
    const o = y * (passo + 1) + 1
    const d = y * passo
    for (let i = 0; i < passo; i++) {
      const a = i >= bpp ? saida[d + i - bpp] : 0
      const b = y > 0 ? saida[d + i - passo] : 0
      const c = y > 0 && i >= bpp ? saida[d + i - passo - bpp] : 0
      let previsto = 0
      if (filtro === 1) previsto = a
      else if (filtro === 2) previsto = b
      else if (filtro === 3) previsto = (a + b) >> 1
      else if (filtro === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        previsto = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filtro !== 0) throw new Error(`PNG: filtro ${filtro} não existe`)
      saida[d + i] = (fluxo[o + i] + previsto) & 0xff
    }
  }
  return saida
}

/**
 * Lê um PNG RGB ou RGBA de 8 ou 16 bits, sem entrelaçamento. Confere a assinatura e o CRC de cada pedaço.
 * → { largura, altura, bits, canais, dados, icc, nomeDoPerfil, exif, xmp, pedacos: ['IHDR', …] }
 */
export async function lerPng(bytes) {
  for (let i = 0; i < 8; i++) if (bytes[i] !== ASSINATURA[i]) throw new Error('PNG: assinatura errada')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const saida = { largura: 0, altura: 0, bits: 0, canais: 0, dados: null, icc: null, nomeDoPerfil: null, exif: null, xmp: null, pedacos: [] }
  const idat = []
  let p = 8
  let fim = false
  while (!fim) {
    if (p + 12 > bytes.length) throw new Error('PNG: arquivo cortado')
    const n = v.getUint32(p)
    const tipo = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
    if (p + 12 + n > bytes.length) throw new Error(`PNG: pedaço ${tipo} passa do fim do arquivo`)
    const dados = bytes.subarray(p + 8, p + 8 + n)
    if (crc32(bytes.subarray(p + 4, p + 8 + n)) !== v.getUint32(p + 8 + n)) throw new Error(`PNG: CRC errado no pedaço ${tipo}`)
    saida.pedacos.push(tipo)
    if (tipo === 'IHDR') {
      saida.largura = v.getUint32(p + 8)
      saida.altura = v.getUint32(p + 12)
      saida.bits = dados[8]
      const cor = dados[9]
      if ((cor !== 2 && cor !== 6) || (saida.bits !== 8 && saida.bits !== 16) || dados[12] !== 0)
        throw new Error('PNG: só RGB ou RGBA de 8 ou 16 bits, sem entrelaçamento')
      saida.canais = cor === 2 ? 3 : 4
    } else if (tipo === 'iCCP') {
      const zero = dados.indexOf(0)
      saida.nomeDoPerfil = String.fromCharCode(...dados.subarray(0, zero))
      saida.icc = await descomprimirZlib(dados.subarray(zero + 2))
    } else if (tipo === 'eXIf') saida.exif = dados.slice()
    else if (tipo === 'iTXt') {
      const zero = dados.indexOf(0)
      if (String.fromCharCode(...dados.subarray(0, zero)) === 'XML:com.adobe.xmp' && dados[zero + 1] === 0) {
        const lingua = dados.indexOf(0, zero + 3)
        const traduzida = dados.indexOf(0, lingua + 1)
        saida.xmp = new TextDecoder().decode(dados.subarray(traduzida + 1))
      }
    } else if (tipo === 'IDAT') idat.push(dados)
    else if (tipo === 'IEND') fim = true
    p += 12 + n
  }
  if (!saida.largura || !idat.length) throw new Error('PNG: falta IHDR ou IDAT')
  const bpp = (saida.canais * saida.bits) / 8
  const cru = desfiltrar(await descomprimirZlib(juntar(idat)), saida.largura, saida.altura, bpp)
  if (saida.bits === 8) saida.dados = cru
  else {
    const amostras = new Uint16Array(cru.length / 2)
    for (let i = 0, j = 0; i < amostras.length; i++, j += 2) amostras[i] = (cru[j] << 8) | cru[j + 1]
    saida.dados = amostras
  }
  return saida
}
