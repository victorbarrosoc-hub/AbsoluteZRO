// A cadeia por pixel do motor Latitude: tudo que não precisa de vizinho, na luz da cena (linear, Rec.2020 D65, sem
// teto, cinza médio = 0,18). `uniformes(ajustes, contexto)` transforma os ajustes em números e tabelas; `criarPonto`
// roda a conta com eles. A GPU recebe os MESMOS uniformes e faz a MESMA conta: cada passo abaixo está escrito sem
// desvio que dependa do dado (só `max`, `mix`, `smoothstep` e leitura de tabela), com a fórmula no comentário.
//
// Ordem:
//   1. entrada       v = E·v                         exposição (2^(EV + exposição base)) e branco (CAT16) numa matriz só
//   2. tom           v = g(e)·(v + max(ε − n, 0))    luz, curva paramétrica e curva de pontos: uma tabela de ganho em EV
//   3. canais        v_c = g_c(e_c)·max(v_c, ε)      curva de pontos por canal (só quando não é reta)
//   4. calibração    v = C·v                         primárias giradas e escaladas em torno do branco
//   5. cor (Oklab)   tinta das sombras → misturador de 8 faixas → vibração e saturação → P&B → tonalização
//   6. desbotar      v = v + véu
//
// Os controles de luz são definidos em EV em torno do cinza médio — n é a norma do pixel, e = log2(n / 0,18):
//
//   contraste   e' = e + (s − 1)·R·tanh(e/R)        s = 1,5^(c/100) é a inclinação no cinza, R = 2,5 EV; longe do cinza
//                                                   a curva volta à inclinação 1 (as pontas andam no máximo (s − 1)·R)
//   altas       e' = e + A·rampa(e; 0 → +3 EV)      A = ±1,5 EV em ±100; acima de +3 EV tudo anda junto
//   sombras     e' = e + A·rampa(−e; 0 → 4 EV)      A = ±2 EV; abaixo de −4 EV tudo anda junto
//   brancos     e' = e + A·rampa(e; +1,5 → +4,5 EV) A = ±1 EV
//   pretos      e' = e + A·rampa(−e; 3 → 7 EV)      A = ±1,5 EV
//
// `rampa` é o smoothstep (3t² − 2t³): cada passo é C1 e monótono (A·1,5/largura < 1) e eles são COMPOSTOS, não
// somados, então qualquer combinação continua monótona. Nada aqui olha o conteúdo da foto: o mesmo número dá o mesmo
// resultado em qualquer imagem. O cinza (e = 0) não sai do lugar em nenhum deles.
//
// A curva paramétrica e a de pontos são desenhadas, como sempre, sobre o código da tela (0..1). Para valerem na cena,
// o motor usa uma tela de REFERÊNCIA fixa (a neutra: contraste 0, margens padrão, sRGB): x = código(f0(n)),
// y = curva(x), n' = f0⁻¹(luz(y)). Abaixo do preto dessa tela o valor fica no piso da curva (é o preto levantado das
// predefinições); acima do branco, anda junto com ele (as altas luzes seguem inteiras até o mapa de tons de verdade).
//
// P&B vem ANTES da tonalização, de propósito: é o que permite o preto e branco tonalizado (sépia).

import { FAIXAS_MATIZ, normalizar } from './ajustes.js'
import { CAT16 } from './cor/adaptacao.js'
import { xyDeTemperatura } from './cor/branco.js'
import { CURVAS, D65, ESPACOS, luminancia, rgbParaXyz, xyParaXYZ, xyzParaRgb } from './cor/espacos.js'
import { diagonal, identidade, inversa, mulM, mulV } from './cor/matriz.js'
import { LAB_PARA_LMS, LMS_PARA_LAB, criarOklab, matizDoCirculo } from './cor/oklab.js'
import { LOG, exp2, f32, i32 } from './cor/rapido.js'
import { CINZA, MARGENS, PESO_MAXIMO, curvaDeTons } from './tela.js'

// ─────────── constantes da cadeia (as faixas de cada controle) ───────────

export const EV_MIN = -16
export const EV_MAX = 16
export const PASSOS_POR_EV = 64
const TAM_TOM = (EV_MAX - EV_MIN) * PASSOS_POR_EV + 1
/** Abaixo disto a norma (ou o canal) é tratada como este valor. */
export const EPS = CINZA * 2 ** EV_MIN

