// Decupagem · medidas: FFT própria, nitidez em duas escalas, tremido contra desfoque, exposição, ruído, impressões
// digitais e horizonte. As imagens são geradas com semente (test/apoio-decupagem.js). Os números de REFERÊNCIA foram
// calculados em numpy (np.fft, np.percentile, np.histogram) sobre estas mesmas imagens e estão travados aqui: o que
// se confere é o valor, sem Python na hora do teste.

import test from 'node:test'
import assert from 'node:assert/strict'

import { criarFft, fft2, espectroReal, cepstroDePotencia, lerCepstro, potenciaDeDois } from '../src/decupagem/fft.js'
import {
  medir,
  lumaDe,
  reduzir,
  percentil,
  hamming,
  dhashDe,
  phashDe,
  classeDeNitidez,
  medirCepstro,
  mapaDeNitidez,
  nitidezDaRegiao,
  LIMIARES,
} from '../src/decupagem/medidas.js'
import {
  casosDeReferencia,
  folhas,
  fotografar,
  gauss,
  disco,
  movimento,
  exposicao,
  quadro,
  paisagem,
  misturar,
  mascaraDaCaixa,
  sorteio,
  normal,
  paraPrevia,
} from './apoio-decupagem.js'

const perto = (obtido, esperado, tolerancia, nome) => {
  const erro = Math.abs(obtido - esperado)
  assert.ok(erro <= tolerancia, `${nome}: obtido ${obtido}, esperado ${esperado} (erro ${erro}, tolerância ${tolerancia})`)
}
// tolerância relativa das referências: o numpy faz parte das contas em float32; aqui é tudo float64
const REL = 2e-5
const relativo = (obtido, esperado, nome, rel = REL) => perto(obtido, esperado, Math.max(1e-9, Math.abs(esperado) * rel), nome)

// ───────────────────────────── FFT ─────────────────────────────

// np.fft.fft2 de um quadro 8 × 8 (default_rng(3), normal arredondada em 3 casas)
const FFT8 = {
  entrada: [
    2.041, -2.556, 0.418, -0.568, -0.453, -0.216, -2.02, -0.232, -0.865, 3.323, 0.226, -0.353, -0.281, -0.668, -1.055, -0.391, 0.482, -0.239, 0.958, -0.2,
    0.024, 1.546, 0.545, -0.505, -0.183, 0.541, 1.935, -0.27, -0.244, 1.002, -0.886, -0.292, 0.883, 0.58, 0.092, 0.67, -2.828, 1.021, -0.96, -1.669, 0.276,
    0.701, -0.445, -1.076, 0.026, -0.053, 1.406, 0.747, 0.194, 1.112, -0.206, -0.926, 0.584, 0.583, -0.215, -0.783, 0.229, -2.494, 0.69, 0.491, -1.639, 0.061,
    -0.964, 0.757,
  ],
  re: [
    -2.591, 6.139831027, -1.273, 9.596168973, -1.879, 9.596168973, -1.273, 6.139831027, -5.701079287, -6.059661038, 0.337314365, 0.160613342, 3.458679298,
    -1.88601327, 9.161179285, 5.669120559, -8.751, 4.403674396, -4.041, -0.926082754, -1.635, 17.960325604, 7.863, 3.110082754, 2.951079287, -8.836613342,
    -3.411179285, -5.092338962, 10.487320702, -0.245120559, 10.980685635, 6.55401327, -3.095, -2.364783541, 5.903, 11.720783541, 5.721, 11.720783541, 5.903,
    -2.364783541, 2.951079287, 6.55401327, 10.980685635, -0.245120559, 10.487320702, -5.092338962, -3.411179285, -8.836613342, -8.751, 3.110082754, 7.863,
    17.960325604, -1.635, -0.926082754, -4.041, 4.403674396, -5.701079287, 5.669120559, 9.161179285, -1.88601327, 3.458679298, 0.160613342, 0.337314365,
    -6.059661038,
  ],
  im: [
    0.0, -6.281164071, -8.844, 9.352835929, 0.0, -9.352835929, 8.844, 6.281164071, -4.266283764, 0.482339531, 9.145292998, 5.309211322, 2.280330804,
    -3.994331163, -4.756121425, 2.280656347, -2.784, -7.605953021, 3.152, 11.685061536, 2.084, 5.995953021, -6.424, -1.023061536, 0.269716236, 3.767211322,
    -0.004121425, 10.848339531, 4.352330804, 1.670656347, -4.390707002, -5.424331163, 0.0, 1.10457186, -3.244, 1.11857186, 0.0, -1.11857186, 3.244, -1.10457186,
    -0.269716236, 5.424331163, 4.390707002, -1.670656347, -4.352330804, -10.848339531, 0.004121425, -3.767211322, 2.784, 1.023061536, 6.424, -5.995953021,
    -2.084, -11.685061536, -3.152, 7.605953021, 4.266283764, -2.280656347, 4.756121425, 3.994331163, -2.280330804, -5.309211322, -9.145292998, -0.482339531,
  ],
}

function quadroAleatorio(n, semente) {
  const rnd = sorteio(semente)
  return Float64Array.from({ length: n * n }, () => normal(rnd))
}

