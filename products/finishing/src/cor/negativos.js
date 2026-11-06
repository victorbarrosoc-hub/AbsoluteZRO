// Revela · negativos de cinema a partir das fichas técnicas. Cada negativo é a curva sensitométrica publicada de cada
// camada (densidade Status M por stop de câmera, 0 = cinza 18% bem exposto), digitalizada do gráfico da ficha, e a
// separação de cor das camadas, calculada da sensibilidade espectral publicada:
//   - Kodak VISION3 500T 5219 (H-1-5219, 2022), 250D 5207 (H-1-5207), 200T 5213 (H-1-5213t) e 50D 5203 (H-1-5203);
//   - Fujifilm ETERNA Vivid 160 (8543), ETERNA 250 (8553), ETERNA 400 (8583), ETERNA 500 (8573), ETERNA 250D (8563)
//     e REALA 500D (8592), manual de filmes da Fujifilm (2007).
// Separação de cor: as curvas de sensibilidade espectral do 500T e do 250D foram digitalizadas e, com as refletâncias
// da ColorChecker sob a luz de cada filme (3200 K e D55) e as funções de cor CIE 1931, deram a matriz que leva a luz da
// cena (DWG, com o branco equilibrado em D65, como a câmera digital) à exposição de cada camada, com o branco nas três
// iguais (o laboratório equilibra o cinza). Erro médio do ajuste: 0,08 stop. Os negativos de tungstênio usam a do
// 500T e os de dia a do 250D; a Fujifilm não publica a sensibilidade espectral no manual.
//
// Nomes de fabricante só como referência da ficha: a Revela não tem vínculo com a Kodak nem com a Fujifilm.

import { matrizGamut } from './espacos.js'

const P3_DWG = matrizGamut('p3d65', 'dwg')

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]

/** DWG linear → exposição das camadas (vermelha, verde, azul), com o branco igual nas três. */
export const SEPARACAO = {
  T: [
    [1.2484, -0.2055, -0.0429],
    [-0.0655, 1.3069, -0.2414],
    [-0.0847, -0.1578, 1.2425],
  ],
  D: [
    [1.3772, -0.3525, -0.0247],
    [-0.0713, 1.2996, -0.2283],
    [-0.0736, -0.2069, 1.2805],
  ],
}

// a curva de cada camada, ajustada aos pontos digitalizados da ficha (erro médio de 0,002 a 0,005 de densidade nas
// Kodak e de 0,014 a 0,03 nas Fuji, cujo traço é mais grosso): densidade em função dos stops de câmera (s, 0 = cinza)
//   u(s) = w1·ln(1 + e^((s-a)/w1))            o pé: zero bem abaixo de a, reta (s - a) acima
//   D(s) = Dmin + g·[ u - w2·ln(1 + e^((u-(b-a))/w2)) ]   o ombro sobre o pé: sobe sempre, por construção
// a reta do meio tem inclinação g por stop; o pé começa perto de a e o ombro perto de b (onde a ficha não mostra o
// ombro, b fica a 11 stops e a curva segue reta em tudo o que uma câmera registra). [Dmin, g, a, w1, b, w2]
const CURVAS = {
  '5219': { R: [0.1864, 0.1458, -4.9029, 0.8904, 7.114, 1.2899], G: [0.5817, 0.172, -4.8481, 0.8449, 7.9189, 1.6842], B: [0.8432, 0.1654, -4.8341, 0.709, 7.3535, 1.2951] },
  '5207': { R: [0.1716, 0.1463, -4.8974, 0.8671, 7.0399, 1.3349], G: [0.5729, 0.1712, -4.8279, 0.8449, 7.4847, 1.3795], B: [0.8435, 0.1646, -4.8287, 0.7036, 7.0449, 1.1629] },
  '5203': { R: [0.1584, 0.151, -5.2062, 0.4839, 6.8027, 1.2641], G: [0.5781, 0.1766, -4.9865, 0.4697, 6.5501, 0.8318], B: [0.8513, 0.1701, -5.0066, 0.6228, 6.3443, 0.605] },
  '5213': { R: [0.1823, 0.1451, -4.6737, 0.5681, 6.9218, 1.0789], G: [0.5855, 0.1691, -4.6015, 0.5357, 7.1499, 0.9878], B: [0.852, 0.1621, -4.6248, 0.5922, 6.9681, 0.9083] },
  '8543': { R: [0.2582, 0.143, -3.4246, 0.5798, 10.9988, 0.3], G: [0.5184, 0.1636, -3.9237, 0.4101, 10.9968, 0.3], B: [0.6238, 0.2023, -3.0152, 1.4004, 6.2147, 1.1208] },
  '8553': { R: [0.2748, 0.1421, -3.6479, 0.5083, 11.0, 3.6582], G: [0.5541, 0.1595, -4.0111, 0.6258, 10.9977, 0.3], B: [0.6822, 0.1797, -3.4568, 0.8679, 11.0, 2.1928] },
  '8583': { R: [0.2356, 0.1192, -4.0929, 0.8502, 6.2988, 0.4592], G: [0.4552, 0.1407, -4.7139, 1.2116, 6.3046, 0.3], B: [0.6564, 0.17, -3.621, 0.9172, 11.0, 3.4693] },
  '8573': { R: [0.2937, 0.1454, -3.7766, 0.4782, 11.0, 4.0], G: [0.5616, 0.1621, -4.0866, 0.4349, 11.0, 2.7059], B: [0.6538, 0.1822, -3.5233, 0.8931, 6.116, 1.1423] },
  '8563': { R: [0.2644, 0.1471, -3.7194, 0.6113, 11.0, 3.8947], G: [0.5725, 0.1546, -4.086, 0.5795, 10.9999, 0.3], B: [0.7105, 0.1784, -3.4771, 0.5201, 11.0, 3.3097] },
  '8592': { R: [0.2606, 0.1569, -3.6768, 0.4574, 10.786, 4.0], G: [0.652, 0.1792, -3.8583, 0.2999, 11.0, 4.0], B: [0.9001, 0.1895, -3.4005, 0.4709, 6.9471, 1.7263] },
}

