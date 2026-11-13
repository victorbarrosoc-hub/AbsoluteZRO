// Magnitude · medidas: o que dá para MEDIR numa prévia, sem modelo nenhum. Nitidez em duas escalas (com o mapa de onde
// está o foco), tremido contra desfoque, exposição, ruído, impressões digitais para achar repetidas e a linha do
// horizonte. Tudo sobre a luma Rec.709 dos valores codificados (0..255) de uma prévia com 1024 px no lado maior: os
// limiares foram medidos nesse tamanho.
//
//   medir(previa { largura, altura, rgba }) → Medidas
//   {
//     largura, altura,
//     nitidez:   { q, s0, s1, qLocal, mapa: { colunas, linhas, bloco, valores: Float32Array } },
//     borrao:    { tipo: 'nenhum' | 'foco' | 'movimento', grau: 'nenhum' | 'leve' | 'forte', comprimento?, angulo?,
//                  cepstro: { z, comprimento, angulo, anel, lado } | null } | null,
//     exposicao: { altas, altas3, baixas, p1, p50, p99, media },   // altas, altas3 e baixas em fração da área (0..1)
//     ruido,       // desvio estimado, em níveis de 8 bits
//     dhash, phash,  // 64 bits em 16 dígitos hexadecimais
//     horizonte: { angulo, forca } | null
//   }
//
// Ângulos em graus, com o y da tela para baixo: `borrao.angulo` é a direção do tremido (0..180; 0 = horizontal, cresce
// no sentido horário); `horizonte.angulo` > 0 quer dizer que a linha desce para a direita.
//
// O que não deu para medir sai null (nitidez e borrão de miniatura sem blocos, cepstro de prévia com menos de 256 px,
// horizonte sem borda), nunca um número de enfeite.

import { cepstroDePotencia, lerCepstro } from './fft.js'

/**
 * Limiares, num lugar só. Vêm de 16 fotos com borrões sintéticos (matriz nítida/leve/foco/movimento fechada nelas);
 * precisam de fotos reais de ensaio para firmar, em especial tremido de mão (curvo) e movimento só do sujeito.
 * Quem decide a classe é `qLocal` (o q das partes mais nítidas); `q` é a medida de percentis da prova original.
 */
export const LIMIARES = Object.freeze({
  // q = S0 / S1: quanto do detalhe está na escala mais fina
  nitida: 0.7,
  leve: 0.6,
  // cepstro: vale fundo (z-score) fora do centro, a pelo menos `comprimentoMin` px, e sem anel em volta
  cepstroZ: -10,
  cepstroRaioMin: 4,
  cepstroRaioMax: 64,
  // 6 px: abaixo disso o vale não é tremido. Prévia embutida de câmera, com a nitidez aplicada pela própria câmera,
  // mostra vales de z ≤ −10 a 4 ou 5 px do centro (visto numa sequência real de 21 fotos; a causa provável, não
  // confirmada, é o halo dessa nitidez).
  comprimentoMin: 6,
  comprimentoForte: 12,
  anel: -2.5,
  // exposição, em níveis de 8 bits
  estourado: 253,
  fechado: 2,
  // horizonte: só ângulos pequenos (uma foto de pé não é horizonte torto)
  horizonteFaixa: 15,
  horizontePasso: 0.25,
})

const BLOCO = 32
const PISO = 16 // somado à média do bloco: sombra profunda não vira "nítida" por dividir por quase zero

// ───────────────────────────── utilitários ─────────────────────────────

/** Luma Rec.709 dos valores codificados: { largura, altura, dados: Float32Array } de 0 a 255. */
export function lumaDe(previa) {
  const { largura, altura, rgba } = conferir(previa)
  const n = largura * altura
  const dados = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) dados[i] = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722
  return { largura, altura, dados }
}

function conferir(previa) {
  const { largura, altura, rgba } = previa || {}
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 1 || altura < 1) throw new Error('Prévia inválida: largura e altura')
  if (!rgba || rgba.length !== largura * altura * 4) throw new Error('Prévia inválida: rgba precisa ter largura × altura × 4 valores')
  return previa
}