test('fft: a 2D confere com o numpy num quadro 8 × 8', () => {
  const re = Float64Array.from(FFT8.entrada)
  const im = new Float64Array(64)
  fft2(re, im, 8, 8)
  for (let i = 0; i < 64; i++) {
    perto(re[i], FFT8.re[i], 1e-8, `re[${i}]`)
    perto(im[i], FFT8.im[i], 1e-8, `im[${i}]`)
  }
})

test('fft: a inversa desfaz a direta, em 1D e em 2D retangular', () => {
  for (const n of [2, 4, 64, 512]) {
    const rnd = sorteio(n)
    const re = Float64Array.from({ length: n }, () => normal(rnd))
    const im = Float64Array.from({ length: n }, () => normal(rnd))
    const a = re.slice()
    const b = im.slice()
    const fft = criarFft(n)
    fft.direta(a, b)
    // Parseval: a energia no tempo é a do espectro dividida por n
    let tempo = 0
    let frequencia = 0
    for (let i = 0; i < n; i++) {
      tempo += re[i] * re[i] + im[i] * im[i]
      frequencia += a[i] * a[i] + b[i] * b[i]
    }
    perto(frequencia / n, tempo, 1e-9 * tempo, `Parseval n=${n}`)
    fft.inversa(a, b)
    for (let i = 0; i < n; i++) {
      perto(a[i], re[i], 1e-12, `volta re n=${n}`)
      perto(b[i], im[i], 1e-12, `volta im n=${n}`)
    }
  }
  const rnd = sorteio(9)
  const re = Float64Array.from({ length: 16 * 4 }, () => normal(rnd))
  const im = Float64Array.from({ length: 16 * 4 }, () => normal(rnd))
  const a = re.slice()
  const b = im.slice()
  fft2(a, b, 16, 4)
  fft2(a, b, 16, 4, true)
  for (let i = 0; i < 64; i++) perto(a[i], re[i], 1e-12, 'volta 2D')
})

test('fft: tamanho que não é potência de dois é recusado', () => {
  assert.equal(potenciaDeDois(512), true)
  assert.equal(potenciaDeDois(1), false)
  assert.equal(potenciaDeDois(384), false)
  assert.throws(() => criarFft(384), /potência de dois/)
  assert.equal(criarFft(64), criarFft(64), 'o plano do mesmo tamanho é reaproveitado')
})

test('fft: o espectro de imagem real (metade das colunas) é igual ao da FFT 2D completa', () => {
  const n = 32
  const dados = quadroAleatorio(n, 5)
  const re = dados.slice()
  const im = new Float64Array(n * n)
  fft2(re, im, n, n)
  const meio = espectroReal(dados, n)
  assert.equal(meio.colunas, n / 2 + 1)
  for (let ky = 0; ky < n; ky++) {
    for (let kx = 0; kx <= n / 2; kx++) {
      perto(meio.re[ky * meio.colunas + kx], re[ky * n + kx], 1e-10, `re ${ky},${kx}`)
      perto(meio.im[ky * meio.colunas + kx], im[ky * n + kx], 1e-10, `im ${ky},${kx}`)
    }
  }
})

test('fft: o cepstro parcial é igual ao caminho inteiro (FFT 2D, log do módulo, FFT 2D inversa)', () => {
  const n = 64
  const raio = 20
  const dados = quadroAleatorio(n, 6)
  const re = dados.slice()
  const im = new Float64Array(n * n)
  fft2(re, im, n, n)
  for (let i = 0; i < n * n; i++) {
    re[i] = Math.log(Math.hypot(re[i], im[i]) + 1e-3)
    im[i] = 0
  }
  fft2(re, im, n, n, true)
  const cep = cepstroDePotencia(dados, n, raio)
  let maiorImaginario = 0
  for (let dy = -raio; dy <= raio; dy++) {
    for (let dx = -raio; dx <= raio; dx++) {
      const i = ((dy + n) % n) * n + ((dx + n) % n)
      perto(lerCepstro(cep, dy, dx), re[i], 1e-12, `cepstro ${dy},${dx}`)
      maiorImaginario = Math.max(maiorImaginario, Math.abs(im[i]))
    }
  }
  assert.ok(maiorImaginario < 1e-12, 'o cepstro de imagem real é real')
  // e é par: o ponto oposto ao vale tem o mesmo valor (por isso a regra não confere "os dois lados")
  perto(lerCepstro(cep, 7, -3), lerCepstro(cep, -7, 3), 1e-12, 'simetria')
  assert.throws(() => cepstroDePotencia(dados, n, 32), /raio/)
})

// ───────────────────────────── referências do numpy ─────────────────────────────

