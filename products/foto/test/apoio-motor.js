// Apoio dos testes do motor: cena sintética com semente, o caminho de ida (cena → mosaico de uma câmera conhecida) e as
// métricas (ΔE em Oklab, PSNR). Nada de arquivo binário: tudo é gerado.

import { criarNegativo } from '../src/raw/negativo.js'
import { D65, matrizEntre, rgbParaXyz, xyParaXYZ } from '../src/motor/cor/espacos.js'
import { inversa, mulM, mulV } from '../src/motor/cor/matriz.js'
import { criarOklab } from '../src/motor/cor/oklab.js'

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

const SRGB_PARA_2020 = matrizEntre('srgb', 'rec2020')
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Código sRGB de 0 a 255 → Rec.2020 linear. */
export function deSrgb8(r, g, b) {
  return mulV(SRGB_PARA_2020, [linear(r / 255), linear(g / 255), linear(b / 255)])
}

// ColorChecker clássico, valores sRGB de 8 bits publicados pela X-Rite (cartela anterior a novembro de 2014).
export const CARTELA = [
  ['pele escura', 115, 82, 68],
  ['pele clara', 194, 150, 130],
  ['céu azul', 98, 122, 157],
  ['folhagem', 87, 108, 67],
  ['flor azul', 133, 128, 177],
  ['verde azulado', 103, 189, 170],
  ['laranja', 214, 126, 44],
  ['azul arroxeado', 80, 91, 166],
  ['vermelho moderado', 193, 90, 99],
  ['roxo', 94, 60, 108],
  ['verde amarelado', 157, 188, 64],
  ['amarelo alaranjado', 224, 163, 46],
  ['azul', 56, 61, 150],
  ['verde', 70, 148, 73],
  ['vermelho', 175, 54, 60],
  ['amarelo', 231, 199, 31],
  ['magenta', 187, 86, 149],
  ['ciano', 8, 133, 161],
  ['branco', 243, 243, 242],
  ['neutro 8', 200, 200, 200],
  ['neutro 6,5', 160, 160, 160],
  ['neutro 5', 122, 122, 121],
  ['neutro 3,5', 85, 85, 85],
  ['preto', 52, 52, 52],
]

/**
 * Cena sintética: fundo em degradê, manchas de cor com borda em vários ângulos (retângulos girados e discos), uma
 * grade fina e uma faixa de cinzas. Desenhada com 4× mais amostras e reduzida por média (a abertura do pixel), com um
 * desfoque leve [1 2 1] (a lente). Rec.2020 linear, cinza médio perto de 0,18. `ganho` multiplica tudo.
 */
export function cena(semente, largura = 240, altura = 160, { ganho = 1, cores = null } = {}) {
  const rnd = sorteio(semente)
  const paleta = cores ?? CARTELA.map(([, r, g, b]) => deSrgb8(r, g, b))
  const S = 4
  const formas = []
  for (let i = 0; i < 46; i++) {
    formas.push({
      disco: rnd() < 0.35,
      cx: rnd() * largura,
      cy: rnd() * altura,
      rx: 4 + rnd() * largura * 0.14,
      ry: 4 + rnd() * altura * 0.18,
      ang: rnd() * Math.PI,
      cor: paleta[(rnd() * paleta.length) | 0],
      luz: 0.5 + rnd() * 1.2,
    })
  }
  const cor = (x, y) => {
    // fundo: degradê de cinza quente a frio
    const t = x / largura
    const u = y / altura
    let c = [0.1 + 0.25 * t, 0.12 + 0.2 * (0.5 * t + 0.5 * u), 0.14 + 0.25 * u]
    for (const f of formas) {
      const dx = x - f.cx
      const dy = y - f.cy
      const a = dx * Math.cos(f.ang) + dy * Math.sin(f.ang)
      const b = -dx * Math.sin(f.ang) + dy * Math.cos(f.ang)
      const dentro = f.disco ? (a * a) / (f.rx * f.rx) + (b * b) / (f.ry * f.ry) < 1 : Math.abs(a) < f.rx && Math.abs(b) < f.ry
      if (dentro) c = [f.cor[0] * f.luz, f.cor[1] * f.luz, f.cor[2] * f.luz]
    }
    // grade diagonal fina num canto (período de 5 px), em cinza
    if (x > largura * 0.7 && y < altura * 0.3) {
      const g = 0.5 + 0.5 * Math.sin(((x + 0.6 * y) * 2 * Math.PI) / 5)
      c = [0.08 + 0.4 * g, 0.08 + 0.4 * g, 0.08 + 0.4 * g]
    }
    // faixa de cinzas embaixo
    if (y > altura * 0.9) {
      const v = 0.02 * 2 ** (Math.floor((x / largura) * 12) / 2)
      c = [v, v, v]
    }
    return c
  }
  const bruta = new Float32Array(largura * altura * 3)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = cor(x + (sx + 0.5) / S, y + (sy + 0.5) / S)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const o = (y * largura + x) * 3
      bruta[o] = (r / (S * S)) * ganho
      bruta[o + 1] = (g / (S * S)) * ganho
      bruta[o + 2] = (b / (S * S)) * ganho
    }
  }
  // lente: [1 2 1]/4 nas duas direções
  const dados = new Float32Array(bruta.length)
  const em = (x, y, c) => bruta[(Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x))) * 3 + c]
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += em(x + dx, y + dy, c) * (dx ? 1 : 2) * (dy ? 1 : 2)
        dados[(y * largura + x) * 3 + c] = s / 16
      }
    }
  }
  return { largura, altura, dados }
}