export const LUZ = {
  contraste: { base: 1.5, raio: 2.5 },
  altas: { ev: 1.5, de: 0, ate: 3 },
  sombras: { ev: 2, de: 0, ate: 4 },
  brancos: { ev: 1, de: 1.5, ate: 4.5 },
  pretos: { ev: 1.5, de: 3, ate: 7 },
}

// Curva paramétrica: quatro lombadas em cosseno levantado sobre o código 0..1, cada uma com centro, meia largura e
// amplitude em ±100. As amplitudes respeitam amplitude·π/(2·meia largura) < 1 (monótona sozinha) e as quatro são
// compostas (monótonas juntas). As pontas 0 e 1 não se mexem.
export const PARAMETRICA = {
  sombras: { centro: 0.2, meia: 0.2, amplitude: 0.1 },
  escuros: { centro: 0.375, meia: 0.375, amplitude: 0.15 },
  claros: { centro: 0.625, meia: 0.375, amplitude: 0.15 },
  altas: { centro: 0.8, meia: 0.2, amplitude: 0.1 },
}

// Calibração: ±100 gira a primária ±20° em torno do branco no diagrama xy e escala a distância ao branco entre 0,5 e
// 1,5. A tinta das sombras desloca o eixo verde–magenta (a de Oklab) em até 0,04·L abaixo de L = 0,5.
export const CALIBRACAO = { graus: 20, escala: 0.5, tinta: 0.04 }

// Misturador: +100 leva o centro da faixa até metade do caminho para a faixa vizinha; saturação de 0 a 2×; luz de
// ±1,5 EV, pesada pela croma (cinza não muda). Vibração: ganho de croma que some nas cores já saturadas (C/L perto de
// 0,2 já recebe metade) e é 60% menor na pele. Tonalização: 100 de saturação = 0,12·L de croma; luz de ±1 EV por zona.
export const COR = {
  matiz: 0.5,
  luzEv: 1.5,
  cromaRef: 0.08,
  vibracaoRef: 0.2,
  pele: { centro: 55, meia: 30, protecao: 0.6 },
  tonalizacao: { croma: 0.12, luzEv: 1, largura: 0.3, equilibrioEv: 2 },
  pbEv: 1.5,
}

// Desbotar: um véu aditivo (como luz parasita) de até 0,18·2^−2,5 na cena: levanta o preto sem tocar as altas.
export const VEU = CINZA * 2 ** -2.5

const TAM_MATIZ = 720
const COLUNAS_MATIZ = 6
const L_CINZA = Math.cbrt(CINZA)

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// ─────────── curvas ───────────

/**
 * Curva por pontos: cúbica de Hermite monótona (Fritsch e Carlson, 1980, "Monotone piecewise cubic interpolation",
 * SIAM J. Numer. Anal. 17). Passa pelos pontos sem ultrapassar entre eles. Devolve x → y, com x limitado a 0..1.
 */
export function criarCurvaDePontos(pontos) {
  const n = pontos.length
  const xs = pontos.map((p) => p[0])
  const ys = pontos.map((p) => p[1])
  if (n < 2) return (x) => x
  const h = []
  const d = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  }
  const m = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
  }
}

const eReta = (p) => p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1

/** A curva paramétrica (quatro regiões) sobre o código 0..1. */
export function criarParametrica(curva) {
  const partes = ['sombras', 'escuros', 'claros', 'altas']
    .map((nome) => ({ ...PARAMETRICA[nome], valor: (curva?.[nome] ?? 0) / 100 }))
    .filter((p) => p.valor !== 0)
  if (!partes.length) return null
  return (x) => {
    let y = x
    for (const p of partes) {
      const t = (y - p.centro) / p.meia
      if (t > -1 && t < 1) y += p.valor * p.amplitude * 0.5 * (1 + Math.cos(Math.PI * t))
    }
    return y
  }
}