// Calculado em numpy sobre casosDeReferencia(): S por blocos e percentil 90, cepstro com np.fft, histograma e
// percentis, Immerkær, Hough restrito, dHash e pHash sobre a miniatura por média de área.
const REFERENCIA = {
  nitida: {
    q: 0.8192582,
    s0: 2.409275,
    s1: 2.940801,
    qLocal: 0.8059541,
    mapa0: 1.343127,
    blocos: 345,
    z: -4.474328,
    comprimento: 21.26029,
    angulo: 138.8141,
    anel: -0.1344569,
    ruido: 4.307524,
    altas: 0.03196971,
    altas3: 0.0004170736,
    baixas: 0.0,
    media: 107.2109,
    p1: 18,
    p50: 97,
    p99: 242,
    dhash: 'a9496be891135c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 7.0, forca: 0.2421875 },
  },
  gauss1: {
    q: 0.666961,
    s0: 1.6554,
    s1: 2.482005,
    qLocal: 0.6516916,
    mapa0: 0.9854403,
    blocos: 345,
    z: -4.020652,
    comprimento: 53.15073,
    angulo: 138.8141,
    anel: -0.1820381,
    ruido: 1.185273,
    altas: 0.01053874,
    altas3: 4.83195e-5,
    baixas: 0.0,
    media: 107.2162,
    p1: 19,
    p50: 99,
    p99: 233,
    dhash: 'a9496be891135c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 7.0, forca: 0.2317708 },
  },
  gauss2: {
    q: 0.5642225,
    s0: 1.029478,
    s1: 1.824596,
    qLocal: 0.5681093,
    mapa0: 0.7051947,
    blocos: 345,
    z: -6.680947,
    comprimento: 5.0,
    angulo: 0.0,
    anel: -3.677471,
    ruido: 1.08345,
    altas: 0.003377279,
    altas3: 0.0,
    baixas: 0.0,
    media: 107.2152,
    p1: 22,
    p50: 101,
    p99: 226,
    dhash: 'a9496ba891135c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 7.0, forca: 0.265625 },
  },
  gauss4: {
    q: 0.5297456,
    s0: 0.5381434,
    s1: 1.015853,
    qLocal: 0.5212675,
    mapa0: 0.4433795,
    blocos: 345,
    z: -3.047294,
    comprimento: 8.602325,
    angulo: 35.53768,
    anel: -1.23591,
    ruido: 1.082345,
    altas: 0.0006891886,
    altas3: 0.0,
    baixas: 0.0,
    media: 107.2077,
    p1: 30,
    p50: 103,
    p99: 213,
    dhash: 'a9496ba891915c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 6.75, forca: 0.3567708 },
  },
  disco4: {
    q: 0.5529498,
    s0: 0.9744421,
    s1: 1.762261,
    qLocal: 0.5628768,
    mapa0: 0.686883,
    blocos: 345,
    z: -10.38353,
    comprimento: 7.211103,
    angulo: 56.30993,
    anel: -7.081566,
    ruido: 1.190366,
    altas: 0.005015055,
    altas3: 5.086263e-6,
    baixas: 0.0,
    media: 107.2146,
    p1: 21,
    p50: 101,
    p99: 227,
    dhash: 'a9496ba891135c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 3.25, forca: 0.2682292 },
  },
  mov9a0: {
    q: 0.6511549,
    s0: 1.383509,
    s1: 2.1247,
    qLocal: 0.6600372,
    mapa0: 0.9014613,
    blocos: 345,
    z: -34.83019,
    comprimento: 9.0,
    angulo: 0.0,
    anel: 0.1941906,
    ruido: 1.251413,
    altas: 0.007680257,
    altas3: 5.086263e-6,
    baixas: 0.0,
    media: 107.2127,
    p1: 20,
    p50: 101,
    p99: 230,
    dhash: 'a9496ba891135c59',
    phash: '1b07b7d8ba17488c',
    horizonte: { angulo: -4.5, forca: 0.453125 },
  },
  mov17a45: {
    q: 0.6651343,
    s0: 1.025038,
    s1: 1.541099,
    qLocal: 0.6529585,
    mapa0: 0.5930167,
    blocos: 345,
    z: -33.9798,
    comprimento: 15.55635,
    angulo: 45.0,
    anel: 0.06770196,
    ruido: 2.482853,
    altas: 0.002576192,
    altas3: 0.0,
    baixas: 0.0,
    media: 107.2118,
    p1: 23,
    p50: 103,
    p99: 221,
    dhash: 'a9496ba891915c59',
    phash: '1b07b7d8ba17488c',
    horizonte: { angulo: -10.0, forca: 0.171875 },
  },
  mov31a120: {
    q: 0.6303349,
    s0: 0.7607605,
    s1: 1.206915,
    qLocal: 0.6359518,
    mapa0: 0.522432,
    blocos: 345,
    z: -24.62978,
    comprimento: 30.01666,
    angulo: 119.9816,
    anel: 0.07635511,
    ruido: 1.560923,
    altas: 0.000445048,
    altas3: 0.0,
    baixas: 0.0,
    media: 107.1901,
    p1: 32,
    p50: 103,
    p99: 210,
    dhash: 'a9496ba891915c5b',
    phash: '1b06b7f8ba17488c',
    horizonte: null,
  },
  mais2ev: {
    q: 0.8128057,
    s0: 1.970582,
    s1: 2.424419,
    qLocal: 0.8099384,
    mapa0: 0.9143432,
    blocos: 345,
    z: -3.798228,
    comprimento: 21.26029,
    angulo: 138.8141,
    anel: 0.03263094,
    ruido: 5.556286,
    altas: 0.3757782,
    altas3: 0.2226384,
    baixas: 0.0,
    media: 170.7362,
    p1: 34,
    p50: 183,
    p99: 255,
    dhash: 'e9496be999915e59',
    phash: '130eb778b2174a8d',
    horizonte: { angulo: 7.0, forca: 0.25 },
  },
  menos3ev: {
    q: 0.8180487,
    s0: 1.93222,
    s1: 2.361986,
    qLocal: 0.8105335,
    mapa0: 1.135772,
    blocos: 345,
    z: -4.503125,
    comprimento: 21.26029,
    angulo: 138.8141,
    anel: -0.2608926,
    ruido: 2.195604,
    altas: 0.0,
    altas3: 0.0,
    baixas: 0.0,
    media: 41.66599,
    p1: 6,
    p50: 37,
    p99: 94,
    dhash: 'a9496be891135c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 7.0, forca: 0.2421875 },
  },
  ruido10: {
    q: 0.8287875,
    s0: 2.434245,
    s1: 2.937116,
    qLocal: 0.8146825,
    mapa0: 1.37314,
    blocos: 345,
    z: -3.77414,
    comprimento: 21.26029,
    angulo: 138.8141,
    anel: -0.5447697,
    ruido: 9.355141,
    altas: 0.03651683,
    altas3: 0.0002237956,
    baixas: 0.0,
    media: 107.1597,
    p1: 12,
    p50: 97,
    p99: 242,
    dhash: 'a9496be891135c59',
    phash: '1b06b7f8ba17488c',
    horizonte: { angulo: 7.0, forca: 0.2421875 },
  },
  horizonte3: {
    q: 0.8405581,
    s0: 0.8748937,
    s1: 1.040849,
    qLocal: 0.8149989,
    mapa0: 0.02973229,
    blocos: 345,
    z: -3.569594,
    comprimento: 58.03447,
    angulo: 1.974934,
    anel: -0.1603118,
    ruido: 1.104037,
    altas: 0.0,
    altas3: 0.0,
    baixas: 0.0,
    media: 129.8397,
    p1: 44,
    p50: 131,
    p99: 202,
    dhash: 'b56294fecf9929b4',
    phash: '2a855c7a85ca7867',
    horizonte: { angulo: 3.0, forca: 2.536458 },
  },
  horizonteMenos5: {
    q: 0.8437859,
    s0: 0.8809355,
    s1: 1.044027,
    qLocal: 0.8274988,
    mapa0: 0.02973229,
    blocos: 345,
    z: -4.294852,
    comprimento: 11.18034,
    angulo: 169.6952,
    anel: 0.4697827,
    ruido: 1.104422,
    altas: 0.0,
    altas3: 0.0,
    baixas: 0.0,
    media: 129.8113,
    p1: 44,
    p50: 142,
    p99: 202,
    dhash: 'b56294200e9929b4',
    phash: '7a85087ad5ca286f',
    horizonte: { angulo: -5.0, forca: 2.523438 },
  },
}

