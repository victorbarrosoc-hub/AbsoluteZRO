// Decodificador de JPEG com perdas (DCT sequencial, Huffman, 8 bits), em JS puro. Existe por dois motivos:
//   1. o "DNG com perdas" (Compression 34892) guarda a imagem em blocos de JPEG comum, e o LibRaw do pacote não
//      traz libjpeg: sem isto o arquivo não abre;
//   2. conferir uma revelação com a prévia embutida fora do navegador (`reduzir: 8` lê só o coeficiente DC de cada
//      bloco: 1/8 do tamanho, sem transformada, em milissegundos — é a média exata de cada bloco 8×8).
// Não é o decodificador das telas: lá quem abre JPEG é o navegador.
//
// Fonte: ITU-T T.81 (JPEG), processos 0 e 1 (SOF0 e SOF1 com Huffman): anexo B (marcadores), F.2 (decodificação),
// A.3.3 (DCT inversa, pela definição, separada em parte par e ímpar), JFIF 1.02 (YCbCr → RGB, croma centrado) e a
// nota técnica 5116 da Adobe (marcador APP14: transformação de cor). JPEG progressivo, aritmético e de 12 bits são
// recusados com o motivo. Nada de código de terceiros.

import { ErroRaw } from './erro.js'

const ZIGUEZAGUE = Uint8Array.of(
  ...[0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28],
  ...[35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63],
)

const cosseno = (j) => Math.cos((j * Math.PI) / 16)
const C1 = cosseno(1)
const C2 = cosseno(2)
const C3 = cosseno(3)
const C5 = cosseno(5)
const C6 = cosseno(6)
const C7 = cosseno(7)
const R2 = Math.SQRT1_2

// Tabela de Huffman (T.81 anexo C): consulta direta de 9 bits ((comprimento << 8) | símbolo) e, para códigos mais
// longos, o maior código de cada comprimento.
function tabelaHuffman(contagens, simbolos) {
  const lut = new Uint16Array(512)
  const maior = new Int32Array(18).fill(-1)
  const primeiro = new Int32Array(18)
  const indice = new Int32Array(18)
  let codigo = 0
  let k = 0
  for (let l = 1; l <= 16; l++) {
    primeiro[l] = codigo
    indice[l] = k
    for (let i = 0; i < contagens[l - 1]; i++, k++, codigo++) {
      if (l <= 9) lut.fill((l << 8) | simbolos[k], codigo << (9 - l), (codigo + 1) << (9 - l))
    }
    maior[l] = contagens[l - 1] ? codigo - 1 : -1
    codigo <<= 1
  }
  return { lut, maior, primeiro, indice, simbolos }
}

// DCT inversa de 8 pontos pela definição (T.81 A.3.3), s(n) = ½·Σ C(k)·X(k)·cos((2n + 1)kπ/16), com a simetria
// usada para separar os termos pares (que dão E(n) = E(7 − n)) dos ímpares (O(n) = −O(7 − n)).
function idct8(v, o, passo) {
  const x0 = v[o]
  const x1 = v[o + passo]
  const x2 = v[o + 2 * passo]
  const x3 = v[o + 3 * passo]
  const x4 = v[o + 4 * passo]
  const x5 = v[o + 5 * passo]
  const x6 = v[o + 6 * passo]
  const x7 = v[o + 7 * passo]
  const e0 = (x0 + x4) * R2
  const e1 = (x0 - x4) * R2
  const g0 = x2 * C2 + x6 * C6
  const g1 = x2 * C6 - x6 * C2
  const p0 = e0 + g0
  const p1 = e1 + g1
  const p2 = e1 - g1
  const p3 = e0 - g0
  const i0 = x1 * C1 + x3 * C3 + x5 * C5 + x7 * C7
  const i1 = x1 * C3 - x3 * C7 - x5 * C1 - x7 * C5
  const i2 = x1 * C5 - x3 * C1 + x5 * C7 + x7 * C3
  const i3 = x1 * C7 - x3 * C5 + x5 * C3 - x7 * C1
  v[o] = 0.5 * (p0 + i0)
  v[o + 7 * passo] = 0.5 * (p0 - i0)
  v[o + passo] = 0.5 * (p1 + i1)
  v[o + 6 * passo] = 0.5 * (p1 - i1)
  v[o + 2 * passo] = 0.5 * (p2 + i2)
  v[o + 5 * passo] = 0.5 * (p2 - i2)
  v[o + 3 * passo] = 0.5 * (p3 + i3)
  v[o + 4 * passo] = 0.5 * (p3 - i3)
}

