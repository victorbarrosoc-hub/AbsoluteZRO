// Descompactar zlib (RFC 1950) e deflate (RFC 1951), em JS puro e síncrono: as tabelas dos perfis da Adobe vêm
// compactadas assim (perfil-adobe.js) e a importação do Lightroom é síncrona e roda igual no Node e no navegador (o
// DecompressionStream do navegador é assíncrono). Escrito a partir das RFCs, sem código de terceiros.
//
// Deflate: blocos guardados (tipo 0), Huffman fixo (1) e dinâmico (2); códigos de Huffman canônicos lidos bit a bit
// pela tabela de contagem/símbolos (a decodificação "por comprimento" da seção 3.2.2 da RFC 1951).

export class ErroInflar extends Error {
  constructor(mensagem) {
    super(mensagem)
    this.name = 'ErroInflar'
  }
}

// comprimentos 257..285 e distâncias 0..29: base e bits extras (RFC 1951, 3.2.5)
const BASE_COMPRIMENTO = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const EXTRA_COMPRIMENTO = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const BASE_DISTANCIA = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const EXTRA_DISTANCIA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
// ordem dos comprimentos do código dos comprimentos (3.2.7)
const ORDEM = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

/** Código de Huffman canônico a partir dos comprimentos: { contagem[0..15], simbolos } (RFC 1951, 3.2.2). */
function huffman(comprimentos) {
  const contagem = new Uint16Array(16)
  for (const c of comprimentos) contagem[c]++
  contagem[0] = 0
  const inicio = new Uint16Array(16)
  for (let i = 1; i < 16; i++) inicio[i] = inicio[i - 1] + contagem[i - 1]
  const simbolos = new Uint16Array(comprimentos.length)
  for (let s = 0; s < comprimentos.length; s++) if (comprimentos[s]) simbolos[inicio[comprimentos[s]]++] = s
  return { contagem, simbolos }
}

let FIXO = null
function fixo() {
  if (!FIXO) {
    const c = new Uint8Array(288)
    c.fill(8, 0, 144)
    c.fill(9, 144, 256)
    c.fill(7, 256, 280)
    c.fill(8, 280, 288)
    FIXO = { literais: huffman(c), distancias: huffman(new Uint8Array(30).fill(5)) }
  }
  return FIXO
}

/** Descompacta um fluxo deflate cru (sem cabeçalho). `tamanho`: o tamanho esperado da saída, se conhecido. */
export function inflarCru(dados, tamanho = 0) {
  return deflate(dados, tamanho).saida
}