// as 13 imagens e as medidas delas são geradas uma vez só por arquivo de teste
let previas = null
let casos = null
const previasDeReferencia = () => (previas ??= casosDeReferencia())
const medidasDeReferencia = () => (casos ??= new Map(previasDeReferencia().map(([nome, previa]) => [nome, medir(previa)])))

test('medir: os 13 casos de referência batem com o numpy (nitidez, cepstro, exposição, ruído, impressões, horizonte)', () => {
  const medidas = medidasDeReferencia()
  assert.equal(medidas.size, Object.keys(REFERENCIA).length)
  for (const [nome, r] of Object.entries(REFERENCIA)) {
    const m = medidas.get(nome)
    const c = m.borrao.cepstro
    relativo(m.nitidez.q, r.q, `${nome} q`)
    relativo(m.nitidez.s0, r.s0, `${nome} s0`)
    relativo(m.nitidez.s1, r.s1, `${nome} s1`)
    relativo(m.nitidez.qLocal, r.qLocal, `${nome} qLocal`)
    relativo(m.nitidez.mapa.valores[0], r.mapa0, `${nome} primeiro bloco do mapa`)
    assert.equal(m.nitidez.mapa.valores.length, r.blocos, `${nome} blocos do mapa`)
    assert.equal(m.nitidez.mapa.colunas * m.nitidez.mapa.linhas, r.blocos)
    assert.equal(c.lado, 512)
    relativo(c.z, r.z, `${nome} z do cepstro`)
    relativo(c.comprimento, r.comprimento, `${nome} comprimento`)
    perto(c.angulo, r.angulo, 1e-3, `${nome} ângulo`)
    // o anel é a mediana de 24 pontos do cepstro: mais sensível ao arredondamento que o resto
    perto(c.anel, r.anel, 1e-4, `${nome} anel`)
    relativo(m.ruido, r.ruido, `${nome} ruído`)
    for (const k of ['altas', 'altas3', 'baixas', 'media']) relativo(m.exposicao[k], r[k], `${nome} ${k}`)
    for (const k of ['p1', 'p50', 'p99']) assert.equal(m.exposicao[k], r[k], `${nome} ${k}`)
    assert.equal(m.dhash, r.dhash, `${nome} dHash`)
    assert.equal(m.phash, r.phash, `${nome} pHash`)
    if (r.horizonte) {
      assert.equal(m.horizonte.angulo, r.horizonte.angulo, `${nome} ângulo do horizonte`)
      relativo(m.horizonte.forca, r.horizonte.forca, `${nome} força do horizonte`)
    } else assert.equal(m.horizonte, null, `${nome} sem horizonte`)
    assert.equal(m.largura, 768)
    assert.equal(m.altura, 512)
  }
})

