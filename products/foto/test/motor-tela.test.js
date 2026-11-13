// A tela do motor: mapa de tons com o cinza preso e as margens, preservação de matiz, gamut, a inversa exata e os bytes.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { neutro } from '../src/motor/ajustes.js'
import { baseDeImagem } from '../src/motor/base.js'
import { CURVAS, matrizEntre } from '../src/motor/cor/espacos.js'
import { mulV } from '../src/motor/cor/matriz.js'
import { revelar } from '../src/motor/revelar.js'
import { CINZA, INCLINACAO, MARGENS, criarTela, curvaDeTons, margens, paraBytes, telaDe } from '../src/motor/tela.js'
import { latitudeDeTeste, oklch, sorteio } from './apoio-motor.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a} (tolerância ${tol})`)
const cod = [0, 0, 0]

test('curva de tons: cinza preso, monótona, inclinação pedida e inversa exata, em toda a faixa de margens', () => {
  let curvas = 0
  for (const altas of [0.5, 1, 2, 3.5, 6, 10, 16]) {
    for (const sombras of [0.5, 1, 2, 5, 8, 12, 16]) {
      for (const inclinacao of [INCLINACAO / Math.SQRT2, INCLINACAO, INCLINACAO * Math.SQRT2]) {
        const c = curvaDeTons({ altas, sombras, inclinacao })
        curvas++
        perto(c.ida(CINZA), CINZA, 1e-8, `cinza (${altas}, ${sombras}, ${inclinacao})`)
        // a inclinação no cinza é a pedida, ou a menor que a margem permite (e a curva diz qual)
        assert.ok(c.inclinacao >= inclinacao - 1e-6, 'inclinação efetiva nunca abaixo da pedida')
        const e = 1e-4
        const medida = (Math.log(c.ida(CINZA * (1 + e))) - Math.log(c.ida(CINZA * (1 - e)))) / (Math.log(1 + e) - Math.log(1 - e))
        perto(medida, c.inclinacao, 2e-3, 'inclinação medida')
        let anterior = -1
        for (let ev = -20; ev <= 20; ev += 1 / 16) {
          const y = c.ida(CINZA * 2 ** ev)
          assert.ok(y >= anterior && y >= 0 && y <= 1, `monótona e em 0..1 em ${ev} EV`)
          anterior = y
        }
        // as pontas: preto e branco exatamente nas margens
        perto(c.ida(CINZA * 2 ** altas), 1, 1e-9, 'branco na margem')
        assert.ok(c.ida(CINZA * 2 ** (altas - 0.01)) < 1)
        perto(c.ida(CINZA * 2 ** -sombras), 0, 1e-9, 'preto na margem')
        assert.ok(c.ida(CINZA * 2 ** (-sombras + 0.01)) > 0)
        for (let y = 0.001; y < 1; y += 0.0037) perto(c.ida(c.volta(y)), y, 1e-8, 'inversa')
      }
    }
  }
  assert.equal(curvas, 147)
  // com margens folgadas a inclinação é exatamente a pedida
  perto(curvaDeTons({ altas: 3.5, sombras: 8 }).inclinacao, INCLINACAO, 1e-9)
})

test('rampa de −12 a +8 EV: monótona, neutra e com o cinza no lugar, nas três telas', () => {
  for (const id of ['srgb', 'p3', 'rec2020']) {
    const tela = criarTela(id)
    let anterior = -1
    for (let ev = -12; ev <= 8; ev += 1 / 32) {
      const v = CINZA * 2 ** ev
      tela.aplicar(v, v, v, cod)
      // neutra: os três canais iguais (croma abaixo de 1e-6 em código)
      assert.ok(Math.max(cod[0], cod[1], cod[2]) - Math.min(cod[0], cod[1], cod[2]) < 1e-6, `${id}: neutro em ${ev} EV`)
      assert.ok(cod[1] >= anterior - 1e-7, `${id}: monótona em ${ev} EV`)
      assert.ok(cod[1] >= 0 && cod[1] <= 1)
      anterior = cod[1]
    }
    tela.aplicar(CINZA, CINZA, CINZA, cod)
    perto(cod[1], tela.espaco.curva === 'srgb' ? CURVAS.srgb.codificar(CINZA) : CURVAS.rec2020.codificar(CINZA), 2e-6, `${id}: cinza preso`)
    tela.aplicar(0, 0, 0, cod)
    assert.deepEqual([...cod], [0, 0, 0])
    tela.aplicar(100, 100, 100, cod)
    for (const v of cod) perto(v, 1, 1e-9, `${id}: branco`)
    // ruído negativo e preto absoluto não viram cor
    tela.aplicar(-0.001, 0.0005, -0.0002, cod)
    assert.ok(cod.every((v) => v === 0))
  }
  // o cinza fica preso com qualquer contraste e qualquer margem
  for (const contraste of [-100, -40, 0, 60, 100]) {
    for (const altas of [2, 3.5, 7]) {
      criarTela('srgb', { contraste, altas, sombras: 6 }).aplicar(CINZA, CINZA, CINZA, cod)
      perto(cod[0], CURVAS.srgb.codificar(CINZA), 2e-6, `cinza com contraste ${contraste} e altas ${altas}`)
    }
  }
})

