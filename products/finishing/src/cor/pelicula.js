// Revela · o motor de look profissional. Trabalha na luz da cena (DaVinci Wide Gamut linear) e devolve luz da cena:
// é um LMT, como pedem ACES, ARRI (ALF4: o look é log → log e a tela fica à parte) e RED (IPP2). A passagem para a tela
// é a de src/cor/cena.js, trocável entre SDR e HDR.
//
// O caminho, na ordem de um laboratório:
//   1. primária: exposição em stops e balanço de branco por adaptação cromática (Bradford), como a câmera faria;
//   2. negativo por densidade: cada camada do filme (vermelho, verde, azul) vê um pouco das vizinhas, tem a própria
//      curva característica (pé e ombro suaves, contraste em log), e as camadas conversam (efeito entre camadas, os
//      acopladores DIR): cor que se separa em densidade ganha separação. Depois volta para luz da cena, com o caráter
//      do filme e sem curva de tela embutida;
//   3. cor como no filme subtrativo: cor saturada fica mais densa (mais escura), saturação cai nas altas e nas sombras,
//      verde puxa para oliva, azul para petróleo, pele se junta, separação de tons em sombras, meios e altas;
//   4. desbotar (véu de flare na cena) e P&B por filtro.
// Efeitos de espaço (halation, grão, bloom) não cabem numa LUT e ficam fora deste motor, de propósito.

import { inversa, matrizGamut, rgbParaXyz } from './espacos.js'
import { diParaLinear, linearParaDi } from './cena.js'

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
const mulM = (a, b) => a.map((linha) => [0, 1, 2].map((j) => linha[0] * b[0][j] + linha[1] * b[1][j] + linha[2] * b[2][j]))
const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const GRAU = Math.PI / 180
const distancia = (h, centro) => ((((h - centro) % 360) + 540) % 360) - 180
const noMatiz = (h, centro, largura) => {
  const d = Math.abs(distancia(h, centro))
  return d >= largura ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / largura)
}

// ─────────── DWG ⇄ XYZ ⇄ Oklab ───────────

const DWG_XYZ = rgbParaXyz('dwg')
const XYZ_DWG = inversa(DWG_XYZ)
const OK_M1 = [
  [0.8189330101, 0.3618667424, -0.1288597137],
  [0.0329845436, 0.9293118715, 0.0361456387],
  [0.0482003018, 0.2643662691, 0.633851707],
]
const OK_M2 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
]
const OK_M1i = inversa(OK_M1)
const OK_M2i = inversa(OK_M2)
// as contas de cor percebida (Oklab) acontecem dentro do Rec.2020: fora do lócus espectral (o azul do DWG está lá) o
// cone L fica negativo e o Oklab perde o chão; a cor de fora entra no Rec.2020 em curva suave antes
const DWG_2020 = matrizGamut('dwg', 'rec2020')
const R2020_DWG = matrizGamut('rec2020', 'dwg')
const R2020_XYZ = rgbParaXyz('rec2020')
const DWG_LMS = mulM(OK_M1, R2020_XYZ)
const LMS_DWG = inversa(DWG_LMS)
// a raiz cúbica tem derivada infinita no zero: perto dele vira reta (mesma inclinação na emenda), para a cor que
// cruza o zero não quebrar em degrau na LUT
const EPS = 1e-4
const RAIZ_EPS = Math.cbrt(EPS)
const INCL = 1 / (3 * RAIZ_EPS * RAIZ_EPS)
const raiz = (v) => (v >= EPS ? Math.cbrt(v) : RAIZ_EPS + (v - EPS) * INCL)
const cubo = (f) => (f >= RAIZ_EPS ? f * f * f : EPS + (f - RAIZ_EPS) / INCL)
/** Luz linear DWG → Oklab, passando pelo Rec.2020 (vale para luz acima de 1: a raiz cúbica não tem teto). */
export const dwgParaOklab = (rgb) => mul(OK_M2, mul(DWG_LMS, dentroDoGamut(mul(DWG_2020, rgb))).map(raiz))
/** Oklab → luz linear DWG (a cor sai dentro do Rec.2020). */
export const oklabParaDwg = (lab) => mul(R2020_DWG, dentroDoGamut(mul(LMS_DWG, mul(OK_M2i, lab).map(cubo))))

/**
 * Cor fora do DWG volta para dentro em curva suave: cada canal se aproxima do maior (o acromático) sem passar de
 * zero, como o compressor de gamut do ACES, mas com teto exato (nenhum canal fica negativo).
 */
