// Revela · Color Space Transform. As curvas log e os gamuts das câmeras que o DaVinci Resolve traz no CST, escritos
// aqui a partir das fórmulas e primárias que cada fabricante publica (white papers de Sony, ARRI, Canon, Panasonic,
// Blackmagic, Fujifilm, Nikon, DJI e RED; ACES pela Academy).
//
// Convenção de nível: o valor de 0 a 1 é o que o Resolve passa para a LUT (código de 10 bits ÷ 1023). As fórmulas de
// Canon e S-Log2 saem em IRE (0 = código 64, 1 = código 940) e passam para código aqui; as demais já saem em código.
//
// Caminho: código da câmera → luz da cena (linear) → XYZ → gamut de saída → mapa de tom (opcional) → curva de saída.

const log10 = Math.log10
const log2 = Math.log2
const ireParaCodigo = (v) => (v * 876 + 64) / 1023
const codigoParaIre = (v) => (v * 1023 - 64) / 876

// ─────────── curvas (código ⇄ linear) ───────────

const gama = (g) => ({
  paraLinear: (v) => Math.sign(v) * Math.abs(v) ** g,
  deLinear: (x) => Math.sign(x) * Math.abs(x) ** (1 / g),
})

// S-Log2 e S-Log: a mesma família; S-Log2 escala a entrada por 155/219. Saída em IRE, reflexão ÷ 0,9.
function sLog(escala) {
  const deLinear = (x) => {
    const t = (x * escala) / 0.9
    return ireParaCodigo(t >= 0 ? 0.432699 * log10(t + 0.037584) + 0.616596 + 0.03 : t * 5 + 0.030001222851889303)
  }
  const corte = deLinear(0)
  const paraLinear = (v) => {
    const y = codigoParaIre(v)
    const t = v >= corte ? 10 ** ((y - 0.616596 - 0.03) / 0.432699) - 0.037584 : (y - 0.030001222851889303) / 5
    return (t * 0.9) / escala
  }
  return { paraLinear, deLinear }
}

// Canon Log, Log 2 e Log 3: saída em IRE, reflexão ÷ 0,9.
function canon(pedacos) {
  const deLinear = (x) => ireParaCodigo(pedacos.codificar(x / 0.9))
  const paraLinear = (v) => pedacos.decodificar(codigoParaIre(v)) * 0.9
  return { paraLinear, deLinear }
}