// EV acima do cinza em que a tela chega ao branco (código ≥ 254,5/255) e abaixo em que chega ao preto (≤ 0,5/255)
function alcance(tela) {
  let branco = null
  let preto = null
  for (let ev = 0; ev <= 20; ev += 1 / 64) {
    const v = CINZA * 2 ** ev
    tela.aplicar(v, v, v, cod)
    if (cod[0] >= 254.5 / 255) {
      branco = ev
      break
    }
  }
  for (let ev = 0; ev >= -20; ev -= 1 / 64) {
    const v = CINZA * 2 ** ev
    tela.aplicar(v, v, v, cod)
    if (cod[0] <= 0.5 / 255) {
      preto = -ev
      break
    }
  }
  return { branco, preto }
}

test('margens: mais margem de altas guarda mais stops antes do branco; mais margem de sombras, antes do preto', () => {
  let anterior = 0
  for (const altas of [1, 2, 3, 4, 5, 6, 8]) {
    const { branco } = alcance(criarTela('srgb', { altas, sombras: 8 }))
    assert.ok(branco > anterior, `altas ${altas}: branco em +${branco} EV (antes ${anterior})`)
    // o branco da tela fica na margem pedida (a menos do último passo de 8 bits)
    assert.ok(branco <= altas + 1e-9 && branco > altas * 0.6, `altas ${altas}: branco em +${branco} EV`)
    anterior = branco
  }
  anterior = 0
  for (const sombras of [1, 2, 3, 4, 5]) {
    const { preto } = alcance(criarTela('srgb', { altas: 3.5, sombras }))
    assert.ok(preto > anterior, `sombras ${sombras}: preto em −${preto} EV`)
    assert.ok(preto <= sombras + 1e-9)
    anterior = preto
  }
  // o contraste da tela muda a inclinação no cinza, no sentido certo
  let inclinacaoAnterior = 0
  for (const contraste of [-100, -50, 0, 50, 100]) {
    const t = criarTela('srgb', { contraste })
    assert.ok(t.curva.inclinacao > inclinacaoAnterior, `contraste ${contraste}`)
    inclinacaoAnterior = t.curva.inclinacao
  }
})

test("margens em 'auto': saem da Latitude do arquivo, acompanham a exposição e têm piso, teto e padrão", () => {
  const a = neutro()
  // sem base: o padrão
  assert.deepEqual(margens(a, null), { altas: MARGENS.altas.padrao, sombras: MARGENS.sombras.padrao, origem: { altas: 'padrao', sombras: 'padrao' } })
  // com Latitude: o que o arquivo tem, mais a folga da reconstrução
  const latitude = latitudeDeTeste({ margem: { altas: [1, 1, 1], sombras: 4, acimaDoCinza: 3.1, abaixoDoCinza: 9.2 } })
  const base = { origem: 'raw', latitude, exposicaoBase: 0, folgaAltas: 0.5 }
  let m = margens(a, base)
  perto(m.altas, 3.6, 1e-12)
  perto(m.sombras, 9.2, 1e-12)
  assert.deepEqual(m.origem, { altas: 'arquivo', sombras: 'arquivo' })
  // a exposição leva as margens junto: +1 EV = 1 EV a mais de altas e 1 EV a menos de sombras
  a.luz.exposicao = 1
  m = margens(a, base)
  perto(m.altas, 4.6, 1e-12)
  perto(m.sombras, 8.2, 1e-12)
  // piso e teto
  a.luz.exposicao = -5
  assert.equal(margens(a, base).altas, MARGENS.altas.piso)
  assert.equal(margens(a, base).sombras, MARGENS.sombras.teto)
  a.luz.exposicao = 5
  assert.equal(margens(a, base).sombras, MARGENS.sombras.piso)
  assert.equal(margens(a, { ...base, latitude: latitudeDeTeste({ margem: { acimaDoCinza: 30, abaixoDoCinza: 3 } }) }).altas, MARGENS.altas.teto)
  // RAW sem Latitude: a saturação nominal do sensor (2,47 EV) mais a exposição base
  a.luz.exposicao = 0
  perto(margens(a, { origem: 'raw', latitude: null, exposicaoBase: 0.3, folgaAltas: 0 }).altas, Math.log2(1 / CINZA) + 0.3, 1e-12)
  // número manual vale como está
  a.tela.margemAltas = 6
  a.tela.margemSombras = 3
  m = margens(a, base)
  assert.deepEqual([m.altas, m.sombras, m.origem.altas, m.origem.sombras], [6, 3, 'manual', 'manual'])
  // telaDe usa essas margens
  const t = telaDe('srgb', a, base)
  assert.deepEqual([t.curva.altas, t.curva.sombras], [6, 3])
})