function dentroDoGamut(rgb) {
  const ac = Math.max(rgb[0], rgb[1], rgb[2])
  if (!(ac > 0)) return [0, 0, 0]
  return rgb.map((v) => {
    const d = (ac - v) / ac
    return d <= 0.8 ? v : ac - ac * (0.8 + 0.2 * Math.tanh((d - 0.8) / 0.2))
  })
}
const L_CINZA = Math.cbrt(0.18) // 0,5646: Oklab L do cinza 18%

// ─────────── balanço de branco (Bradford) ───────────

const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
]
const xyParaXYZ = ([x, y]) => [x / y, 1, (1 - x - y) / y]
/** Branco da luz do dia (CIE) para uma temperatura de cor em kelvin (4000–25000). */
function brancoDoDia(T) {
  const t = limitar(T, 4000, 25000)
  const x =
    t <= 7000
      ? -4.607e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
      : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.23704
  return [x, -3 * x * x + 2.87 * x - 0.275]
}
/**
 * Matriz em DWG que leva o branco da cena (temperatura e tint) para o D65. `temperatura` e `tint` de -1 a 1:
 * temperatura positiva = imagem mais quente; tint positivo = mais magenta.
 */
export function matrizBranco(temperatura = 0, tint = 0, ganhosLms = null) {
  if (!temperatura && !tint && !ganhosLms) return null
  const mired = 1e6 / 6504 - 45 * temperatura
  let [x, y] = brancoDoDia(1e6 / mired)
  if (tint) {
    const den = -2 * x + 12 * y + 3
    const u = (4 * x) / den
    const v = (9 * y) / den + 0.012 * tint
    const d2 = 6 * u - 16 * v + 12
    ;[x, y] = [(9 * u) / d2, (4 * v) / d2]
  }
  const a = mul(BRADFORD, xyParaXYZ([x, y]))
  const b = mul(BRADFORD, xyParaXYZ([0.3127, 0.329]))
  const g = ganhosLms ?? [1, 1, 1]
  const D = [
    [(b[0] / a[0]) * g[0], 0, 0],
    [0, (b[1] / a[1]) * g[1], 0],
    [0, 0, (b[2] / a[2]) * g[2]],
  ]
  return mulM(XYZ_DWG, mulM(inversa(BRADFORD), mulM(D, mulM(BRADFORD, DWG_XYZ))))
}
/** Luz DWG → espaço de cones Bradford (para medir e corrigir o branco de um frame). */
export const dwgParaCones = (rgb) => mul(mulM(BRADFORD, DWG_XYZ), rgb)

// ─────────── perfis de película e looks ───────────

/**
 * Parâmetros de um perfil (todos opcionais; o neutro deixa a cena como está):
 * contraste (em log, 1 = igual), canais (contraste por camada), timing (stops por camada no cinza: o tom do
 * laboratório), pe/ombro (stops abaixo/acima do cinza até a curva deitar), sensibilidade (quanto cada camada vê das
 * vizinhas), entreCamadas (separação por densidade), densidade (cor saturada escurece), saturacao, satAltas/satSombras,
 * verde/azul/pele/ceu (matizes), sombras/meios/altas (separação de tons, em Oklab a e b), veu (desbotar), pb.
 */
export const NEUTRO = {
  contraste: 1,
  canais: [1, 1, 1],
  timing: [0, 0, 0],
  pe: Infinity,
  ombro: Infinity,
  sensibilidade: 0,
  entreCamadas: 0,
  densidade: 0,
  saturacao: 1,
  satAltas: 0,
  satSombras: 0,
  verde: { gira: 0, croma: 1 },
  azul: { gira: 0, croma: 1 },
  pele: { junta: 0, croma: 1, ancora: 0 },
  sombras: [0, 0],
  meios: [0, 0],
  altas: [0, 0],
  veu: 0,
  pb: null,
}
const perfil = (p) => ({ ...NEUTRO, ...p })