/** Média 2 × 2 (a escala seguinte). Linha ou coluna que sobra fica de fora. */
export function reduzir(luma) {
  const w = luma.largura >> 1
  const h = luma.altura >> 1
  const dados = new Float32Array(w * h)
  const e = luma.dados
  const W = luma.largura
  for (let y = 0; y < h; y++) {
    const a = 2 * y * W
    const b = a + W
    const s = y * w
    for (let x = 0; x < w; x++) dados[s + x] = (e[a + 2 * x] + e[a + 2 * x + 1] + e[b + 2 * x] + e[b + 2 * x + 1]) * 0.25
  }
  return { largura: w, altura: h, dados }
}

// Deixa a[k] com o k-ésimo menor valor (os menores à esquerda, os maiores à direita). Hoare, sem recursão.
function selecionar(a, k, ini = 0, fim = a.length - 1) {
  while (fim > ini) {
    const pivo = a[(ini + fim) >> 1]
    let i = ini
    let j = fim
    while (i <= j) {
      while (a[i] < pivo) i++
      while (a[j] > pivo) j--
      if (i <= j) {
        const t = a[i]
        a[i] = a[j]
        a[j] = t
        i++
        j--
      }
    }
    if (k <= j) fim = j
    else if (k >= i) ini = i
    else return
  }
}

/**
 * Percentil com interpolação linear entre os vizinhos (a mesma conta do numpy.percentile). MEXE na ordem de `a`:
 * passe uma cópia se precisar dela inteira. Vazio devolve NaN.
 */
export function percentil(a, p) {
  const n = a.length
  if (!n) return NaN
  const pos = ((n - 1) * p) / 100
  const k = Math.floor(pos)
  selecionar(a, k)
  if (k + 1 >= n || pos === k) return a[k]
  let prox = Infinity
  for (let i = k + 1; i < n; i++) if (a[i] < prox) prox = a[i]
  return a[k] + (prox - a[k]) * (pos - k)
}

