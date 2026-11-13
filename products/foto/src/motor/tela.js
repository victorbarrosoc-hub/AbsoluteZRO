// A tela do motor Latitude: deita a luz da cena (linear, sem teto, cinza médio = 0,18) no que o monitor mostra.
//
//   cena Rec.2020 → mapa de tons (sigmoide log-logística) → preservação de matiz → ida ao branco perto do pico →
//   gamut da tela (compressão de croma em Oklab) → curva da tela (sRGB, Adobe, BT.2020)
//
// O que este mapa de tons tem de próprio são as MARGENS: quantos EV acima e abaixo do cinza cabem na imagem. Em
// 'auto' elas saem da medida do arquivo (src/raw/latitude.js): o branco da tela fica onde o sensor satura (mais o que
// a reconstrução de altas luzes recuperou) e acompanha a exposição — puxar a exposição para baixo não deixa céu
// estourado cinza, puxar para cima não corta o que o arquivo ainda tem. O preto fica no piso de ruído quando ele está
// perto. O cinza médio nunca sai do lugar.
//
// A curva (em x = cena / 0,18, saída em luz linear da tela):
//
//   L(x) = x^c / (x^c + k)                 log-logística (Naka e Rushton, 1966; a forma das curvas de filme em log)
//   f(x) = a · (L(x) − L(B))               0 em x ≤ B, 1 em x ≥ W
//
// com B = 2^−margemSombras, W = 2^margemAltas e a = 1 / (L(W) − L(B)). As duas constantes livres, c e k, saem de duas
// condições: f(1) = 0,18 (o cinza preso) e a inclinação em log-log no cinza igual à pedida (o contraste da tela).
// Da primeira, k tem forma fechada para cada c:  G = 0,18·(W^c − B^c)/(1 − B^c),  k = (W^c − G)/(G − 1).
// A segunda dá c por bisseção. A inversa é exata:  L = y/a + L(B),  x = (k·L/(1 − L))^(1/c).
//
// Margem curta pede inclinação alta (com o branco a 2 EV do cinza não existe curva de inclinação 1 que passe pelos
// dois pontos): nesse caso a inclinação efetiva sobe até a menor possível e `curva.inclinacao` diz quanto ficou.

import { ESPACOS, curvaDe, luminancia, matrizEntre } from './cor/espacos.js'
import { inversa, mulM } from './cor/matriz.js'
import { LAB_PARA_LMS, criarOklab } from './cor/oklab.js'
import { EXP, LOG, POT, POT_MIN, exp2, f32, i32, log2 } from './cor/rapido.js'

/** Cinza médio: 0,18 na cena vira 0,18 de luz na tela (código 118 de 255 em sRGB). */
export const CINZA = 0.18

// Inclinação da curva no cinza (em log-log) com `tela.contraste` em 0. É escolha de aparência: 1,4 é o contraste de
// meio-tom de uma revelação fotográfica comum (o filme de cópia fica perto de 1,5; o retrato sem tratamento, de 1,3).
// O controle vai de 1,4/√2 a 1,4·√2.
export const INCLINACAO = 1.4
const inclinacaoDe = (contraste) => INCLINACAO * 2 ** ((0.5 * contraste) / 100)

// Margens, em EV. Padrão das altas (foto sem medida): log2(1/0,18) = 2,47 EV até a saturação de um sensor exposto
// pela norma ISO, mais 1 EV de folga de reconstrução. Piso e teto valem só para o 'auto'; o número manual vai de 0,5
// a 16 (ajustes.js). Abaixo de 5 EV de sombra o preto já come meio-tom; acima de 12 a curva não muda mais.
export const MARGENS = {
  altas: { padrao: 3.5, piso: 2, teto: 10 },
  sombras: { padrao: 8, piso: 5, teto: 12 },
}

// A norma que mede a "luz" de uma cor para o mapa de tons: 75% da luminância e 25% do maior canal. A luminância pura
// deixa azul e vermelho saturados passarem do branco da tela (o azul pesa 6%); o maior canal puro escurece o céu.
// A mistura é homogênea e acompanha deslocamento — N(s·v + d) = s·N(v) + d para s ≥ 0 — e é isso que dá inversa
// fechada à tela inteira.
export const PESO_MAXIMO = 0.25