test('branco estourado continua branco quando a exposição desce (a margem acompanha)', () => {
  const latitude = latitudeDeTeste()
  const base = { origem: 'raw', latitude, exposicaoBase: 0, folgaAltas: 0 }
  const saturado = 1 // o neutro no teto do sensor
  for (const exposicao of [-0.4, 0, 1, 2.5]) {
    const a = neutro()
    a.luz.exposicao = exposicao
    const v = saturado * 2 ** exposicao
    telaDe('srgb', a, base).aplicar(v, v, v, cod)
    assert.ok(cod[0] > 254.4 / 255, `exposição ${exposicao}: o teto do sensor saiu em ${cod[0] * 255}`)
  }
})

test('identidade: foto pronta + ajustes neutros devolve a mesma imagem (erro < 1/255 em 5000 cores)', () => {
  const rnd = sorteio(42)
  for (const espaco of ['srgb', 'p3', 'adobe']) {
    const n = 5000
    const dados = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n * 4; i++) dados[i] = Math.floor(rnd() * 256)
    // as pontas do cubo e os cinzas entram também
    const pontas = [0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 0, 255, 255, 255, 0, 255, 1, 1, 1, 254, 254, 254]
    for (let i = 0; i < pontas.length / 3; i++) dados.set(pontas.slice(i * 3, i * 3 + 3), i * 4)
    const base = baseDeImagem({ largura: 100, altura: 50, dados, canais: 4, espaco })
    assert.equal(base.origem, 'imagem')
    // a foto pronta sai no mesmo espaço em que entrou (Adobe RGB só existe como entrada; a tela dela é interna)
    const tela = criarTela(espaco)
    let pior = 0
    for (let i = 0; i < n; i++) {
      tela.aplicar(base.imagem.dados[i * 3], base.imagem.dados[i * 3 + 1], base.imagem.dados[i * 3 + 2], cod)
      for (let c = 0; c < 3; c++) pior = Math.max(pior, Math.abs(cod[c] - dados[i * 4 + c] / 255))
    }
    assert.ok(pior < 1 / 255, `${espaco}: pior erro ${pior * 255}/255`)
    // a volta é exata; o que sobra é a imagem de trabalho em float32, que a gama pura do Adobe RGB (inclinação
    // infinita no preto) amplia perto do zero
    assert.ok(pior < (espaco === 'adobe' ? 1e-3 : 2e-5), `${espaco}: a volta é exata na prática (${pior})`)
    if (espaco !== 'adobe') {
      const saida = revelar(base, neutro(), { tela: espaco })
      const bytes = paraBytes(saida)
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) assert.equal(bytes[i * 4 + c], dados[i * 4 + c], `${espaco}: pixel ${i}`)
    }
  }
  // 16 bits e 3 canais
  const dados16 = new Uint16Array(3000 * 3)
  for (let i = 0; i < dados16.length; i++) dados16[i] = Math.floor(rnd() * 65536)
  const base16 = baseDeImagem({ largura: 60, altura: 50, dados: dados16, canais: 3, espaco: 'srgb' })
  const volta = paraBytes(revelar(base16, neutro()), { bits: 16 })
  let pior16 = 0
  for (let i = 0; i < dados16.length; i++) pior16 = Math.max(pior16, Math.abs(volta[i] - dados16[i]))
  assert.ok(pior16 <= 2, `16 bits: pior erro ${pior16}/65535`)
  assert.throws(() => baseDeImagem({ largura: 2, altura: 2, dados: new Uint8Array(4), canais: 4 }), /menores/)
  assert.throws(() => baseDeImagem({ largura: 1, altura: 1, dados: new Uint8Array(4), canais: 2 }), /canais/)
})