// Arredonda com empate para o par (como o numpy.round): os testes travam os números contra o numpy.
function arredondar(x) {
  const r = Math.round(x)
  return x - Math.floor(x) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

// ───────────────────────────── nitidez ─────────────────────────────

/**
 * Uma passada pelo miolo da imagem (ou de uma região), em blocos de `bloco` px: energia do gradiente de Sobel
 * (Tenengrad: Krotkov, 1987), média da luma e, se pedido, o operador de ruído de Immerkær. Os blocos nascem no
 * pixel (x0 + 1, y0 + 1) porque o Sobel não existe na borda.
 */
function passada(luma, bloco, { x0 = 0, y0 = 0, x1 = luma.largura, y1 = luma.altura, ruido = false } = {}) {
  const W = luma.largura
  const g = luma.dados
  const colunas = Math.floor((x1 - x0 - 2) / bloco)
  const linhas = Math.floor((y1 - y0 - 2) / bloco)
  const total = Math.max(0, colunas) * Math.max(0, linhas)
  const energia = new Float64Array(total)
  const media = new Float64Array(total)
  const imm = ruido ? new Float64Array(total) : null
  if (!total) return { colunas: Math.max(0, colunas), linhas: Math.max(0, linhas), bloco, energia, media, imm }
  const fimX = x0 + 1 + colunas * bloco
  const fimY = y0 + 1 + linhas * bloco
  for (let y = y0 + 1; y < fimY; y++) {
    const cima = (y - 1) * W
    const meio = y * W
    const baixo = (y + 1) * W
    const linhaDoBloco = Math.floor((y - y0 - 1) / bloco) * colunas
    // janela 3 × 3 deslizante: a cada pixel entram só os três valores da coluna da direita
    let a = g[cima + x0]
    let b = g[cima + x0 + 1]
    let d = g[meio + x0]
    let o = g[meio + x0 + 1]
    let p = g[baixo + x0]
    let q = g[baixo + x0 + 1]
    for (let bx = 0, x = x0 + 1; x < fimX; bx++) {
      let e = 0
      let m = 0
      let r = 0
      const ate = x + bloco
      for (; x < ate; x++) {
        const c = g[cima + x + 1]
        const f = g[meio + x + 1]
        const s = g[baixo + x + 1]
        const gx = c + 2 * f + s - (a + 2 * d + p)
        const gy = p + 2 * q + s - (a + 2 * b + c)
        e += gx * gx + gy * gy
        m += o
        if (ruido) r += Math.abs(a - 2 * b + c - 2 * d + 4 * o - 2 * f + p - 2 * q + s)
        a = b
        b = c
        d = o
        o = f
        p = q
        q = s
      }
      energia[linhaDoBloco + bx] += e
      media[linhaDoBloco + bx] += m
      if (ruido) imm[linhaDoBloco + bx] += r
    }
  }
  const area = bloco * bloco
  for (let i = 0; i < total; i++) {
    energia[i] /= area
    media[i] /= area
    if (ruido) imm[i] /= area
  }
  return { colunas, linhas, bloco, energia, media, imm }
}

// s de cada bloco: contraste de borda relativo = raiz do Tenengrad do bloco sobre a luz do bloco
function contraste({ energia, media }) {
  const s = new Float32Array(energia.length)
  for (let i = 0; i < s.length; i++) s[i] = Math.sqrt(energia[i]) / (media[i] + PISO)
  return s
}

/**
 * O contraste de borda de cada bloco da imagem inteira: { colunas, linhas, bloco, valores: Float32Array }. O bloco
 * (coluna, linha) cobre os pixels a partir de (1 + coluna·bloco, 1 + linha·bloco). É o que a tela pinta para mostrar
 * onde está o foco, e o que separa o rosto do fundo.
 */
export function mapaDeNitidez(luma, bloco = BLOCO) {
  const p = passada(luma, bloco)
  return { colunas: p.colunas, linhas: p.linhas, bloco, valores: contraste(p) }
}

/**
 * S de uma região: percentil 90, entre os blocos, do contraste de borda relativo. O percentil 90 responde "existe
 * alguma parte em foco aqui?", então o resto desfocado de propósito não derruba a região.
 * `caixa` = { x, y, largura, altura } em px da luma (cortada na imagem). Devolve { s, blocos } ou null se não cabe
 * nem um bloco.
 */
export function nitidezDaRegiao(luma, caixa, bloco = 16) {
  const x0 = Math.max(0, Math.floor(caixa.x))
  const y0 = Math.max(0, Math.floor(caixa.y))
  const x1 = Math.min(luma.largura, Math.ceil(caixa.x + caixa.largura))
  const y1 = Math.min(luma.altura, Math.ceil(caixa.y + caixa.altura))
  const p = passada(luma, bloco, { x0, y0, x1, y1 })
  if (!p.energia.length) return null
  return { s: percentil(contraste(p), 90), blocos: p.energia.length }
}

/**
 * q de uma região: o mesmo S em duas escalas (a região inteira e ela reduzida à metade, com bloco pela metade),
 * q = S0 / S1. Normaliza o conteúdo: compara o detalhe fino com o da escala seguinte, e cai com qualquer borrão.
 * `metade` é a luma já reduzida (reduzir(luma)), para não refazer a conta a cada rosto.
 */
export function qDaRegiao(luma, metade, caixa, bloco = 16) {
  const a = nitidezDaRegiao(luma, caixa, bloco)
  const b = nitidezDaRegiao(metade, { x: caixa.x / 2, y: caixa.y / 2, largura: caixa.largura / 2, altura: caixa.altura / 2 }, Math.max(2, bloco >> 1))
  if (!a || !b || !(b.s > 0)) return null
  return { q: a.s / b.s, s0: a.s, s1: b.s, blocos: a.blocos }
}

// ───────────────────────────── tremido contra desfoque ─────────────────────────────

/**
 * Cepstro de potência num recorte central (512 px; 256 px se a prévia for estreita) com janela de Hann.
 * Tremido linear de L px deixa dois vales negativos opostos, a distância L do centro, na direção do movimento
 * (Cannon, 1976). Desfoque de lente (disco) deixa um ANEL inteiro de vales; por isso o teste do anel: a mediana do
 * z-score em 24 pontos do círculo de raio L precisa continuar perto de zero.
 *
 * O cepstro de uma imagem real é par, então o ponto oposto ao vale tem o mesmo valor: conferir os dois lados seria
 * repetir a mesma conta. Devolve null se a prévia não comporta um recorte de 256 px.
 */
export function medirCepstro(luma) {
  const menor = Math.min(luma.largura, luma.altura)
  const lado = menor >= 512 ? 512 : menor >= 256 ? 256 : 0
  if (!lado) return null
  const raioMax = LIMIARES.cepstroRaioMax
  const raioMin = LIMIARES.cepstroRaioMin
  const x0 = (luma.largura - lado) >> 1
  const y0 = (luma.altura - lado) >> 1
  const g = luma.dados
  const W = luma.largura
  let soma = 0
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) soma += g[(y0 + y) * W + x0 + x]
  const media = soma / (lado * lado)
  const hann = new Float64Array(lado)
  for (let i = 0; i < lado; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (lado - 1))
  const recorte = new Float64Array(lado * lado)
  for (let y = 0; y < lado; y++) {
    const jy = hann[y]
    for (let x = 0; x < lado; x++) recorte[y * lado + x] = (g[(y0 + y) * W + x0 + x] - media) * jy * hann[x]
  }
  const cep = cepstroDePotencia(recorte, lado, raioMax)
  // média e desvio no anel raioMin..raioMax do plano inteiro: a metade dx > 0 conta em dobro (o espelho)
  let n = 0
  let s1 = 0
  let s2 = 0
  let menorValor = Infinity
  let dxMin = 0
  let dyMin = 0
  const r2min = raioMin * raioMin
  const r2max = raioMax * raioMax
  for (let dy = -raioMax; dy <= raioMax; dy++) {
    for (let dx = 0; dx <= raioMax; dx++) {
      const r2 = dx * dx + dy * dy
      if (r2 < r2min || r2 > r2max) continue
      const v = cep.dados[(dy + raioMax) * cep.lado + dx]
      const peso = dx === 0 ? 1 : 2
      n += peso
      s1 += peso * v
      s2 += peso * v * v
      if (v < menorValor) {
        menorValor = v
        dxMin = dx
        dyMin = dy
      }
    }
  }
  const m = s1 / n
  const desvio = Math.sqrt(Math.max(0, s2 / n - m * m))
  if (!(desvio > 0)) return null
  const z = (menorValor - m) / desvio
  const comprimento = Math.hypot(dxMin, dyMin)
  const anel = []
  const centro = lado / 2
  for (let grau = 0; grau < 360; grau += 15) {
    const t = (grau * Math.PI) / 180
    // arredonda a posição já somada ao centro, como a referência em numpy (meio pixel exato cai no par)
    const dy = Math.max(-raioMax, Math.min(raioMax, arredondar(centro + comprimento * Math.sin(t)) - centro))
    const dx = Math.max(-raioMax, Math.min(raioMax, arredondar(centro + comprimento * Math.cos(t)) - centro))
    anel.push((lerCepstro(cep, dy, dx) - m) / desvio)
  }
  anel.sort((a, b) => a - b)
  // ângulo da direção do movimento, 0..180 (0 = horizontal; cresce no sentido horário da tela, y para baixo)
  const angulo = ((Math.atan2(dyMin, dxMin) * 180) / Math.PI + 180) % 180
  return { z, comprimento, angulo, anel: (anel[11] + anel[12]) / 2, lado }
}

