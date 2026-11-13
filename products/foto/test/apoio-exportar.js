// Apoio dos testes de exportação: imagens geradas com semente (nenhum binário no repositório), um decodificador JPEG
// baseline mínimo (para conferir o codificador sem depender de navegador), métricas e a porta para o Chromium.

import { createRequire } from 'node:module'

/** Gerador determinístico (mulberry32): mesma semente, mesmos números. */
export function sorteio(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Cena de teste em valores de tela (0..1): degradê de fundo, retângulos e discos de cor com borda dura, uma textura
 * fina e um pouco de ruído. Parece uma foto para um codificador: tem área lisa, borda e detalhe.
 */
export function cenaDeTeste(largura, altura, semente = 1) {
  const r = sorteio(semente)
  const dados = new Float32Array(largura * altura * 3)
  const formas = Array.from({ length: 14 }, () => ({
    disco: r() < 0.5,
    x: r() * largura,
    y: r() * altura,
    a: (0.05 + r() * 0.2) * largura,
    b: (0.05 + r() * 0.2) * altura,
    cor: [r(), r(), r()],
  }))
  const fase = r() * 6
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 3
      const u = x / largura
      const v = y / altura
      let cor = [0.15 + 0.6 * u, 0.2 + 0.5 * v, 0.7 - 0.5 * u * v]
      for (const f of formas) {
        const dx = (x - f.x) / f.a
        const dy = (y - f.y) / f.b
        if (f.disco ? dx * dx + dy * dy < 1 : Math.abs(dx) < 1 && Math.abs(dy) < 1) cor = f.cor
      }
      const textura = 0.04 * Math.sin(x * 0.9 + fase) * Math.sin(y * 0.7)
      for (let c = 0; c < 3; c++) {
        const valor = cor[c] + textura + (r() - 0.5) * 0.02
        dados[i + c] = valor < 0 ? 0 : valor > 1 ? 1 : valor
      }
    }
  }
  return { largura, altura, dados }
}

/** Imagem de tela → Uint8Array RGB (arredondando). */
export function paraRgb8(imagem) {
  const saida = new Uint8Array(imagem.dados.length)
  for (let i = 0; i < saida.length; i++) saida[i] = Math.round(imagem.dados[i] * 255)
  return saida
}

/** Imagem de tela → Uint16Array RGB. */
export function paraRgb16(imagem) {
  const saida = new Uint16Array(imagem.dados.length)
  for (let i = 0; i < saida.length; i++) saida[i] = Math.round(imagem.dados[i] * 65535)
  return saida
}

/** Erro médio absoluto e PSNR entre dois vetores de 8 bits do mesmo tamanho. */
export function comparar8(a, b) {
  if (a.length !== b.length) throw new Error(`comparar8: tamanhos diferentes (${a.length} e ${b.length})`)
  let soma = 0
  let quadrados = 0
  let maior = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    soma += d
    quadrados += d * d
    if (d > maior) maior = d
  }
  const mse = quadrados / a.length
  return { medio: soma / a.length, maior, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse) }
}

// ─────────── decodificador JPEG baseline (ITU-T T.81), só o necessário: Huffman, 8 bits, 3 componentes ──────

const ZIGUEZAGUE = (() => {
  const z = []
  for (let soma = 0; soma < 15; soma++) {
    const de = Math.max(0, soma - 7)
    const ate = Math.min(soma, 7)
    if (soma % 2 === 0) for (let l = ate; l >= de; l--) z.push(l * 8 + (soma - l))
    else for (let l = de; l <= ate; l++) z.push(l * 8 + (soma - l))
  }
  return z
})()

// T.81, A.3.3: a DCT inversa pela definição (lenta e direta, de propósito: é a régua do teste)
const COSSENOS = Array.from({ length: 8 }, (_, x) =>
  Array.from({ length: 8 }, (_, u) => (u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)),
)

function idct(coef, saida) {
  const meio = new Float64Array(64)
  for (let l = 0; l < 8; l++) {
    for (let x = 0; x < 8; x++) {
      let s = 0
      for (let u = 0; u < 8; u++) s += COSSENOS[x][u] * coef[l * 8 + u]
      meio[l * 8 + x] = s / 2
    }
  }
  for (let c = 0; c < 8; c++) {
    for (let y = 0; y < 8; y++) {
      let s = 0
      for (let v = 0; v < 8; v++) s += COSSENOS[y][v] * meio[v * 8 + c]
      saida[y * 8 + c] = s / 2
    }
  }
}