test('medir: o q das partes mais nítidas acompanha o q de percentis em imagem de nitidez uniforme', () => {
  for (const [nome, m] of medidasDeReferencia()) perto(m.nitidez.qLocal, m.nitidez.q, 0.03, `${nome}: qLocal contra q`)
})

// ───────────────────────────── a matriz nítida / leve / foco / movimento ─────────────────────────────

const MATRIZ = [
  ['original', 'nitida', (r) => r],
  ['gauss σ=1', 'leve', (r) => gauss(r, 1)],
  ['gauss σ=2', 'foco', (r) => gauss(r, 2)],
  ['gauss σ=4', 'foco', (r) => gauss(r, 4)],
  ['disco r=4', 'foco', (r) => disco(r, 4)],
  ['disco r=7', 'foco', (r) => disco(r, 7)],
  ['movimento 9 px a 0°', 'movimento', (r) => movimento(r, 9, 0), 9, 0],
  ['movimento 13 px a 30°', 'movimento', (r) => movimento(r, 13, 30), 13, 30],
  ['movimento 17 px a 45°', 'movimento', (r) => movimento(r, 17, 45), 17, 45],
  ['movimento 17 px a 90°', 'movimento', (r) => movimento(r, 17, 90), 17, 90],
  ['movimento 31 px a 120°', 'movimento', (r) => movimento(r, 31, 120), 31, 120],
]

test('matriz: nítida, leve, foco e movimento fecham em três texturas (33 de 33), com comprimento e ângulo do tremido', () => {
  const contagem = {}
  for (const semente of [21, 22, 23]) {
    const base = folhas(semente, 768, 512, { raioMin: 2.5 })
    for (const [nome, esperado, defeito, comprimento, angulo] of MATRIZ) {
      const m = medir(fotografar(defeito(base)), { horizonte: false })
      const classe = classeDeNitidez(m)
      contagem[esperado] ??= {}
      contagem[esperado][classe] = (contagem[esperado][classe] || 0) + 1
      assert.equal(
        classe,
        esperado,
        `semente ${semente}, ${nome}: q ${m.nitidez.qLocal.toFixed(3)}, z ${m.borrao.cepstro.z.toFixed(1)}, anel ${m.borrao.cepstro.anel.toFixed(2)}`,
      )
      if (esperado === 'movimento') {
        // o traço desenhado em pixels inteiros tem, na diagonal, um pouco menos que o comprimento pedido
        perto(m.borrao.comprimento, comprimento, 0.1 * comprimento + 0.6, `${nome}: comprimento`)
        const erro = Math.abs(((m.borrao.angulo - angulo + 270) % 180) - 90)
        assert.ok(erro <= 3, `${nome}: ângulo ${m.borrao.angulo}`)
        assert.equal(m.borrao.grau, comprimento >= LIMIARES.comprimentoForte ? 'forte' : 'leve')
      } else {
        assert.equal(m.borrao.comprimento, undefined)
        assert.equal(m.borrao.tipo, esperado === 'nitida' ? 'nenhum' : 'foco')
        assert.equal(m.borrao.grau, { nitida: 'nenhum', leve: 'leve', foco: 'forte' }[esperado])
      }
    }
  }
  assert.deepEqual(contagem, { nitida: { nitida: 3 }, leve: { leve: 3 }, foco: { foco: 12 }, movimento: { movimento: 15 } })
})

test('matriz: as margens que separam as classes (q de cada caso longe dos limiares 0,70 e 0,60)', () => {
  const base = folhas(24, 768, 512, { raioMin: 2.5 })
  const q = (img) => medir(fotografar(img), { horizonte: false }).nitidez.qLocal
  const nitida = q(base)
  const leve = q(gauss(base, 1))
  const foco = q(gauss(base, 2))
  const muito = q(gauss(base, 4))
  assert.ok(nitida > 0.76, `nítida ${nitida}`)
  assert.ok(leve > 0.62 && leve < 0.69, `leve ${leve}`)
  assert.ok(foco > 0.54 && foco < 0.59, `foco ${foco}`)
  // o piso: imagem toda borrada fica em 0,52, que é só o ruído nas duas escalas
  assert.ok(muito > 0.5 && muito < 0.545, `muito borrada ${muito}`)
  assert.ok(nitida > leve && leve > foco && foco > muito)
})

test('matriz: desfoque de lente tem vale fundo no cepstro, mas é barrado pelo teste do anel', () => {
  const base = folhas(25, 768, 512, { raioMin: 2.5 })
  const lente = medir(fotografar(disco(base, 4)), { horizonte: false }).borrao
  const tremido = medir(fotografar(movimento(base, 9, 0)), { horizonte: false }).borrao
  assert.equal(lente.tipo, 'foco')
  assert.ok(lente.cepstro.z < -8, `o disco também cava o cepstro: z ${lente.cepstro.z}`)
  assert.ok(lente.cepstro.anel < LIMIARES.anel, `anel do disco ${lente.cepstro.anel}`)
  assert.equal(tremido.tipo, 'movimento')
  assert.ok(tremido.cepstro.z < -20 && tremido.cepstro.anel > -1, `tremido: z ${tremido.cepstro.z}, anel ${tremido.cepstro.anel}`)
})