export const REVELA = [
  perfil({
    id: 'revela',
    nome: 'Revela Look',
    frases: ['Película de cinema: preto denso, meio-tom dourado, altas que deitam.', 'Verde oliva, céu petróleo, pele junta.'],
    contraste: 1.08,
    canais: [1.0, 1.0, 0.985],
    timing: [0.03, 0, -0.04],
    pe: 6.5,
    ombro: 7,
    sensibilidade: 0.05,
    entreCamadas: 0.12,
    densidade: 0.22,
    saturacao: 0.97,
    satAltas: 0.35,
    satSombras: 0.2,
    verde: { gira: -14, croma: 0.84 },
    azul: { gira: -10, croma: 0.92 },
    pele: { junta: 0.3, croma: 1.02, ancora: 0.6 },
    sombras: [-0.006, -0.012],
    meios: [0.002, 0.012],
    altas: [0.002, 0.008],
  }),
  perfil({
    id: 'suave',
    nome: 'Suave',
    frases: ['Contraste baixo e preto leitoso, cor contida.'],
    contraste: 0.88,
    pe: 5,
    ombro: 6,
    sensibilidade: 0.04,
    entreCamadas: 0.06,
    densidade: 0.12,
    saturacao: 0.9,
    satAltas: 0.3,
    pele: { junta: 0.2, croma: 1, ancora: 0.6 },
    verde: { gira: -8, croma: 0.85 },
    meios: [0.002, 0.008],
    veu: 0.6,
  }),
  perfil({
    id: 'petroleo',
    nome: 'Petróleo',
    frases: ['Sombras petróleo, pele quente e protegida.'],
    contraste: 1.1,
    timing: [-0.04, 0, 0.05],
    pe: 6,
    ombro: 7,
    sensibilidade: 0.05,
    entreCamadas: 0.14,
    densidade: 0.2,
    saturacao: 0.98,
    satAltas: 0.3,
    azul: { gira: -22, croma: 1.0 },
    verde: { gira: 26, croma: 0.75 },
    pele: { junta: 0.4, croma: 1.05, ancora: 0.6 },
    sombras: [-0.02, -0.028],
    meios: [0.004, 0.012],
    altas: [0.006, 0.018],
  }),
  perfil({
    id: 'dourado',
    tingeMax: 0.065, // o tom no cinza é o look (declarado; o controle de qualidade cobra o limite)
    nome: 'Dourado',
    frases: ['Fim de tarde: luz quente e altas âmbar.'],
    contraste: 1.04,
    timing: [0.1, 0.02, -0.14],
    pe: 6,
    ombro: 7,
    sensibilidade: 0.05,
    entreCamadas: 0.1,
    densidade: 0.2,
    saturacao: 1.0,
    satAltas: 0.3,
    verde: { gira: -24, croma: 0.8 },
    pele: { junta: 0.3, croma: 1.04, ancora: 0.6 },
    meios: [0.006, 0.02],
    altas: [0.006, 0.018],
  }),
  perfil({
    id: 'pb',
    nome: 'P&B',
    frases: ['Preto e branco com filtro amarelo: céu mais denso, pele limpa.'],
    contraste: 1.16,
    pe: 6,
    ombro: 7,
    pb: [0.36, 0.56, 0.08],
  }),
]