// Ida ao branco: perto do pico a cor perde croma, como no filme e no olho. k(h) = 0,6 · suave(0,6; 1; h)², com h a
// luz da tela (0..1). Escolha de aparência.
const BRANCO_K = 0.6
const BRANCO_H0 = 0.6

// Abaixo disto a norma é tratada como este valor (ruído negativo e preto absoluto não têm razão entre canais).
export const EPS = CINZA * 2 ** -20

const TOL_GAMUT = 1e-6
const PASSOS_GAMUT = 14

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * A curva de tons para uma inclinação e duas margens (em EV). Devolve `ida(cena) → luz da tela 0..1`,
 * `volta(luz) → cena`, e os números que a GPU usa (c, k, a, lb, preto, branco, em cena/0,18).
 */
export function curvaDeTons({ inclinacao = INCLINACAO, altas = MARGENS.altas.padrao, sombras = MARGENS.sombras.padrao } = {}) {
  const g = CINZA
  const W = 2 ** altas
  const B = 2 ** -sombras
  const kDe = (c) => {
    const uW = W ** c
    const uB = B ** c
    const G = (g * (uW - uB)) / (1 - uB)
    return (uW - G) / (G - 1)
  }
  const pDe = (c) => {
    const uB = B ** c
    const k = kDe(c)
    return (c * (uB + k)) / ((1 + k) * (1 - uB))
  }
  // c mínimo: abaixo dele não existe k positivo e finito. Com margem de altas curta o limite é G > 1 (a reta de
  // potência entre o preto e o branco já passa acima do cinza); com margem de sombras curta é W^c > G (idem, abaixo).
  // Perto de c = 0 só uma das duas falha, conforme o sinal de 0,18·altas − 0,82·sombras.
  const limite =
    g * altas < (1 - g) * sombras
      ? (c) => g * W ** c + (1 - g) * B ** c - 1
      : (c) => {
          const uB = B ** c
          return W ** c * (1 - g - uB) + g * uB
        }
  let cMin
  {
    let a = 1e-9
    let b = 0.25
    while (limite(b) <= 0) b *= 2
    for (let i = 0; i < 100; i++) {
      const m = (a + b) / 2
      if (limite(m) <= 0) a = m
      else b = m
    }
    cMin = b
  }
  // a inclinação no cinza em função de c: procura o menor valor possível e resolve no ramo que cresce
  let cBase = cMin * (1 + 1e-7)
  let pBase = pDe(cBase)
  for (let i = 1; i <= 200; i++) {
    const c = cMin + (i / 200) * (cMin + 4)
    const p = pDe(c)
    if (p < pBase) {
      pBase = p
      cBase = c
    }
  }
  let c = cBase
  if (inclinacao > pBase) {
    let a = cBase
    let b = cBase + 1
    while (pDe(b) < inclinacao) b = cBase + (b - cBase) * 2
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2
      if (pDe(m) < inclinacao) a = m
      else b = m
    }
    c = (a + b) / 2
  }
  const k = Math.min(Math.max(kDe(c), 1e-12), 1e12)
  const L = (x) => {
    const u = x ** c
    return u / (u + k)
  }
  const lb = L(B)
  const a = 1 / (L(W) - lb)
  const ic = 1 / c
  return {
    c,
    k,
    a,
    lb,
    preto: B,
    branco: W,
    altas,
    sombras,
    inclinacao: pDe(c),
    ida(n) {
      const x = n / g
      if (!(x > B)) return 0
      if (x >= W) return 1
      const u = x ** c
      const y = a * (u / (u + k) - lb)
      return y < 0 ? 0 : y > 1 ? 1 : y
    },
    volta(y) {
      if (!(y > 0)) return B * g
      if (y >= 1) return W * g
      const l = y / a + lb
      return g * ((k * l) / (1 - l)) ** ic
    },
  }
}

/**
 * As margens que valem para estes ajustes e esta base, em EV. Em 'auto': o que o arquivo tem (Latitude), mais o que a
 * reconstrução de altas luzes recuperou (`base.folgaAltas`), acompanhando a exposição; sem medida, o padrão.
 * `origem` diz de onde veio cada número, para a tela mostrar.
 */
