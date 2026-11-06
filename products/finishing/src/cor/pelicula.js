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
//   4. cópia de cinema (opcional, src/cor/copia.js): o negativo copiado numa película de cópia (2383, 2393, 3513), com as
//      curvas das fichas técnicas dos fabricantes;
//   5. desbotar (véu de flare na cena) e P&B por filtro.
// Efeitos de espaço (halation, grão, bloom) não cabem numa LUT e ficam fora deste motor, de propósito.

import { inversa, matrizGamut, rgbParaXyz } from './espacos.js'
import { diParaLinear, linearParaDi } from './cena.js'
import { branco709, copiaDe, criarCopia } from './copia.js'
import { criarScan } from './negativos.js'

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
/** Como `suave`, mas sem bico também na curvatura (quíntica): para o que entra numa LUT de cor saturada. */
const suave5 = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * t * (t * (6 * t - 15) + 10)
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
const DWG_709 = matrizGamut('dwg', 'rec709')
const R709_DWG = matrizGamut('rec709', 'dwg')
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
const Y_DWG = rgbParaXyz('dwg')[1]
const luz = (v) => Y_DWG[0] * v[0] + Y_DWG[1] * v[1] + Y_DWG[2] * v[2]
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
 * verde/azul/pele/ceu (matizes), sombras/meios/altas (separação de tons, em Oklab a e b), veu (desbotar), pb,
 * copia (id da película de cópia, src/cor/copia.js), gamaCopia (contraste negativo × cópia no cinza, com o negativo
 * ideal), ancoraCopia (quanto da virada de matiz da pele com a exposição, que a cópia real faz, fica de fora: 0 = toda,
 * 1 = nenhuma), negativoFicha (id de um negativo das fichas, src/cor/negativos.js: vai à cópia, ou sozinho como scan),
 * revelacao (stops forçados ou puxados), luzCopia (D55, D60 ou D65) e expandido (a cópia com menos pé e ombro).
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
  subtrativa: 0,
  sombras: [0, 0],
  meios: [0, 0],
  altas: [0, 0],
  veu: 0,
  pb: null,
  copia: null,
  gamaCopia: 1.8,
  ancoraCopia: 0.75,
  negativoFicha: null,
  revelacao: 0,
  luzCopia: 'D65',
  expandido: false,
}
const perfil = (p) => ({ ...NEUTRO, ...p })