/**
 * q das partes mais nítidas: a soma do contraste de borda dos 10% de blocos mais nítidos na escala 0, sobre a soma
 * dos MESMOS blocos na escala 1 (o bloco de 32 px e o de 16 px da imagem reduzida cobrem a mesma área).
 * Em imagem de nitidez uniforme dá o mesmo número que q (os testes travam isso). A diferença aparece quando só uma
 * parte está em foco: no q de percentis, o percentil 90 de cada escala cai em blocos diferentes (na escala 1, nas
 * bordas grandes do fundo desfocado), e o retrato com fundo desfocado sai como borrado; aqui as duas escalas olham
 * para os mesmos blocos, e a pergunta passa a ser "o que está em foco, está nítido?".
 */
function qDasPartesNitidas(p0, s0, p1, s1) {
  const colunas = Math.min(p0.colunas, p1.colunas)
  const linhas = Math.min(p0.linhas, p1.linhas)
  const total = colunas * linhas
  if (total < 4) return null
  const ordem = []
  for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) ordem.push([s0[l * p0.colunas + c], s1[l * p1.colunas + c]])
  ordem.sort((a, b) => b[0] - a[0])
  const k = Math.max(4, Math.round(total * 0.1))
  let a = 0
  let b = 0
  for (let i = 0; i < k; i++) {
    a += ordem[i][0]
    b += ordem[i][1]
  }
  return b > 0 ? a / b : null
}

