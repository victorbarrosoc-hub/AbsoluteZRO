// Ciência de cor do motor: matrizes derivadas das primárias, curvas de transferência, adaptação cromática, Oklab e o
// branco por temperatura e tinta. Tudo contra valores publicados e com ida e volta.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BRADFORD, CAT16, matrizAdaptacao } from '../src/motor/cor/adaptacao.js'
import { KELVIN_MAX, KELVIN_MIN, temperaturaDeXy, uvDeXy, xyDePlanck, xyDeTemperatura, xyDeUv } from '../src/motor/cor/branco.js'
import { CURVAS, D50, D65, ESPACOS, luminancia, matrizEntre, rgbParaXyz, xyParaXYZ, xyzParaRgb } from '../src/motor/cor/espacos.js'
import { identidade, inversa, mulM, mulV } from '../src/motor/cor/matriz.js'
import { criarOklab, deOklch, deltaE, matizDoCirculo, paraOklch, xyzParaOklab } from '../src/motor/cor/oklab.js'
import { exp2, log2 } from '../src/motor/cor/rapido.js'
import { sorteio } from './apoio-motor.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a} (tolerância ${tol})`)
const matrizPerto = (m, ref, tol, msg) => m.forEach((v, i) => perto(v, ref[i], tol, `${msg} [${i}]`))

test('matrizes RGB → XYZ batem com as publicadas (Lindbloom; BT.2020; SMPTE EG 432-1)', () => {
  // tolerância 1,5e-4: as publicadas partem de primárias arredondadas a 4 casas
  matrizPerto(rgbParaXyz('srgb'), [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041], 3e-4, 'sRGB')
  matrizPerto(rgbParaXyz('rec2020'), [0.636958, 0.1446169, 0.168881, 0.2627002, 0.6779981, 0.0593017, 0, 0.0280727, 1.0609851], 1e-6, 'Rec.2020')
  matrizPerto(rgbParaXyz('p3'), [0.4865709, 0.2656677, 0.1982173, 0.2289746, 0.6917385, 0.0792869, 0, 0.0451134, 1.0439444], 1e-6, 'Display P3')
  matrizPerto(rgbParaXyz('adobe'), [0.5767309, 0.185554, 0.1881852, 0.2973769, 0.6273491, 0.0752741, 0.0270343, 0.0706872, 0.9911085], 3e-4, 'Adobe RGB')
  matrizPerto(rgbParaXyz('prophoto'), [0.7976749, 0.1351917, 0.0313534, 0.2880402, 0.7118741, 0.0000857, 0, 0, 0.82521], 2e-4, 'ProPhoto')
  matrizPerto(luminancia('rec2020'), [0.2627, 0.678, 0.0593], 1e-4, 'luminância BT.2020')
})

test('matrizes: branco vira branco, ida e volta dá a identidade, sRGB cabe em P3, Adobe e Rec.2020', () => {
  for (const id of Object.keys(ESPACOS)) {
    const branco = mulV(rgbParaXyz(id), [1, 1, 1])
    const esperado = xyParaXYZ(ESPACOS[id].branco)
    branco.forEach((v, i) => perto(v, esperado[i], 1e-12, `branco de ${id}`))
    matrizPerto(mulM(xyzParaRgb(id), rgbParaXyz(id)), identidade(), 1e-12, `ida e volta ${id}`)
    for (const outro of Object.keys(ESPACOS)) matrizPerto(mulM(matrizEntre(outro, id), matrizEntre(id, outro)), identidade(), 1e-10, `${id} ⇄ ${outro}`)
  }
  // as primárias de um espaço menor têm coordenadas não negativas no maior
  for (const [menor, maior] of [['srgb', 'p3'], ['srgb', 'rec2020'], ['srgb', 'adobe'], ['adobe', 'rec2020']]) {
    assert.ok(matrizEntre(menor, maior).every((v) => v > -1e-9), `${menor} dentro de ${maior}`)
  }
  // referência publicada (ITU-R BT.2087): Rec.709 → Rec.2020
  matrizPerto(matrizEntre('srgb', 'rec2020'), [0.6274, 0.3293, 0.0433, 0.0691, 0.9195, 0.0114, 0.0164, 0.088, 0.8956], 1e-4, 'BT.2087')
})

test('curvas de transferência: pontos conhecidos e ida e volta', () => {
  perto(CURVAS.srgb.codificar(0.18), 0.46135, 1e-4, 'sRGB de 0,18')
  perto(CURVAS.srgb.decodificar(0.5), 0.21404, 1e-4, 'sRGB 0,5')
  perto(CURVAS.srgb.codificar(0.0031308), 0.04045, 1e-4, 'emenda do sRGB')
  perto(CURVAS.gama22.codificar(0.18), 0.18 ** (256 / 563), 1e-12, 'Adobe')
  perto(CURVAS.rec2020.codificar(0.18), 1.09929682680944 * 0.18 ** 0.45 - 0.09929682680944, 1e-12, 'BT.2020')
  perto(CURVAS.rec2020.codificar(0.018053968510807), 4.5 * 0.018053968510807, 1e-9, 'emenda do BT.2020')
  perto(CURVAS.prophoto.codificar(0.18), 0.18 ** (1 / 1.8), 1e-12, 'ProPhoto')
  for (const [nome, c] of Object.entries(CURVAS)) {
    perto(c.codificar(0), 0, 1e-12, nome)
    perto(c.codificar(1), 1, 1e-12, nome)
    let anterior = -1
    for (let i = 0; i <= 2000; i++) {
      const v = i / 2000
      const cod = c.codificar(v)
      assert.ok(cod >= anterior, `${nome} monótona em ${v}`)
      anterior = cod
      perto(c.decodificar(cod), v, 1e-9, `${nome} ida e volta em ${v}`)
    }
  }
})

