// Revela · cópia de cinema (print film). O negativo vai para a cópia, a cópia vai para a tela: é dela o contraste
// alto, o preto denso, o branco que deita devagar e a cor cheia do cinema. As curvas aqui saem das fichas técnicas
// publicadas pelos fabricantes, não de LUT de terceiros nem de chute:
//   - 2383: KODAK VISION Color Print Film 2383/3383, publicação H-1-2383 (revisão 3-22): curvas sensitométricas
//     (Status A, ECP-2D) e densidade espectral dos corantes;
//   - 2393: KODAK VISION Premier Color Print Film 2393, publicação H-61 (9-98): curvas sensitométricas (o verde,
//     que a ficha desenha quase sobre o vermelho e o azul, é a média dos dois);
//   - 3513: FUJICOLOR ETERNA-CP 3513DI, manual de filmes da Fujifilm (2007), curvas características (Status A).
// Cada curva foi digitalizada do gráfico e ajustada por uma logística assimétrica (Richards): densidade em função do log
// da exposição, suave e sem degrau. O erro médio do ajuste fica entre 0,02 e 0,09 de densidade.
//
// Como entra num motor de cena: a cópia projetada é uma imagem de tela (display-referred). A etapa calcula a tela que
// a cópia daria e volta pela inversa exata da tela Rec.709 (src/cor/cena.js) até a luz da cena. Assim o LMT continua
// log → log e, na tela SDR, o resultado é o da cópia.
//
// Nomes de fabricante só como referência da ficha: a Revela não tem vínculo com a Kodak nem com a Fujifilm.

import { CURVAS, matrizGamut } from './espacos.js'
import { comprimirGamut, criarTela } from './cena.js'

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]

/** Uma curva (Richards): x = log10 da exposição relativo ao ponto de densidade 1,0. */
const curva = (k, x0, nu, dmin, dmax) => ({ k, x0, nu, dmin, dmax })

// Corantes da 2383 (gráfico de densidade espectral, Status A em 445, 545 e 690 nm, cada corante normalizado no próprio
// canal): o ciano absorve um pouco de verde, o magenta um pouco de azul, o amarelo um pouco de verde. Linhas: densidade
// R, G, B; colunas: ciano, magenta, amarelo. A 2393 e a 3513 não publicam esse gráfico; usam o mesmo, que é o típico
// dos corantes de cópia ECP.
const CORANTES_ECP = [
  [1, 0.02, 0],
  [0.11, 1, 0.08],
  [0.04, 0.11, 1],
]

// A cópia real vira o matiz da pele com a exposição (mais vermelha na sombra, dourada na alta luz). O motor tira a maior
// parte dessa deriva (âncora da pele, src/cor/pelicula.js) e deixa um pouco, que é o desenho da película: o controle de
// qualidade cobra este limite declarado (graus Oklab de -2 a +2 stops) em vez dos 7° dos looks sem cópia.
const PELE_MAX = 12

export const COPIAS = [
  {
    id: '2383',
    nome: 'Cópia 2383',
    frases: ['A cópia de cinema mais usada: contraste de projeção, preto denso, altas que deitam devagar.'],
    ficha: 'KODAK VISION Color Print Film 2383, publicação H-1-2383 (2022)',
    curvas: [curva(4.5578, 0.2294, 0.9205, 0.06, 4.12), curva(4.2021, 0.3017, 1.0361, 0.06, 4.12), curva(5.2141, 0.3796, 1.4332, 0.07, 4.12)],
    corantes: CORANTES_ECP,
    peleMax: PELE_MAX,
    cruzamento: 1, // traço preto e nítido na ficha: ajuste com erro de 0,02 a 0,05
  },
  {
    id: '2393',
    nome: 'Cópia 2393',
    frases: ['A cópia premium: preto ainda mais fundo (densidade máxima acima de 5) e cor mais cheia.'],
    ficha: 'KODAK VISION Premier Color Print Film 2393, publicação H-61 (1998)',
    curvas: [curva(4.3989, 0.4143, 1.1562, 0.05, 5.28), curva(4.74, 0.4785, 1.3853, 0.06, 5.34), curva(5.0812, 0.5426, 1.6143, 0.07, 5.4)],
    corantes: CORANTES_ECP,
    peleMax: PELE_MAX,
    cruzamento: 0.5, // curvas quase sobrepostas na ficha (o verde é a média): o cruzamento medido é mais incerto
  },
  {
    id: '3513',
    nome: 'Cópia 3513',
    frases: ['A cópia japonesa feita para o intermediário digital: verde mais frio, contraste firme e branco limpo.'],
    ficha: 'FUJICOLOR ETERNA-CP 3513DI, manual de filmes da Fujifilm (2007)',
    curvas: [curva(6.3275, 0.3553, 1.6621, 0.08, 3.86), curva(5.3021, 0.4594, 1.7374, 0.09, 3.97), curva(8.9448, 0.546, 3.3378, 0.12, 3.93)],
    corantes: CORANTES_ECP,
    peleMax: PELE_MAX,
    cruzamento: 0.5, // traço grosso no manual (ajuste com erro de 0,08 a 0,09): metade do cruzamento medido
  },
]
export const copiaDe = (id) => COPIAS.find((c) => c.id === id) ?? null