export const PELICULAS = [
  perfil({
    id: 'negativo-250d',
    nome: 'Negativo 250D',
    frases: ['Negativo de dia: latitude longa, contraste baixo, altas que deitam.', 'Meio-tom quente, verde oliva.'],
    contraste: 0.94,
    canais: [1.0, 1.0, 0.98],
    timing: [0.03, 0, -0.04],
    pe: 6,
    ombro: 8,
    sensibilidade: 0.06,
    entreCamadas: 0.1,
    densidade: 0.18,
    saturacao: 1.0,
    satAltas: 0.35,
    satSombras: 0.1,
    verde: { gira: -18, croma: 0.88 },
    azul: { gira: -8, croma: 0.98 },
    pele: { junta: 0.25, croma: 1.0, ancora: 0.6 },
    meios: [0.002, 0.012],
  }),
  perfil({
    id: 'negativo-500t',
    nome: 'Negativo 500T',
    frases: ['Negativo de tungstênio: noite, sombras frias e luzes quentes.', 'Mais densidade nas cores fortes.'],
    contraste: 1.0,
    canais: [1.005, 1.0, 0.99],
    timing: [-0.005, 0, 0.02],
    pe: 5.5,
    ombro: 7.5,
    sensibilidade: 0.07,
    entreCamadas: 0.14,
    densidade: 0.24,
    saturacao: 1.0,
    satAltas: 0.3,
    satSombras: 0.25,
    verde: { gira: 12, croma: 0.78 },
    azul: { gira: -14, croma: 1.0 },
    pele: { junta: 0.4, croma: 1.02, ancora: 0.85 },
    sombras: [-0.006, -0.012],
    altas: [0.005, 0.014],
  }),
  perfil({
    id: 'positivo-50d',
    nome: 'Positivo 50D',
    frases: ['Grão fino e cor cheia: contraste alto, preto profundo.'],
    contraste: 1.22,
    canais: [1.01, 1.0, 0.98],
    pe: 4.5,
    ombro: 5.5,
    sensibilidade: 0.03,
    entreCamadas: 0.2,
    densidade: 0.3,
    saturacao: 1.08,
    satAltas: 0.25,
    satSombras: 0.15,
    verde: { gira: -6, croma: 0.95 },
    azul: { gira: -6, croma: 1.06 },
    pele: { junta: 0.2, croma: 1.03, ancora: 0.6 },
    meios: [0.002, 0.008],
  }),
  perfil({
    id: 'reversivel',
    nome: 'Reversível',
    frases: ['Filme de slide: céu azul fundo, contraste forte, pouca latitude.'],
    contraste: 1.32,
    canais: [0.99, 1.0, 1.015],
    timing: [-0.01, 0, 0.02],
    pe: 3.8,
    ombro: 4.2,
    sensibilidade: 0.03,
    entreCamadas: 0.2,
    densidade: 0.34,
    saturacao: 1.12,
    satAltas: 0.2,
    satSombras: 0.25,
    azul: { gira: -4, croma: 1.12 },
    verde: { gira: 6, croma: 1.0 },
    pele: { junta: 0.15, croma: 1.0, ancora: 0.6 },
    sombras: [0, -0.01],
  }),
  perfil({
    id: 'sem-branqueamento',
    nome: 'Sem branqueamento',
    frases: ['Prata que fica no filme: cor lavada, contraste duro, preto denso.'],
    contraste: 1.28,
    pe: 4.5,
    ombro: 5,
    sensibilidade: 0.05,
    entreCamadas: 0.08,
    densidade: 0.4,
    saturacao: 0.5,
    satAltas: 0.4,
    pele: { junta: 0.2, croma: 0.95, ancora: 0.6 },
    sombras: [-0.004, -0.008],
  }),
]

export const CLASSICOS = [
  perfil({
    id: 'laranja-petroleo',
    tingeMax: 0.065, // o tom no cinza é o look (declarado; o controle de qualidade cobra o limite)
    nome: 'Laranja e petróleo',
    frases: ['O clássico do cinema de ação: pele laranja, sombra petróleo.'],
    contraste: 1.14,
    pe: 5.5,
    ombro: 6.5,
    sensibilidade: 0.04,
    entreCamadas: 0.12,
    densidade: 0.2,
    saturacao: 1.04,
    satAltas: 0.3,
    pele: { junta: 0.5, croma: 1.08, ancora: 0.6 },
    azul: { gira: -20, croma: 1.06 },
    verde: { gira: 28, croma: 0.72 },
    sombras: [-0.026, -0.034],
    meios: [0.006, 0.016],
    altas: [0.008, 0.018],
  }),
  perfil({
    id: 'anos-70',
    tingeMax: 0.065, // o tom no cinza é o look (declarado; o controle de qualidade cobra o limite)
    nome: 'Anos 70',
    frases: ['Desbotado e quente, preto leitoso.'],
    contraste: 0.9,
    timing: [0.08, 0.02, -0.12],
    pe: 5,
    ombro: 6,
    sensibilidade: 0.08,
    entreCamadas: 0.06,
    densidade: 0.14,
    saturacao: 0.82,
    satAltas: 0.35,
    verde: { gira: -30, croma: 0.7 },
    pele: { junta: 0.2, croma: 1.0, ancora: 0.6 },
    sombras: [0.008, 0.016],
    meios: [0.004, 0.02],
    altas: [0.008, 0.022],
    veu: 1,
  }),
  perfil({
    id: 'nordico',
    nome: 'Nórdico',
    frases: ['Frio e contido, branco limpo.'],
    contraste: 1.02,
    timing: [-0.05, 0, 0.06],
    pe: 6,
    ombro: 7,
    sensibilidade: 0.04,
    entreCamadas: 0.06,
    densidade: 0.12,
    saturacao: 0.66,
    satAltas: 0.3,
    pele: { junta: 0.25, croma: 0.95, ancora: 0.6 },
    sombras: [-0.01, -0.018],
    altas: [-0.002, -0.004],
  }),
]