export const CURVAS = {
  rec709: { nome: 'Gama 2.4 (Rec.709)', ...gama(2.4) },
  srgb: {
    nome: 'sRGB',
    paraLinear: (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
    deLinear: (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055),
  },
  gama26: { nome: 'Gama 2.6', ...gama(2.6) },
  gama22: { nome: 'Gama 2.2', ...gama(2.2) },
  linear: { nome: 'Linear', paraLinear: (v) => v, deLinear: (x) => x },

  davinci: {
    nome: 'DaVinci Intermediate',
    paraLinear: (v) => (v <= 0.02740668 ? v / 10.44426855 : 2 ** (v / 0.07329248 - 7) - 0.0075),
    deLinear: (x) => (x <= 0.00262409 ? x * 10.44426855 : (log2(x + 0.0075) + 7) * 0.07329248),
  },
  acescct: {
    nome: 'ACEScct',
    paraLinear: (v) => (v <= 0.155251141552511 ? (v - 0.0729055341958355) / 10.5402377416545 : 2 ** (v * 17.52 - 9.72)),
    deLinear: (x) => (x <= 0.0078125 ? 10.5402377416545 * x + 0.0729055341958355 : (log2(x) + 9.72) / 17.52),
  },
  slog3: {
    nome: 'Sony S-Log3',
    paraLinear: (v) => (v >= 171.2102946929 / 1023 ? 10 ** ((v * 1023 - 420) / 261.5) * 0.19 - 0.01 : ((v * 1023 - 95) * 0.01125) / (171.2102946929 - 95)),
    deLinear: (x) => (x >= 0.01125 ? (420 + log10((x + 0.01) / 0.19) * 261.5) / 1023 : ((x * (171.2102946929 - 95)) / 0.01125 + 95) / 1023),
  },
  slog2: { nome: 'Sony S-Log2', ...sLog(155 / 219) },
  logc3: {
    nome: 'ARRI LogC3 (EI 800)',
    paraLinear: (v) => (v > 5.367655 * 0.010591 + 0.092809 ? (10 ** ((v - 0.385537) / 0.24719) - 0.052272) / 5.555556 : (v - 0.092809) / 5.367655),
    deLinear: (x) => (x > 0.010591 ? 0.24719 * log10(5.555556 * x + 0.052272) + 0.385537 : 5.367655 * x + 0.092809),
  },
  logc4: (() => {
    const a = (2 ** 18 - 16) / 117.45
    const b = (1023 - 95) / 1023
    const c = 95 / 1023
    const s = (7 * Math.LN2 * 2 ** (7 - (14 * c) / b)) / (a * b)
    const t = (2 ** (14 * (-c / b) + 6) - 64) / a
    return {
      nome: 'ARRI LogC4',
      paraLinear: (v) => (v >= 0 ? (2 ** ((14 * (v - c)) / b + 6) - 64) / a : v * s + t),
      deLinear: (x) => (x >= t ? ((log2(a * x + 64) - 6) / 14) * b + c : (x - t) / s),
    }
  })(),
  vlog: {
    nome: 'Panasonic V-Log',
    paraLinear: (v) => (v < 0.181 ? (v - 0.125) / 5.6 : 10 ** ((v - 0.598206) / 0.241514) - 0.00873),
    deLinear: (x) => (x < 0.01 ? 5.6 * x + 0.125 : 0.241514 * log10(x + 0.00873) + 0.598206),
  },
  clog: canon({
    codificar: (x) => (x >= 0 ? 0.529136 * log10(10.1596 * x + 1) + 0.0730597 : -0.529136 * log10(-10.1596 * x + 1) + 0.0730597),
    decodificar: (y) => (y >= 0.0730597 ? (10 ** ((y - 0.0730597) / 0.529136) - 1) / 10.1596 : -(10 ** ((0.0730597 - y) / 0.529136) - 1) / 10.1596),
  }),
  clog2: canon({
    codificar: (x) => (x >= 0 ? 0.24136077 * log10(x * 87.09937546 + 1) + 0.092864125 : -0.24136077 * log10(-x * 87.09937546 + 1) + 0.092864125),
    decodificar: (y) =>
      y >= 0.092864125 ? (10 ** ((y - 0.092864125) / 0.24136077) - 1) / 87.09937546 : -(10 ** ((0.092864125 - y) / 0.24136077) - 1) / 87.09937546,
  }),
  clog3: canon({
    codificar: (x) =>
      x < -0.014
        ? -0.36726845 * log10(-x * 14.98325 + 1) + 0.12783901
        : x <= 0.014
          ? 1.9754798 * x + 0.12512219
          : 0.36726845 * log10(x * 14.98325 + 1) + 0.12240537,
    decodificar: (y) =>
      y < 0.0974655
        ? -(10 ** ((0.12783901 - y) / 0.36726845) - 1) / 14.98325
        : y <= 0.15277891
          ? (y - 0.12512219) / 1.9754798
          : (10 ** ((y - 0.12240537) / 0.36726845) - 1) / 14.98325,
  }),
  bmdgen5: {
    nome: 'Blackmagic Film Gen 5',
    paraLinear: (v) =>
      v < 8.283605932402494 * 0.005 + 0.09246575342465753
        ? (v - 0.09246575342465753) / 8.283605932402494
        : Math.exp((v - 0.5300133392291939) / 0.08692876065491224) - 0.005494072432257808,
    deLinear: (x) => (x < 0.005 ? 8.283605932402494 * x + 0.09246575342465753 : 0.08692876065491224 * Math.log(x + 0.005494072432257808) + 0.5300133392291939),
  },
  flog: {
    nome: 'Fujifilm F-Log',
    paraLinear: (v) => (v >= 0.100537775223865 ? (10 ** ((v - 0.790453) / 0.344676) - 0.009468) / 0.555556 : (v - 0.092864) / 8.735631),
    deLinear: (x) => (x >= 0.00089 ? 0.344676 * log10(0.555556 * x + 0.009468) + 0.790453 : 8.735631 * x + 0.092864),
  },
  flog2: {
    nome: 'Fujifilm F-Log2',
    paraLinear: (v) => (v >= 0.100686685370811 ? (10 ** ((v - 0.384316) / 0.245281) - 0.064829) / 5.555556 : (v - 0.092864) / 8.799461),
    deLinear: (x) => (x >= 0.000889 ? 0.245281 * log10(5.555556 * x + 0.064829) + 0.384316 : 8.799461 * x + 0.092864),
  },
  nlog: {
    nome: 'Nikon N-Log',
    paraLinear: (v) => (v < 452 / 1023 ? ((v * 1023) / 650) ** 3 - 0.0075 : Math.exp((v * 1023 - 619) / 150)),
    deLinear: (x) => (x < 0.328 ? (650 * Math.cbrt(x + 0.0075)) / 1023 : (150 * Math.log(x) + 619) / 1023),
  },
  dlog: {
    nome: 'DJI D-Log',
    paraLinear: (v) => (v <= 0.14 ? (v - 0.0929) / 6.025 : (10 ** (3.89616 * v - 2.27752) - 0.0108) / 0.9892),
    deLinear: (x) => (x <= 0.0078 ? 6.025 * x + 0.0929 : log10(x * 0.9892 + 0.0108) * 0.256663 + 0.584555),
  },
  log3g10: {
    nome: 'RED Log3G10',
    paraLinear: (v) => (v < 0 ? v / 15.1927 : (10 ** (v / 0.224282) - 1) / 155.975327) - 0.01,
    deLinear: (x) => {
      const t = x + 0.01
      return t < 0 ? t * 15.1927 : 0.224282 * log10(t * 155.975327 + 1)
    },
  },
}

// ─────────── gamuts (primárias xy e branco) ───────────

const D65 = [0.3127, 0.329]
const BRANCO_ACES = [0.32168, 0.33767]

export const GAMUTS = {
  rec709: { nome: 'Rec.709', p: [0.64, 0.33, 0.3, 0.6, 0.15, 0.06], w: D65 },
  rec2020: { nome: 'Rec.2020', p: [0.708, 0.292, 0.17, 0.797, 0.131, 0.046], w: D65 },
  p3d65: { nome: 'P3-D65', p: [0.68, 0.32, 0.265, 0.69, 0.15, 0.06], w: D65 },
  dwg: { nome: 'DaVinci Wide Gamut', p: [0.8, 0.313, 0.1682, 0.9877, 0.079, -0.1155], w: D65 },
  ap1: { nome: 'ACES AP1', p: [0.713, 0.293, 0.165, 0.83, 0.128, 0.044], w: BRANCO_ACES },
  sgamut3cine: { nome: 'Sony S-Gamut3.Cine', p: [0.766, 0.275, 0.225, 0.8, 0.089, -0.087], w: D65 },
  sgamut3: { nome: 'Sony S-Gamut3', p: [0.73, 0.28, 0.14, 0.855, 0.1, -0.05], w: D65 },
  awg3: { nome: 'ARRI Wide Gamut 3', p: [0.684, 0.313, 0.221, 0.848, 0.0861, -0.102], w: D65 },
  awg4: { nome: 'ARRI Wide Gamut 4', p: [0.7347, 0.2653, 0.1424, 0.8576, 0.0991, -0.0308], w: D65 },
  vgamut: { nome: 'Panasonic V-Gamut', p: [0.73, 0.28, 0.165, 0.84, 0.1, -0.03], w: D65 },
  cinema: { nome: 'Canon Cinema Gamut', p: [0.74, 0.27, 0.17, 1.14, 0.08, -0.1], w: D65 },
  bmdwg5: { nome: 'Blackmagic Wide Gamut Gen 5', p: [0.7177215, 0.3171181, 0.228041, 0.861569, 0.1005841, -0.0820452], w: [0.312717, 0.3290312] },
  fgamut: { nome: 'Fujifilm F-Gamut', p: [0.708, 0.292, 0.17, 0.797, 0.131, 0.046], w: D65 },
  dgamut: { nome: 'DJI D-Gamut', p: [0.71, 0.31, 0.21, 0.88, 0.09, -0.08], w: D65 },
  redwg: { nome: 'REDWideGamutRGB', p: [0.780308, 0.304253, 0.121595, 1.493994, 0.095612, -0.084589], w: D65 },
}

// ─────────── câmeras e saídas, como aparecem na lista ───────────

export const ENTRADAS = [
  { id: 'sony-slog3-cine', nome: 'Sony · S-Log3 / S-Gamut3.Cine', curva: 'slog3', gamut: 'sgamut3cine' },
  { id: 'sony-slog3', nome: 'Sony · S-Log3 / S-Gamut3', curva: 'slog3', gamut: 'sgamut3' },
  { id: 'sony-slog2', nome: 'Sony · S-Log2 / S-Gamut3', curva: 'slog2', gamut: 'sgamut3' },
  { id: 'arri-logc3', nome: 'ARRI · LogC3 / Wide Gamut 3', curva: 'logc3', gamut: 'awg3' },
  { id: 'arri-logc4', nome: 'ARRI · LogC4 / Wide Gamut 4', curva: 'logc4', gamut: 'awg4' },
  { id: 'canon-clog3', nome: 'Canon · Log 3 / Cinema Gamut', curva: 'clog3', gamut: 'cinema' },
  { id: 'canon-clog2', nome: 'Canon · Log 2 / Cinema Gamut', curva: 'clog2', gamut: 'cinema' },
  { id: 'canon-clog', nome: 'Canon · Log / Rec.709', curva: 'clog', gamut: 'rec709' },
  { id: 'panasonic-vlog', nome: 'Panasonic · V-Log / V-Gamut', curva: 'vlog', gamut: 'vgamut' },
  { id: 'bmd-gen5', nome: 'Blackmagic · Film Gen 5', curva: 'bmdgen5', gamut: 'bmdwg5' },
  { id: 'fuji-flog2', nome: 'Fujifilm · F-Log2 / F-Gamut', curva: 'flog2', gamut: 'fgamut' },
  { id: 'fuji-flog', nome: 'Fujifilm · F-Log / F-Gamut', curva: 'flog', gamut: 'fgamut' },
  { id: 'nikon-nlog', nome: 'Nikon · N-Log / Rec.2020', curva: 'nlog', gamut: 'rec2020' },
  { id: 'dji-dlog', nome: 'DJI · D-Log / D-Gamut', curva: 'dlog', gamut: 'dgamut' },
  { id: 'red-log3g10', nome: 'RED · Log3G10 / REDWideGamutRGB', curva: 'log3g10', gamut: 'redwg' },
  { id: 'davinci', nome: 'DaVinci Intermediate / Wide Gamut', curva: 'davinci', gamut: 'dwg' },
  { id: 'acescct', nome: 'ACEScct / AP1', curva: 'acescct', gamut: 'ap1' },
]

export const SAIDAS = [
  { id: 'rec709', nome: 'Rec.709 · Gama 2.4', curva: 'rec709', gamut: 'rec709' },
  { id: 'srgb', nome: 'sRGB (web)', curva: 'srgb', gamut: 'rec709' },
  { id: 'rec2020', nome: 'Rec.2020 · Gama 2.4', curva: 'rec709', gamut: 'rec2020' },
  { id: 'p3d65', nome: 'P3-D65 · Gama 2.6', curva: 'gama26', gamut: 'p3d65' },
  { id: 'davinci', nome: 'DaVinci Intermediate / Wide Gamut', curva: 'davinci', gamut: 'dwg' },
  { id: 'acescct', nome: 'ACEScct / AP1', curva: 'acescct', gamut: 'ap1' },
]

// ─────────── matrizes ───────────

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
const mulM = (a, b) => a.map((linha) => [0, 1, 2].map((j) => linha[0] * b[0][j] + linha[1] * b[1][j] + linha[2] * b[2][j]))
export function inversa(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ]
}
const xyParaXYZ = ([x, y]) => [x / y, 1, (1 - x - y) / y]