test('nitidez: retrato com fundo desfocado não sai como borrado (o q de percentis erra, o q das partes nítidas não)', () => {
  const base = folhas(26, 768, 512, { raioMin: 2.5 })
  const sujeito = { x: 300, y: 150, largura: 130, altura: 160 }
  const mascara = mascaraDaCaixa(768, 512, sujeito, 6)
  const soFundo = medir(fotografar(misturar(gauss(base, 4), base, mascara)), { horizonte: false })
  assert.ok(soFundo.nitidez.q < 0.6, `o q de percentis reprova: ${soFundo.nitidez.q}`)
  assert.ok(soFundo.nitidez.qLocal >= 0.7, `o q das partes nítidas aprova: ${soFundo.nitidez.qLocal}`)
  assert.equal(classeDeNitidez(soFundo), 'nitida')
  // e continua reprovando quando o sujeito também está fora de foco
  const tudo = medir(fotografar(misturar(gauss(base, 4), gauss(base, 2), mascara)), { horizonte: false })
  assert.equal(classeDeNitidez(tudo), 'foco')
  // o mapa mostra onde está o foco: os blocos do sujeito são os de maior contraste
  const { colunas, valores, bloco } = soFundo.nitidez.mapa
  const dentro = []
  const fora = []
  valores.forEach((v, i) => {
    const x = 1 + (i % colunas) * bloco
    const y = 1 + Math.floor(i / colunas) * bloco
    const noSujeito = x >= sujeito.x && x + bloco <= sujeito.x + sujeito.largura && y >= sujeito.y && y + bloco <= sujeito.y + sujeito.altura
    ;(noSujeito ? dentro : fora).push(v)
  })
  assert.ok(dentro.length >= 6)
  assert.ok(Math.min(...dentro) > percentil(Float32Array.from(fora), 90), 'os blocos do sujeito ganham de 90% do fundo')
})

test('nitidez: a medida quase não muda com outro sorteio de ruído', () => {
  const base = gauss(folhas(27, 768, 512, { raioMin: 2.5 }), 1)
  const valores = [7, 8, 9, 10].map((semente) => medir(fotografar(base, semente), { horizonte: false }).nitidez.qLocal)
  assert.ok(Math.max(...valores) - Math.min(...valores) < 0.01, `q com quatro ruídos: ${valores.map((v) => v.toFixed(4))}`)
})

// ───────────────────────────── exposição ─────────────────────────────

test('exposição: +2 EV estoura (um canal e três), −3 EV escurece, e os percentis andam para o lado certo', () => {
  const m = medidasDeReferencia()
  const base = m.get('nitida').exposicao
  const mais = m.get('mais2ev').exposicao
  const menos = m.get('menos3ev').exposicao
  assert.ok(base.altas < 0.05 && base.altas3 < 0.01, 'a base não está estourada')
  assert.ok(mais.altas > 0.3 && mais.altas3 > 0.2, `+2 EV: altas ${mais.altas}, três canais ${mais.altas3}`)
  assert.ok(mais.altas3 <= mais.altas, 'três canais estourados é um subconjunto de um canal estourado')
  assert.equal(mais.p99, 255)
  assert.ok(menos.p99 < 110 && menos.altas === 0, `−3 EV: p99 ${menos.p99}`)
  assert.ok(menos.p50 < base.p50 && base.p50 < mais.p50)
  assert.ok(menos.media < base.media && base.media < mais.media)
})

test('exposição: preto fechado e branco chapado são contados pela área', () => {
  const largura = 64
  const altura = 64
  const rgba = new Uint8ClampedArray(largura * altura * 4)
  for (let i = 0; i < largura * altura; i++) {
    const x = i % largura
    // um quarto preto, um quarto branco, um quarto só com o vermelho estourado, um quarto cinza
    const cor = x < 16 ? [0, 1, 2] : x < 32 ? [255, 254, 253] : x < 48 ? [255, 120, 90] : [128, 128, 128]
    rgba.set([...cor, 255], i * 4)
  }
  const e = medir({ largura, altura, rgba }).exposicao
  assert.equal(e.baixas, 0.25)
  assert.equal(e.altas, 0.5)
  assert.equal(e.altas3, 0.25)
  assert.equal(e.p1, 0) // luma do quarto preto: 0,86
  assert.equal(e.p99, 254)
})

// ───────────────────────────── ruído ─────────────────────────────

test('ruído: cresce com o ruído somado e fica entre 60% e 105% dele numa imagem lisa', () => {
  const lisa = gauss(folhas(51, 640, 428, { raioMin: 6, raioMax: 200 }), 3)
  const estimado = [0, 1.5, 3, 5, 10, 20].map((sigma) => [sigma, medir(fotografar(lisa, 5, sigma), { horizonte: false }).ruido])
  assert.ok(estimado[0][1] < 0.3, `sem ruído somado: ${estimado[0][1]}`)
  for (let i = 1; i < estimado.length; i++) {
    const [sigma, valor] = estimado[i]
    assert.ok(valor > estimado[i - 1][1], 'monotônico')
    assert.ok(valor > 0.6 * sigma && valor < 1.05 * sigma, `somado ${sigma}, estimado ${valor}`)
  }
})