export const GRUPOS = [
  { id: 'revela', nome: 'Revela', looks: REVELA },
  { id: 'pelicula', nome: 'Película', looks: PELICULAS },
  { id: 'classicos', nome: 'Clássicos', looks: CLASSICOS },
]
const TODOS = GRUPOS.flatMap((g) => g.looks)
export const perfilDe = (id) => TODOS.find((l) => l.id === id) ?? null

// ─────────── o motor ───────────

// base e flare do filme: o log de cada camada é de (luz + VEU_BASE), então o preto chega devagar em vez de cair num
// abismo do log; abaixo de metade do véu a curva vira reta (luz negativa de ruído não vira log de negativo)
const VEU_BASE = 0.18 * 2 ** -9
const PISO = VEU_BASE / 2
const logCamada = (v) => {
  const w = v + VEU_BASE
  return w > PISO ? Math.log2(w / 0.18) : Math.log2(PISO / 0.18) + (w - PISO) / (PISO * Math.LN2)
}

/** Pé e ombro: até o cinza a curva é reta em log; longe dele deita suave (tanh), sem degrau. */
const peOmbro = (e, pe, ombro) => (e >= 0 ? (ombro === Infinity ? e : ombro * Math.tanh(e / ombro)) : pe === Infinity ? e : pe * Math.tanh(e / pe))

/**
 * O look de um perfil em luz da cena: `emCena([r, g, b]) → [r, g, b]`, DWG linear nos dois lados.
 * `extra`: { exposicao (stops), temperatura, tint (-1–1), ganhosLms, contraste (×), saturacao (×), calor (0–1),
 * veu (0–1), pele (0–1, protege a cor da pele), intensidade (0–1) }.
 */