// Uma matriz XYZ → câmera plausível (forma das matrizes de fabricante: diagonal forte, vermelho e azul cruzados).
export const CAMERA = [0.8293, -0.1611, -0.1132, -0.4759, 1.2711, 0.2275, -0.1013, 0.2415, 0.5509]

export const PADROES = {
  rggb: new Uint8Array([0, 1, 1, 2]),
  bggr: new Uint8Array([2, 1, 1, 0]),
  grbg: new Uint8Array([1, 0, 2, 1]),
  gbrg: new Uint8Array([1, 2, 0, 1]),
}

// X-Trans (6×6) como nos sensores Fujifilm
export const XTRANS = new Uint8Array([1, 2, 1, 1, 0, 1, 0, 1, 0, 2, 1, 2, 1, 2, 1, 1, 0, 1, 1, 0, 1, 1, 2, 1, 2, 1, 2, 0, 1, 0, 1, 0, 1, 1, 2, 1])

/**
 * O caminho de ida de uma câmera: cena Rec.2020 → XYZ → câmera (matriz conhecida) → DN com preto, saturação e
 * margens mascaradas → mosaico. Devolve o negativo (no formato do contrato) e o que o teste precisa saber.
 * `luz`: xy da luz da cena quando não é D65 (a cena é multiplicada no espaço da câmera, como um iluminante faria).
 */
export function fotografar(imagem, opcoes = {}) {
  const {
    cm = CAMERA,
    padrao = PADROES.rggb,
    tipo = 'bayer',
    preto = 256,
    branco = 4095,
    margem = { x: 6, y: 4, direita: 2, baixo: 2 },
    ruido = null, // { leitura, ganho } em DN, com semente
    semente = 7,
    origem = 'libraw',
    matrizes = null,
    neutro = null,
    exposicaoBase = 0,
    orientacao = 1,
  } = opcoes
  const { largura, altura, dados } = imagem
  const paraCamera = mulM(cm, rgbParaXyz('rec2020'))
  const noBranco = neutro ?? mulV(cm, xyParaXYZ(D65))
  const maior = Math.max(...noBranco)
  const lado = tipo === 'bayer' ? 2 : 6
  const sw = largura + margem.x + margem.direita
  const sh = altura + margem.y + margem.baixo
  const sensor = new Uint16Array(sw * sh)
  const rnd = sorteio(semente)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const ax = x - margem.x
      const ay = y - margem.y
      let sinal = 0
      if (ax >= 0 && ay >= 0 && ax < largura && ay < altura) {
        const c = padrao[(ay % lado) * lado + (ax % lado)]
        const o = (ay * largura + ax) * 3
        sinal = ((paraCamera[c * 3] * dados[o] + paraCamera[c * 3 + 1] * dados[o + 1] + paraCamera[c * 3 + 2] * dados[o + 2]) / maior) * (branco - preto)
      }
      let dn = preto + sinal
      if (ruido) dn += gauss() * Math.sqrt(Math.max(0, ruido.ganho * sinal) + ruido.leitura ** 2)
      sensor[y * sw + x] = Math.min(branco, Math.max(0, Math.round(dn)))
    }
  }
  const ganhos = noBranco.map((v) => noBranco[1] / v)
  const negativo = criarNegativo({
    tipo: 'raw',
    formato: 'sintetico',
    sensor: { largura: sw, altura: sh, dados: sensor },
    area: { x: margem.x, y: margem.y, largura, altura },
    cfa: { tipo, lado, padrao },
    preto: { porCanal: [preto, preto, preto] },
    branco: { declarado: [branco, branco, branco] },
    wb: { comoFotografado: ganhos },
    cor: { origem, matrizes: matrizes ?? [{ kelvin: 6504, xyzParaCamera: cm }] },
    exposicaoBase,
    exif: { orientacao },
  })
  return { negativo, ganhos, neutro: noBranco.map((v) => v / maior) }
}