export const REVELA = [
  // Revela Look (04/11/2026): refeito sobre a cópia de projeção (2383, das fichas) e medido nos scopes de 9 filmes de
  // referência finalizados casando o digital com a cópia (Interstellar, Oppenheimer, Duna 1 e 2, The Batman, A Chegada,
  // 2001, 1917, Onde os Fracos Não Têm Vez), aplicado em 35 takes reais. Sai o meio-tom dourado (amarelava pele, céu e
  // parede branca) e sai a alta morna da cópia (o branco fica branco: céu, neve, vestido); fica o desenho da cópia:
  // preto denso, contraste de projeção, pele contida, verde sem neon. Erro contra os filmes: 2,98 → 2,57.
  perfil({
    id: 'revela',
    nome: 'Revela Look',
    frases: ['Cópia de cinema: preto denso, contraste de projeção, branco limpo.', 'Pele contida, verde sem neon.'],
    copia: '2383',
    saturacao: 0.95,
    satAltas: 0, // a cópia e a tela já desaturam perto do branco; mais que isso apagava o azul do céu
    verde: { gira: -4, croma: 1 },
    peleSat: -0.5,
    separacao: -1,
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

// Cinema: tudo das fichas técnicas. As cópias sozinhas sobre a câmera digital (com o negativo ideal do intermediário
// digital, o uso mais comum), os negativos copiados como no laboratório (curva de cada camada e separação de cor do
// negativo × curvas e corantes da cópia: o contraste e o cruzamento de cores saem da física, não de um ajuste) e dois
// negativos só escaneados, sem cópia.
const filme = (id, nome, negativoFicha, copia, frases) => perfil({ id, nome, negativoFicha, copia, frases })
export const CINEMA = [
  filme('copia-2383', 'Cópia 2383', null, '2383', ['A cópia de cinema mais usada, sobre a câmera digital.', 'Contraste de projeção e preto denso.']),
  filme('copia-2393', 'Cópia 2393', null, '2393', ['A cópia premium: preto ainda mais fundo e cor mais cheia.']),
  filme('copia-3513', 'Cópia 3513', null, '3513', ['A cópia feita para o intermediário digital: verde mais frio, branco limpo.']),
  filme('500t-2383', '500T + 2383', '5219', '2383', ['Vision3 500T copiado na 2383: a noite do cinema.']),
  filme('250d-2383', '250D + 2383', '5207', '2383', ['Vision3 250D copiado na 2383: o dia do cinema.']),
  filme('200t-2383', '200T + 2383', '5213', '2383', ['Vision3 200T na 2383: tungstênio fino.']),
  filme('500t-3513', '500T + 3513', '5219', '3513', ['Vision3 500T na cópia da Fuji.']),
  filme('eterna500-3513', 'Eterna 500 + 3513', '8573', '3513', ['O sistema da Fuji: azul firme, verde frio.']),
  filme('eterna250d-3513', 'Eterna 250D + 3513', '8563', '3513', ['O dia da Fuji, do negativo à cópia.']),
  filme('eterna400-3513', 'Eterna 400 + 3513', '8583', '3513', ['O mais suave: contraste baixo, cor contida.']),
  filme('reala500d-3513', 'Reala 500D + 3513', '8592', '3513', ['Dia rápido da Fuji, cor fiel em luz mista.']),
  filme('500t-scan', '500T escaneado', '5219', null, ['O negativo sem cópia, como no scan do intermediário digital.']),
]

export const GRUPOS = [
  { id: 'revela', nome: 'Revela', looks: REVELA },
  { id: 'pelicula', nome: 'Película', looks: PELICULAS },
  { id: 'cinema', nome: 'Cinema', looks: CINEMA },
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
 * Acabamento da cópia REVELAFILM (titular, 04/11/2026): o que uma cópia projetada faz com a imagem e a ficha técnica
 * sozinha não conta, com números próprios, conferidos numa carta de medição (escala de cinza, 24 matizes × 5 cromas × 3
 * exposições e uma grade 17³). Age depois da cópia e do High Density, na luz da cena:
 *   - tom: o meio-tom abre um pouco e as altas deitam antes do branco (a luz sempre sobe);
 *   - polos de matiz: as cores se juntam em poucos polos, como os corantes da cópia fazem (vermelho e magenta para o
 *     laranja, verde-amarelo para o verde, roxo para o azul), mais forte quanto mais cor;
 *   - compressão de cor: cor fraca ganha um pouco, cor extrema é segurada (neon vira cor de cinema), na saturação
 *     (croma ÷ luz), menor perto do preto e do branco;
 *   - separação: sombra fria e alta quente, a assinatura da cópia (de 0 a 2, 1 no padrão).
 * A Era da cópia (−1 retrô a +1 moderno) dosa os polos e a cor e tinge o cinza do meio (retrô quente, moderno petróleo).
 */
export const ACABAMENTO = {
  tom: { meio: 0.55, centro: 0.9, largura: 3, ombro: 0.45 },
  polos: { graus: [16, 19, -8, 5, 16, 4, 11, 10, -6, -13, -22, -7], saturacao: 0.06 },
  compressao: { teto: 0.29, ganho: 1.18, preto: 0.5, branco: 0.2 },
  separacao: { sombras: [-0.012, -0.02], altas: [-0.006, 0.012] },
  era: { tom: [0.016, 0.02], cor: 0.12 },
}

/** Valor periódico em nós a cada 30° (Catmull-Rom): curva de matiz suave, sem bico. */
function noCirculo(nos, h) {
  const n = nos.length
  const passo = 360 / n
  const u = ((((h % 360) + 360) % 360) / passo) % n
  const i = Math.floor(u)
  const t = u - i
  const p = (k) => nos[(((i + k) % n) + n) % n]
  const [p0, p1, p2, p3] = [p(-1), p(0), p(1), p(2)]
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
}

/**
 * O look de um perfil em luz da cena: `emCena([r, g, b]) → [r, g, b]`, DWG linear nos dois lados.
 * `extra`: { exposicao (stops), temperatura, tint (-1–1), ganhosLms, contraste (×), saturacao (×), calor (0–1),
 * veu (0–1), pele (0–1, protege a cor da pele), copia (id, 'nenhuma' ou ausente = a do perfil), negativo (id,
 * 'digital' ou ausente = o do perfil), revelacao, luzCopia, expandido, intensidade (0–1) }.
 */
/** Zonas da exposição HDR: centro em stops sobre o cinza 18%. */
export const ZONAS_HDR = [
  { id: 'preto', centro: -6 },
  { id: 'escuros', centro: -4 },
  { id: 'sombras', centro: -2 },
  { id: 'claros', centro: 1.5 },
  { id: 'altas', centro: 3.5 },
  { id: 'especular', centro: 5.5 },
]
/**
 * `exposicoes`: stops por zona (na ordem de ZONAS_HDR, até ±1,5). Devolve ev → ev, monótona: soma de sinos (largura
 * 1,2 stop) tabelada de -16 a +12 stops e corrigida para a inclinação nunca ficar abaixo de 0,15.
 */
export function criarCurvaZonas(exposicoes) {
  const e = ZONAS_HDR.map((_, i) => limitar(exposicoes[i] ?? 0, -1.5, 1.5))
  const DE = -16, ATE = 12, PASSO = 0.05, N = Math.round((ATE - DE) / PASSO) + 1
  const tab = new Float64Array(N)
  for (let k = 0; k < N; k++) {
    const ev = DE + k * PASSO
    let off = 0
    for (let i = 0; i < e.length; i++) if (e[i]) off += e[i] * Math.exp(-(((ev - ZONAS_HDR[i].centro) / 1.2) ** 2) / 2)
    tab[k] = ev + off
    if (k > 0 && tab[k] < tab[k - 1] + 0.15 * PASSO) tab[k] = tab[k - 1] + 0.15 * PASSO
  }
  return (ev) => {
    if (!(ev > DE)) return ev + (tab[0] - DE)
    if (ev >= ATE) return ev + (tab[N - 1] - ATE)
    const f = (ev - DE) / PASSO, k = Math.floor(f), t = f - k
    return tab[k] + (tab[k + 1] - tab[k]) * t
  }
}

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
  // ajuste fino (todos -1 a 1, 0 = neutro; densidade e branqueamento de 0 a 1)
  const altas = extra.altas ?? 0
  const sombrasAj = extra.sombras ?? 0
  const preto = extra.preto ?? 0
  // matiz e saturação da pele: o do perfil (o look) somado ao ajuste da pessoa
  const peleMatiz = (pr.peleMatiz ?? 0) + (extra.peleMatiz ?? 0)
  const peleSat = (pr.peleSat ?? 0) + (extra.peleSat ?? 0)
  // Estilo (até a receita 5): a separação de tons antiga, retrô ou moderna, antes da cópia. Desde a 6 a separação é a
  // do acabamento da cópia (abaixo) e a Era da cópia faz o papel do retrô ↔ moderno.
  const estilo = extra.estilo ?? 0
  // densidade da cor (o corante da cópia): de -1 (tira corante: a cor some e a luz que ele segurava volta) a +1 (mais
  // corante: cor cheia e mais escura), no acabamento, depois da cópia; até a receita 5 era um reforço de 0 a 1 antes
  // dela (`densidadeLegado`)
  const densidadeAj = limitar(extra.densidade ?? 0, -1, 1)
  const densidade = pr.densidade + 0.3 * limitar(extra.densidadeLegado ?? 0, 0, 1)
  const branqueamento = extra.branqueamento ?? 0
  // Boost (REVELAFILM): a assinatura da casa por cima da película, de 0 a 100; só onde há negativo das fichas ou cópia
  const boostPedido = limitar((extra.boost ?? 0) / 100, 0, 1)
  // Estilo: moderno (> 0) põe a sombra para o petróleo e a alta para o quente; retrô (< 0), a sombra quente e a alta
  // fria, como as cópias antigas. Soma à separação de tons do perfil.
  const split = {
    sombras: estilo >= 0 ? [-0.008 * estilo, -0.014 * estilo] : [0.006 * -estilo, 0.013 * -estilo],
    altas: estilo >= 0 ? [0.005 * estilo, 0.014 * estilo] : [-0.004 * -estilo, -0.011 * -estilo],
  }
  // sombra fria (Analisar e corrigir, 0 a 1): o azul-petróleo que os coloristas põem na sombra (19 takes reais,
  // 04/11/2026). A pele continua fora da separação de tons
  const fria = limitar(extra.sombraFria ?? 0, 0, 2)
  const sombrasTom = [pr.sombras[0] + split.sombras[0] - 0.008 * fria, pr.sombras[1] + split.sombras[1] - 0.02 * fria]
  const altasTom = [pr.altas[0] + split.altas[0], pr.altas[1] + split.altas[1]]
  const t = limitar(extra.intensidade ?? 1, 0, 1)
  const idCopia = extra.copia === 'nenhuma' ? null : (extra.copia ?? pr.copia)
  const idNegativo = extra.negativo === 'digital' ? null : (extra.negativo ?? pr.negativoFicha)
  const opcoesFilme = {
    gamaSistema: pr.gamaCopia,
    negativo: idNegativo,
    revelacao: extra.revelacao ?? pr.revelacao,
    iluminante: 'D65', // a luz do projetor entra depois da âncora da pele (abaixo)
    expandido: extra.expandido ?? pr.expandido,
  }
  // luz do projetor da cópia (D60, D55): o branco da cópia em Rec.709, aplicado na luz da cena depois da cópia e da
  // âncora da pele; a tela da Revela mantém a razão entre os canais, então na tela é a lâmpada sobre a cópia
  const luzCopia = idCopia ? (extra.luzCopia ?? pr.luzCopia) : 'D65'
  const lampada = branco709(luzCopia)
  const LUZ = lampada ? mulM(mulM(R709_DWG, [[lampada[0], 0, 0], [0, lampada[1], 0], [0, 0, lampada[2]]]), DWG_709) : null
  // com cópia: negativo (da ficha ou o ideal) → cópia → tela; sem cópia e com negativo da ficha: o negativo escaneado
  const copia = idCopia ? criarCopia(idCopia, opcoesFilme).emCena : idNegativo ? criarScan(idNegativo, opcoesFilme).emCena : null

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
    L -= densidade * (Math.hypot(C, 0.01) - 0.01) * suave(0.15, 0.7, Lr) * L
    // saturação subtrativa (04/11/2026): como o corante da película, a cor forte ganha croma e perde luz juntos — fica
    // cheia e escura, nunca neon. Até o meio-tom alto: luz prática, janela e céu não escurecem (no cinema elas continuam
    // luz). Medido nos filmes: no dia, a cor forte é ~20% mais escura que a fraca na mesma faixa
    if (pr.subtrativa) {
      const forte = (C * C) / (C * C + 0.0036) // quadrática: suave no eixo neutro (o croma tem bico no zero)
      const ondeAge = suave5(0.12, 0.5, Lr) * (1 - suave5(1.15, 1.9, Lr)) // quíntica: sem quina na LUT
      // a pele fica fora (como o colorista protege): escurecer a pele a deixa barrenta, principalmente a pele negra
      * (1 - 0.8 * noMatiz(h, 55, 45))
      L *= 1 - pr.subtrativa * forte * ondeAge
      C *= 1 + 0.5 * pr.subtrativa * forte * ondeAge
    }
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
    let da = (ws * sombrasTom[0] + wm * pr.meios[0] + wa * altasTom[0]) * fora
    let db = (ws * sombrasTom[1] + wm * pr.meios[1] + wa * altasTom[1]) * fora
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

  // a cópia real vira o matiz da pele com a exposição (mais vermelha na sombra, dourada na alta). A âncora puxa o
  // matiz da pele para o que a própria cópia dá a essa cor no meio-tom: fica o desenho da cópia, sai a deriva
  // perfil criativo (com cor própria) + negativo e cópia reais: as viradas da pele se somam, então a âncora firma
  // (o mesmo na cópia que precisa de equilíbrio com um negativo das fichas, a 2393: o traço dela é o mais incerto)
  const firme = (pr.pele.ancora > 0 && copia) || (idNegativo && copiaDe(idCopia)?.equilibrar)
  const ancoraCopia = Math.max(pr.ancoraCopia, pele, firme ? 0.95 : 0)
  function copiar(y, antes) {
    const z = copia(y)
    if (!(ancoraCopia > 0) || !antes) return z
    // cor relativa à luz (croma ÷ L): a pele no escuro continua pele
    const Ca = Math.hypot(antes[1], antes[2]) / Math.max(antes[0], 0.02)
    const naPele = noMatiz(Math.atan2(antes[2], antes[1]) / GRAU, 52, 38) * ((Ca * Ca) / (Ca * Ca + 0.0025))
    if (!(naPele > 0.001)) return z
    const Lr = dwgParaOklab(y)[0] / L_CINZA
    if (!(Lr > 0.05)) return z
    const k = limitar(1 / (Lr * Lr * Lr), 1 / 32, 32)
    const meio = dwgParaOklab(copia(y.map((v) => v * k)))
    const [L, a, b] = dwgParaOklab(z)
    const C = Math.hypot(a, b)
    if (!(C > 1e-6) || !(Math.hypot(meio[1], meio[2]) > 1e-6)) return z
    let h = Math.atan2(b, a) / GRAU
    h += ancoraCopia * naPele * distancia(Math.atan2(meio[2], meio[1]) / GRAU, h)
    return oklabParaDwg([L, C * Math.cos(h * GRAU), C * Math.sin(h * GRAU)])
  }

  // níveis do frame (Analisar e corrigir), depois da exposição e do branco, em DaVinci Intermediate: um slope abaixo do
  // cinza (assenta o preto) e outro acima (abre ou segura o branco), com o cinza parado e a passagem suave (sem quina
  // na LUT); depois a saturação com a luma do Rec.709, como no ASC CDL
  const [slopeSombra, slopeAlta] = Array.isArray(extra.contrasteCena) ? extra.contrasteCena : [extra.contrasteCena ?? 1, extra.contrasteCena ?? 1]
  const satDi = extra.saturacaoCena ?? 1
  const DI_CINZA = linearParaDi(0.18)
  const JOELHO = 0.02 // largura da passagem, em código DI (~0,3 stop)
  const sp = (u) => (u > 30 ? u : Math.log1p(Math.exp(u)))
  const niveis = (v) => {
    const u = linearParaDi(v) - DI_CINZA
    return DI_CINZA + slopeSombra * u + (slopeAlta - slopeSombra) * JOELHO * (sp(u / JOELHO) - Math.LN2)
  }
  function primaria(rgb) {
    const x = rgb.map((v) => v * ganho)
    const y = branco ? mul(branco, x) : x
    if (slopeSombra === 1 && slopeAlta === 1 && satDi === 1) return y
    let d = y.map(niveis)
    if (satDi !== 1) {
      const l = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]
      d = d.map((v) => l + (v - l) * satDi)
    }
    return d.map(diParaLinear)
  }

  // Exposição HDR por zonas (como as rodas HDR do Resolve): seis zonas em stops na luz da cena, cada uma até ±1,5
  // stop, somadas por sinos suaves; a curva final é forçada a subir sempre (nunca inverte a luz nem faz degrau, mesmo
  // com zonas vizinhas em sentidos opostos). Age na luz e mantém a cor.
  const zonas = extra.zonas && extra.zonas.some((z) => z) ? extra.zonas : null
  const curvaZonas = zonas ? criarCurvaZonas(zonas) : null

  /**
   * Tom da cena antes do filme: altas, sombras e preto em log, em volta do cinza e sem mexer nele; depois as zonas HDR.
   * Age na luz e mantém a cor (a razão entre os canais).
   */
  function tomDaCena(x) {
    if (!altas && !sombrasAj && !preto && !curvaZonas) return x
    const Y = Math.max(1e-9, luz(x))
    const e = Math.log2(Y / 0.18)
    let e2 = e
    if (e > 0) e2 = e * (1 + 0.35 * altas * suave(0, 3, e))
    else e2 = e * (1 - 0.35 * sombrasAj * suave(0, 3, -e))
    // preto: só abaixo de -1,5 stop (até -7 por inteiro): afunda ou levanta a sombra profunda, a curva sempre sobe
    if (preto) e2 += (preto < 0 ? 2 : 1) * preto * suave(-1.5, -7, e)
    if (curvaZonas) e2 = curvaZonas(e2)
    return x.map((v) => (v * 2 ** e2 * 0.18) / Y)
  }

  /** Pele: matiz (vermelho ↔ amarelo) e saturação só onde a cena tem pele, depois do filme. */
  function ajustarPele(y, antes) {
    if ((!peleMatiz && !peleSat) || !antes) return y
    const Ca = Math.hypot(antes[1], antes[2]) / Math.max(antes[0], 0.02)
    const w = noMatiz(Math.atan2(antes[2], antes[1]) / GRAU, 55, 32) * ((Ca * Ca) / (Ca * Ca + 0.0025))
    if (!(w > 0.001)) return y
    const [L, a, b] = dwgParaOklab(y)
    const C = Math.hypot(a, b) * (1 + 0.35 * peleSat * w)
    const h = Math.atan2(b, a) / GRAU + 10 * peleMatiz * w
    return oklabParaDwg([L, C * Math.cos(h * GRAU), C * Math.sin(h * GRAU)])
  }

  /** Sem branqueamento (bleach bypass): a prata que fica soma densidade neutra: mais contraste, menos cor. */
  function semBranqueamento(y) {
    if (!branqueamento) return y
    // a prata pesa mais no meio e nas altas: o ponto que fica parado é 1 stop acima do cinza (o meio escurece um pouco
    // e as altas abrem)
    const Y = Math.max(1e-9, luz(y))
    const Y2 = 0.36 * (Y / 0.36) ** (1 + 0.3 * branqueamento)
    const fica = 1 - 0.55 * branqueamento
    return y.map((v) => Y2 * (1 + (v / Y - 1) * fica))
  }

  /**
   * Boost (REVELAFILM, titular, 04/11/2026): a mão do colorista por cima da película, sem tocar no negativo nem na
   * cópia (as curvas e corantes das fichas ficam como estão). Em Oklab, depois da cópia: o meio-tom ganha densidade de
   * cor (a cor forte fica mais cheia e um pouco mais escura, como no filme subtrativo), as altas guardam cor (a cópia
   * desbota rápido perto do branco), amarelos e laranjas mais cheios e quentes, o azul do céu puxa para o ciano. O
   * neutro fica neutro, a pele fica com a cópia e a luz nunca inverte.
   */
  const boost = idCopia || idNegativo ? boostPedido : 0
  // o Boost age na diferença entre a cor e o cinza da própria cópia na mesma luz: o neutro (com o leve tom que a cópia
  // tem no pé e no topo) fica exatamente como a ficha manda, e o reforço cresce em linha reta a partir dele
  function cinzaDaCopia(x) {
    // luz que nunca fica negativa e sem bico no zero (o azul profundo do DWG tem luminância negativa): o cinza de
    // referência anda suave junto com a cor, e a conta relativa a ele (Boost, acabamento) não quebra
    const Y0 = luz(x)
    const escala = 0.05 * Math.max(x[0], x[1], x[2], 1e-6)
    const Y = 0.5 * (Y0 + Math.sqrt(Y0 * Y0 + escala * escala))
    const c = [Y, Y, Y]
    const a = dwgParaOklab(c)
    let y = idNegativo ? c : negativo(c)
    y = dentroDoGamut(cor(y, a))
    return dwgParaOklab(copia ? copiar(y, a) : y)
  }
  function reforcar(y, antes, ref) {
    if (!(boost > 0)) return y
    const [L, a, b] = dwgParaOklab(y)
    const da = a - ref[1]
    const db = b - ref[2]
    const C = Math.hypot(da, db)
    if (!(C > 1e-7) || !(L > 0)) return y
    let h = Math.atan2(db, da) / GRAU
    const h0 = h
    const Lr = L / L_CINZA
    // os giros e a densidade só entram com cor de verdade (perto do cinza o matiz não diz nada)
    const comCor = (C * C) / (C * C + 0.0016)
    // pele: medida na cor da cena (antes do filme), que não muda com a exposição; a da cópia muda nas altas
    let pl = noMatiz(h, 58, 30) * comCor
    if (antes) {
      const Ca = Math.hypot(antes[1], antes[2]) / Math.max(antes[0], 0.02)
      // (a união das duas medidas sem o bico do máximo: 1 − (1 − a)(1 − b))
      const naCena = noMatiz(Math.atan2(antes[2], antes[1]) / GRAU, 52, 42) * suave5(0.015, 0.07, Ca)
      pl = 1 - (1 - pl) * (1 - naCena)
    }
    const amarelo = noMatiz(h, 100, 20) * comCor * (1 - pl) ** 2
    const ceu = noMatiz(h, 245, 40) * comCor * (1 - suave(0.07, 0.16, C)) // céu: azul de saturação moderada, não o primário
    // o reforço some na sombra profunda (ruído não ganha cor), cresce um pouco nas altas e não toca a pele
    const naLuz = suave(0.12, 0.45, Lr)
    // cor que já está perto do limite é empurrada cada vez menos, sem joelho (sem virar tinta nem forçar a tela); o
    // amarelo tem o limite mais baixo de todos fora do claro, então o teto dele é menor
    const zonaAmarela = noMatiz(h, 100, 30)
    const folga = 1 / (1 + (C / (0.2 - 0.08 * zonaAmarela)) ** 2)
    const g = 1 + boost * naLuz * (1 - pl) * folga * (0.24 + 0.2 * suave(1.0, 2.2, Lr) + 0.2 * amarelo)
    h += boost * folga * (5 * amarelo - 6 * ceu)
    const C2 = C * g
    // densidade subtrativa: cor cheia escurece um pouco (no máximo 6%), proporcional a quanto a cor cresceu
    // (o amarelo é o corante mais claro do filme: não escurece)
    const L2 = L * (1 - boost * 0.06 * comCor * (1 - pl) * (1 - zonaAmarela) * (C2 / (C2 + 0.09)))
    if (C2 === C && L2 === L && h === h0) return y
    // aplica como diferença sobre a cor original: onde o Boost não age (pele, neutro), a cor fica idêntica, sem passar
    // pela ida e volta do Oklab (que recorta o gamut)
    const antesDwg = oklabParaDwg([L, a, b])
    const depois = oklabParaDwg([L2, ref[1] + C2 * Math.cos(h * GRAU), ref[2] + C2 * Math.sin(h * GRAU)])
    return y.map((v, i) => v + depois[i] - antesDwg[i])
  }

  // acabamento da cópia (ACABAMENTO, acima): por inteiro com cópia de cinema; a separação, a Era e o preto neutro
  // também valem sem ela, como ajuste
  const AC = extra.parametrosAcabamento ?? ACABAMENTO
  const acab = idCopia ? limitar(extra.acabamento ?? 1, 0, 1) : 0
  const era = limitar(extra.era ?? 0, -1, 1)
  // separação de tons da cópia: a do acabamento, mais a do perfil (o Revela Look tira a alta morna) e o ajuste da pessoa
  const separacao = limitar(acab + (pr.separacao ?? 0) + (extra.separacao ?? 0), 0, 2)
  const pretoNeutro = limitar(extra.pretoNeutro ?? 0, -1, 1)
  const temAcabamento = acab > 0 || separacao > 0 || era !== 0 || pretoNeutro !== 0 || densidadeAj !== 0
  function acabar(y, ref, antes) {
    if (!temAcabamento) return y
    let z = y
    if (acab) {
      // tom: o meio abre um pouco e as altas deitam antes (a inclinação nunca passa de 0,2 para baixo: a luz sempre sobe)
      const T = AC.tom
      const ev = Math.log2(Math.max(1e-9, luz(y)) / 0.18)
      const sobe = acab * (T.meio * Math.exp(-(((ev - T.centro) / T.largura) ** 2)) - T.ombro * suave(2.5, 6.5, ev))
      z = y.map((v) => v * 2 ** sobe)
    }
    const ok = dwgParaOklab(z)
    const L = ok[0]
    let L2 = L
    if (!(L > 0)) return z
    const Lr = L / L_CINZA
    const ev = Math.log2(Math.max(1e-6, Lr * Lr * Lr))
    let da = ok[1] - ref[1]
    let db = ok[2] - ref[2]
    const C = Math.hypot(da, db)
    // a pele fica fora dos polos e da separação (pela cor da cena, que não muda com a exposição): fica com a cópia,
    // como no resto do motor; sombra fria em rosto adoece. Laranja vivo (bem mais saturado que pele) entra.
    let fora = 1
    if (antes) {
      const Ca = Math.hypot(antes[1], antes[2]) / Math.max(antes[0], 0.02)
      fora = 1 - noMatiz(Math.atan2(antes[2], antes[1]) / GRAU, 50, 60) * suave(0.015, 0.06, Ca) * (1 - suave(0.22, 0.4, Ca))
    }
    const forca = acab * (1 + era)
    if (C > 1e-7 && (acab || era || densidadeAj)) {
      let h = Math.atan2(db, da) / GRAU
      const base = Math.max(L, 0.02)
      const sat = C / base
      // polos: mais forte quanto mais saturada a cor (croma ÷ luz, que não muda com a exposição; perto do cinza o matiz
      // não diz nada)
      h += forca * fora * ((sat * sat) / (sat * sat + AC.polos.saturacao ** 2)) * noCirculo(AC.polos.graus, h)
      // compressão na saturação: tanh, que cresce sempre e encosta no teto sem joelho
      const K = AC.compressao
      const teto = K.teto * (K.preto + (1 - K.preto) * suave5(0.1, 0.6, Lr)) * (1 - (1 - K.branco) * suave5(1.25, 2.2, Lr))
      const k = K.ganho * (1 + AC.era.cor * era)
      let sat2 = sat + acab * (teto * Math.tanh((k * sat) / teto) - sat)
      let base2 = base
      if (densidadeAj > 0) {
        // mais corante: a cor saturada fica mais cheia e mais escura, como no filme subtrativo (a pele, pela metade)
        const d = densidadeAj * (1 - 0.5 * (1 - fora))
        const w = (sat2 * sat2) / (sat2 * sat2 + 0.1 * 0.1)
        L2 = L * (1 - 0.25 * d * w * suave5(0.05, 0.4, Lr))
        sat2 *= 1 + 0.5 * d
        base2 = Math.max(L2, 0.02)
      } else if (densidadeAj < 0) {
        // menos corante: a cor vai embora e a luz que o corante absorvia volta, até quase o P&B da própria cópia
        // (a luz que volta segue a cor tirada, medida sem bico no cinza: hypot)
        // (a pele, pela metade, como no lado de mais corante)
        const q = -densidadeAj * (1 - 0.5 * (1 - fora))
        const s3 = sat2 * (1 - 0.88 * q)
        L2 = L * (1 + 1.8 * 0.88 * q * (Math.hypot(sat2, 0.02) - 0.02) * suave5(0.05, 0.4, Lr))
        sat2 = s3
        base2 = Math.max(L2, 0.02)
      }
      da = sat2 * base2 * Math.cos(h * GRAU)
      db = sat2 * base2 * Math.sin(h * GRAU)
    }
    // separação (sombra fria, alta quente) e o tom da Era no meio, proporcionais à luz (fora da pele)
    const ws = 1 - suave(-4.5, -0.5, ev)
    const wa = suave(0.5, 4, ev)
    const wm = Math.exp(-((ev + 0.3) ** 2) / 4.5)
    const S = AC.separacao
    let a = ref[1] + da + (separacao * (ws * S.sombras[0] + wa * S.altas[0]) - era * AC.era.tom[0] * wm) * Lr * fora
    let b = ref[2] + db + (separacao * (ws * S.sombras[1] + wa * S.altas[1]) - era * AC.era.tom[1] * wm) * Lr * fora
    if (pretoNeutro) {
      // preto neutro: a cor sai (ou cresce) só abaixo de -1,5 stop, por inteiro no preto
      const wp = 1 - suave(-5, -1.5, ev)
      const f = pretoNeutro > 0 ? 1 - pretoNeutro * wp : 1 + 0.3 * -pretoNeutro * wp
      a *= f
      b *= f
    }
    // como diferença sobre a cor de entrada (sem a ida e volta do Oklab onde nada mudou)
    const antesDwg = oklabParaDwg(ok)
    const depois = oklabParaDwg([L2, a, b])
    return z.map((v, i) => v + depois[i] - antesDwg[i])
  }

  function emCena(rgb) {
    const x = dentroDoGamut(tomDaCena(primaria(rgb)))
    const antes = pele || peleMatiz || peleSat || pr.pele.ancora > 0 || copia || boost > 0 || temAcabamento ? dwgParaOklab(x) : null
    // um negativo das fichas substitui o negativo genérico do perfil (do perfil fica a cor): nunca dois negativos
    let y = idNegativo ? x : negativo(x)
    y = dentroDoGamut(cor(y, antes))
    if (copia) y = copiar(y, antes)
    const ref = boost > 0 || temAcabamento ? cinzaDaCopia(x) : null
    if (boost > 0) y = reforcar(y, antes, ref)
    // o acabamento da cópia segura também a cor que o High Density encheu (neon vira cor de cinema)
    if (temAcabamento) y = acabar(y, ref, antes)
    if (LUZ) y = mul(LUZ, y)
    y = ajustarPele(y, antes)
    y = semBranqueamento(y)
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
    copia: idCopia,
    negativo: idNegativo,
    luzCopia,
    boost,
    acabamento: acab,
    partes: { negativo, cor, dentroDoGamut, copia, reforcar, acabar }, // para os testes internos olharem cada etapa
    /** O mesmo look em código DaVinci Intermediate, para a LUT log → log. */
    emDi(r, g, b) {
      return emCena([diParaLinear(r), diParaLinear(g), diParaLinear(b)]).map(linearParaDi)
    },
  }
}