/** A curva de luz em EV: e (EV em torno do cinza) → e'. Só os controles do grupo `luz`, sem as curvas de código. */
export function curvaDeLuz(luz) {
  const s = LUZ.contraste.base ** ((luz?.contraste ?? 0) / 100)
  const R = LUZ.contraste.raio
  const A = (nome) => ((luz?.[nome] ?? 0) / 100) * LUZ[nome].ev
  const altas = A('altas')
  const sombras = A('sombras')
  const brancos = A('brancos')
  const pretos = A('pretos')
  return (e) => {
    let x = e + (s - 1) * R * Math.tanh(e / R)
    x += altas * suave(LUZ.altas.de, LUZ.altas.ate, x) + sombras * suave(LUZ.sombras.de, LUZ.sombras.ate, -x)
    x += brancos * suave(LUZ.brancos.de, LUZ.brancos.ate, x) + pretos * suave(LUZ.pretos.de, LUZ.pretos.ate, -x)
    return x
  }
}

// A tela de referência das curvas de código (ver o cabeçalho).
let referencia = null
function telaDeReferencia() {
  if (!referencia) {
    const tom = curvaDeTons({ altas: MARGENS.altas.padrao, sombras: MARGENS.sombras.padrao })
    referencia = {
      evPreto: -MARGENS.sombras.padrao,
      evBranco: MARGENS.altas.padrao,
      codigoDe: (e) => CURVAS.srgb.codificar(tom.ida(CINZA * 2 ** e)),
      evDe: (codigo) => Math.log2(tom.volta(CURVAS.srgb.decodificar(limitar(codigo, 0, 1))) / CINZA),
    }
  }
  return referencia
}

/** Uma curva de código (0..1 → 0..1) vista da cena: e → e'. */
function curvaNaCena(curva) {
  const ref = telaDeReferencia()
  const piso = ref.evDe(curva(0))
  const noBranco = ref.evDe(curva(1)) - ref.evBranco
  return (e) => {
    if (e <= ref.evPreto) return piso
    if (e >= ref.evBranco) return e + noBranco
    return ref.evDe(curva(ref.codigoDe(e)))
  }
}

// Tabela de ganho g(e) = 2^(e' − e), de EV_MIN a EV_MAX em passos de 1/64 EV. Fora da faixa vale a ponta (todas as
// curvas viram deslocamento constante lá).
function tabelaDeGanho(funcaoEv) {
  const t = new Float32Array(TAM_TOM + 1)
  for (let i = 0; i < TAM_TOM; i++) {
    const e = EV_MIN + i / PASSOS_POR_EV
    t[i] = 2 ** (funcaoEv(e) - e)
  }
  t[TAM_TOM] = t[TAM_TOM - 1]
  return t
}

// ─────────── branco e calibração ───────────

/**
 * Matriz (Rec.2020 → Rec.2020) que troca o branco da foto de `de` para `para` ({ kelvin, tinta }): desfaz a adaptação
 * ao branco antigo e adapta ao novo, em cones CAT16. `de` igual a `para` dá a identidade exata.
 */
export function matrizDeBranco(de, para) {
  if (!de || !para || (Math.abs(de.kelvin - para.kelvin) < 1e-6 && Math.abs(de.tinta - para.tinta) < 1e-9)) return identidade()
  const antigo = mulV(CAT16, xyParaXYZ(xyDeTemperatura(de.kelvin, de.tinta)))
  const novo = mulV(CAT16, xyParaXYZ(xyDeTemperatura(para.kelvin, para.tinta)))
  // objeto que era neutro sob o branco antigo passa a ter a cor que o branco antigo tem visto do novo
  const emXyz = mulM(inversa(CAT16), mulM(diagonal([antigo[0] / novo[0], antigo[1] / novo[1], antigo[2] / novo[2]]), CAT16))
  return mulM(xyzParaRgb('rec2020'), mulM(emXyz, rgbParaXyz('rec2020')))
}