function classificarBorrao(q, cep) {
  const movimento = !!cep && cep.z <= LIMIARES.cepstroZ && cep.comprimento >= LIMIARES.comprimentoMin && cep.anel > LIMIARES.anel
  if (movimento) {
    return {
      tipo: 'movimento',
      grau: cep.comprimento >= LIMIARES.comprimentoForte ? 'forte' : 'leve',
      comprimento: cep.comprimento,
      angulo: cep.angulo,
      cepstro: cep,
    }
  }
  if (q >= LIMIARES.nitida) return { tipo: 'nenhum', grau: 'nenhum', cepstro: cep }
  return { tipo: 'foco', grau: q >= LIMIARES.leve ? 'leve' : 'forte', cepstro: cep }
}

/** As quatro classes da matriz de validação: 'nitida' | 'leve' | 'foco' | 'movimento' (null se não deu para medir). */
export function classeDeNitidez(medidas) {
  const b = medidas.borrao
  if (!b) return null
  if (b.tipo === 'movimento') return 'movimento'
  if (b.tipo === 'nenhum') return 'nitida'
  return b.grau === 'leve' ? 'leve' : 'foco'
}

// ───────────────────────────── exposição ─────────────────────────────

// Corte pelo MAIOR canal (um canal estourado já perde cor) e pelo MENOR (os três estourados: branco sem volta na
// prévia). Percentis da luma pelo histograma de 256 casas.
function medirExposicao(previa, luma) {
  const { rgba } = previa
  const n = luma.dados.length
  const hist = new Uint32Array(256)
  let altas = 0
  let altas3 = 0
  let baixas = 0
  let soma = 0
  const y = luma.dados
  const teto = LIMIARES.estourado
  const chao = LIMIARES.fechado
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p]
    const g = rgba[p + 1]
    const b = rgba[p + 2]
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b
    if (mx >= teto) {
      altas++
      if (mn >= teto) altas3++
    } else if (mx <= chao) baixas++
    const v = y[i]
    soma += v
    hist[v >= 255 ? 255 : v | 0]++
  }
  const p = (q) => {
    let c = 0
    for (let i = 0; i < 256; i++) {
      c += hist[i] / n
      if (c >= q) return i
    }
    return 255
  }
  return { altas: altas / n, altas3: altas3 / n, baixas: baixas / n, p1: p(0.01), p50: p(0.5), p99: p(0.99), media: soma / n }
}

// ───────────────────────────── impressões digitais ─────────────────────────────

// Miniatura por média de área (cada casa é a média dos pixels que caem nela). É o filtro certo para reduzir muito:
// não deixa passar detalhe fino, que é justamente o que muda entre dois quadros da mesma cena.
function miniatura(luma, colunas, linhas) {
  const { largura: W, altura: H, dados } = luma
  const soma = new Float64Array(colunas * linhas)
  const conta = new Uint32Array(colunas * linhas)
  const casaX = new Uint16Array(W)
  for (let x = 0; x < W; x++) casaX[x] = Math.min(colunas - 1, Math.floor((x * colunas) / W))
  for (let y = 0; y < H; y++) {
    const base = Math.min(linhas - 1, Math.floor((y * linhas) / H)) * colunas
    const linha = y * W
    for (let x = 0; x < W; x++) {
      soma[base + casaX[x]] += dados[linha + x]
      conta[base + casaX[x]]++
    }
  }
  for (let i = 0; i < soma.length; i++) soma[i] = conta[i] ? soma[i] / conta[i] : 0
  return soma
}

function hexDeBits(bits) {
  let s = ''
  for (let i = 0; i < 64; i += 4) s += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16)
  return s
}

/** dHash de 64 bits: miniatura 9 × 8, um bit por vizinho da direita mais claro. */
export function dhashDe(luma) {
  const m = miniatura(luma, 9, 8)
  const bits = new Uint8Array(64)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits[y * 8 + x] = m[y * 9 + x + 1] > m[y * 9 + x] ? 1 : 0
  return hexDeBits(bits)
}

let cossenos = null

/**
 * pHash de 64 bits: DCT-II da miniatura 32 × 32, o bloco 8 × 8 das frequências baixas sem o termo constante, um bit
 * por coeficiente acima da mediana. O primeiro bit (o lugar do termo constante) é sempre 0.
 */