export const NEGATIVOS = [
  { id: '5219', nome: 'Vision3 500T', numero: '5219', fabricante: 'Kodak', luz: 'T', ficha: 'KODAK VISION3 500T 5219/7219, H-1-5219 (2022)', frase: 'O negativo da noite do cinema: latitude enorme, grão presente.' },
  { id: '5213', nome: 'Vision3 200T', numero: '5213', fabricante: 'Kodak', luz: 'T', ficha: 'KODAK VISION3 200T 5213/7213, H-1-5213t', frase: 'Tungstênio mais fino: o 500T com menos grão.' },
  { id: '5207', nome: 'Vision3 250D', numero: '5207', fabricante: 'Kodak', luz: 'D', ficha: 'KODAK VISION3 250D 5207/7207, H-1-5207', frase: 'O negativo do dia: cor limpa, pele natural.' },
  { id: '5203', nome: 'Vision3 50D', numero: '5203', fabricante: 'Kodak', luz: 'D', ficha: 'KODAK VISION3 50D 5203/7203, H-1-5203 (2022)', frase: 'Grão quase invisível e um pouco mais de contraste.' },
  { id: '8573', nome: 'Eterna 500', numero: '8573', fabricante: 'Fujifilm', luz: 'T', ficha: 'FUJICOLOR ETERNA 500 8573, manual Fujifilm (2007)', frase: 'O tungstênio da Fuji: azul mais firme, verde mais frio.' },
  { id: '8583', nome: 'Eterna 400', numero: '8583', fabricante: 'Fujifilm', luz: 'T', ficha: 'FUJICOLOR ETERNA 400 8583, manual Fujifilm (2007)', frase: 'O mais suave de todos: contraste baixo, cor contida.' },
  { id: '8553', nome: 'Eterna 250', numero: '8553', fabricante: 'Fujifilm', luz: 'T', ficha: 'FUJICOLOR ETERNA 250 8553, manual Fujifilm (2007)', frase: 'Eterna de tungstênio em velocidade média.' },
  { id: '8563', nome: 'Eterna 250D', numero: '8563', fabricante: 'Fujifilm', luz: 'D', ficha: 'FUJICOLOR ETERNA 250D 8563, manual Fujifilm (2007)', frase: 'O dia da Fuji: sombra mais fria, meio-tom leve.' },
  { id: '8543', nome: 'Eterna Vivid 160', numero: '8543', fabricante: 'Fujifilm', luz: 'T', ficha: 'FUJICOLOR ETERNA Vivid 160 8543, manual Fujifilm (2007)', frase: 'A Eterna com mais cor e contraste.' },
  { id: '8592', nome: 'Reala 500D', numero: '8592', fabricante: 'Fujifilm', luz: 'D', ficha: 'FUJICOLOR REALA 500D 8592, manual Fujifilm (2007)', frase: 'Dia rápido com a quarta camada da Fuji: cor fiel em luz mista.' },
]
export const negativoDe = (id) => NEGATIVOS.find((n) => n.id === id) ?? null