/** Matriz da calibração de primárias (ver CALIBRACAO). Neutra = identidade exata; o branco nunca muda. */
export function matrizDeCalibracao(cal) {
  const mexeu = ['vermelho', 'verde', 'azul'].some((p) => (cal?.[`${p}Matiz`] ?? 0) !== 0 || (cal?.[`${p}Saturacao`] ?? 0) !== 0)
  if (!mexeu) return identidade()
  const p = ESPACOS.rec2020.primarias
  const novas = []
  ;['vermelho', 'verde', 'azul'].forEach((nome, i) => {
    const ang = (((cal[`${nome}Matiz`] ?? 0) / 100) * CALIBRACAO.graus * Math.PI) / 180
    const esc = 1 + ((cal[`${nome}Saturacao`] ?? 0) / 100) * CALIBRACAO.escala
    const dx = p[i * 2] - D65[0]
    const dy = p[i * 2 + 1] - D65[1]
    novas.push(D65[0] + esc * (dx * Math.cos(ang) - dy * Math.sin(ang)), D65[1] + esc * (dx * Math.sin(ang) + dy * Math.cos(ang)))
  })
  return mulM(xyzParaRgb('rec2020'), rgbParaXyz({ primarias: novas, branco: D65 }))
}

// ─────────── tabela de matiz (misturador, P&B por faixa, proteção de pele) ───────────

const CENTROS = FAIXAS_MATIZ.map((g) => {
  const a = matizDoCirculo(g)
  return a < 0 ? a + 2 * Math.PI : a
})

/** Peso de cada uma das 8 faixas num matiz Oklab (radianos). Somam 1; só as duas faixas vizinhas do matiz pesam. */
export function pesosDasFaixas(matiz) {
  const dois = 2 * Math.PI
  const h = ((matiz % dois) + dois) % dois
  const w = new Array(8).fill(0)
  for (let i = 0; i < 8; i++) {
    const a = CENTROS[i]
    let b = CENTROS[(i + 1) % 8]
    if (b <= a) b += dois
    const x = h < a ? h + dois : h
    if (x >= a && x <= b) {
      const t = (x - a) / (b - a)
      const depois = 0.5 - 0.5 * Math.cos(Math.PI * t)
      w[i] = 1 - depois
      w[(i + 1) % 8] = depois
      break
    }
  }
  return w
}

// Ângulo sem arco tangente: p de 0 a 4 dá a volta inteira (o "ângulo de losango"), monótono no ângulo de verdade.
//   d = |a| + |b|;  t = b/d;  p = a ≥ 0 ? (b ≥ 0 ? t : 4 + t) : 2 − t
function direcaoDoLosango(p) {
  const q = Math.floor(p) % 4
  const f = p - Math.floor(p)
  if (q === 0) return [1 - f, f]
  if (q === 1) return [-f, 1 - f]
  if (q === 2) return [-(1 - f), -f]
  return [f, -(1 - f)]
}

function tabelaDeMatiz(ajustes) {
  const mis = ajustes.misturador
  const dois = 2 * Math.PI
  const giro = mis.matiz.map((v, i) => {
    const vizinho = v >= 0 ? CENTROS[(i + 1) % 8] : CENTROS[(i + 7) % 8]
    let dist = v >= 0 ? vizinho - CENTROS[i] : CENTROS[i] - vizinho
    if (dist < 0) dist += dois
    return (v / 100) * COR.matiz * dist
  })
  const centroPele = (COR.pele.centro * Math.PI) / 180
  const meiaPele = (COR.pele.meia * Math.PI) / 180
  const t = new Float32Array((TAM_MATIZ + 1) * COLUNAS_MATIZ)
  for (let i = 0; i <= TAM_MATIZ; i++) {
    const [a, b] = direcaoDoLosango(((i % TAM_MATIZ) / TAM_MATIZ) * 4)
    const h = Math.atan2(b, a)
    const w = pesosDasFaixas(h)
    let d = 0
    let sat = 0
    let luz = 0
    let pb = 0
    for (let k = 0; k < 8; k++) {
      d += w[k] * giro[k]
      sat += w[k] * (1 + mis.saturacao[k] / 100)
      luz += w[k] * (mis.luz[k] / 100) * COR.luzEv
      pb += w[k] * (ajustes.pb.mistura[k] / 100) * COR.pbEv
    }
    let dp = Math.abs(h - centroPele)
    if (dp > Math.PI) dp = dois - dp
    const pele = dp < meiaPele ? 0.5 * (1 + Math.cos((Math.PI * dp) / meiaPele)) : 0
    const o = i * COLUNAS_MATIZ
    t[o] = Math.cos(d)
    t[o + 1] = Math.sin(d)
    t[o + 2] = sat
    t[o + 3] = luz / 3 // em EV de L (L é a raiz cúbica da luz)
    t[o + 4] = pb / 3
    t[o + 5] = pele
  }
  return t
}