/** RGB linear do gamut → XYZ (a matriz que todo CST usa, derivada das primárias e do branco). */
export function rgbParaXyz(gamut) {
  const { p, w } = typeof gamut === 'string' ? GAMUTS[gamut] : gamut
  const R = xyParaXYZ([p[0], p[1]])
  const G = xyParaXYZ([p[2], p[3]])
  const B = xyParaXYZ([p[4], p[5]])
  const M = [
    [R[0], G[0], B[0]],
    [R[1], G[1], B[1]],
    [R[2], G[2], B[2]],
  ]
  const S = mul(inversa(M), xyParaXYZ(w))
  return M.map((linha) => linha.map((v, j) => v * S[j]))
}

const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
]
/** Adaptação cromática Bradford de um branco para outro (ACES usa um branco perto de D60). */
function adaptar(de, para) {
  if (de[0] === para[0] && de[1] === para[1]) return null
  const a = mul(BRADFORD, xyParaXYZ(de))
  const b = mul(BRADFORD, xyParaXYZ(para))
  const D = [
    [b[0] / a[0], 0, 0],
    [0, b[1] / a[1], 0],
    [0, 0, b[2] / a[2]],
  ]
  return mulM(inversa(BRADFORD), mulM(D, BRADFORD))
}

/** Matriz RGB linear de um gamut para outro, com adaptação do branco quando os brancos diferem. */
export function matrizGamut(de, para) {
  const g1 = GAMUTS[de]
  const g2 = GAMUTS[para]
  const cat = adaptar(g1.w, g2.w)
  const paraXyz = rgbParaXyz(de)
  return mulM(inversa(rgbParaXyz(para)), cat ? mulM(cat, paraXyz) : paraXyz)
}