test('ruído: limite conhecido, a textura fina conta como ruído', () => {
  const m = medidasDeReferencia()
  // a mesma textura nítida e borrada, com o mesmo ruído somado (σ = 1,5): a nítida mede mais
  assert.ok(m.get('nitida').ruido > 3, `textura nítida: ${m.get('nitida').ruido}`)
  assert.ok(m.get('gauss2').ruido < 1.6, `textura borrada: ${m.get('gauss2').ruido}`)
})

// ───────────────────────────── impressões digitais ─────────────────────────────

test('hamming: distância entre impressões de 64 bits', () => {
  assert.equal(hamming('0000000000000000', '0000000000000000'), 0)
  assert.equal(hamming('0000000000000000', 'ffffffffffffffff'), 64)
  assert.equal(hamming('a9496be891135c59', 'a9496ba891135c59'), 1)
  assert.equal(hamming('abc', null), Infinity)
  assert.equal(hamming(undefined, undefined), Infinity)
  assert.equal(hamming('ab', 'abc'), Infinity)
})

test('impressões: a mesma foto com ruído, outra exposição ou andando 1% fica abaixo do limiar; fotos diferentes, acima', () => {
  const sementes = [41, 42, 43, 44, 45, 46]
  const bases = sementes.map((s) => folhas(s, 640, 428, { raioMin: 2.5 }))
  const med = (img, semente = 7, sigma = 1.5) => medir(fotografar(img, semente, sigma), { horizonte: false })
  const referencia = bases.map((b) => med(quadro(b)))
  const menor = (a, b) => Math.min(hamming(a.dhash, b.dhash), hamming(a.phash, b.phash))
  const variacoes = {
    'ruído σ = 4': (b) => med(quadro(b), 99, 4),
    '+0,7 EV': (b) => med(exposicao(quadro(b), 0.7)),
    '−1 EV': (b) => med(exposicao(quadro(b), -1)),
    'desfoque σ = 2': (b) => med(gauss(quadro(b), 2)),
    'rajada andando 1%': (b) => med(quadro(b, 0.01, 0.005)),
  }
  for (const [nome, variar] of Object.entries(variacoes)) {
    bases.forEach((b, i) => {
      const d = menor(referencia[i], variar(b))
      assert.ok(d <= 10, `${nome}, semente ${sementes[i]}: Hamming ${d}`)
    })
  }
  // andando 3% a foto cai na zona cinza (11 a 20) em pelo menos uma das impressões: quem decide é o vetor
  bases.forEach((b, i) => {
    const outra = med(quadro(b, 0.03, 0.01))
    assert.ok(menor(referencia[i], outra) <= 20, `rajada andando 3%, semente ${sementes[i]}`)
  })
  let minimo = 64
  for (let i = 0; i < referencia.length; i++) for (let j = i + 1; j < referencia.length; j++) minimo = Math.min(minimo, menor(referencia[i], referencia[j]))
  assert.ok(minimo > 16, `fotos diferentes: a menor distância foi ${minimo}`)
})

test('impressões: dHash e pHash têm 16 dígitos, e o primeiro bit do pHash é sempre zero', () => {
  const m = medidasDeReferencia().get('nitida')
  assert.match(m.dhash, /^[0-9a-f]{16}$/)
  assert.match(m.phash, /^[0-7][0-9a-f]{15}$/)
  // degradê horizontal: todo vizinho da direita é mais claro
  const largura = 90
  const altura = 80
  const rgba = new Uint8ClampedArray(largura * altura * 4)
  for (let i = 0; i < largura * altura; i++) rgba.set([(i % largura) * 2, (i % largura) * 2, (i % largura) * 2, 255], i * 4)
  const luma = lumaDe({ largura, altura, rgba })
  assert.equal(dhashDe(luma), 'ffffffffffffffff')
  assert.equal(phashDe(luma).length, 16)
})

// ───────────────────────────── horizonte ─────────────────────────────

test('horizonte: acha o ângulo de uma linha girada de propósito (erro de até 0,25°) com força acima de 1', () => {
  for (const graus of [0, 0.75, 1.5, 3, -5, 8, -12]) {
    const h = medir(fotografar(paisagem(61, 640, 428, graus))).horizonte
    perto(h.angulo, graus, 0.25, `horizonte a ${graus}°`)
    assert.ok(h.forca > 1.5, `força ${h.forca}`)
  }
})

test('horizonte: textura sem linha comprida dá força baixa (não vira aviso), e dá para pular a conta', () => {
  const m = medidasDeReferencia()
  for (const nome of ['nitida', 'gauss1', 'ruido10']) assert.ok(m.get(nome).horizonte.forca < 1, `${nome}: ${m.get(nome).horizonte.forca}`)
  const [, previa] = previasDeReferencia()[0]
  assert.equal(medir(previa, { horizonte: false }).horizonte, null)
})

// ───────────────────────────── bordas do contrato ─────────────────────────────