// ─────────── uniformes ───────────

/**
 * Os números e as tabelas da cadeia, para a GPU e para `criarPonto`.
 * `contexto`: { branco: { kelvin, tinta } (o branco da base), brancoAuto?: { kelvin, tinta }, exposicaoBase? }.
 *
 * Devolve:
 *   passos        quais blocos rodam (o resto é identidade e fica de fora)
 *   entrada       mat3: 2^(exposição + exposição base) · matriz de branco
 *   tom           { tabela: Float32Array, evMin, evMax, passosPorEv }  ganho por EV da norma
 *   canais        [tabela R, tabela G, tabela B] ou null
 *   calibracao    mat3
 *   cor           { paraLms, deLms, lmsParaLab, labParaLms, matiz: { tabela, tamanho, colunas }, sombrasTinta,
 *                   saturacao, vibracao, vibracaoRef, cromaRef, protecaoPele, pb, tonalizacao }
 *   veu           número somado aos três canais
 *   norma         { pesos: [r, g, b], maximo }   n = pesos·v + maximo·max(v)
 *   eps, cinza
 */
export function uniformes(ajustes, contexto = {}) {
  // qualquer objeto de ajustes serve: campo ausente ou fora da faixa vira o neutro (ajustes.js)
  const a = normalizar(ajustes)
  const ganho = 2 ** (a.luz.exposicao + (contexto.exposicaoBase ?? 0))
  let alvo = null
  if (a.branco.modo === 'manual') alvo = { kelvin: a.branco.temperatura, tinta: a.branco.tinta }
  else if (a.branco.modo === 'auto') alvo = contexto.brancoAuto ?? null
  const branco = alvo && contexto.branco ? matrizDeBranco(contexto.branco, alvo) : identidade()
  const entrada = branco.map((v) => v * ganho)

  // tom: luz → paramétrica → pontos, numa função de EV só
  const luzMexida = ['contraste', 'altas', 'sombras', 'brancos', 'pretos'].some((k) => a.luz[k] !== 0)
  const parametrica = criarParametrica(a.curva)
  const pontosLuz = eReta(a.curva.pontos.luz) ? null : criarCurvaDePontos(a.curva.pontos.luz)
  const temTom = luzMexida || !!parametrica || !!pontosLuz
  let tabelaTom = null
  if (temTom) {
    const luz = curvaDeLuz(a.luz)
    const codigo = parametrica || pontosLuz ? curvaNaCena((x) => (pontosLuz ? pontosLuz(parametrica ? parametrica(x) : x) : parametrica(x))) : null
    tabelaTom = tabelaDeGanho(codigo ? (e) => codigo(luz(e)) : luz)
  }
  const canais = ['r', 'g', 'b'].map((c) => (eReta(a.curva.pontos[c]) ? null : tabelaDeGanho(curvaNaCena(criarCurvaDePontos(a.curva.pontos[c])))))
  const temCanais = canais.some(Boolean)
  if (temCanais) for (let c = 0; c < 3; c++) canais[c] ??= tabelaDeGanho((e) => e)

  const calibracao = matrizDeCalibracao(a.calibracao)
  const temCalibracao = calibracao.some((v, i) => v !== (i % 4 === 0 ? 1 : 0))

  const mis = a.misturador
  const temMisturador = mis.matiz.some((v) => v !== 0) || mis.saturacao.some((v) => v !== 0) || mis.luz.some((v) => v !== 0)
  const ton = a.tonalizacao
  const zonas = ['sombras', 'meios', 'altas', 'global'].map((z) => {
    const h = matizDoCirculo(ton[z].matiz)
    const c = (ton[z].saturacao / 100) * COR.tonalizacao.croma
    return { a: c * Math.cos(h), b: c * Math.sin(h), luz: ((ton[z].luz / 100) * COR.tonalizacao.luzEv) / 3 }
  })
  const temTonalizacao = zonas.some((z) => z.a !== 0 || z.b !== 0 || z.luz !== 0)
  const sombrasTinta = (a.calibracao.sombrasTinta / 100) * CALIBRACAO.tinta
  const pb = a.pb.ativo
  const temCor = temMisturador || temTonalizacao || pb || sombrasTinta !== 0 || a.cor.vibracao !== 0 || a.cor.saturacao !== 0
  const oklab = criarOklab('rec2020')
  const Y = luminancia('rec2020')
  const veu = (a.efeitos.desbotar / 100) * VEU

  return {
    passos: {
      tom: temTom,
      canais: temCanais,
      calibracao: temCalibracao,
      cor: temCor,
      misturador: temMisturador || pb,
      tonalizacao: temTonalizacao,
      pb,
      veu: veu !== 0,
    },
    entrada,
    tom: { tabela: tabelaTom, evMin: EV_MIN, evMax: EV_MAX, passosPorEv: PASSOS_POR_EV },
    canais: temCanais ? canais : null,
    calibracao,
    cor: {
      paraLms: oklab.paraLms,
      deLms: oklab.deLms,
      lmsParaLab: LMS_PARA_LAB,
      labParaLms: LAB_PARA_LMS,
      matiz: { tabela: temMisturador || pb || a.cor.vibracao !== 0 ? tabelaDeMatiz(a) : null, tamanho: TAM_MATIZ, colunas: COLUNAS_MATIZ },
      sombrasTinta,
      saturacao: 1 + a.cor.saturacao / 100,
      vibracao: a.cor.vibracao / 100,
      vibracaoRef: COR.vibracaoRef,
      cromaRef: COR.cromaRef,
      protecaoPele: COR.pele.protecao,
      pb,
      tonalizacao: {
        zonas,
        // pivô em L: o cinza médio, deslocado pelo equilíbrio (positivo = mais da foto conta como alta luz)
        pivo: L_CINZA * 2 ** ((-(ton.equilibrio / 100) * COR.tonalizacao.equilibrioEv) / 3),
        largura: COR.tonalizacao.largura,
        mistura: ton.mistura / 100,
      },
    },
    veu,
    norma: { pesos: [Y[0] * (1 - PESO_MAXIMO), Y[1] * (1 - PESO_MAXIMO), Y[2] * (1 - PESO_MAXIMO)], maximo: PESO_MAXIMO },
    eps: EPS,
    cinza: CINZA,
  }
}