test('a volta também é exata no modo por canal; no meio do caminho ela avisa', () => {
  const rnd = sorteio(3)
  const tela = criarTela('srgb', { preservarMatiz: 0 })
  const cena = [0, 0, 0]
  for (let i = 0; i < 2000; i++) {
    const c = [rnd(), rnd(), rnd()]
    tela.inverter(c[0], c[1], c[2], cena)
    tela.aplicar(cena[0], cena[1], cena[2], cod)
    for (let k = 0; k < 3; k++) perto(cod[k], c[k], 2e-5, 'por canal')
  }
  assert.throws(() => criarTela('srgb', { preservarMatiz: 50 }).inverter(0.5, 0.4, 0.3, cena), /preservarMatiz/)
  assert.throws(() => criarTela('cmyk'), /desconhecida/)
})

test('gamut: nada sai de 0..1 e a cor que já cabe na tela não muda', () => {
  const rnd = sorteio(8)
  for (const id of ['srgb', 'p3', 'rec2020']) {
    const tela = criarTela(id)
    const paraTela = matrizEntre('rec2020', id)
    for (let i = 0; i < 20000; i++) {
      // cena larga: cores fora de qualquer tela, com negativo e muito acima do branco
      const ganho = 2 ** (rnd() * 14 - 8)
      const c = [(rnd() * 1.3 - 0.15) * ganho, (rnd() * 1.3 - 0.15) * ganho, (rnd() * 1.3 - 0.15) * ganho]
      tela.aplicar(c[0], c[1], c[2], cod)
      for (let k = 0; k < 3; k++) assert.ok(cod[k] >= 0 && cod[k] <= 1 && Number.isFinite(cod[k]), `${id}: ${c} → ${cod}`)
    }
    // cor de dentro: a mesma conta sem o passo de gamut (norma, curva, ida ao branco, matriz, curva da tela)
    let conferidas = 0
    for (let i = 0; i < 20000 && conferidas < 4000; i++) {
      const c = [rnd() * 0.6, rnd() * 0.6, rnd() * 0.6]
      const u = tela.uniformes
      const n = u.pesosNorma[0] * c[0] + u.pesosNorma[1] * c[1] + u.pesosNorma[2] * c[2] + u.pesoMaximo * Math.max(...c)
      const h = tela.curva.ida(n)
      const t = Math.min(1, Math.max(0, (h - u.branco.inicio) / (1 - u.branco.inicio)))
      const s = t * t * (3 - 2 * t)
      const k = 1 - u.branco.k * s * s
      const linear = mulV(paraTela, c.map((v) => h + (v * (h / n) - h) * k))
      if (linear.some((v) => v < 0 || v > 1)) continue
      conferidas++
      tela.aplicar(c[0], c[1], c[2], cod)
      const curva = CURVAS[tela.espaco.curva]
      for (let j = 0; j < 3; j++) perto(cod[j], curva.codificar(linear[j]), 5e-6, `${id}: cor de dentro`)
    }
    assert.ok(conferidas >= 2000, `${id}: ${conferidas} cores de dentro conferidas`)
  }
  // cor fora da tela: comprime a croma sem mexer no matiz (Oklab) — verde do Rec.2020 numa tela sRGB
  const tela = criarTela('srgb')
  const fora = [0.02, 0.5, 0.03]
  tela.aplicar(fora[0], fora[1], fora[2], cod)
  const lin = cod.map((v) => CURVAS.srgb.decodificar(v))
  const dentro = mulV(matrizEntre('srgb', 'rec2020'), lin)
  const antes = oklch(...fora)
  const depois = oklch(...dentro)
  assert.ok(depois[1] < antes[1], 'a croma caiu')
  // o matiz é o da cor depois do mapa de tons (a mesma razão entre canais): confere contra ela
  assert.ok(Math.min(...lin) < 1e-4, 'encostou na borda do gamut')
  let dh = Math.abs(depois[2] - antes[2])
  if (dh > 180) dh = 360 - dh
  assert.ok(dh < 1, `matiz girou ${dh}°`)
})