test('adaptação cromática: Bradford contra a matriz publicada, CAT16 com as propriedades do artigo', () => {
  // Lindbloom, D65 → D50 (Bradford); tolerância pela diferença de arredondamento dos brancos
  matrizPerto(matrizAdaptacao(xyParaXYZ(D65), xyParaXYZ(D50), 'bradford'), [1.0478112, 0.0228866, -0.050127, 0.0295424, 0.9904844, -0.0170491, -0.0092345, 0.0150436, 0.7521316], 4e-4, 'Bradford')
  // as três linhas da CAT16 somam 1: o branco de energia igual vira (1, 1, 1) nos cones (Li et al., 2017)
  for (let l = 0; l < 3; l++) perto(CAT16[l * 3] + CAT16[l * 3 + 1] + CAT16[l * 3 + 2], 1, 1e-6, `CAT16 linha ${l}`)
  matrizPerto(BRADFORD, [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296], 0, 'Bradford')
  for (const metodo of ['cat16', 'bradford']) {
    const de = xyParaXYZ(xyDeTemperatura(3200, 5))
    const para = xyParaXYZ(D65)
    const M = matrizAdaptacao(de, para, metodo)
    mulV(M, de).forEach((v, i) => perto(v, para[i], 1e-12, `${metodo}: branco vira branco`))
    matrizPerto(mulM(matrizAdaptacao(para, de, metodo), M), identidade(), 1e-12, `${metodo}: ida e volta`)
    matrizPerto(matrizAdaptacao(de, de, metodo), identidade(), 1e-12, `${metodo}: mesmo branco`)
  }
  assert.throws(() => matrizAdaptacao([1, 1, 1], [1, 1, 1], 'outra'))
  assert.throws(() => inversa([1, 2, 3, 2, 4, 6, 0, 0, 1]), /sem inversa/)
})

test('Oklab: tabela de referência do artigo, ida e volta, cinza sem croma em qualquer espaço', () => {
  // Ottosson (2020), tabela de pares XYZ → Lab, 3 casas
  const pares = [
    [[0.95, 1, 1.089], [1, 0, 0]],
    [[1, 0, 0], [0.45, 1.236, -0.019]],
    [[0, 1, 0], [0.922, -0.671, 0.263]],
    [[0, 0, 1], [0.153, -1.415, -0.449]],
  ]
  for (const [xyz, lab] of pares) xyzParaOklab(...xyz).forEach((v, i) => perto(v, lab[i], 1e-3, `XYZ ${xyz}`))
  const rnd = sorteio(1)
  for (const espaco of ['rec2020', 'srgb', 'p3']) {
    const o = criarOklab(espaco)
    const lab = [0, 0, 0]
    const rgb = [0, 0, 0]
    for (let i = 0; i < 2000; i++) {
      // cena sem teto e com negativo pequeno
      const c = [rnd() * 4 - 0.02, rnd() * 4 - 0.02, rnd() * 4 - 0.02]
      o.paraOklab(c[0], c[1], c[2], lab)
      o.deOklab(lab[0], lab[1], lab[2], rgb)
      for (let k = 0; k < 3; k++) perto(rgb[k], c[k], 1e-9, `${espaco} ida e volta`)
    }
    for (const v of [0.001, 0.18, 1, 7]) {
      o.paraOklab(v, v, v, lab)
      assert.ok(Math.hypot(lab[1], lab[2]) < 2e-7, `${espaco}: cinza ${v} com croma ${Math.hypot(lab[1], lab[2])}`)
      perto(lab[0], Math.cbrt(v), 1e-6, 'L do cinza')
    }
  }
  // homogêneo: dobrar a luz não gira o matiz nem muda C/L
  const o = criarOklab('rec2020')
  const a = paraOklch(...o.paraOklab(0.3, 0.1, 0.05, [0, 0, 0]))
  const b = paraOklch(...o.paraOklab(0.6, 0.2, 0.1, [0, 0, 0]))
  perto(a[2], b[2], 1e-9, 'matiz')
  perto(a[1] / a[0], b[1] / b[0], 1e-12, 'croma relativa')
  deOklch(...a).forEach((v, i) => perto(v, o.paraOklab(0.3, 0.1, 0.05, [0, 0, 0])[i], 1e-12, 'Oklch ida e volta'))
  perto(deltaE('srgb', 1, 1, 1, 1, 1, 1), 0, 0)
  // sRGB puro em Oklch (valores do artigo e da CSS Color 4): vermelho 29°, amarelo 110°, verde 142°, azul 264°
  const graus = (g) => (((matizDoCirculo(g) * 180) / Math.PI + 360) % 360)
  perto(graus(0), 29.23, 0.05, 'vermelho')
  perto(graus(60), 109.77, 0.05, 'amarelo')
  perto(graus(120), 142.5, 0.05, 'verde')
  perto(graus(240), 264.05, 0.05, 'azul')
})