/** Só o cabeçalho: { largura, altura, componentes, processo, bits } ou null se não for JPEG. Não decodifica nada. */
export function medidasDoJpeg(u8, inicio = 0, fim = u8.length) {
  if (fim - inicio < 4 || u8[inicio] !== 0xff || u8[inicio + 1] !== 0xd8) return null
  let p = inicio + 2
  while (p + 4 <= fim) {
    if (u8[p] !== 0xff) return null
    const m = u8[p + 1]
    if (m === 0xff) {
      p++
      continue
    }
    const tam = (u8[p + 2] << 8) | u8[p + 3]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { bits: u8[p + 4], altura: (u8[p + 5] << 8) | u8[p + 6], largura: (u8[p + 7] << 8) | u8[p + 8], componentes: u8[p + 9], processo: m & 15 }
    }
    if (m === 0xda || m === 0xd9) return null
    p += 2 + tam
  }
  return null
}

/**
 * JPEG → { largura, altura, canais: 1 | 3, dados: Uint8Array (cinza, ou RGB entrelaçado), reduzir }.
 *   inicio, fim   o trecho de `u8` onde o JPEG mora (padrão: tudo)
 *   reduzir       1 (padrão) ou 8: com 8, cada bloco 8×8 vira um pixel (a média do bloco), sem a transformada
 * Três componentes saem em RGB: YCbCr → RGB (JFIF), salvo quando o marcador da Adobe diz que já é RGB. Croma
 * subamostrado é ampliado em bilinear, com a amostra centrada no bloco (convenção do JFIF).
 * Lança `ErroRaw`: 'sem-suporte' (progressivo, aritmético, 12 bits, CMYK) ou 'corrompido'.
 */