// ─────────── a conta ───────────

/**
 * A cadeia pronta. `aplicar(r, g, b, saida)` escreve o pixel tratado em `saida[0..2]`; `aplicarEm(dados, pixels,
 * inicio)` trata um bloco no lugar (Float32Array, 3 por pixel). `uniformes` é o que foi usado.
 */
export function criarPonto(ajustes, contexto = {}) {
  const u = uniformes(ajustes, contexto)
  const P = u.passos
  const [e0, e1, e2, e3, e4, e5, e6, e7, e8] = u.entrada
  const [w0, w1, w2] = u.norma.pesos
  const beta = u.norma.maximo
  const tom = u.tom.tabela
  const canais = u.canais
  const [c0, c1, c2, c3, c4, c5, c6, c7, c8] = u.calibracao
  const [p0, p1, p2, p3, p4, p5, p6, p7, p8] = u.cor.paraLms
  const [d0, d1, d2, d3, d4, d5, d6, d7, d8] = u.cor.deLms
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = u.cor.lmsParaLab
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = u.cor.labParaLms
  const matiz = u.cor.matiz.tabela
  const { sombrasTinta, saturacao, vibracao, pb } = u.cor
  const iVib2 = 1 / (u.cor.vibracaoRef * u.cor.vibracaoRef)
  const croma2 = u.cor.cromaRef * u.cor.cromaRef
  const pele = u.cor.protecaoPele
  const T = u.cor.tonalizacao
  const [zs, zm, za, zg] = T.zonas
  const temLuzZona = T.zonas.some((z) => z.luz !== 0)
  const tPivo = T.pivo
  const tSombra0 = T.pivo - T.largura
  const tSombraInv = 1 / (T.mistura * T.largura + T.largura)
  const tAlta0 = T.pivo - T.mistura * T.largura
  const tAltaInv = 1 / (T.mistura * T.largura + T.largura)
  const tMeioInv = 1 / T.largura
  const veu = u.veu
  const iCinza = 1 / CINZA
  const maxIndice = TAM_TOM - 1

  // ganho da tabela para um valor de cena já limitado em EPS (log2 de cor/rapido.js embutido)
  const ganhoDe = (tabela, valor) => {
    f32[0] = valor * iCinza
    const bits = i32[0]
    const mant = bits & 0x7fffff
    const il = mant >>> 13
    let pos = ((bits >>> 23) - 127 + LOG[il] + (LOG[il + 1] - LOG[il]) * ((mant & 0x1fff) * (1 / 8192)) - EV_MIN) * PASSOS_POR_EV
    if (pos < 0) pos = 0
    else if (pos > maxIndice) pos = maxIndice
    const i = pos | 0
    return tabela[i] + (tabela[i + 1] - tabela[i]) * (pos - i)
  }

  // O pixel em `d[i..i+2]`, tratado no lugar. É a única cópia da conta: `aplicar` e `aplicarEm` passam por aqui.
  function nucleo(d, i) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    // 1. entrada: exposição e branco
    let x = e0 * r + e1 * g + e2 * b
    let y = e3 * r + e4 * g + e5 * b
    let z = e6 * r + e7 * g + e8 * b

    // 2. tom: ganho pela norma. Abaixo de EPS o pixel sobe até a norma EPS antes do ganho (soma, não razão: ruído
    //    negativo não tem razão entre canais para preservar).
    if (P.tom) {
      const mx = x > y ? (x > z ? x : z) : y > z ? y : z
      const n = w0 * x + w1 * y + w2 * z + beta * mx
      const sobe = n < EPS ? EPS - n : 0
      const k = ganhoDe(tom, n < EPS ? EPS : n)
      x = k * (x + sobe)
      y = k * (y + sobe)
      z = k * (z + sobe)
    }

    // 3. curva de pontos por canal
    if (P.canais) {
      if (x < EPS) x = EPS
      if (y < EPS) y = EPS
      if (z < EPS) z = EPS
      x *= ganhoDe(canais[0], x)
      y *= ganhoDe(canais[1], y)
      z *= ganhoDe(canais[2], z)
    }

    // 4. calibração de primárias
    if (P.calibracao) {
      const cx = c0 * x + c1 * y + c2 * z
      const cy = c3 * x + c4 * y + c5 * z
      z = c6 * x + c7 * y + c8 * z
      x = cx
      y = cy
    }

    // 5. cor, em Oklab
    if (P.cor) {
      const l = Math.cbrt(p0 * x + p1 * y + p2 * z)
      const m = Math.cbrt(p3 * x + p4 * y + p5 * z)
      const s = Math.cbrt(p6 * x + p7 * y + p8 * z)
      let L = a0 * l + a1 * m + a2 * s
      let A = a3 * l + a4 * m + a5 * s
      let B = a6 * l + a7 * m + a8 * s
      const Lp = L > 1e-9 ? L : 1e-9

      // 5a. tinta das sombras: A += tinta·L·(1 − suave(0,15; 0,5; L))
      if (sombrasTinta !== 0) A += sombrasTinta * Lp * (1 - suave(0.15, 0.5, L))

      let croma = saturacao
      if (matiz) {
        // 5b. tabela de matiz pelo ângulo de losango: [cos Δ, sen Δ, saturação, luz, P&B, pele]
        const aa = A < 0 ? -A : A
        const ab = B < 0 ? -B : B
        const dsoma = aa + ab
        const t = dsoma > 1e-30 ? B / dsoma : 0
        const pos = (A >= 0 ? (B >= 0 ? t : 4 + t) : 2 - t) * (TAM_MATIZ / 4)
        let casa = pos | 0
        if (casa >= TAM_MATIZ) casa = TAM_MATIZ - 1
        const f = pos - casa
        const o = casa * COLUNAS_MATIZ
        const q = o + COLUNAS_MATIZ
        // quanto a cor é cor: m = x²/(x² + ref²), com x = C/L. Zero no cinza: luz por faixa e P&B não mexem nele.
        const x2 = (A * A + B * B) / (Lp * Lp)
        const peso = x2 / (x2 + croma2)
        if (P.misturador) {
          const cs = matiz[o] + (matiz[q] - matiz[o]) * f
          const sn = matiz[o + 1] + (matiz[q + 1] - matiz[o + 1]) * f
          const na = A * cs - B * sn
          B = A * sn + B * cs
          A = na
          croma *= matiz[o + 2] + (matiz[q + 2] - matiz[o + 2]) * f
          // luz por faixa (e a mistura do P&B): L·2^(ev·m)
          let ev = matiz[o + 3] + (matiz[q + 3] - matiz[o + 3]) * f
          if (pb) ev += matiz[o + 4] + (matiz[q + 4] - matiz[o + 4]) * f
          if (ev !== 0) L *= exp2(ev * peso)
        }
        // 5c. vibração: ganho = 1 + v·(1/(1 + x²/ref²))·(1 − proteção·pele)
        if (vibracao !== 0) croma *= 1 + (vibracao * (1 - pele * (matiz[o + 5] + (matiz[q + 5] - matiz[o + 5]) * f))) / (1 + x2 * iVib2)
      }
      // 5d. saturação (e o que o misturador e a vibração somaram): escala a croma; P&B zera
      if (pb) {
        A = 0
        B = 0
      } else {
        A *= croma
        B *= croma
      }

      // 5e. tonalização: desloca a e b na proporção de L e mexe na luz, por zona
      if (P.tonalizacao) {
        // ws = 1 − suave(pivô − largura; pivô + mistura·largura; L);  wh = suave(pivô − mistura·largura; pivô + largura; L)
        // wm = 1 − suave(0; largura; |L − pivô|)        (suave = smoothstep, escrito por extenso: é o laço quente)
        let t = (L - tSombra0) * tSombraInv
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const ws = 1 - t * t * (3 - 2 * t)
        t = (L - tAlta0) * tAltaInv
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const wh = t * t * (3 - 2 * t)
        t = (L > tPivo ? L - tPivo : tPivo - L) * tMeioInv
        t = t > 1 ? 1 : t
        const wm = 1 - t * t * (3 - 2 * t)
        const base = L > 0 ? L : 0
        A += base * (ws * zs.a + wm * zm.a + wh * za.a + zg.a)
        B += base * (ws * zs.b + wm * zm.b + wh * za.b + zg.b)
        if (temLuzZona) L *= exp2(ws * zs.luz + wm * zm.luz + wh * za.luz + zg.luz)
      }

      const l2 = b0 * L + b1 * A + b2 * B
      const m2 = b3 * L + b4 * A + b5 * B
      const s2 = b6 * L + b7 * A + b8 * B
      const l3 = l2 * l2 * l2
      const m3 = m2 * m2 * m2
      const s3 = s2 * s2 * s2
      x = d0 * l3 + d1 * m3 + d2 * s3
      y = d3 * l3 + d4 * m3 + d5 * s3
      z = d6 * l3 + d7 * m3 + d8 * s3
      if (pb && !P.tonalizacao) {
        // preto e branco sem tonalização: os três canais iguais, exatos
        x = y = z = L * L * L
      }
    }

    // 6. desbotar
    if (P.veu) {
      x += veu
      y += veu
      z += veu
    }
    d[i] = x
    d[i + 1] = y
    d[i + 2] = z
  }

  const um = new Float64Array(3)
  function aplicar(r, g, b, saida) {
    um[0] = r
    um[1] = g
    um[2] = b
    nucleo(um, 0)
    saida[0] = um[0]
    saida[1] = um[1]
    saida[2] = um[2]
    return saida
  }

  const soEntrada = !Object.values(P).some(Boolean)
  const semNada = soEntrada && u.entrada.every((v, i) => v === (i % 4 === 0 ? 1 : 0))

  function aplicarEm(dados, pixels, inicio = 0) {
    const fim = inicio + pixels * 3
    if (semNada) return dados
    if (soEntrada) {
      // só exposição e branco: a matriz, num laço curto
      for (let i = inicio; i < fim; i += 3) {
        const r = dados[i]
        const g = dados[i + 1]
        const b = dados[i + 2]
        dados[i] = e0 * r + e1 * g + e2 * b
        dados[i + 1] = e3 * r + e4 * g + e5 * b
        dados[i + 2] = e6 * r + e7 * g + e8 * b
      }
      return dados
    }
    for (let i = inicio; i < fim; i += 3) nucleo(dados, i)
    return dados
  }

  return { aplicar, aplicarEm, uniformes: u, neutro: semNada }
}
