// CAMZRO · cor e exposição na imagem. Contas puras; o shader (motor/monitor.js) usa as mesmas tabelas.
//
// - Luma Rec.709: Y = 0,2126 R + 0,7152 G + 0,0722 B (sinal já com gama, como as câmeras medem o vídeo).
// - IRE: o quadro chega ao navegador em RGB de faixa cheia (0–1), então IRE ≈ Y × 100. A faixa legal de 8 bits
//   (16–235) só entra quando o sinal vem de fora em faixa limitada (placa de captura): irePorCodigo().
// - Falsa cor: faixas de IRE com cor; o resto em cinza. ARRI (a tabela pública da ALEXA) e Simples (a do CAMZRO,
//   faixas largas para quem está começando).
// - Vectorscope: Cb = (B − Y) / 1,8556 e Cr = (R − Y) / 1,5748 (BT.709), alvos das barras a 75% e a linha de pele.

export const REC709 = Object.freeze([0.2126, 0.7152, 0.0722])
export const REC601 = Object.freeze([0.299, 0.587, 0.114])

/** Luma (0–1) de RGB (0–1). */
export const luma = (r, g, b, k = REC709) => k[0] * r + k[1] * g + k[2] * b

/** IRE de um código de 8 bits: faixa cheia (0–255) ou legal (16–235). Pode passar de 0–100 (super-branco). */
export const irePorCodigo = (codigo, faixa = 'cheia') => (faixa === 'legal' ? ((codigo - 16) / 219) * 100 : (codigo / 255) * 100)

/**
 * Escalas de falsa cor: faixas [de, até) em IRE (até inclusive no topo). A ordem importa: a primeira que pega vale.
 * ARRI (ALEXA, sinal Rec.709): roxo = preto cortado, azul = logo acima do preto, verde = cinza 18%, rosa = um stop
 * acima do cinza (pele clara), amarelo = logo abaixo do branco, vermelho = branco cortado.
 * Simples (CAMZRO): as mesmas cores em faixas largas — fácil de ler no sol, para quem está começando. A Blackmagic não
 * publica a tabela de IRE da falsa cor do app dela; por isso não há escala "Blackmagic" aqui.
 */
export const FALSA_COR = Object.freeze({
  arri: Object.freeze({
    nome: 'ARRI',
    faixas: Object.freeze([
      { de: -Infinity, ate: 2.5, cor: [0.55, 0.2, 0.75], nome: 'Preto cortado' },
      { de: 2.5, ate: 4, cor: [0.1, 0.35, 0.95], nome: 'Quase preto' },
      { de: 38, ate: 42, cor: [0.2, 0.8, 0.25], nome: 'Cinza 18%' },
      { de: 52, ate: 56, cor: [0.98, 0.5, 0.75], nome: 'Pele (+1 stop)' },
      { de: 97, ate: 99, cor: [1, 0.9, 0.1], nome: 'Quase estourado' },
      { de: 99, ate: Infinity, cor: [0.95, 0.12, 0.1], nome: 'Estourado' },
    ]),
  }),
  simples: Object.freeze({
    nome: 'Simples',
    faixas: Object.freeze([
      { de: -Infinity, ate: 2.5, cor: [0.55, 0.2, 0.75], nome: 'Preto cortado' },
      { de: 2.5, ate: 10, cor: [0.1, 0.35, 0.95], nome: 'Sombra sem detalhe' },
      { de: 38, ate: 48, cor: [0.2, 0.8, 0.25], nome: 'Cinza 18%' },
      { de: 52, ate: 70, cor: [0.98, 0.5, 0.75], nome: 'Pele' },
      { de: 92, ate: 99, cor: [1, 0.9, 0.1], nome: 'Quase estourado' },
      { de: 99, ate: Infinity, cor: [0.95, 0.12, 0.1], nome: 'Estourado' },
    ]),
  }),
})

/** Cor da falsa cor para um IRE, ou null (fica em cinza). */
export function falsaCor(ire, escala = 'arri') {
  const t = FALSA_COR[escala] || FALSA_COR.arri
  for (const f of t.faixas) if (ire >= f.de && (ire < f.ate || (f.ate === Infinity && ire >= f.de))) return f
  return null
}

/** As faixas como floats para o shader: [de, ate, r, g, b] × 8 (vazias com de > ate). Infinity vira ±1000. */
export function faixasParaShader(escala = 'arri') {
  const t = FALSA_COR[escala] || FALSA_COR.arri
  const v = new Float32Array(8 * 5)
  for (let i = 0; i < 8; i++) {
    const f = t.faixas[i]
    if (!f) {
      v.set([1, 0, 0, 0, 0], i * 5)
      continue
    }
    v.set([Math.max(-1000, f.de) / 100, Math.min(1000, f.ate) / 100, ...f.cor], i * 5)
  }
  return v
}

/** Zebra: acima de um nível (estouro) ou numa faixa ±5 IRE (pele, como a zebra 1 das câmeras de TV). */
export function zebra(ire, { modo = 'acima', nivel = 95 } = {}) {
  return modo === 'faixa' ? Math.abs(ire - nivel) <= 5 : ire >= nivel
}

/** Cb e Cr (−0,5 a 0,5) de RGB (0–1), BT.709. */
export function cbcr(r, g, b) {
  const y = luma(r, g, b)
  return { y, cb: (b - y) / 1.8556, cr: (r - y) / 1.5748 }
}