// ─────────── mapa de tom e gamut ───────────

const LUMA = [0.2126, 0.7152, 0.0722] // Y do Rec.709/2020 basta para o peso; o mapa preserva a razão entre canais

/**
 * Mapa de tom de cena para tela: até o joelho a luz passa igual (cinza 18% fica no lugar); acima, deita suave até o
 * branco em vez de cortar. Aplicado na luminância, com os três canais na mesma razão (o matiz não muda).
 */
export function deitarAltas(x, joelho = 0.6) {
  if (x <= joelho) return x
  const k = 1 - joelho
  return joelho + k * (1 - Math.exp(-(x - joelho) / k))
}

function mapearTom(rgb) {
  const Y = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2]
  if (Y <= 0.6) return rgb
  const f = deitarAltas(Y) / Y
  return rgb.map((v) => v * f)
}

/** Cor fora do gamut de saída: perde saturação em direção ao cinza da mesma luz, em vez de cortar canal a canal. */
function comprimirGamut(rgb) {
  const Y = Math.max(0, LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2])
  const menor = Math.min(...rgb)
  if (menor >= 0) return rgb
  const t = Y / (Y - menor) // quanto andar do cinza até a cor para o canal mais baixo tocar zero
  return rgb.map((v) => Y + (v - Y) * t)
}