export function margens(ajustes, base = null) {
  const ev = ajustes?.luz?.exposicao ?? 0
  const t = ajustes?.tela ?? {}
  const medida = base?.latitude?.margem
  const saida = { altas: 0, sombras: 0, origem: { altas: 'manual', sombras: 'manual' } }
  if (typeof t.margemAltas === 'number') saida.altas = t.margemAltas
  else {
    let doArquivo = null
    if (Number.isFinite(medida?.acimaDoCinza)) doArquivo = medida.acimaDoCinza
    else if (base?.origem === 'raw') doArquivo = Math.log2(1 / CINZA) + (base.exposicaoBase ?? 0)
    saida.origem.altas = doArquivo == null ? 'padrao' : 'arquivo'
    const partida = doArquivo == null ? MARGENS.altas.padrao : doArquivo + (base.folgaAltas ?? 0)
    saida.altas = limitar(partida + ev, MARGENS.altas.piso, MARGENS.altas.teto)
  }
  if (typeof t.margemSombras === 'number') saida.sombras = t.margemSombras
  else {
    const doArquivo = Number.isFinite(medida?.abaixoDoCinza) ? medida.abaixoDoCinza : null
    saida.origem.sombras = doArquivo == null ? 'padrao' : 'arquivo'
    saida.sombras = limitar((doArquivo ?? MARGENS.sombras.padrao) - ev, MARGENS.sombras.piso, MARGENS.sombras.teto)
  }
  return saida
}

// Tabela da curva da tela (linear → código), para não pagar três potências por pixel. É indexada pela RAIZ do valor
// linear: nessa escala as curvas são quase retas (a gama 2,2 vira s^0,91; o trecho reto do sRGB, uma parábola), e
// 4096 trechos dão erro máximo perto de 2e-6 (na emenda do sRGB) — menos de um sétimo de um passo de 16 bits.
const TAM_TABELA = 4096
const tabelas = new Map()
function tabelaDe(nomeCurva, curva) {
  if (!tabelas.has(nomeCurva)) {
    const t = new Float32Array(TAM_TABELA + 2)
    for (let i = 0; i <= TAM_TABELA; i++) t[i] = curva.codificar((i / TAM_TABELA) ** 2)
    t[TAM_TABELA + 1] = t[TAM_TABELA]
    tabelas.set(nomeCurva, t)
  }
  return tabelas.get(nomeCurva)
}

/**
 * A tela pronta para um espaço de saída. `opcoes`: `contraste` (−100..100), `preservarMatiz` (0..100), `altas` e
 * `sombras` (margens em EV, já resolvidas — ver `margens`).
 *
 * `aplicar(r, g, b, saida)`: cena Rec.2020 → código da tela 0..1. `inverter(r, g, b, saida)`: o caminho de volta, exato
 * (é por onde JPEG, PNG e TIFF entram no motor). `aplicarEm(origem, destino, pixels)` faz um bloco inteiro.
 * `uniformes` são os números que a GPU recebe.
 *
 * Passos de `aplicar`, na ordem (cada um tem tradução direta para GLSL):
 *   1. n = 0,75·Y(v) + 0,25·max(v);  nc = max(n, EPS);  h = f(nc)                     norma e mapa de tons
 *   2. o = v·(h/nc) + (h − n·h/nc)                                                    escala (N(o) = h)
 *   3. o = h + (o − h)·(1 − k(h))                                                     ida ao branco (N(o) = h)
 *   4. o = mistura(f(v) canal a canal, o, preservarMatiz)                             só se preservarMatiz < 100
 *   5. t = M·o;  fora de 0..1: reduz a croma em Oklab (L e matiz fixos) até caber     gamut da tela
 *   6. código = curva(limitar(t, 0, 1))
 */