test('preservar matiz: a cor saturada mantém o matiz quando a luz sobe; por canal, ela gira', () => {
  const gira = (preservarMatiz, ate = 3) => {
    const tela = criarTela('rec2020', { preservarMatiz, altas: 6 })
    const M = matrizEntre('rec2020', 'rec2020')
    let menor = Infinity
    let maior = -Infinity
    for (let ev = -3; ev <= ate; ev += 0.5) {
      const g = 2 ** ev
      tela.aplicar(0.3 * g, 0.12 * g, 0.03 * g, cod)
      const lin = mulV(M, cod.map((v) => CURVAS.rec2020.decodificar(v)))
      const h = oklch(...lin)[2]
      menor = Math.min(menor, h)
      maior = Math.max(maior, h)
    }
    return maior - menor
  }
  const preservado = gira(100)
  const porCanal = gira(0)
  // até a ida ao branco começar (luz da tela 0,6) o matiz não se mexe; dali ao pico a mistura com o branco, feita em
  // luz linear, desloca o matiz de Oklab em alguns graus (medido: 8° nesta cor) contra 51° no modo por canal
  assert.ok(gira(100, 0.5) < 0.01, `abaixo do pico o matiz variou ${gira(100, 0.5)}°`)
  assert.ok(preservado < 10, `com preservação o matiz variou ${preservado}°`)
  assert.ok(porCanal > 4 * preservado && porCanal > 30, `por canal variou ${porCanal}°`)
  assert.ok(gira(50) < porCanal && gira(50) > preservado, 'o controle é contínuo')
})

test('ida ao branco: perto do pico a cor perde croma, e a luz muito forte de qualquer cor chega ao branco', () => {
  const tela = criarTela('rec2020')
  const croma = (ev) => {
    const g = 2 ** ev
    tela.aplicar(0.25 * g, 0.18 * g, 0.1 * g, cod)
    const c = oklch(...cod.map((v) => CURVAS.rec2020.decodificar(v)))
    return c[1] / c[0]
  }
  perto(croma(-2), croma(-1), 1e-3, 'longe do pico a croma relativa não muda')
  assert.ok(croma(2.5) < 0.8 * croma(0), 'perto do pico cai')
  tela.aplicar(60, 20, 5, cod)
  assert.ok(cod.every((v) => v > 0.93), `luz forte quase branca: ${cod}`)
})

test('paraBytes: 8 bits RGBA com pontilhado determinístico, 16 bits RGB', () => {
  const largura = 64
  const altura = 32
  const dados = new Float32Array(largura * altura * 3).fill(100.4 / 255)
  const imagem = { largura, altura, dados }
  const seco = paraBytes(imagem)
  assert.ok(seco instanceof Uint8ClampedArray && seco.length === largura * altura * 4)
  assert.ok(seco.every((v, i) => (i % 4 === 3 ? v === 255 : v === 100)))
  const p1 = paraBytes(imagem, { pontilhado: true })
  const p2 = paraBytes(imagem, { pontilhado: true })
  assert.deepEqual(p1, p2, 'mesma imagem, mesmos bytes')
  // o pontilhado guarda a média (100,4) que o arredondamento seco perde (100), e nunca anda mais de um passo e meio
  let soma = 0
  let conta = 0
  for (let i = 0; i < p1.length; i++) {
    if (i % 4 === 3) continue
    soma += p1[i]
    conta++
    assert.ok(Math.abs(p1[i] - 100.4) <= 1.5)
  }
  perto(soma / conta, 100.4, 0.03, 'média do pontilhado')
  const b16 = paraBytes({ largura: 2, altura: 1, dados: new Float32Array([0, 0.5, 1, -1, 2, 0.25]) }, { bits: 16 })
  assert.ok(b16 instanceof Uint16Array)
  assert.deepEqual([...b16], [0, 32768, 65535, 0, 65535, 16384])
  assert.throws(() => paraBytes(imagem, { bits: 10 }), /8 ou 16/)
})

test('uniformes da tela: o que a GPU recebe', () => {
  const u = criarTela('p3', { contraste: 20, altas: 4, sombras: 7 }).uniformes
  assert.equal(u.espaco, 'p3')
  assert.equal(u.transferencia, 'srgb')
  for (const m of [u.matrizTela, u.paraLms, u.lmsParaTela]) assert.ok(m.length === 9 && m.every(Number.isFinite))
  perto(u.pesosNorma[0] + u.pesosNorma[1] + u.pesosNorma[2] + u.pesoMaximo, 1, 1e-12, 'a norma de um cinza é o próprio cinza')
  assert.deepEqual([u.curva.preto, u.curva.branco], [2 ** -7, 2 ** 4])
  for (const k of ['c', 'k', 'a', 'lb']) assert.ok(Number.isFinite(u.curva[k]))
  assert.equal(u.preservarMatiz, 1)
})