// { saida, fim }: fim = o primeiro byte depois do último bloco (o que sobra de bits nele é enchimento)
function deflate(dados, tamanho) {
  let pos = 0
  let bits = 0
  let nBits = 0
  let saida = new Uint8Array(tamanho > 0 ? tamanho : Math.max(1024, dados.length * 4))
  let n = 0
  const garantir = (mais) => {
    if (n + mais <= saida.length) return
    const nova = new Uint8Array(Math.max(saida.length * 2, n + mais))
    nova.set(saida.subarray(0, n))
    saida = nova
  }
  const bit = (quantos) => {
    while (nBits < quantos) {
      if (pos >= dados.length) throw new ErroInflar('dados compactados truncados')
      bits |= dados[pos++] << nBits
      nBits += 8
    }
    const v = bits & ((1 << quantos) - 1)
    bits >>>= quantos
    nBits -= quantos
    return v
  }
  const simbolo = ({ contagem, simbolos }) => {
    let codigo = 0
    let primeiro = 0
    let indice = 0
    for (let len = 1; len < 16; len++) {
      codigo |= bit(1)
      const c = contagem[len]
      if (codigo - c < primeiro) return simbolos[indice + (codigo - primeiro)]
      indice += c
      primeiro = (primeiro + c) << 1
      codigo <<= 1
    }
    throw new ErroInflar('código de Huffman inválido')
  }
  let ultimo = 0
  while (!ultimo) {
    ultimo = bit(1)
    const tipo = bit(2)
    if (tipo === 0) {
      bits = 0
      nBits = 0
      if (pos + 4 > dados.length) throw new ErroInflar('bloco guardado truncado')
      const len = dados[pos] | (dados[pos + 1] << 8)
      const nlen = dados[pos + 2] | (dados[pos + 3] << 8)
      if ((len ^ 0xffff) !== nlen) throw new ErroInflar('bloco guardado com tamanho inconsistente')
      pos += 4
      if (pos + len > dados.length) throw new ErroInflar('bloco guardado truncado')
      garantir(len)
      saida.set(dados.subarray(pos, pos + len), n)
      n += len
      pos += len
      continue
    }
    let literais
    let distancias
    if (tipo === 1) ({ literais, distancias } = fixo())
    else if (tipo === 2) {
      const hlit = bit(5) + 257
      const hdist = bit(5) + 1
      const hclen = bit(4) + 4
      const cc = new Uint8Array(19)
      for (let i = 0; i < hclen; i++) cc[ORDEM[i]] = bit(3)
      const codigoDosComprimentos = huffman(cc)
      const comp = new Uint8Array(hlit + hdist)
      for (let i = 0; i < hlit + hdist; ) {
        const s = simbolo(codigoDosComprimentos)
        if (s < 16) comp[i++] = s
        else {
          let repetir
          let valor = 0
          if (s === 16) {
            if (!i) throw new ErroInflar('repetição sem comprimento anterior')
            valor = comp[i - 1]
            repetir = 3 + bit(2)
          } else if (s === 17) repetir = 3 + bit(3)
          else repetir = 11 + bit(7)
          if (i + repetir > hlit + hdist) throw new ErroInflar('comprimentos demais')
          comp.fill(valor, i, i + repetir)
          i += repetir
        }
      }
      literais = huffman(comp.subarray(0, hlit))
      distancias = huffman(comp.subarray(hlit))
    } else throw new ErroInflar('tipo de bloco inválido')
    for (;;) {
      const s = simbolo(literais)
      if (s < 256) {
        garantir(1)
        saida[n++] = s
      } else if (s === 256) break
      else {
        const k = s - 257
        if (k >= 29) throw new ErroInflar('comprimento inválido')
        const len = BASE_COMPRIMENTO[k] + bit(EXTRA_COMPRIMENTO[k])
        const d = simbolo(distancias)
        if (d >= 30) throw new ErroInflar('distância inválida')
        const dist = BASE_DISTANCIA[d] + bit(EXTRA_DISTANCIA[d])
        if (dist > n) throw new ErroInflar('distância antes do começo')
        garantir(len)
        for (let i = 0; i < len; i++, n++) saida[n] = saida[n - dist]
      }
    }
  }
  return { saida: saida.subarray(0, n), fim: pos }
}

/** Descompacta um fluxo zlib (RFC 1950): cabeçalho de 2 bytes, deflate, Adler-32 conferido. */
export function inflar(dados, tamanho = 0) {
  if (dados.length < 6) throw new ErroInflar('fluxo zlib curto demais')
  const cmf = dados[0]
  const flg = dados[1]
  if ((cmf & 15) !== 8 || ((cmf << 8) | flg) % 31 !== 0) throw new ErroInflar('cabeçalho zlib inválido')
  if (flg & 32) throw new ErroInflar('zlib com dicionário prévio não é aceito')
  const { saida, fim: fimDoDeflate } = deflate(dados.subarray(2), tamanho)
  const fim = 2 + fimDoDeflate + 4
  if (fim > dados.length) throw new ErroInflar('fluxo zlib sem a soma de conferência')
  // Adler-32 (RFC 1950, 8.2), big-endian no fim do fluxo
  let a = 1
  let b = 0
  for (let i = 0; i < saida.length; i++) {
    a = (a + saida[i]) % 65521
    b = (b + a) % 65521
  }
  const esperado = ((dados[fim - 4] << 24) | (dados[fim - 3] << 16) | (dados[fim - 2] << 8) | dados[fim - 1]) >>> 0
  if ((((b << 16) | a) >>> 0) !== esperado) throw new ErroInflar('soma de conferência (Adler-32) não bate')
  return saida
}