const densidade = (c, x) => c.dmin + (c.dmax - c.dmin) * (1 + Math.exp(-c.k * (x - c.x0))) ** (-1 / c.nu)
/** Log da exposição em que a curva chega à densidade `d`. */
const exposicaoPara = (c, d) => c.x0 - Math.log(((d - c.dmin) / (c.dmax - c.dmin)) ** -c.nu - 1) / c.k
/** Inclinação (gama) da curva no ponto x. */
function gama(c, x) {
  const e = Math.exp(-c.k * (x - c.x0))
  return ((c.dmax - c.dmin) * c.k * e * (1 + e) ** (-1 / c.nu - 1)) / c.nu
}

function inversa3(m) {
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

// a cópia trabalha nas primárias P3-D65 (o gamut de uma sala de cinema): cada canal é uma camada de corante
const DWG_P3 = matrizGamut('dwg', 'p3d65')
const P3_709 = matrizGamut('p3d65', 'rec709')
const SOBRE_O_CINZA = 1.0 // a cópia de laboratório põe o cinza 18% em densidade 1,0 acima da base (LAD)
const MARGEM = 0.985 // o branco da base fica logo abaixo do pico: a inversa da tela tem conta para ele
const FOG = 0.18 * 2 ** -9 // base e véu do negativo: o log não cai num abismo no preto
const telaSdr = criarTela('rec709')
const TAB_A = -5
const TAB_B = 4
const TAB_N = 4096
const TAB_PASSO = (TAB_B - TAB_A) / (TAB_N - 1)
const deLinear709 = CURVAS.rec709.deLinear

function semNegativo(rgb) {
  const ac = Math.max(rgb[0], rgb[1], rgb[2])
  if (!(ac > 0)) return [0, 0, 0]
  return rgb.map((v) => {
    const d = (ac - v) / ac
    return d <= 0.8 ? v : ac - ac * (0.8 + 0.2 * Math.tanh((d - 0.8) / 0.2))
  })
}

/**
 * A cópia como etapa do motor: luz da cena em DWG → luz da cena em DWG, de modo que a tela Rec.709 mostre o que a
 * cópia mostraria. `gamaSistema`: contraste do negativo × cópia no cinza (log da tela por log da cena);
 * `saturacaoSistema`: quanto a cor do meio-tom cresce (razão entre canais, em log). O negativo de
 * cada camada é escolhido para o cinza sair neutro e com esse contraste, como o laboratório equilibra as luzes de
 * copiagem. O que sobra de diferença entre as camadas (pé e ombro de cada uma) é o caráter da cópia.
 */
export function criarCopia(id, { gamaSistema = 1.8, saturacaoSistema = 1.3 } = {}) {
  const c = copiaDe(id)
  if (!c) throw new Error(`Cópia desconhecida: ${id}`)
  const M = c.corantes
  const Mi = inversa3(M)
  // luzes de copiagem: em que exposição cada camada põe o cinza na densidade de laboratório
  const xCinza = c.curvas.map((cv) => exposicaoPara(cv, cv.dmin + SOBRE_O_CINZA))
  const gamaNeg = c.curvas.map((cv, i) => gamaSistema / gama(cv, xCinza[i]))
  // negativo + cópia de cada camada, em função do log da luz da cena relativo ao cinza (e)
  // (acima da base de cada camada: a base é o branco e fica de fora da média)
  const integral = (j, e) => densidade(c.curvas[j], xCinza[j] - gamaNeg[j] * e) - c.curvas[j].dmin
  // o quanto cada camada se afasta da média (o cruzamento de cores no pé e no ombro) entra com a confiança da
  // digitalização da ficha: 1 = a curva como está
  const lambda = c.cruzamento
  const composta = (j, e) => {
    const media = (integral(0, e) + integral(1, e) + integral(2, e)) / 3
    return c.curvas[j].dmin + media + lambda * (integral(j, e) - media)
  }
  // densidade analítica (só do corante da camada i) com a camada em `e`: no neutro as três camadas andam juntas e a
  // densidade integral é a da ficha, então o corante sozinho é M⁻¹ × as três curvas
  const exata = (i, e) => Mi[i][0] * composta(0, e) + Mi[i][1] * composta(1, e) + Mi[i][2] * composta(2, e)
  // as três curvas são suaves: tabela de 4096 pontos de -5 a +4 (log10 da cena, de 17 stops abaixo a 13 acima do
  // cinza) com interpolação de Hermite; fora dela a curva já está no pé ou no ombro e segue reta
  const tabelas = [0, 1, 2].map((i) => {
    const t = new Float64Array(TAB_N)
    for (let k = 0; k < TAB_N; k++) t[k] = exata(i, TAB_A + k * TAB_PASSO)
    return t
  })
  const analitica = (i, e) => {
    const t = tabelas[i]
    const u = (Math.min(TAB_B, Math.max(TAB_A, e)) - TAB_A) / TAB_PASSO
    const k = Math.min(TAB_N - 2, Math.floor(u))
    const f = u - k
    const p0 = t[k]
    const p1 = t[k + 1]
    const m0 = (t[Math.min(TAB_N - 1, k + 1)] - t[Math.max(0, k - 1)]) / (k > 0 ? 2 : 1)
    const m1 = (t[Math.min(TAB_N - 1, k + 2)] - t[k]) / (k + 2 < TAB_N ? 2 : 1)
    const f2 = f * f
    const f3 = f2 * f
    return (2 * f3 - 3 * f2 + 1) * p0 + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * p1 + (f3 - f2) * m1
  }
  const dmin = c.curvas.map((cv) => cv.dmin)
  // as camadas do negativo enxergam faixas largas e sobrepostas do espectro (as curvas de sensibilidade espectral dos
  // negativos se cruzam): cada camada vê um pouco das vizinhas. Sem isso o contraste de cada camada (gamaSistema)
  // multiplicaria a saturação inteira; com a sobreposição, a cor no meio-tom sai `saturacaoSistema` vezes a da cena
  // (em log da razão entre canais), que é o "mais cheio que a vida" da película, sem virar tinta
  const so = (1 - saturacaoSistema / gamaSistema) / 3
  const sobreposicao = [
    [1 - 2 * so, so, so],
    [so, 1 - 2 * so, so],
    [so, so, 1 - 2 * so],
  ]

  /** A tela da cópia (Rec.709 linear, 1 = pico) para uma luz da cena em DWG. */
  function tela(rgbDwg) {
    const p3 = mul(sobreposicao, semNegativo(mul(DWG_P3, rgbDwg)))
    // negativo: mais luz na cena, mais densidade no negativo, menos luz na cópia (o sinal está em `integral`)
    const e = p3.map((v) => Math.log10((v + FOG) / (0.18 + FOG)))
    const a = e.map((v, i) => analitica(i, v))
    const D = mul(M, a)
    const t = D.map((v, i) => MARGEM * 0.1 * 10 ** -(v - dmin[i] - SOBRE_O_CINZA))
    return mul(P3_709, t)
  }

  function emCena(rgbDwg) {
    const lin = comprimirGamut(tela(rgbDwg))
    const pico = telaSdr.curvaDeTom.pico
    return telaSdr.inverter(...lin.map((v) => deLinear709(Math.min(1, Math.max(0, v / pico)))))
  }

  return { copia: c, tela, emCena, gamaNegativo: gamaNeg }
}