export function criarTela(id = 'srgb', opcoes = {}) {
  const espaco = ESPACOS[id]
  if (!espaco) throw new Error(`Tela desconhecida: ${id}`)
  const contraste = opcoes.contraste ?? 0
  const preservar = limitar((opcoes.preservarMatiz ?? 100) / 100, 0, 1)
  const curva = curvaDeTons({
    inclinacao: inclinacaoDe(contraste),
    altas: opcoes.altas ?? MARGENS.altas.padrao,
    sombras: opcoes.sombras ?? MARGENS.sombras.padrao,
  })
  const { c, k, a, lb } = curva
  const xB = curva.preto
  const xW = curva.branco
  const M = matrizEntre('rec2020', id)
  const Mi = inversa(M)
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = M
  const Y = luminancia('rec2020')
  const beta = PESO_MAXIMO
  const w0 = Y[0] * (1 - beta)
  const w1 = Y[1] * (1 - beta)
  const w2 = Y[2] * (1 - beta)
  const oklab = criarOklab('rec2020')
  const lmsParaTela = mulM(M, oklab.deLms)
  const transferencia = curvaDe(id)
  const tabela = tabelaDe(espaco.curva, transferencia)
  const lab = [0, 0, 0]
  const ig = 1 / CINZA

  // a curva de tons no laço: x^c por tabela (cor/rapido.js); `curva.ida` é a mesma conta com Math.pow
  const f = (n) => {
    const x = n * ig
    if (!(x > xB)) return 0
    if (x >= xW) return 1
    const u = exp2(c * log2(x))
    const y = a * (u / (u + k) - lb)
    return y < 0 ? 0 : y > 1 ? 1 : y
  }
  const paraOBranco = (h) => {
    if (h <= BRANCO_H0) return 0
    const t = h >= 1 ? 1 : (h - BRANCO_H0) / (1 - BRANCO_H0)
    const s = t * t * (3 - 2 * t)
    return BRANCO_K * s * s
  }
  // Cor que não cabe na tela: mesma luz (L de Oklab) e mesmo matiz, croma reduzida até a borda do cubo. Bisseção de
  // passos fixos, igual na GPU. Cor de dentro nem chega aqui.
  function comprimir(or, og, ob, saida) {
    oklab.paraOklab(or, og, ob, lab)
    const L = limitar(lab[0], 0, 1)
    let lo = 0
    let hi = 1
    const q = lmsParaTela
    const B0 = LAB_PARA_LMS
    let tr = L * L * L
    let tg = tr
    let tb = tr
    for (let i = 0; i < PASSOS_GAMUT; i++) {
      const s = (lo + hi) / 2
      const A = lab[1] * s
      const Bb = lab[2] * s
      const l = B0[0] * L + B0[1] * A + B0[2] * Bb
      const m = B0[3] * L + B0[4] * A + B0[5] * Bb
      const z = B0[6] * L + B0[7] * A + B0[8] * Bb
      const lc = l * l * l
      const mc = m * m * m
      const zc = z * z * z
      const r = q[0] * lc + q[1] * mc + q[2] * zc
      const g = q[3] * lc + q[4] * mc + q[5] * zc
      const b = q[6] * lc + q[7] * mc + q[8] * zc
      if (r >= -TOL_GAMUT && g >= -TOL_GAMUT && b >= -TOL_GAMUT && r <= 1 + TOL_GAMUT && g <= 1 + TOL_GAMUT && b <= 1 + TOL_GAMUT) {
        lo = s
        tr = r
        tg = g
        tb = b
      } else hi = s
    }
    saida[0] = tr
    saida[1] = tg
    saida[2] = tb
  }

  const temp = [0, 0, 0]

  // O pixel de cena em `o[i..i+2]` vira código da tela em `d[j..j+2]`. É a única cópia da conta.
  function nucleo(o, i, d, j) {
    const r = o[i]
    const g = o[i + 1]
    const b = o[i + 2]
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b
    const n = w0 * r + w1 * g + w2 * b + beta * mx
    const nc = n > EPS ? n : EPS
    // h = f(nc), com log2 e 2^x de cor/rapido.js embutidos (é a conta mais cara do pixel)
    let h = 0
    const x = nc * ig
    if (x >= xW) h = 1
    else if (x > xB) {
      f32[0] = x
      const bits = i32[0]
      const mant = bits & 0x7fffff
      const il = mant >>> 13
      const e = c * ((bits >>> 23) - 127 + LOG[il] + (LOG[il + 1] - LOG[il]) * ((mant & 0x1fff) * (1 / 8192)))
      const ke = Math.floor(e)
      const pe = (e - ke) * 1024
      const ie = pe | 0
      const u = POT[ke - POT_MIN] * (EXP[ie] + (EXP[ie + 1] - EXP[ie]) * (pe - ie))
      h = a * (u / (u + k) - lb)
      if (h < 0) h = 0
      else if (h > 1) h = 1
    }
    const s = h / nc
    const desloca = h - s * n
    let kb = 1
    if (h > BRANCO_H0) {
      const t = h >= 1 ? 1 : (h - BRANCO_H0) / (1 - BRANCO_H0)
      const st = t * t * (3 - 2 * t)
      kb = 1 - BRANCO_K * st * st
    }
    let or = h + (s * r + desloca - h) * kb
    let og = h + (s * g + desloca - h) * kb
    let ob = h + (s * b + desloca - h) * kb
    if (preservar < 1) {
      const pr = f(r)
      const pg = f(g)
      const pb = f(b)
      or = pr + (or - pr) * preservar
      og = pg + (og - pg) * preservar
      ob = pb + (ob - pb) * preservar
    }
    let tr = m0 * or + m1 * og + m2 * ob
    let tg = m3 * or + m4 * og + m5 * ob
    let tb = m6 * or + m7 * og + m8 * ob
    if (tr < -TOL_GAMUT || tg < -TOL_GAMUT || tb < -TOL_GAMUT || tr > 1 + TOL_GAMUT || tg > 1 + TOL_GAMUT || tb > 1 + TOL_GAMUT) {
      comprimir(or, og, ob, temp)
      tr = temp[0]
      tg = temp[1]
      tb = temp[2]
    }
    let p = (tr <= 0 ? 0 : tr >= 1 ? 1 : Math.sqrt(tr)) * TAM_TABELA
    let q = p | 0
    d[j] = tabela[q] + (tabela[q + 1] - tabela[q]) * (p - q)
    p = (tg <= 0 ? 0 : tg >= 1 ? 1 : Math.sqrt(tg)) * TAM_TABELA
    q = p | 0
    d[j + 1] = tabela[q] + (tabela[q + 1] - tabela[q]) * (p - q)
    p = (tb <= 0 ? 0 : tb >= 1 ? 1 : Math.sqrt(tb)) * TAM_TABELA
    q = p | 0
    d[j + 2] = tabela[q] + (tabela[q + 1] - tabela[q]) * (p - q)
  }

  const um = new Float64Array(3)
  function aplicar(r, g, b, saida) {
    um[0] = r
    um[1] = g
    um[2] = b
    nucleo(um, 0, um, 0)
    saida[0] = um[0]
    saida[1] = um[1]
    saida[2] = um[2]
    return saida
  }

  /** Bloco: `pixels` cores de `origem` (cena, 3 por pixel) viram código da tela em `destino` (pode ser o mesmo). */
  function aplicarEm(origem, destino, pixels, deOnde = 0, paraOnde = 0) {
    const fim = deOnde + pixels * 3
    for (let i = deOnde, j = paraOnde; i < fim; i += 3, j += 3) nucleo(origem, i, destino, j)
    return destino
  }

  // a volta da curva de tons no laço (2^x e log2 por tabela, erro relativo < 1e-6); `curva.volta` é a conta com Math.pow
  const ic = 1 / c
  const voltaRapida = (y) => {
    if (!(y > 0)) return xB * CINZA
    if (y >= 1) return xW * CINZA
    const l = y / a + lb
    return CINZA * exp2(ic * log2((k * l) / (1 - l)))
  }

  /**
   * Luz linear da tela (0..1, no espaço da tela) → cena Rec.2020. É a volta sem a curva de transferência, para quem
   * já decodificou o código (uma tabela de 256 ou 65536 entradas resolve a foto inteira).
   */
  function inverterLinear(tr, tg, tb, saida) {
    const or = Mi[0] * tr + Mi[1] * tg + Mi[2] * tb
    const og = Mi[3] * tr + Mi[4] * tg + Mi[5] * tb
    const ob = Mi[6] * tr + Mi[7] * tg + Mi[8] * tb
    if (preservar === 0) {
      saida[0] = voltaRapida(or)
      saida[1] = voltaRapida(og)
      saida[2] = voltaRapida(ob)
      return saida
    }
    if (preservar < 1) throw new Error('A volta da tela só existe com preservarMatiz em 100 ou em 0')
    const mx = or > og ? (or > ob ? or : ob) : og > ob ? og : ob
    const h = w0 * or + w1 * og + w2 * ob + beta * mx
    const n = voltaRapida(h)
    if (!(h > 1e-12)) {
      saida[0] = saida[1] = saida[2] = n
      return saida
    }
    // desfaz a ida ao branco (a norma não mudou: é ela que diz quanto foi) e depois a escala
    const kb = 1 - paraOBranco(h)
    const e = n / h
    saida[0] = (h + (or - h) / kb) * e
    saida[1] = (h + (og - h) / kb) * e
    saida[2] = (h + (ob - h) / kb) * e
    return saida
  }

  /**
   * Código da tela (0..1) → cena Rec.2020. Exata para `preservarMatiz` 100 (o padrão) e 0; no meio do caminho a
   * mistura não tem inversa fechada e a função lança.
   */
  function inverter(cr, cg, cb, saida) {
    return inverterLinear(
      transferencia.decodificar(limitar(cr, 0, 1)),
      transferencia.decodificar(limitar(cg, 0, 1)),
      transferencia.decodificar(limitar(cb, 0, 1)),
      saida,
    )
  }

  return {
    id,
    espaco,
    curva,
    aplicar,
    aplicarEm,
    inverter,
    inverterLinear,
    /** Curva de transferência da tela: { codificar, decodificar }. */
    transferencia,
    /** f da curva de tons sobre um valor de cena (para desenhar a curva e a margem na tela). */
    tom: f,
    uniformes: {
      espaco: id,
      transferencia: espaco.curva,
      matrizTela: M,
      paraLms: oklab.paraLms,
      lmsParaTela,
      pesosNorma: [w0, w1, w2],
      pesoMaximo: beta,
      eps: EPS,
      cinza: CINZA,
      curva: { c, k, a, lb, preto: xB, branco: xW },
      branco: { k: BRANCO_K, inicio: BRANCO_H0 },
      preservarMatiz: preservar,
      gamut: { tolerancia: TOL_GAMUT, passos: PASSOS_GAMUT },
    },
  }
}