/**
 * CST: `de` e `para` são ids de ENTRADAS/SAIDAS ou `{ curva, gamut }`. `opcoes.tom` ('nenhum' | 'suave', padrão
 * 'suave' quando a saída é de tela) e `opcoes.gamut` ('comprimir' | 'cortar', padrão 'comprimir').
 * Devolve `aplicar(r, g, b) → [r, g, b]`, no formato do resto da Revela (para virar .cube com `assar`).
 */
export function criarCst(de, para, opcoes = {}) {
  const a = typeof de === 'string' ? [...ENTRADAS, ...SAIDAS].find((e) => e.id === de) : de
  const b = typeof para === 'string' ? [...SAIDAS, ...ENTRADAS].find((e) => e.id === para) : para
  if (!a || !b) throw new Error('Espaço de cor desconhecido')
  const c1 = CURVAS[a.curva]
  const c2 = CURVAS[b.curva]
  const M = matrizGamut(a.gamut, b.gamut)
  const deTela = ['rec709', 'srgb', 'gama26', 'gama22'].includes(b.curva)
  const tom = opcoes.tom ?? (deTela ? 'suave' : 'nenhum')
  const gamut = opcoes.gamut ?? 'comprimir'
  return {
    de: a,
    para: b,
    aplicar(r, g, bb) {
      let rgb = mul(M, [c1.paraLinear(r), c1.paraLinear(g), c1.paraLinear(bb)])
      if (tom === 'suave') rgb = mapearTom(rgb)
      if (deTela) {
        if (gamut === 'comprimir') rgb = comprimirGamut(rgb)
        rgb = rgb.map((v) => Math.min(1, Math.max(0, v)))
      }
      return rgb.map((v) => c2.deLinear(v))
    },
  }
}