export function decodificarJpeg(u8, { inicio = 0, fim = u8.length, reduzir = 1 } = {}) {
  const erro = (m) => new ErroRaw('corrompido', `JPEG inválido: ${m}`)
  if (reduzir !== 1 && reduzir !== 8) throw new Error('decodificarJpeg: reduzir precisa ser 1 ou 8')
  if (fim - inicio < 4 || u8[inicio] !== 0xff || u8[inicio + 1] !== 0xd8) throw erro('sem o marcador de início')
  const quantizacao = []
  const dc = []
  const ac = []
  let quadro = null
  let reinicio = 0
  let adobe = -1
  let p = inicio + 2
  let varredura = null
  while (!varredura) {
    if (p + 4 > fim) throw erro('cabeçalho truncado')
    if (u8[p] !== 0xff) throw erro('marcador fora do lugar')
    const m = u8[p + 1]
    if (m === 0xff) {
      p++
      continue
    }
    const tam = (u8[p + 2] << 8) | u8[p + 3]
    const seg = p + 4
    const ate = p + 2 + tam
    if (ate > fim) throw erro('segmento passa do fim')
    if (m === 0xdb) {
      for (let q = seg; q < ate; ) {
        const dezesseis = u8[q] >> 4
        const t = new Float32Array(64)
        for (let i = 0; i < 64; i++) t[ZIGUEZAGUE[i]] = dezesseis ? (u8[q + 1 + 2 * i] << 8) | u8[q + 2 + 2 * i] : u8[q + 1 + i]
        quantizacao[u8[q] & 15] = t
        q += 1 + (dezesseis ? 128 : 64)
      }
    } else if (m === 0xc4) {
      for (let q = seg; q + 17 <= ate; ) {
        let total = 0
        for (let i = 0; i < 16; i++) total += u8[q + 1 + i]
        const t = tabelaHuffman(u8.subarray(q + 1, q + 17), u8.subarray(q + 17, q + 17 + total))
        if (u8[q] >> 4) ac[u8[q] & 15] = t
        else dc[u8[q] & 15] = t
        q += 17 + total
      }
    } else if (m === 0xc0 || m === 0xc1) {
      if (u8[seg] !== 8) throw new ErroRaw('sem-suporte', `JPEG de ${u8[seg]} bits: este leitor cobre 8 bits.`)
      const n = u8[seg + 5]
      if (n !== 1 && n !== 3) throw new ErroRaw('sem-suporte', `JPEG com ${n} componentes: este leitor cobre cinza e três cores.`)
      quadro = { altura: (u8[seg + 1] << 8) | u8[seg + 2], largura: (u8[seg + 3] << 8) | u8[seg + 4], comps: [] }
      for (let i = 0; i < n; i++) {
        const q = seg + 6 + 3 * i
        quadro.comps.push({ id: u8[q], h: u8[q + 1] >> 4, v: u8[q + 1] & 15, tq: u8[q + 2] })
      }
    } else if (m >= 0xc2 && m <= 0xcf && m !== 0xc8 && m !== 0xcc) {
      const nome = m === 0xc2 ? 'progressivo' : m === 0xc3 ? 'sem perdas' : m >= 0xc9 ? 'com codificação aritmética' : 'hierárquico'
      throw new ErroRaw('sem-suporte', `JPEG ${nome}: este leitor cobre o JPEG sequencial comum.`)
    } else if (m === 0xdd) reinicio = (u8[seg] << 8) | u8[seg + 1]
    else if (m === 0xee && tam >= 14 && u8[seg] === 0x41 && u8[seg + 1] === 0x64 && u8[seg + 2] === 0x6f) adobe = u8[seg + 11]
    else if (m === 0xda) {
      if (!quadro) throw erro('varredura antes do quadro')
      const n = u8[seg]
      if (n !== quadro.comps.length) throw new ErroRaw('sem-suporte', 'JPEG com mais de uma varredura: este leitor cobre o JPEG sequencial comum.')
      varredura = []
      for (let i = 0; i < n; i++) {
        const c = quadro.comps.find((x) => x.id === u8[seg + 1 + 2 * i])
        if (!c) throw erro('componente desconhecido na varredura')
        c.dc = dc[u8[seg + 2 + 2 * i] >> 4]
        c.ac = ac[u8[seg + 2 + 2 * i] & 15]
        c.q = quantizacao[c.tq]
        if (!c.dc || !c.ac || !c.q) throw erro('componente sem tabela')
        varredura.push(c)
      }
    } else if (m === 0xd9) throw erro('sem imagem')
    p = ate
  }
  const { largura, altura, comps } = quadro
  if (!(largura > 0 && altura > 0)) throw erro('quadro sem medidas')
  const hMax = Math.max(...comps.map((c) => c.h))
  const vMax = Math.max(...comps.map((c) => c.v))
  if (!comps.every((c) => c.h >= 1 && c.v >= 1 && c.h <= 4 && c.v <= 4)) throw erro('amostragem inválida')
  const mcuX = Math.ceil(largura / (8 * hMax))
  const mcuY = Math.ceil(altura / (8 * vMax))
  const lado = reduzir === 8 ? 1 : 8
  for (const c of comps) {
    c.blocosX = mcuX * c.h
    c.blocosY = mcuY * c.v
    c.w = c.blocosX * lado
    c.plano = new Uint8Array(c.w * c.blocosY * lado)
    c.pred = 0
  }

  // leitor de bits: FF 00 é o byte FF; qualquer outro marcador encerra os dados (entram zeros e a posição fica nele)
  let acum = 0
  let tem = 0
  const encher = () => {
    while (tem <= 24) {
      let b = 0
      if (p < fim) {
        b = u8[p]
        if (b === 0xff) {
          if (u8[p + 1] === 0) p += 2
          else b = 0
        } else p++
      }
      acum = (acum << 8) | b
      tem += 8
    }
  }
  const simbolo = (t) => {
    if (tem < 16) encher()
    const e = t.lut[(acum >>> (tem - 9)) & 511]
    if (e) {
      tem -= e >> 8
      return e & 255
    }
    let codigo = (acum >>> (tem - 9)) & 511
    for (let l = 10; l <= 16; l++) {
      codigo = (codigo << 1) | ((acum >>> (tem - l)) & 1)
      if (codigo <= t.maior[l]) {
        tem -= l
        return t.simbolos[t.indice[l] + codigo - t.primeiro[l]]
      }
    }
    throw erro('código de Huffman desconhecido')
  }
  const valor = (s) => {
    if (tem < s) encher()
    const v = (acum >>> (tem - s)) & ((1 << s) - 1)
    tem -= s
    return v < 1 << (s - 1) ? v - (1 << s) + 1 : v
  }

  const bloco = new Float32Array(64)
  const total = mcuX * mcuY
  for (let n = 0; n < total; n++) {
    if (reinicio && n > 0 && n % reinicio === 0) {
      acum = 0
      tem = 0
      while (p + 1 < fim && !(u8[p] === 0xff && u8[p + 1] >= 0xd0 && u8[p + 1] <= 0xd7)) p++
      p += 2
      for (const c of comps) c.pred = 0
    }
    const mx = n % mcuX
    const my = (n / mcuX) | 0
    for (const c of varredura) {
      for (let by = 0; by < c.v; by++) {
        for (let bx = 0; bx < c.h; bx++) {
          const s = simbolo(c.dc)
          if (s > 11) throw erro('diferença de DC fora da faixa')
          c.pred += s ? valor(s) : 0
          const x0 = (mx * c.h + bx) * lado
          const y0 = (my * c.v + by) * lado
          if (reduzir === 8) {
            // só o DC: a média do bloco é DC·Q/8 + 128; os AC são lidos para andar no fluxo e descartados
            for (let k = 1; k < 64; ) {
              const rs = simbolo(c.ac)
              const tamanho = rs & 15
              if (!tamanho) {
                if (rs !== 0xf0) break
                k += 16
                continue
              }
              k += (rs >> 4) + 1
              if (tem < tamanho) encher()
              tem -= tamanho
            }
            const v = Math.round((c.pred * c.q[0]) / 8 + 128)
            c.plano[y0 * c.w + x0] = v < 0 ? 0 : v > 255 ? 255 : v
            continue
          }
          bloco.fill(0)
          bloco[0] = c.pred * c.q[0]
          let ultimo = 0
          for (let k = 1; k < 64; ) {
            const rs = simbolo(c.ac)
            const tamanho = rs & 15
            if (!tamanho) {
              if (rs !== 0xf0) break
              k += 16
              continue
            }
            k += rs >> 4
            if (k > 63) throw erro('coeficiente fora do bloco')
            const z = ZIGUEZAGUE[k]
            bloco[z] = valor(tamanho) * c.q[z]
            ultimo = k
            k++
          }
          const plano = c.plano
          if (ultimo === 0) {
            // bloco liso: só o DC
            const v = Math.round(bloco[0] / 8 + 128)
            const liso = v < 0 ? 0 : v > 255 ? 255 : v
            for (let y = 0; y < 8; y++) plano.fill(liso, (y0 + y) * c.w + x0, (y0 + y) * c.w + x0 + 8)
            continue
          }
          for (let i = 0; i < 8; i++) idct8(bloco, i * 8, 1)
          for (let i = 0; i < 8; i++) idct8(bloco, i, 8)
          for (let y = 0; y < 8; y++) {
            const o = (y0 + y) * c.w + x0
            for (let x = 0; x < 8; x++) {
              const v = Math.round(bloco[y * 8 + x] + 128)
              plano[o + x] = v < 0 ? 0 : v > 255 ? 255 : v
            }
          }
        }
      }
    }
  }

  // planos → imagem
  const W = reduzir === 8 ? Math.ceil(largura / 8) : largura
  const H = reduzir === 8 ? Math.ceil(altura / 8) : altura
  if (comps.length === 1) {
    const dados = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) dados.set(comps[0].plano.subarray(y * comps[0].w, y * comps[0].w + W), y * W)
    return { largura: W, altura: H, canais: 1, dados, reduzir }
  }
  // leitura de cada plano no tamanho cheio: o que já está no tamanho cheio é copiado; o subamostrado, em bilinear
  const linhas = comps.map(() => new Float32Array(W))
  const mapas = comps.map((c) => {
    const fx = c.h / hMax
    const fy = c.v / vMax
    if (fx === 1 && fy === 1) return null
    const maxX = c.blocosX * lado - 1
    const x0 = new Int32Array(W)
    const tx = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const f = Math.min(Math.max((x + 0.5) * fx - 0.5, 0), maxX)
      x0[x] = Math.min(f | 0, Math.max(0, maxX - 1))
      tx[x] = maxX > 0 ? f - x0[x] : 0
    }
    return { fy, x0, tx, maxX, maxY: c.blocosY * lado - 1 }
  })
  const rgb = adobe === 0
  const dados = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let k = 0; k < 3; k++) {
      const c = comps[k]
      const m = mapas[k]
      const linha = linhas[k]
      if (!m) {
        const o = y * c.w
        for (let x = 0; x < W; x++) linha[x] = c.plano[o + x]
        continue
      }
      const f = Math.min(Math.max((y + 0.5) * m.fy - 0.5, 0), m.maxY)
      const y0 = Math.min(f | 0, Math.max(0, m.maxY - 1))
      const ty = m.maxY > 0 ? f - y0 : 0
      const a = y0 * c.w
      const b = (m.maxY > 0 ? y0 + 1 : y0) * c.w
      const passo = m.maxX > 0 ? 1 : 0
      for (let x = 0; x < W; x++) {
        const i = m.x0[x]
        const t = m.tx[x]
        const cima = c.plano[a + i] + (c.plano[a + i + passo] - c.plano[a + i]) * t
        const baixo = c.plano[b + i] + (c.plano[b + i + passo] - c.plano[b + i]) * t
        linha[x] = cima + (baixo - cima) * ty
      }
    }
    const o = y * W * 3
    const [l0, l1, l2] = linhas
    for (let x = 0; x < W; x++) {
      let r = l0[x]
      let g = l1[x]
      let b = l2[x]
      if (!rgb) {
        // JFIF 1.02: R = Y + 1,402·(Cr − 128); G = Y − 0,344136·(Cb − 128) − 0,714136·(Cr − 128); B = Y + 1,772·(Cb − 128)
        const cb = g - 128
        const cr = b - 128
        g = r - 0.344136 * cb - 0.714136 * cr
        b = r + 1.772 * cb
        r += 1.402 * cr
      }
      r = Math.round(r)
      g = Math.round(g)
      b = Math.round(b)
      dados[o + x * 3] = r < 0 ? 0 : r > 255 ? 255 : r
      dados[o + x * 3 + 1] = g < 0 ? 0 : g > 255 ? 255 : g
      dados[o + x * 3 + 2] = b < 0 ? 0 : b > 255 ? 255 : b
    }
  }
  return { largura: W, altura: H, canais: 3, dados, reduzir }
}