export function phashDe(luma) {
  const N = 32
  const K = 8
  if (!cossenos) {
    cossenos = new Float64Array(K * N)
    for (let i = 0; i < K; i++) for (let j = 0; j < N; j++) cossenos[i * N + j] = Math.cos((Math.PI * (2 * j + 1) * i) / (2 * N))
  }
  const a = miniatura(luma, N, N)
  // só as 8 primeiras linhas e colunas da DCT interessam: D · a · Dᵀ com D de 8 × 32
  const parcial = new Float64Array(K * N)
  for (let i = 0; i < K; i++) {
    for (let x = 0; x < N; x++) {
      let s = 0
      for (let y = 0; y < N; y++) s += cossenos[i * N + y] * a[y * N + x]
      parcial[i * N + x] = s
    }
  }
  const coef = new Float64Array(K * K)
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let s = 0
      for (let x = 0; x < N; x++) s += parcial[i * N + x] * cossenos[j * N + x]
      coef[i * K + j] = s
    }
  }
  const ordenados = Array.from(coef.subarray(1)).sort((x, y) => x - y)
  const mediana = ordenados[31]
  const bits = new Uint8Array(64)
  for (let i = 1; i < 64; i++) bits[i] = coef[i] > mediana ? 1 : 0
  return hexDeBits(bits)
}

const BITS_DO_DIGITO = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

/** Distância de Hamming entre duas impressões de 64 bits (16 dígitos hexadecimais). Faltou uma delas: Infinity. */
export function hamming(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) d += BITS_DO_DIGITO[parseInt(a[i], 16) ^ parseInt(b[i], 16)]
  return d
}

// ───────────────────────────── horizonte ─────────────────────────────

/**
 * Hough restrito (Duda e Hart, 1972, só na faixa de ±15°): bordas fortes (acima do percentil 92 da magnitude) com
 * gradiente quase vertical, isto é, linhas quase deitadas. Para cada ângulo, projeta os pontos em
 * ρ = y·cos θ − x·sen θ, conta em faixas de 2 px e fica com o ângulo da reta mais longa.
 * Roda na imagem reduzida à metade. `forca` = pontos na reta / largura. `angulo` > 0: a linha desce para a direita (foto girada no sentido horário).
 * É só dica: uma reta comprida qualquer (mesa, parede) também responde. Quem avisa decide pela cena.
 */
function medirHorizonte(luma) {
  const { largura, altura, dados: g } = luma
  const w = largura - 2
  const h = altura - 2
  const total = w * h
  if (w < 8 || h < 8) return null
  // gradiente de Sobel em todo o miolo: energia (magnitude²) e se a borda é de linha quase deitada
  const bordas = { energia: new Float32Array(total), deitada: new Uint8Array(total) }
  for (let y = 1, i = 0; y <= h; y++) {
    const cima = (y - 1) * largura
    const meio = y * largura
    const baixo = (y + 1) * largura
    for (let x = 1; x <= w; x++, i++) {
      const a = g[cima + x - 1]
      const c = g[cima + x + 1]
      const p = g[baixo + x - 1]
      const s = g[baixo + x + 1]
      const gx = c + 2 * g[meio + x + 1] + s - (a + 2 * g[meio + x - 1] + p)
      const gy = p + 2 * g[baixo + x] + s - (a + 2 * g[cima + x] + c)
      bordas.energia[i] = gx * gx + gy * gy
      bordas.deitada[i] = Math.abs(gy) > 2.1 * Math.abs(gx) ? 1 : 0
    }
  }
  // percentil 92 da magnitude: a raiz é monótona, então escolhe-se no quadrado e tira-se a raiz dos dois vizinhos
  const copia = bordas.energia.slice(0, total)
  const pos = ((total - 1) * 92) / 100
  const k = Math.floor(pos)
  selecionar(copia, k)
  let prox = Infinity
  for (let i = k + 1; i < total; i++) if (copia[i] < prox) prox = copia[i]
  const baixo = Math.sqrt(copia[k])
  const limiar = k + 1 < total ? baixo + (Math.sqrt(prox) - baixo) * (pos - k) : baixo
  const limiar2 = limiar * limiar
  let n = 0
  for (let i = 0; i < total; i++) if (bordas.deitada[i] && bordas.energia[i] > limiar2) n++
  if (n < 2) return null
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  // O menor e o maior ρ de cada ângulo só podem estar nas pontas de cada linha (ρ é linear em x): guardar o primeiro
  // e o último ponto de cada linha poupa uma passada inteira por ângulo.
  const pontas = []
  for (let i = 0, j = 0, linhaAtual = -1; i < total; i++) {
    if (bordas.deitada[i] && bordas.energia[i] > limiar2) {
      xs[j] = i % w
      ys[j] = (i - xs[j]) / w
      if (ys[j] !== linhaAtual) {
        if (j > 0) pontas.push(j - 1)
        pontas.push(j)
        linhaAtual = ys[j]
      }
      j++
    }
  }
  pontas.push(n - 1)
  let casas = new Int32Array(1024)
  let melhor = 0
  let angulo = 0
  const { horizonteFaixa: faixa, horizontePasso: passo } = LIMIARES
  for (let t = -faixa; t <= faixa + passo / 4; t += passo) {
    const r = (t * Math.PI) / 180
    const c = Math.cos(r)
    const s = Math.sin(r)
    let min = Infinity
    let max = -Infinity
    for (const i of pontas) {
      const v = ys[i] * c - xs[i] * s
      if (v < min) min = v
      if (v > max) max = v
    }
    const tamanho = arredondar((max - min) / 2) + 1
    if (tamanho < 2) continue
    if (casas.length < tamanho) casas = new Int32Array(tamanho * 2)
    else casas.fill(0, 0, tamanho)
    for (let i = 0; i < n; i++) {
      // o mesmo arredondamento com empate para o par, sem chamada: aqui o valor nunca é negativo
      const v = (ys[i] * c - xs[i] * s - min) / 2
      let casa = (v + 0.5) | 0
      if (casa - v === 0.5 && casa & 1) casa--
      casas[casa]++
    }
    let pico = 0
    for (let i = 0; i + 1 < tamanho; i++) if (casas[i] + casas[i + 1] > pico) pico = casas[i] + casas[i + 1]
    if (pico > melhor) {
      melhor = pico
      angulo = t
    }
  }
  if (!melhor) return null
  return { angulo, forca: melhor / largura }
}