test('branco: lugar de Planck contra valores publicados', () => {
  // Wyszecki e Stiles: corpo negro a 6500 K e o iluminante A (2856 K); tolerância do ajuste de Kim et al.
  const p65 = xyDePlanck(6500)
  perto(p65[0], 0.3135, 5e-4, 'x 6500 K')
  perto(p65[1], 0.3237, 5e-4, 'y 6500 K')
  const a = xyDePlanck(2856)
  perto(a[0], 0.4476, 8e-4, 'x iluminante A')
  perto(a[1], 0.4074, 8e-4, 'y iluminante A')
  // temperatura infinita: (0,2399; 0,2342)
  const inf = xyDePlanck(1e12)
  perto(inf[0], 0.2399, 1.2e-3, 'x no infinito')
  perto(inf[1], 0.2342, 1.2e-3, 'y no infinito')
  // D65 tem temperatura correlata de 6504 K e fica 0,0032 acima do lugar (tinta ≈ +10); D50, 5003 K
  const d65 = temperaturaDeXy(D65)
  perto(d65.kelvin, 6504, 12, 'CCT do D65')
  perto(d65.tinta / 3000, 0.0032, 4e-4, 'Duv do D65')
  perto(temperaturaDeXy(D50).kelvin, 5003, 12, 'CCT do D50')
  // sem degrau nas emendas do ajuste
  for (const T of [2222, 4000]) {
    const antes = xyDePlanck(T - 0.01)
    const depois = xyDePlanck(T + 0.01)
    perto(antes[0], depois[0], 1e-5, `emenda ${T}`)
    perto(antes[1], depois[1], 1e-5, `emenda ${T}`)
  }
})

test('branco: temperatura e tinta, ida e volta em toda a faixa', () => {
  let piorT = 0
  let piorTinta = 0
  for (let T = KELVIN_MIN; T <= KELVIN_MAX; T *= 1.021) {
    for (const tinta of [-150, -75, -10, 0, 10, 75, 150]) {
      const volta = temperaturaDeXy(xyDeTemperatura(T, tinta))
      piorT = Math.max(piorT, Math.abs(volta.kelvin - T) / T)
      piorTinta = Math.max(piorTinta, Math.abs(volta.tinta - tinta))
      assert.ok(volta.noLugar)
    }
  }
  assert.ok(piorT < 1e-6, `pior erro relativo de temperatura ${piorT}`)
  assert.ok(piorTinta < 1e-6, `pior erro de tinta ${piorTinta}`)
  // sentido: mais kelvin = mais azul (x cai); tinta positiva = luz mais verde (y sobe)
  let anterior = Infinity
  for (let T = KELVIN_MIN; T <= KELVIN_MAX; T *= 1.05) {
    const [x] = xyDeTemperatura(T, 0)
    assert.ok(x < anterior, `x cai com a temperatura em ${T}`)
    anterior = x
    assert.ok(xyDeTemperatura(T, 50)[1] > xyDeTemperatura(T, 0)[1], 'tinta positiva é verde')
    assert.ok(xyDeTemperatura(T, -50)[1] < xyDeTemperatura(T, 0)[1], 'tinta negativa é magenta')
  }
  const uv = uvDeXy([0.31, 0.33])
  xyDeUv(uv).forEach((v, i) => perto(v, [0.31, 0.33][i], 1e-12, 'uv ida e volta'))
  // ponto longe do lugar: os números saem na faixa e o aviso desce
  const longe = temperaturaDeXy([0.2, 0.6])
  assert.equal(longe.noLugar, false)
  assert.ok(longe.kelvin >= KELVIN_MIN && longe.kelvin <= KELVIN_MAX && Math.abs(longe.tinta) <= 150)
})

test('log2 e 2^x por tabela: erro abaixo de 3e-7', () => {
  const rnd = sorteio(9)
  let piorLog = 0
  let piorExp = 0
  for (let i = 0; i < 200000; i++) {
    const v = 2 ** (rnd() * 60 - 40)
    piorLog = Math.max(piorLog, Math.abs(log2(v) - Math.log2(v)))
    const x = rnd() * 80 - 50
    piorExp = Math.max(piorExp, Math.abs(exp2(x) / 2 ** x - 1))
  }
  assert.ok(piorLog < 3e-7, `log2: ${piorLog}`)
  assert.ok(piorExp < 1e-7, `exp2: ${piorExp}`)
  perto(exp2(0), 1, 0)
  perto(log2(1), 0, 0)
})