test('medir: prévia pequena mede o que dá e diz null no resto', () => {
  const de = (largura, altura) => medir(fotografar(folhas(71, largura, altura, { raioMin: 2.5 })))
  const media = de(300, 260)
  assert.equal(media.borrao.cepstro.lado, 256, 'recorte de 256 px quando não cabem 512')
  assert.equal(media.borrao.tipo, 'nenhum')
  const pequena = de(200, 150)
  assert.equal(pequena.borrao.cepstro, null, 'sem recorte de 256 px não há cepstro')
  assert.equal(pequena.borrao.tipo, 'nenhum', 'a classe sai só da nitidez')
  assert.ok(pequena.nitidez.q > 0.7)
  const miniatura = de(40, 30)
  assert.equal(miniatura.nitidez.q, null)
  assert.equal(miniatura.nitidez.qLocal, null)
  assert.equal(miniatura.borrao, null)
  assert.equal(miniatura.ruido, null)
  assert.equal(classeDeNitidez(miniatura), null)
  assert.match(miniatura.dhash, /^[0-9a-f]{16}$/)
  assert.equal(typeof miniatura.exposicao.p50, 'number')
  assert.equal(medirCepstro(lumaDe(fotografar(folhas(71, 40, 30)))), null)
})

test('medir: entrada torta é recusada com a razão', () => {
  assert.throws(() => medir(null), /Prévia inválida/)
  assert.throws(() => medir({ largura: 10, altura: 10, rgba: new Uint8ClampedArray(10) }), /rgba/)
  assert.throws(() => medir({ largura: 0, altura: 10, rgba: new Uint8ClampedArray(0) }), /largura e altura/)
})

test('medir: aceita a luma já calculada e Uint8Array no lugar de Uint8ClampedArray', () => {
  const [, previa] = previasDeReferencia()[1]
  const luma = lumaDe(previa)
  const a = medir(previa, { luma })
  const b = medir({ ...previa, rgba: new Uint8Array(previa.rgba) })
  assert.equal(a.nitidez.q, b.nitidez.q)
  assert.equal(a.dhash, b.dhash)
  assert.deepEqual(a.exposicao, b.exposicao)
})

test('utilitários: percentil como o numpy, redução 2 × 2, mapa e nitidez de região', () => {
  assert.equal(percentil(Float64Array.from([1, 2, 3, 4]), 50), 2.5)
  assert.equal(percentil(Float64Array.from([4, 1, 3, 2]), 90), 3.7)
  assert.equal(percentil(Float64Array.from([5]), 10), 5)
  assert.ok(Number.isNaN(percentil(new Float64Array(0), 50)))
  const pequena = reduzir({ largura: 5, altura: 3, dados: Float32Array.from([1, 3, 5, 7, 9, 1, 3, 5, 7, 9, 0, 0, 0, 0, 0]) })
  assert.deepEqual([pequena.largura, pequena.altura, ...pequena.dados], [2, 1, 2, 6])
  const base = folhas(72, 256, 192, { raioMin: 2.5 })
  const luma = lumaDe(paraPrevia(base))
  const mapa = mapaDeNitidez(luma, 16)
  assert.equal(mapa.colunas, Math.floor(254 / 16))
  assert.equal(mapa.linhas, Math.floor(190 / 16))
  const inteira = nitidezDaRegiao(luma, { x: 0, y: 0, largura: 256, altura: 192 }, 16)
  relativo(inteira.s, percentil(mapa.valores.slice(), 90), 'S da região inteira = percentil 90 do mapa', 1e-12)
  assert.equal(nitidezDaRegiao(luma, { x: 10, y: 10, largura: 12, altura: 12 }, 16), null, 'região sem bloco inteiro')
  // região fora da imagem é cortada na borda
  assert.ok(nitidezDaRegiao(luma, { x: -50, y: -50, largura: 150, altura: 150 }, 16).blocos >= 16)
})

// ───────────────────────────── desempenho ─────────────────────────────

test('desempenho: medir uma prévia de 1024 px', (t) => {
  const base = folhas(81, 1024, 683)
  const previas = [fotografar(base), fotografar(gauss(base, 2)), fotografar(paisagem(82, 1024, 683, 2))]
  for (let i = 0; i < 6; i++) for (const p of previas) medir(p)
  const tempos = []
  for (let i = 0; i < 10; i++) {
    for (const p of previas) {
      const t0 = performance.now()
      medir(p)
      tempos.push(performance.now() - t0)
    }
  }
  tempos.sort((a, b) => a - b)
  const mediana = tempos[tempos.length >> 1]
  const ms = (v) => `${v.toFixed(1)} ms`
  t.diagnostic(`medir 1024 × 683: mediana ${ms(mediana)}, mínimo ${ms(tempos[0])}, p90 ${ms(tempos[Math.floor(tempos.length * 0.9)])} (alvo: 60 ms num núcleo)`)
  // O alvo é 60 ms. A trava é folgada porque a máquina de teste roda outras coisas ao mesmo tempo; com
  // FOTO_DESEMPENHO=1 (máquina parada) vale o alvo.
  const limite = process.env.FOTO_DESEMPENHO === '1' ? 60 : 250
  assert.ok(mediana < limite, `mediana de ${mediana.toFixed(1)} ms (limite ${limite} ms)`)
})