// T.81, anexo C e F.2.2.3: tabela de decodificação a partir de BITS e HUFFVAL
function tabelaDeHuffman(bits, valores) {
  const menor = new Int32Array(17)
  const maior = new Int32Array(17).fill(-1)
  const primeiro = new Int32Array(17)
  let codigo = 0
  let k = 0
  for (let n = 1; n <= 16; n++) {
    primeiro[n] = k
    menor[n] = codigo
    codigo += bits[n - 1]
    k += bits[n - 1]
    maior[n] = bits[n - 1] ? codigo - 1 : -1
    codigo <<= 1
  }
  return { menor, maior, primeiro, valores }
}

/**
 * Decodifica um JPEG baseline de 3 componentes (YCbCr, com a croma inteira ou subamostrada).
 * → { largura, altura, rgb: Uint8Array, amostragem: [[h, v], …], qualidadeDeclarada? }
 */
export function decodificarJpeg(jpeg) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('decodificarJpeg: não começa com SOI')
  const quantizacao = []
  const huffman = { dc: [], ac: [] }
  let quadro = null
  let p = 2
  let reinicio = 0
  for (;;) {
    if (jpeg[p] !== 0xff) throw new Error(`decodificarJpeg: marcador esperado em ${p}`)
    const m = jpeg[p + 1]
    const tam = (jpeg[p + 2] << 8) | jpeg[p + 3]
    const d = p + 4
    if (m === 0xdb) {
      for (let q = d; q < p + 2 + tam;) {
        if (jpeg[q] >> 4 !== 0) throw new Error('decodificarJpeg: só tabela de quantização de 8 bits')
        const tabela = new Int32Array(64)
        for (let k = 0; k < 64; k++) tabela[ZIGUEZAGUE[k]] = jpeg[q + 1 + k]
        quantizacao[jpeg[q] & 15] = tabela
        q += 65
      }
    } else if (m === 0xc0) {
      if (jpeg[d] !== 8) throw new Error('decodificarJpeg: só 8 bits')
      quadro = { altura: (jpeg[d + 1] << 8) | jpeg[d + 2], largura: (jpeg[d + 3] << 8) | jpeg[d + 4], componentes: [] }
      for (let c = 0; c < jpeg[d + 5]; c++) {
        const q = d + 6 + c * 3
        quadro.componentes.push({ id: jpeg[q], h: jpeg[q + 1] >> 4, v: jpeg[q + 1] & 15, tq: jpeg[q + 2] })
      }
    } else if (m === 0xc4) {
      for (let q = d; q < p + 2 + tam;) {
        const bits = Array.from(jpeg.subarray(q + 1, q + 17))
        const n = bits.reduce((s, b) => s + b, 0)
        const tabela = tabelaDeHuffman(bits, jpeg.subarray(q + 17, q + 17 + n))
        if (jpeg[q] >> 4 === 0) huffman.dc[jpeg[q] & 15] = tabela
        else huffman.ac[jpeg[q] & 15] = tabela
        q += 17 + n
      }
    } else if (m === 0xdd) reinicio = (jpeg[d] << 8) | jpeg[d + 1]
    else if (m === 0xda) {
      if (!quadro) throw new Error('decodificarJpeg: SOS antes de SOF0 (ou o arquivo não é baseline)')
      for (let c = 0; c < jpeg[d]; c++) {
        const comp = quadro.componentes.find((x) => x.id === jpeg[d + 1 + c * 2])
        comp.td = jpeg[d + 2 + c * 2] >> 4
        comp.ta = jpeg[d + 2 + c * 2] & 15
      }
      p += 2 + tam
      break
    } else if (m >= 0xc1 && m <= 0xcf && m !== 0xc8 && m !== 0xcc) throw new Error('decodificarJpeg: só baseline (SOF0)')
    p += 2 + tam
  }

  const hMax = Math.max(...quadro.componentes.map((c) => c.h))
  const vMax = Math.max(...quadro.componentes.map((c) => c.v))
  const colunas = Math.ceil(quadro.largura / (8 * hMax))
  const linhas = Math.ceil(quadro.altura / (8 * vMax))
  for (const c of quadro.componentes) {
    c.largura = colunas * c.h * 8
    c.altura = linhas * c.v * 8
    c.plano = new Float32Array(c.largura * c.altura)
    c.anterior = 0
  }

  // leitor de bits: FF 00 é um FF de verdade; FF Dn é reinício
  let acumulador = 0
  let disponiveis = 0
  const bit = () => {
    if (disponiveis === 0) {
      let b = jpeg[p++]
      if (b === 0xff) {
        const x = jpeg[p]
        if (x === 0) p++
        else if (x >= 0xd0 && x <= 0xd7) {
          p++
          b = jpeg[p++]
          if (b === 0xff && jpeg[p] === 0) p++
        } else throw new Error('decodificarJpeg: marcador no meio dos dados')
      }
      acumulador = b
      disponiveis = 8
    }
    disponiveis--
    return (acumulador >> disponiveis) & 1
  }
  const simbolo = (t) => {
    let codigo = 0
    for (let n = 1; n <= 16; n++) {
      codigo = (codigo << 1) | bit()
      if (t.maior[n] >= 0 && codigo <= t.maior[n] && codigo >= t.menor[n]) return t.valores[t.primeiro[n] + codigo - t.menor[n]]
    }
    throw new Error('decodificarJpeg: código de Huffman inválido')
  }
  const receber = (n) => {
    let v = 0
    for (let i = 0; i < n; i++) v = (v << 1) | bit()
    return n && v < 1 << (n - 1) ? v - (1 << n) + 1 : v
  }

  const coef = new Float64Array(64)
  const pixels = new Float64Array(64)
  let unidades = 0
  for (let my = 0; my < linhas; my++) {
    for (let mx = 0; mx < colunas; mx++) {
      if (reinicio && unidades > 0 && unidades % reinicio === 0) {
        disponiveis = 0
        for (const c of quadro.componentes) c.anterior = 0
      }
      unidades++
      for (const c of quadro.componentes) {
        const q = quantizacao[c.tq]
        for (let by = 0; by < c.v; by++) {
          for (let bx = 0; bx < c.h; bx++) {
            coef.fill(0)
            c.anterior += receber(simbolo(huffman.dc[c.td]))
            coef[0] = c.anterior * q[0]
            for (let k = 1; k < 64;) {
              const rs = simbolo(huffman.ac[c.ta])
              const corrida = rs >> 4
              const n = rs & 15
              if (n === 0) {
                if (corrida !== 15) break
                k += 16
                continue
              }
              k += corrida
              coef[ZIGUEZAGUE[k]] = receber(n) * q[ZIGUEZAGUE[k]]
              k++
            }
            idct(coef, pixels)
            const x0 = (mx * c.h + bx) * 8
            const y0 = (my * c.v + by) * 8
            for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.plano[(y0 + y) * c.largura + x0 + x] = pixels[y * 8 + x] + 128
          }
        }
      }
    }
  }

  // croma subamostrada volta por repetição (o vizinho mais próximo) e YCbCr → RGB pelo JFIF
  const [Y, Cb, Cr] = quadro.componentes
  const rgb = new Uint8Array(quadro.largura * quadro.altura * 3)
  const ler = (c, x, y) => c.plano[Math.floor((y * c.v) / vMax) * c.largura + Math.floor((x * c.h) / hMax)]
  const byte = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
  for (let y = 0; y < quadro.altura; y++) {
    for (let x = 0; x < quadro.largura; x++) {
      const l = ler(Y, x, y)
      const cb = ler(Cb, x, y) - 128
      const cr = ler(Cr, x, y) - 128
      const i = (y * quadro.largura + x) * 3
      rgb[i] = byte(l + 1.402 * cr)
      rgb[i + 1] = byte(l - 0.344136 * cb - 0.714136 * cr)
      rgb[i + 2] = byte(l + 1.772 * cb)
    }
  }
  return { largura: quadro.largura, altura: quadro.altura, rgb, amostragem: quadro.componentes.map((c) => [c.h, c.v]) }
}

// ─────────── Chromium ───────────

let chromium = null
try {
  // require (e não import) para achar o Playwright também pelo NODE_PATH do ambiente
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  chromium = null
}

export const EXIGIR = process.env.FOTO_EXIGIR === '1'
/** false quando há Playwright; senão o motivo para pular o teste. */
export const semChromium = chromium ? false : 'sem Playwright na máquina'

/** Abre o Chromium com tempos folgados (a máquina é dividida). Quem chama fecha. */
export async function abrirChromium() {
  return chromium.launch({ timeout: 120000 })
}

/** Bytes → texto base64, para levar um arquivo até a página. */
export const base64 = (bytes) => Buffer.from(bytes).toString('base64')