// ───────────────────────────── medir ─────────────────────────────

/**
 * Mede uma prévia. `opcoes.luma` aproveita uma luma já calculada (lumaDe); `opcoes.horizonte = false` pula a linha do
 * horizonte (ensaio de estúdio não precisa).
 */
export function medir(previa, opcoes = {}) {
  conferir(previa)
  const luma = opcoes.luma ?? lumaDe(previa)
  const metade = reduzir(luma)

  // escala 0: nitidez por blocos de 32 px e o operador de ruído, na mesma passada
  const p0 = passada(luma, BLOCO, { ruido: true })
  const mapa = contraste(p0)
  // escala 1: a mesma conta na imagem reduzida à metade, com blocos de 16 px
  const p1 = passada(metade, BLOCO >> 1)
  const mapa1 = contraste(p1)
  // com menos de 4 blocos em alguma escala não há percentil que preste: a nitidez sai null, não um palpite
  const mede = mapa.length >= 4 && mapa1.length >= 4
  const s0 = mede ? percentil(mapa.slice(), 90) : null
  const s1 = mede ? percentil(mapa1.slice(), 90) : null
  const q = mede && s1 > 0 ? s0 / s1 : null
  const qLocal = q == null ? null : (qDasPartesNitidas(p0, mapa, p1, mapa1) ?? q)

  // Immerkær (CVIU 64(2), 1996): σ = √(π/2) · média(|I ∗ N|) / 6. Por blocos, ficando com o percentil 10 (os blocos
  // lisos), para a textura não contar como ruído. Subestima cerca de 30% e erra em foto toda texturizada.
  const sigma = new Float64Array(p0.imm.length)
  for (let i = 0; i < sigma.length; i++) sigma[i] = (p0.imm[i] * Math.sqrt(Math.PI / 2)) / 6
  const ruido = sigma.length ? percentil(sigma, 10) : null

  const cep = medirCepstro(luma)
  return {
    largura: previa.largura,
    altura: previa.altura,
    nitidez: { q, s0, s1, qLocal, mapa: { colunas: p0.colunas, linhas: p0.linhas, bloco: BLOCO, valores: mapa } },
    borrao: qLocal == null ? null : classificarBorrao(qLocal, cep),
    exposicao: medirExposicao(previa, luma),
    ruido,
    dhash: dhashDe(metade),
    phash: phashDe(metade),
    horizonte: opcoes.horizonte === false ? null : medirHorizonte(metade),
  }
}