export function criarMotor(p = NEUTRO, extra = {}) {
  const pr = perfil(p)
  const ganho = 2 ** (extra.exposicao ?? 0)
  const branco = matrizBranco(extra.temperatura ?? 0, extra.tint ?? 0, extra.ganhosLms ?? null)
  const contraste = pr.contraste * (extra.contraste ?? 1)
  const s = pr.sensibilidade
  // cada camada vê (1 - 2s) da própria cor e s de cada vizinha: linhas somam 1, o cinza continua cinza
  const sens = [
    [1 - 2 * s, s, s],
    [s, 1 - 2 * s, s],
    [s, s, 1 - 2 * s],
  ]
  const satExtra = extra.saturacao ?? 1
  const calor = extra.calor ?? 0
  const veu = pr.veu + (extra.veu ?? 0)
  const pele = extra.pele ?? 0
  const t = limitar(extra.intensidade ?? 1, 0, 1)

  function negativo(x) {
    const camada = mul(sens, x)
    const e = camada.map((v, i) => logCamada(v) + pr.timing[i])
    const d = e.map((v, i) => contraste * pr.canais[i] * peOmbro(v, pr.pe, pr.ombro))
    const m = (d[0] + d[1] + d[2]) / 3
    return d.map((v) => 0.18 * 2 ** (v + pr.entreCamadas * (v - m)) - VEU_BASE)
  }

  function cor(x, antes) {
    let [L, a, b] = dwgParaOklab(x)
    if (pr.pb) {
      const y = Math.max(0, pr.pb[0] * x[0] + pr.pb[1] * x[1] + pr.pb[2] * x[2])
      return [y, y, y]
    }
    let C = Math.hypot(a, b)
    let h = Math.atan2(b, a) / GRAU
    const Lr = L / L_CINZA // 1 no cinza
    // perto do cinza o matiz não existe: os giros e cromas por matiz entram aos poucos com a cor (sem bico na LUT)
    const comCor = (C * C) / (C * C + 0.0025)
    let pl = 0
    if (C > 1e-6) {
      const verde = noMatiz(h, 142, 45) * comCor
      const azul = noMatiz(h, 250, 40) * comCor
      pl = noMatiz(h, 58, 28) * comCor
      h += verde * pr.verde.gira + azul * pr.azul.gira - pl * pr.pele.junta * distancia(h, 58)
      C *= 1 + verde * (pr.verde.croma - 1) + azul * (pr.azul.croma - 1) + pl * (pr.pele.croma - 1)
    }
    // saturação pela luz: cheia no meio, contida nas altas (o filme desatura perto do branco) e nas sombras
    C *= pr.saturacao * satExtra * (1 - pr.satAltas * suave(1.25, 1.9, Lr)) * (1 - pr.satSombras * (1 - suave(0.35, 0.85, Lr)))
    // densidade subtrativa: cor forte fica mais escura, proporcional à luz (no preto não há o que escurecer)
    L -= pr.densidade * (Math.hypot(C, 0.01) - 0.01) * suave(0.15, 0.7, Lr) * L
    // separação de tons pela exposição (stops em volta do cinza), proporcional à luz
    const ev = Math.log2(Math.max(1e-6, (L / L_CINZA) ** 3))
    const ws = 1 - suave(-4.5, -0.5, ev)
    const wa = suave(0.5, 4, ev)
    const wm = Math.exp(-((ev + 0.3) ** 2) / 4.5)
    // a pele fica fora da separação de tons (como um colorista recorta a pele): sombra petróleo em rosto adoece
    // (pela cor da cena, que sai do cinza aos poucos; a cor depois do negativo já tem o tom do look no cinza)
    const ref = antes ?? [L, a, b]
    const Cr = Math.hypot(ref[1], ref[2])
    const fora = 1 - 0.92 * noMatiz(Math.atan2(ref[2], ref[1]) / GRAU, 52, 38) * ((Cr * Cr) / (Cr * Cr + 0.0025))
    let da = (ws * pr.sombras[0] + wm * pr.meios[0] + wa * pr.altas[0]) * fora
    let db = (ws * pr.sombras[1] + wm * pr.meios[1] + wa * pr.altas[1]) * fora
    if (calor) {
      // calor: meio-tom e pele mais quentes e ricos, sem amarelar o branco
      da += 0.006 * calor * wm
      db += 0.02 * calor * wm
      C *= 1 + 0.18 * calor * wm
    }
    // âncora da pele: o matiz da pele segue o da cena (puxado para a linha da pele), não a curva de cada camada;
    // assim a pele não muda de cor quando a exposição muda. A luz e a saturação continuam sendo as do look.
    if (antes && pr.pele.ancora > 0) {
      const Ca = Math.hypot(antes[1], antes[2])
      const ha = Math.atan2(antes[2], antes[1]) / GRAU
      const naPele = noMatiz(ha, 52, 38) * ((Ca * Ca) / (Ca * Ca + 0.0009))
      if (naPele > 0) {
        const alvo = ha - pr.pele.junta * noMatiz(ha, 58, 28) * distancia(ha, 58)
        h += pr.pele.ancora * naPele * distancia(alvo, h)
      }
    }
    a = C * Math.cos(h * GRAU) + da * Lr
    b = C * Math.sin(h * GRAU) + db * Lr
    // pele protegida: a cor da pele volta para a de antes do look (a luz do look fica)
    if (pele && antes) {
      const Ca = Math.hypot(antes[1], antes[2])
      if (Ca > 0.02) {
        const ha = Math.atan2(antes[2], antes[1]) / GRAU
        const w = pele * Math.max(0, 1 - Math.abs(distancia(ha, 58)) / 30) * suave(0.35, 0.75, antes[0] / L_CINZA)
        a += (antes[1] - a) * w
        b += (antes[2] - b) * w
      }
    }
    return oklabParaDwg([L, a, b])
  }

  function primaria(rgb) {
    const x = rgb.map((v) => v * ganho)
    return branco ? mul(branco, x) : x
  }

  function emCena(rgb) {
    const x = dentroDoGamut(primaria(rgb))
    const antes = pele || pr.pele.ancora > 0 ? dwgParaOklab(x) : null
    let y = negativo(x)
    y = dentroDoGamut(cor(y, antes))
    if (veu) y = y.map((v) => v + veu * 0.005)
    if (t >= 1) return y
    // intensidade: mistura em log (DI) entre a primária (exposição e branco, que valem sempre) e o look, como um nó
    // com opacidade depois da correção no Resolve
    const p0 = primaria(rgb)
    return y.map((v, i) => diParaLinear(linearParaDi(p0[i]) + (linearParaDi(v) - linearParaDi(p0[i])) * t))
  }

  return {
    perfil: pr,
    emCena,
    partes: { negativo, cor, dentroDoGamut }, // para os testes internos olharem cada etapa
    /** O mesmo look em código DaVinci Intermediate, para a LUT log → log. */
    emDi(r, g, b) {
      return emCena([diParaLinear(r), diParaLinear(g), diParaLinear(b)]).map(linearParaDi)
    },
  }
}