/** Alvos do vectorscope: as seis cores das barras a 75% (e a 100%), com ângulo e raio (0,5 = borda). */
export function alvosVectorscope(nivel = 0.75) {
  const cores = { R: [1, 0, 0], Mg: [1, 0, 1], B: [0, 0, 1], Cy: [0, 1, 1], G: [0, 1, 0], Yl: [1, 1, 0] }
  return Object.entries(cores).map(([nome, [r, g, b]]) => {
    const { cb, cr } = cbcr(r * nivel, g * nivel, b * nivel)
    return { nome, cb, cr, angulo: (Math.atan2(cr, cb) * 180) / Math.PI, raio: Math.hypot(cb, cr) }
  })
}

/** A linha de pele (I-line) dos vectorscopes: 123° a partir do eixo +Cb, sentido anti-horário. */
export const ANGULO_PELE = 123

/**
 * Histograma de luma e RGB de um quadro RGBA (Uint8ClampedArray), 256 caixas cada. Pula pixels (passo) para caber no
 * tempo de um quadro. Devolve também a porcentagem cortada embaixo (≤ 1) e em cima (≥ 254).
 */
export function histograma(rgba, passo = 1) {
  const y = new Uint32Array(256)
  const r = new Uint32Array(256)
  const g = new Uint32Array(256)
  const b = new Uint32Array(256)
  let n = 0
  let baixo = 0
  let alto = 0
  for (let i = 0; i < rgba.length; i += 4 * passo) {
    const R = rgba[i]
    const G = rgba[i + 1]
    const B = rgba[i + 2]
    const Y = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B)
    y[Y]++
    r[R]++
    g[G]++
    b[B]++
    if (Y <= 1) baixo++
    if (Y >= 254 || R >= 254 || G >= 254 || B >= 254) alto++
    n++
  }
  return { y, r, g, b, n, cortadoEmbaixo: n ? (baixo / n) * 100 : 0, cortadoEmCima: n ? (alto / n) * 100 : 0 }
}

/**
 * Forma de onda (waveform): para cada coluna da imagem (reduzida a `colunas`), quantos pixels há em cada um dos 256
 * níveis. Modo 'luma' ou 'parade' (R, G e B lado a lado, cada um com um terço da largura).
 */
export function formaDeOnda(rgba, largura, altura, { colunas = 256, modo = 'luma' } = {}) {
  const canais = modo === 'parade' ? 3 : 1
  const cols = modo === 'parade' ? Math.floor(colunas / 3) : colunas
  const grade = new Uint32Array(cols * canais * 256)
  for (let yy = 0; yy < altura; yy++) {
    for (let xx = 0; xx < largura; xx++) {
      const i = (yy * largura + xx) * 4
      const c = Math.min(cols - 1, Math.floor((xx / largura) * cols))
      if (modo === 'parade') {
        for (let k = 0; k < 3; k++) grade[(k * cols + c) * 256 + rgba[i + k]]++
      } else {
        const Y = Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2])
        grade[c * 256 + Y]++
      }
    }
  }
  return { grade, colunas: cols * canais, niveis: 256 }
}

/** Vectorscope: grade `tam`×`tam` de densidade em Cb (x) e Cr (y, para cima), 0,5 de croma na borda. */
export function vectorscope(rgba, { tam = 128, passo = 1, zoom = 1 } = {}) {
  const grade = new Uint32Array(tam * tam)
  for (let i = 0; i < rgba.length; i += 4 * passo) {
    const { cb, cr } = cbcr(rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255)
    const x = Math.round((cb * zoom + 0.5) * (tam - 1))
    const y = Math.round((0.5 - cr * zoom) * (tam - 1))
    if (x >= 0 && x < tam && y >= 0 && y < tam) grade[y * tam + x]++
  }
  return { grade, tam }
}

/**
 * Nitidez de um quadro de luma (Uint8 ou Float, largura × altura): média do quadrado do gradiente de Sobel. Serve
 * para o indicador de foco (sobe quando entra em foco) e para o teste do focus peaking.
 */
export function nitidez(y, largura, altura) {
  let soma = 0
  let n = 0
  for (let j = 1; j < altura - 1; j++) {
    for (let i = 1; i < largura - 1; i++) {
      const p = (dx, dy) => y[(j + dy) * largura + (i + dx)]
      const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1)
      const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1)
      soma += gx * gx + gy * gy
      n++
    }
  }
  return n ? soma / n : 0
}

/** Temperaturas de cor de referência (K), para o seletor de balanço de branco. */
export const BALANCOS = [
  { k: 2700, nome: 'Tungstênio quente' },
  { k: 3200, nome: 'Tungstênio' },
  { k: 4300, nome: 'Fluorescente' },
  { k: 5600, nome: 'Luz do dia' },
  { k: 6500, nome: 'Nublado' },
  { k: 7500, nome: 'Sombra' },
]

/**
 * Temperatura (K) aproximada de uma cor neutra medida (conta-gotas no cartão cinza), pela aproximação de McCamy a
 * partir da cromaticidade CIE 1931 (sRGB linear → XYZ). Serve para sugerir o Kelvin; o ajuste é na câmera.
 */
export function kelvinDeRgb(r, g, b) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B
  const s = X + Y + Z
  if (s <= 0) return null
  const x = X / s
  const y = Y / s
  const n = (x - 0.332) / (0.1858 - y)
  return Math.round(449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33)
}

/** Luma média com peso no centro (como o fotômetro central das câmeras): o centro (60% do quadro) vale 3×. */
export function lumaMedia(rgba, largura, altura, { pesoCentro = 3, centro = 0.6 } = {}) {
  let soma = 0
  let pesos = 0
  const x0 = (largura * (1 - centro)) / 2
  const x1 = largura - x0
  const y0 = (altura * (1 - centro)) / 2
  const y1 = altura - y0
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4
      const p = x >= x0 && x < x1 && y >= y0 && y < y1 ? pesoCentro : 1
      soma += p * (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2])
      pesos += p
    }
  }
  return pesos ? soma / pesos / 255 : 0
}