/** A tela para estes ajustes e esta base (resolve as margens em 'auto'). */
export function telaDe(id, ajustes, base = null) {
  const m = margens(ajustes, base)
  return criarTela(id, {
    contraste: ajustes?.tela?.contraste ?? 0,
    preservarMatiz: ajustes?.tela?.preservarMatiz ?? 100,
    altas: m.altas,
    sombras: m.sombras,
  })
}

// Pontilhado: ruído triangular de ±1 passo (soma de dois uniformes), que troca o degrau do arredondamento em 8 bits
// por um ruído sem padrão (Lipshitz, Wannamaker e Vanderkooy, 1992). O ruído sai de um hash do índice da amostra: a
// mesma imagem dá sempre os mesmos bytes.
function hash32(i) {
  let x = (i ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad)
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97)
  return (x ^ (x >>> 15)) >>> 0
}

/**
 * Imagem de tela (0..1) → bytes. `bits` 8: Uint8ClampedArray RGBA (alfa 255), com `pontilhado` opcional.
 * `bits` 16: Uint16Array RGB, sem pontilhado (o passo já é menor que o ruído de qualquer sensor).
 * `deslocamento` (opcional) é o índice do primeiro pixel dentro da foto inteira, para o pontilhado de um bloco ser o
 * mesmo da imagem completa.
 */