const oklab = criarOklab('rec2020')

/** ΔE em Oklab entre duas imagens Rec.2020 lineares: { medio, pior, p99 }. `mascara` (Uint8Array) escolhe os pixels. */
export function deltaE(a, b, mascara = null) {
  const n = a.largura * a.altura
  const p = [0, 0, 0]
  const q = [0, 0, 0]
  const todos = []
  let soma = 0
  let pior = 0
  for (let i = 0; i < n; i++) {
    if (mascara && !mascara[i]) continue
    oklab.paraOklab(a.dados[i * 3], a.dados[i * 3 + 1], a.dados[i * 3 + 2], p)
    oklab.paraOklab(b.dados[i * 3], b.dados[i * 3 + 1], b.dados[i * 3 + 2], q)
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
    soma += d
    if (d > pior) pior = d
    todos.push(d)
  }
  todos.sort((x, y) => x - y)
  return { medio: soma / Math.max(1, todos.length), pior, p99: todos[Math.floor(todos.length * 0.99)] ?? 0, pixels: todos.length }
}

/** ΔE em Oklab entre duas cores Rec.2020 lineares. */
export function deltaECor(c1, c2) {
  const p = oklab.paraOklab(c1[0], c1[1], c1[2], [0, 0, 0])
  const q = oklab.paraOklab(c2[0], c2[1], c2[2], [0, 0, 0])
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** [L, C, h em graus] de uma cor Rec.2020 linear. */
export function oklch(r, g, b) {
  const p = oklab.paraOklab(r, g, b, [0, 0, 0])
  const h = (Math.atan2(p[2], p[1]) * 180) / Math.PI
  return [p[0], Math.hypot(p[1], p[2]), h < 0 ? h + 360 : h]
}

/** PSNR (dB) entre duas imagens lineares, medido depois da raiz quadrada (perto de como se enxerga), pico 1. */
export function psnr(a, b, mascara = null) {
  let soma = 0
  let n = 0
  const cod = (v) => Math.sqrt(Math.min(1, Math.max(0, v)))
  for (let i = 0; i < a.largura * a.altura; i++) {
    if (mascara && !mascara[i]) continue
    for (let c = 0; c < 3; c++) {
      const d = cod(a.dados[i * 3 + c]) - cod(b.dados[i * 3 + c])
      soma += d * d
      n++
    }
  }
  return 10 * Math.log10(1 / (soma / n))
}

/** Máscara dos pixels de borda de uma imagem (variação do verde na vizinhança 3×3 acima de `limiar`, relativo). */
export function mascaraDeBorda(imagem, limiar = 0.2, margem = 4) {
  const { largura, altura, dados } = imagem
  const m = new Uint8Array(largura * altura)
  for (let y = margem; y < altura - margem; y++) {
    for (let x = margem; x < largura - margem; x++) {
      let lo = Infinity
      let hi = -Infinity
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = dados[((y + dy) * largura + x + dx) * 3 + 1]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      if ((hi - lo) / (hi + lo + 1e-6) > limiar) m[y * largura + x] = 1
    }
  }
  return m
}

/** Máscara do miolo (tudo menos `margem` pixels de cada lado). */
export function miolo(imagem, margem = 4) {
  const { largura, altura } = imagem
  const m = new Uint8Array(largura * altura)
  for (let y = margem; y < altura - margem; y++) for (let x = margem; x < largura - margem; x++) m[y * largura + x] = 1
  return m
}

/** Latitude no formato do contrato, para os testes que precisam de uma. */
export function latitudeDeTeste(extra = {}) {
  return {
    preto: [256, 256, 256],
    branco: [4095, 4095, 4095],
    ruido: { leitura: 3, ganho: 0.6, origem: 'declarado' },
    faixa: { engenharia: 10.3, fotografica: 6.5 },
    margem: { altas: [1, 1, 1], sombras: 4, acimaDoCinza: Math.log2(1 / 0.18), abaixoDoCinza: 7.8 },
    cortado: { um: 0, dois: 0, tres: 0 },
    confianca: 'media',
    ...extra,
  }
}

export { inversa, mulM, mulV }