const sp = (x) => (x > 30 ? x : Math.log1p(Math.exp(x)))
/** A curva analítica de uma camada: stops → densidade. */
const curvaDe =
  ([dmin, g, a, w1, b, w2]) =>
  (s) => {
    const u = w1 * sp((s - a) / w1)
    return dmin + g * (u - w2 * sp((u - (b - a)) / w2))
  }

/**
 * O negativo pronto para o motor. `revelacao`: forçar (+1, +2 stops) ou puxar (-1) na revelação: o contraste do
 * negativo sobe uns 12% por stop forçado e o véu sobe um pouco, como no ECN-2 forçado.
 * Devolve { negativo, M (DWG → exposição das camadas), delta(j, e) (densidade a mais que no cinza, camada j na
 * exposição e em stops), gama[j] (inclinação no cinza, densidade por log10 da exposição) }.
 */
export function criarNegativo(id, { revelacao = 0 } = {}) {
  const n = negativoDe(id)
  if (!n) throw new Error(`Negativo desconhecido: ${id}`)
  const t = CURVAS[id]
  const curvas = ['R', 'G', 'B'].map((k) => curvaDe(t[k]))
  const ganho = 1 + 0.12 * revelacao
  const veu = 0.03 * Math.max(0, revelacao)
  const base = curvas.map((c) => c(0))
  const delta = (j, e) => ganho * (curvas[j](e) - base[j]) + veu * (1 - Math.exp(-Math.max(0, -e) / 3))
  const gama = curvas.map((c) => (ganho * (c(0.5) - c(-0.5))) / Math.log10(2))
  return { negativo: n, M: SEPARACAO[n.luz], delta, gama, curvas }
}

/** Exposição das camadas (stops sobre o cinza 18%) de uma luz em DWG, sem canal negativo. */
export function exposicaoDasCamadas(M, rgbDwg, fog) {
  const e = mul(M, rgbDwg)
  const ac = Math.max(e[0], e[1], e[2])
  const f = ac > 0 ? e.map((v) => { const d = (ac - v) / ac; return d <= 0.8 ? v : ac - ac * (0.8 + 0.2 * Math.tanh((d - 0.8) / 0.2)) }) : [0, 0, 0]
  return f.map((v) => Math.log2((v + fog) / (0.18 + fog)))
}

/**
 * O negativo sozinho, escaneado e invertido sem cópia (o "Cineon" do intermediário digital): cada camada passa pela
 * própria curva (pé, ombro e o cruzamento entre camadas) e volta à luz pela inclinação do cinza. As três camadas são
 * lidas como as primárias P3 (as camadas do Vision3 ficam perto delas: ver SEPARACAO), como um scanner faz: a cor do
 * scan é a separação do próprio filme, não a da cena. O cinza fica no lugar; a tela da Revela faz o resto.
 */
export function criarScan(id, { revelacao = 0 } = {}) {
  const neg = criarNegativo(id, { revelacao })
  const FOG = 0.18 * 2 ** -9
  const LOG10_2 = Math.log10(2)
  // quanto do cruzamento entre camadas fica: o traço colorido e grosso do manual da Fuji deixa o desenho de cada
  // camada mais incerto que o da Kodak (o mesmo critério das cópias)
  const lambda = neg.negativo.fabricante === 'Fujifilm' ? 0.5 : 1
  function emCena(rgbDwg) {
    const e = exposicaoDasCamadas(neg.M, rgbDwg, FOG)
    const s = e.map((v, j) => neg.delta(j, v) / (neg.gama[j] * LOG10_2)) // de volta a stops, pela inclinação do cinza
    const camadas = s.map((v, j) => {
      // o cruzamento é a diferença entre a camada e as outras na mesma luz: mede pela luz de cada uma
      const mesmo = (neg.delta(0, e[j]) / neg.gama[0] + neg.delta(1, e[j]) / neg.gama[1] + neg.delta(2, e[j]) / neg.gama[2]) / (3 * LOG10_2)
      return (0.18 + FOG) * 2 ** (mesmo + lambda * (v - mesmo)) - FOG
    })
    return mul(P3_DWG, camadas)
  }
  return { negativo: neg.negativo, emCena }
}