export function paraBytes(imagem, { bits = 8, pontilhado = false, deslocamento = 0 } = {}) {
  const { largura, altura, dados } = imagem
  const n = largura * altura
  if (bits === 16) {
    const saida = new Uint16Array(n * 3)
    for (let i = 0; i < n * 3; i++) {
      const v = dados[i]
      saida[i] = v <= 0 ? 0 : v >= 1 ? 65535 : (v * 65535 + 0.5) | 0
    }
    return saida
  }
  if (bits !== 8) throw new Error('paraBytes: bits precisa ser 8 ou 16')
  const saida = new Uint8ClampedArray(n * 4)
  for (let p = 0, i = 0, j = 0; p < n; p++, i += 3, j += 4) {
    if (pontilhado) {
      const base = (deslocamento + p) * 3
      for (let c = 0; c < 3; c++) {
        const h = hash32(base + c)
        const ruido = ((h & 0xffff) + (h >>> 16)) / 65536 - 1
        saida[j + c] = Math.round(dados[i + c] * 255 + ruido)
      }
    } else {
      saida[j] = Math.round(dados[i] * 255)
      saida[j + 1] = Math.round(dados[i + 1] * 255)
      saida[j + 2] = Math.round(dados[i + 2] * 255)
    }
    saida[j + 3] = 255
  }
  return saida
}
