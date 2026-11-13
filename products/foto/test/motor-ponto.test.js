// A cadeia por pixel do motor: cada controle neutro é identidade, cada controle anda no sentido esperado, e as
// propriedades que fazem a predefinição ser previsível (cinza preso, mesma resposta em qualquer exposição).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CONTROLES, FAIXAS, FAIXAS_MATIZ, neutro, normalizar } from '../src/motor/ajustes.js'
import { xyDeTemperatura } from '../src/motor/cor/branco.js'
import { rgbParaXyz, xyParaXYZ, xyzParaRgb } from '../src/motor/cor/espacos.js'
import { mulV } from '../src/motor/cor/matriz.js'
import { matizDoCirculo } from '../src/motor/cor/oklab.js'
import { EPS, EV_MAX, EV_MIN, LUZ, VEU, criarCurvaDePontos, criarParametrica, criarPonto, curvaDeLuz, matrizDeBranco, matrizDeCalibracao, pesosDasFaixas, uniformes } from '../src/motor/ponto.js'
import { CINZA } from '../src/motor/tela.js'
import { CARTELA, deSrgb8, oklch, sorteio } from './apoio-motor.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a} (tolerância ${tol})`)
const contexto = { branco: { kelvin: 5200, tinta: 8 }, exposicaoBase: 0 }
const com = (mexe) => {
  const a = neutro()
  mexe(a)
  return criarPonto(normalizar(a), contexto)
}
const aplicar = (ponto, cor) => ponto.aplicar(cor[0], cor[1], cor[2], [0, 0, 0])
const norma = (c) => 0.75 * (0.2627002 * c[0] + 0.6779981 * c[1] + 0.0593017 * c[2]) + 0.25 * Math.max(...c)
const ev = (c) => Math.log2(norma(c) / CINZA)
const cinza = (e) => [CINZA * 2 ** e, CINZA * 2 ** e, CINZA * 2 ** e]
const cores = CARTELA.map(([, r, g, b]) => deSrgb8(r, g, b))

test('ajustes neutros: a cadeia é a identidade exata', () => {
  const ponto = com(() => {})
  const rnd = sorteio(1)
  for (let i = 0; i < 5000; i++) {
    const c = [rnd() * 8 - 0.01, rnd() * 8 - 0.01, rnd() * 8 - 0.01]
    assert.deepEqual(aplicar(ponto, c), c)
  }
  const p = ponto.uniformes.passos
  assert.ok(Object.values(p).every((v) => v === false), 'nenhum passo ligado')
})

test('exposição: +1 EV dobra a cena, −1 EV divide por dois, e a exposição base do arquivo soma', () => {
  const c = [0.3, 0.2, 0.05]
  assert.deepEqual(aplicar(com((a) => (a.luz.exposicao = 1)), c), [0.6, 0.4, 0.1])
  assert.deepEqual(aplicar(com((a) => (a.luz.exposicao = -1)), c), [0.15, 0.1, 0.025])
  assert.deepEqual(aplicar(com((a) => (a.luz.exposicao = 3)), [4, 4, 4]), [32, 32, 32], 'sem teto')
  const a = neutro()
  a.luz.exposicao = 0.5
  const comBase = criarPonto(a, { ...contexto, exposicaoBase: 0.5 })
  aplicar(comBase, c).forEach((v, i) => perto(v, c[i] * 2, 1e-12))
})

test('cada controle escalar: no neutro não mexe em nada', () => {
  const rnd = sorteio(2)
  const amostra = []
  for (let i = 0; i < 300; i++) amostra.push([rnd() * 3, rnd() * 3, rnd() * 3])
  const referencia = com(() => {})
  for (const [caminho, c] of Object.entries(CONTROLES)) {
    const a = neutro()
    const partes = caminho.split('.')
    let o = a
    for (let i = 0; i < partes.length - 1; i++) o = o[partes[i]]
    o[partes[partes.length - 1]] = c.neutro
    const ponto = criarPonto(normalizar(a), contexto)
    for (const cor of amostra) assert.deepEqual(aplicar(ponto, cor), aplicar(referencia, cor), caminho)
  }
})

test('luz: cinza médio preso e cada controle monótono no sentido esperado, em EV', () => {
  // [controle, EV onde medir, sentido esperado com o controle subindo]
  const casos = [
    ['contraste', 2, +1],
    ['contraste', -2, -1],
    ['altas', 2.5, +1],
    ['sombras', -3, +1],
    ['brancos', 4, +1],
    ['pretos', -6, +1],
  ]
  for (const [nome, onde, sentido] of casos) {
    let anterior = -Infinity * sentido
    for (let valor = -100; valor <= 100; valor += 25) {
      const ponto = com((a) => (a.luz[nome] = valor))
      // o cinza médio não sai do lugar
      perto(ev(aplicar(ponto, cinza(0))), 0, 2e-6, `${nome} ${valor}: cinza`)
      const saida = ev(aplicar(ponto, cinza(onde)))
      assert.ok(sentido > 0 ? saida > anterior : saida < anterior, `${nome} ${valor} em ${onde} EV: ${saida} depois de ${anterior}`)
      anterior = saida
      if (valor === 0) perto(saida, onde, 1e-9, `${nome} neutro`)
    }
  }
  // as faixas documentadas: o deslocamento máximo de cada controle, no patamar
  const desloca = (nome, onde) => ev(aplicar(com((a) => (a.luz[nome] = 100)), cinza(onde))) - onde
  perto(desloca('altas', 5), LUZ.altas.ev, 1e-4, 'altas +100 acima de +3 EV')
  perto(desloca('sombras', -6), LUZ.sombras.ev, 1e-4, 'sombras +100 abaixo de −4 EV')
  perto(desloca('brancos', 6), LUZ.brancos.ev, 1e-4, 'brancos +100 acima de +4,5 EV')
  perto(desloca('pretos', -9), LUZ.pretos.ev, 1e-4, 'pretos +100 abaixo de −7 EV')
  // cada controle só age do seu lado do cinza
  perto(desloca('altas', -2), 0, 1e-6, 'altas não mexe na sombra')
  perto(desloca('sombras', 2), 0, 1e-6, 'sombras não mexe na alta luz')
  perto(desloca('brancos', 1), 0, 1e-6, 'brancos só acima de +1,5 EV')
  perto(desloca('pretos', -2), 0, 1e-6, 'pretos só abaixo de −3 EV')
  // contraste: a inclinação no cinza é 1,5^(c/100)
  const d = 1e-3
  const inclinacao = (c) => (ev(aplicar(com((a) => (a.luz.contraste = c)), cinza(d))) - ev(aplicar(com((a) => (a.luz.contraste = c)), cinza(-d)))) / (2 * d)
  perto(inclinacao(100), 1.5, 2e-3)
  perto(inclinacao(-100), 1 / 1.5, 2e-3)
})

test('luz: qualquer combinação de controles dá uma curva monótona e sem quina (C1) em EV', () => {
  const extremos = [-100, 0, 100]
  let combinacoes = 0
  for (const contraste of extremos) for (const altas of extremos) for (const sombras of extremos) for (const brancos of extremos) for (const pretos of extremos) {
    const f = curvaDeLuz({ contraste, altas, sombras, brancos, pretos })
    combinacoes++
    const h = 1 / 64
    let anterior = f(EV_MIN)
    let inclinacaoAnterior = null
    for (let e = EV_MIN + h; e <= EV_MAX; e += h) {
      const y = f(e)
      const inclinacao = (y - anterior) / h
      assert.ok(inclinacao > 0.02, `monótona em ${e} EV (${[contraste, altas, sombras, brancos, pretos]}): inclinação ${inclinacao}`)
      // sem quina: a inclinação não pula de um passo para o outro
      if (inclinacaoAnterior != null) assert.ok(Math.abs(inclinacao - inclinacaoAnterior) < 0.08, `C1 em ${e} EV: ${inclinacaoAnterior} → ${inclinacao}`)
      inclinacaoAnterior = inclinacao
      anterior = y
    }
    perto(f(0), 0, 1e-12, 'cinza')
  }
  assert.equal(combinacoes, 243)
})

test('luz: mesma resposta em qualquer foto — o ganho depende só do EV do pixel, e a cor não muda', () => {
  const ponto = com((a) => Object.assign(a.luz, { contraste: 40, altas: -60, sombras: 50, brancos: 20, pretos: -30 }))
  for (const cor of cores) {
    for (const e of [-5, -2, 0.7, 3]) {
      const k = 2 ** (e - ev(cor))
      const entrada = cor.map((v) => v * k)
      const saida = aplicar(ponto, entrada)
      // o mesmo EV de entrada dá o mesmo EV de saída, seja qual for a cor
      perto(ev(saida), ev(aplicar(ponto, cinza(e))), 1e-5, 'ganho pelo EV')
      // e a razão entre canais fica igual (o matiz e a saturação não mudam com a luz)
      perto(saida[0] / saida[1], entrada[0] / entrada[1], 1e-9)
      perto(saida[2] / saida[1], entrada[2] / entrada[1], 1e-9)
    }
  }
})

test('curva paramétrica e curva de pontos: neutras, monótonas, sem ultrapassar', () => {
  assert.equal(criarParametrica({ sombras: 0, escuros: 0, claros: 0, altas: 0 }), null)
  for (const s of [-100, 100]) for (const e of [-100, 100]) for (const c of [-100, 100]) for (const al of [-100, 100]) {
    const f = criarParametrica({ sombras: s, escuros: e, claros: c, altas: al })
    perto(f(0), 0, 1e-12)
    perto(f(1), 1, 1e-12)
    let anterior = -1
    for (let x = 0; x <= 1.0001; x += 1 / 512) {
      const y = f(x)
      assert.ok(y > anterior, `paramétrica monótona em ${x} (${[s, e, c, al]})`)
      anterior = y
    }
  }
  // cada região sobe a sua parte da curva
  for (const [nome, x] of [['sombras', 0.2], ['escuros', 0.375], ['claros', 0.625], ['altas', 0.8]]) {
    assert.ok(criarParametrica({ [nome]: 100 })(x) > x + 0.05, nome)
    assert.ok(criarParametrica({ [nome]: -100 })(x) < x - 0.05, nome)
  }
  // Fritsch-Carlson: passa pelos pontos, monótona quando os pontos são, nunca sai do intervalo entre dois pontos
  const pontos = [[0, 0.05], [0.2, 0.1], [0.25, 0.4], [0.6, 0.45], [0.9, 0.95], [1, 1]]
  const f = criarCurvaDePontos(pontos)
  for (const [x, y] of pontos) perto(f(x), y, 1e-12)
  let anterior = -1
  for (let x = 0; x <= 1; x += 1 / 1024) {
    const y = f(x)
    assert.ok(y >= anterior - 1e-12, `pontos: monótona em ${x}`)
    anterior = y
    const i = pontos.findIndex((p) => p[0] > x)
    if (i > 0) assert.ok(y >= pontos[i - 1][1] - 1e-12 && y <= pontos[i][1] + 1e-12, 'sem ultrapassar')
  }
  const reta = criarCurvaDePontos([[0, 0], [1, 1]])
  for (const x of [0, 0.3, 1]) perto(reta(x), x, 1e-12)
  // na cadeia: a reta não liga o passo; a curva em S sobe o claro e desce o escuro; a curva do canal mexe só nele
  assert.equal(com((a) => (a.curva.pontos.luz = [[0, 0], [1, 1]])).uniformes.passos.tom, false)
  const emS = com((a) => (a.curva.pontos.luz = [[0, 0], [0.25, 0.18], [0.75, 0.82], [1, 1]]))
  assert.ok(ev(aplicar(emS, cinza(1.5))) > 1.5)
  assert.ok(ev(aplicar(emS, cinza(-2))) < -2)
  const soVermelho = aplicar(com((a) => (a.curva.pontos.r = [[0, 0], [0.5, 0.6], [1, 1]])), [0.2, 0.2, 0.2])
  assert.ok(soVermelho[0] > 0.2 && soVermelho[1] === 0.2 && soVermelho[2] === 0.2)
  // preto levantado (o "fosco" das predefinições): nada fica abaixo do piso, nem ruído negativo
  const fosco = com((a) => (a.curva.pontos.luz = [[0, 0.12], [1, 1]]))
  const piso = norma(aplicar(fosco, [0, 0, 0]))
  assert.ok(piso > 0.002, `piso do fosco em ${piso}`)
  for (const c of [[-0.01, 0.001, -0.002], [1e-9, 1e-9, 1e-9], [0.0001, 0.0002, 0.0001]]) assert.ok(norma(aplicar(fosco, c)) >= piso - 1e-9)
  // acima do branco da curva as altas luzes continuam distintas (nada é cortado na cena)
  assert.ok(norma(aplicar(emS, cinza(7))) > norma(aplicar(emS, cinza(6))) * 1.9)
})

test('branco: adaptação CAT16 nos modos original, manual e auto', () => {
  const c = [0.3, 0.3, 0.3]
  // original não mexe; manual com o branco da própria foto também não
  assert.deepEqual(aplicar(com((a) => (a.branco.modo = 'original')), c), c)
  assert.deepEqual(aplicar(com((a) => Object.assign(a.branco, { modo: 'manual', temperatura: 5200, tinta: 8 })), c), c)
  // dizer que a luz era mais azul (mais kelvin) esquenta a foto; mais verde (tinta +), puxa para o magenta
  let anterior = 0
  for (const temperatura of [2500, 3500, 5200, 7000, 12000, 40000]) {
    const s = aplicar(com((a) => Object.assign(a.branco, { modo: 'manual', temperatura, tinta: 8 })), c)
    assert.ok(s[0] / s[2] > anterior, `temperatura ${temperatura}: vermelho/azul ${s[0] / s[2]}`)
    anterior = s[0] / s[2]
  }
  anterior = Infinity
  for (const tinta of [-100, -40, 8, 60, 150]) {
    const s = aplicar(com((a) => Object.assign(a.branco, { modo: 'manual', temperatura: 5200, tinta })), c)
    const verde = s[1] / (s[0] + s[2])
    assert.ok(verde < anterior, `tinta ${tinta}: verde ${verde}`)
    anterior = verde
  }
  // a conta: um objeto que tem a cor da luz nova (vista com o branco antigo) fica neutro
  const de = { kelvin: 5200, tinta: 8 }
  const para = { kelvin: 3400, tinta: -12 }
  const M = matrizDeBranco(de, para)
  const xyz = (b) => xyParaXYZ(xyDeTemperatura(b.kelvin, b.tinta))
  // cor da luz nova na foto equilibrada para a antiga: CAT16(antiga → D65) aplicada ao branco novo
  const u = uniformes(normalizar(neutro()), contexto)
  assert.ok(u.entrada.every((v, i) => v === (i % 4 === 0 ? 1 : 0)))
  const emFoto = mulV(xyzParaRgb('rec2020'), xyz(para))
  const antigo = mulV(xyzParaRgb('rec2020'), xyz(de))
  // em cones de von Kries a razão é a que importa: aplica M à cor "luz nova / luz antiga" e espera neutro
  const cones = mulV(matrizDeBranco(de, de), [1, 1, 1])
  assert.deepEqual(cones, [1, 1, 1])
  const ida = mulV(M, mulV(matrizDeBranco(para, de), [0.4, 0.4, 0.4]))
  ida.forEach((v) => perto(v, 0.4, 1e-12, 'ida e volta do branco'))
  assert.ok(emFoto[0] / emFoto[2] > antigo[0] / antigo[2], 'a luz de 3400 K é mais vermelha')
  const neutroDepois = mulV(M, [1, 1, 1])
  assert.ok(neutroDepois[2] / neutroDepois[0] > 1.3, 'descontar a luz quente esfria a foto')
  // auto: usa o branco medido que vem no contexto; sem ele, não mexe
  const a = neutro()
  a.branco.modo = 'auto'
  assert.deepEqual(aplicar(criarPonto(a, contexto), c), c)
  const auto = aplicar(criarPonto(a, { ...contexto, brancoAuto: { kelvin: 7000, tinta: 8 } }), c)
  const manual = aplicar(com((x) => Object.assign(x.branco, { modo: 'manual', temperatura: 7000, tinta: 8 })), c)
  assert.deepEqual(auto, manual)
})

test('misturador: os pesos das faixas somam 1 e uma faixa não vaza para a oposta', () => {
  for (let g = 0; g < 360; g += 0.5) {
    const w = pesosDasFaixas((g * Math.PI) / 180)
    perto(w.reduce((s, v) => s + v, 0), 1, 1e-12, `soma em ${g}°`)
    assert.ok(w.filter((v) => v > 0).length <= 2, 'só as duas vizinhas')
  }
  // no centro de cada faixa só ela pesa
  FAIXAS_MATIZ.forEach((g, i) => perto(pesosDasFaixas(matizDoCirculo(g))[i], 1, 1e-9, FAIXAS[i]))
  // a cor pura de cada faixa (o círculo de cores), em Rec.2020 linear
  const pura = (graus) => {
    const h = graus / 60
    const x = 1 - Math.abs((h % 2) - 1)
    const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x]
    return deSrgb8(r * 200, g * 200, b * 200)
  }
  for (let i = 0; i < 8; i++) {
    const oposta = (i + 4) % 8
    for (const controle of ['matiz', 'saturacao', 'luz']) {
      const ponto = com((a) => (a.misturador[controle][i] = -100))
      const corOposta = pura(FAIXAS_MATIZ[oposta])
      aplicar(ponto, corOposta).forEach((v, k) => perto(v, corOposta[k], 1e-6, `${FAIXAS[i]} ${controle} vazou para ${FAIXAS[oposta]}`))
      // e mexe na própria faixa
      const propria = pura(FAIXAS_MATIZ[i])
      const saida = aplicar(ponto, propria)
      assert.ok(Math.hypot(...saida.map((v, k) => v - propria[k])) > 0.01, `${FAIXAS[i]} ${controle} não mexeu na própria cor`)
      // cinza nunca muda
      aplicar(ponto, [0.18, 0.18, 0.18]).forEach((v) => perto(v, 0.18, 1e-6, `cinza com ${FAIXAS[i]} ${controle}`))
    }
  }
})

test('misturador: matiz, saturação e luz por faixa andam no sentido esperado', () => {
  const azul = deSrgb8(40, 80, 220)
  const [, c0, h0] = oklch(...azul)
  // saturação: monótona, −100 tira a cor da faixa
  let anterior = -1
  for (const v of [-100, -50, 0, 50, 100]) {
    const c = oklch(...aplicar(com((a) => (a.misturador.saturacao[5] = v)), azul))[1]
    assert.ok(c > anterior, `saturação do azul em ${v}`)
    anterior = c
  }
  assert.ok(oklch(...aplicar(com((a) => (a.misturador.saturacao[5] = -100)), deSrgb8(0, 0, 200)))[1] < 0.004, 'azul puro sem cor')
  // luz: monótona, mexe na luz e deixa a croma relativa e o matiz
  anterior = -Infinity
  for (const v of [-100, -50, 0, 50, 100]) {
    const [L, C, h] = oklch(...aplicar(com((a) => (a.misturador.luz[5] = v)), azul))
    assert.ok(L > anterior, `luz do azul em ${v}`)
    anterior = L
    perto(h, h0, 1e-3, 'matiz')
  }
  // matiz: positivo anda para a faixa seguinte (azul → roxo), negativo para a anterior (azul → ciano), sem mudar a croma
  const mais = oklch(...aplicar(com((a) => (a.misturador.matiz[5] = 100)), azul))
  const menos = oklch(...aplicar(com((a) => (a.misturador.matiz[5] = -100)), azul))
  assert.ok(mais[2] > h0 + 5 && menos[2] < h0 - 5, `matiz ${menos[2]} < ${h0} < ${mais[2]}`)
  perto(mais[1], c0, 2e-3, 'croma')
  // mesma resposta em qualquer exposição: a cadeia de cor é homogênea
  const ponto = com((a) => {
    a.misturador.matiz[1] = 60
    a.misturador.saturacao[3] = -40
    a.misturador.luz[5] = -50
    a.cor.vibracao = 40
    a.cor.saturacao = 20
    a.tonalizacao.global = { matiz: 30, saturacao: 20, luz: 0 }
  })
  for (const cor of cores) {
    const base = aplicar(ponto, cor)
    const dobro = aplicar(ponto, cor.map((v) => v * 8))
    dobro.forEach((v, k) => perto(v / 8, base[k], 1e-5 * Math.max(1e-3, Math.abs(base[k])) + 1e-9, 'homogênea'))
  }
})

test('saturação e vibração: neutro fica neutro, sentido certo, pele e cor já saturada protegidas', () => {
  for (const cor of cores) {
    let anterior = -1
    for (const v of [-100, -50, 0, 50, 100]) {
      const [, C] = oklch(...aplicar(com((a) => (a.cor.saturacao = v)), cor))
      assert.ok(C >= anterior, `saturação ${v}`)
      anterior = C
    }
    anterior = -1
    for (const v of [-100, -50, 0, 50, 100]) {
      const [, C] = oklch(...aplicar(com((a) => (a.cor.vibracao = v)), cor))
      assert.ok(C >= anterior - 1e-9, `vibração ${v}`)
      anterior = C
    }
    // saturação −100: preto e branco
    assert.ok(oklch(...aplicar(com((a) => (a.cor.saturacao = -100)), cor))[1] < 1e-6)
    // o matiz e a luz não mudam
    const antes = oklch(...cor)
    const depois = oklch(...aplicar(com((a) => (a.cor.saturacao = 40)), cor))
    perto(depois[0], antes[0], 1e-6, 'luz')
    if (antes[1] > 0.01) perto(depois[2], antes[2], 1e-3, 'matiz')
  }
  for (const v of [0.01, 0.18, 3]) {
    for (const controle of ['saturacao', 'vibracao']) {
      aplicar(com((a) => (a.cor[controle] = 100)), [v, v, v]).forEach((s) => perto(s, v, 1e-6 * v, `cinza com ${controle}`))
    }
  }
  const ganho = (cor) => oklch(...aplicar(com((a) => (a.cor.vibracao = 100)), cor))[1] / oklch(...cor)[1]
  // mesma croma relativa, matizes diferentes: a pele ganha menos que o azul
  const pele = deSrgb8(194, 150, 130)
  const [Lp, Cp] = oklch(...pele)
  const azulado = deSrgb8(130, 160, 196)
  assert.ok(ganho(pele) < ganho(azulado) - 0.1, `pele ${ganho(pele)} contra azul ${ganho(azulado)} (croma da pele ${Cp / Lp})`)
  // mesma cor, mais saturada: ganha menos
  assert.ok(ganho(deSrgb8(20, 60, 230)) < ganho(deSrgb8(110, 130, 190)) - 0.2)
  assert.ok(ganho(deSrgb8(110, 130, 190)) > 1.4, 'cor apagada ganha de verdade')
})

test('P&B: croma zero, mistura por faixa, e a tonalização por cima (sépia)', () => {
  const pb = com((a) => (a.pb.ativo = true))
  for (const cor of cores) {
    const s = aplicar(pb, cor)
    assert.ok(s[0] === s[1] && s[1] === s[2], `croma zero: ${s}`)
    // a luz é a de Oklab: o cinza continua onde estava
    perto(Math.cbrt(s[0]), oklch(...cor)[0], 1e-9)
  }
  // (a primeira linha da matriz publicada de Oklab soma 0,9999999935: daí os 4e-9)
  aplicar(pb, [0.18, 0.18, 0.18]).forEach((v) => perto(v, 0.18, 1e-8))
  // mistura: escurecer o azul escurece o céu e não mexe no laranja nem no cinza
  const mistura = com((a) => {
    a.pb.ativo = true
    a.pb.mistura[5] = -100
  })
  const ceu = deSrgb8(60, 110, 220)
  assert.ok(aplicar(mistura, ceu)[0] < aplicar(pb, ceu)[0] * 0.6)
  const laranja = deSrgb8(214, 126, 44)
  perto(aplicar(mistura, laranja)[0], aplicar(pb, laranja)[0], 1e-6)
  perto(aplicar(mistura, [0.4, 0.4, 0.4])[0], 0.4, 1e-6)
  // a mistura sem o P&B ligado não faz nada
  assert.equal(com((a) => (a.pb.mistura[5] = -100)).uniformes.passos.cor, false)
  // sépia: P&B + tonalização global dá a mesma cor em todos os pixels (só a luz varia)
  const sepia = com((a) => {
    a.pb.ativo = true
    a.tonalizacao.global = { matiz: 40, saturacao: 40, luz: 0 }
  })
  const matizes = cores.map((cor) => oklch(...aplicar(sepia, cor)))
  for (const m of matizes) {
    perto(m[2], matizes[0][2], 1e-6, 'um matiz só')
    perto(m[1] / m[0], matizes[0][1] / matizes[0][0], 1e-6, 'uma croma relativa só')
    assert.ok(m[1] / m[0] > 0.03)
  }
})

test('tonalização: cada zona tinge a sua parte; equilíbrio e mistura movem a fronteira', () => {
  const tinge = (mexe, e) => {
    const s = oklch(...aplicar(com(mexe), cinza(e)))
    return s[1] / s[0]
  }
  const azulNasSombras = (a) => (a.tonalizacao.sombras = { matiz: 240, saturacao: 60, luz: 0 })
  const laranjaNasAltas = (a) => (a.tonalizacao.altas = { matiz: 30, saturacao: 60, luz: 0 })
  assert.ok(tinge(azulNasSombras, -4) > 0.05 && tinge(azulNasSombras, 2.5) < 1e-6, 'sombras só na sombra')
  assert.ok(tinge(laranjaNasAltas, 2.5) > 0.05 && tinge(laranjaNasAltas, -4) < 1e-6, 'altas só na alta luz')
  assert.ok(tinge((a) => (a.tonalizacao.meios = { matiz: 120, saturacao: 60, luz: 0 }), 0) > 0.05)
  assert.ok(tinge((a) => (a.tonalizacao.meios = { matiz: 120, saturacao: 60, luz: 0 }), -5) < 1e-6)
  for (const e of [-5, 0, 3]) perto(tinge((a) => (a.tonalizacao.global = { matiz: 300, saturacao: 50, luz: 0 }), e), 0.06, 1e-3, 'global em tudo')
  // saturação monótona e o matiz é o do círculo de cores
  let anterior = -1
  for (const s of [0, 25, 50, 100]) {
    const t = tinge((a) => (a.tonalizacao.global = { matiz: 200, saturacao: s, luz: 0 }), 0)
    assert.ok(t > anterior)
    anterior = t
  }
  const h = oklch(...aplicar(com((a) => (a.tonalizacao.global = { matiz: 240, saturacao: 30, luz: 0 })), cinza(0)))[2]
  perto(h, ((matizDoCirculo(240) * 180) / Math.PI + 360) % 360, 0.5, 'matiz da roda')
  // equilíbrio positivo: mais da foto conta como alta luz
  const noCinza = (equilibrio) => tinge((a) => {
    laranjaNasAltas(a)
    a.tonalizacao.equilibrio = equilibrio
  }, -0.5)
  assert.ok(noCinza(100) > noCinza(0) && noCinza(0) > noCinza(-100))
  // mistura: mais mistura, mais as altas entram abaixo do pivô
  const comMistura = (mistura) => tinge((a) => {
    laranjaNasAltas(a)
    a.tonalizacao.mistura = mistura
  }, -1)
  assert.ok(comMistura(100) > comMistura(50) && comMistura(50) > comMistura(0))
  // luz por zona
  assert.ok(ev(aplicar(com((a) => (a.tonalizacao.sombras = { matiz: 0, saturacao: 0, luz: 100 })), cinza(-4))) > -3.2)
  perto(ev(aplicar(com((a) => (a.tonalizacao.sombras = { matiz: 0, saturacao: 0, luz: 100 })), cinza(3))), 3, 1e-6)
})

test('calibração: neutra é identidade, o branco nunca muda, as primárias andam no sentido do círculo', () => {
  assert.deepEqual(matrizDeCalibracao(neutro().calibracao), [1, 0, 0, 0, 1, 0, 0, 0, 1])
  const rnd = sorteio(4)
  for (let i = 0; i < 50; i++) {
    const cal = {}
    for (const k of ['vermelhoMatiz', 'vermelhoSaturacao', 'verdeMatiz', 'verdeSaturacao', 'azulMatiz', 'azulSaturacao']) cal[k] = Math.round(rnd() * 200 - 100)
    mulV(matrizDeCalibracao(cal), [1, 1, 1]).forEach((v) => perto(v, 1, 1e-12, 'branco'))
  }
  const vermelho = deSrgb8(200, 40, 40)
  const h0 = oklch(...vermelho)[2]
  const c0 = oklch(...vermelho)[1]
  assert.ok(oklch(...aplicar(com((a) => (a.calibracao.vermelhoMatiz = 100)), vermelho))[2] > h0 + 3, 'vermelho + vai para o laranja')
  assert.ok(oklch(...aplicar(com((a) => (a.calibracao.vermelhoMatiz = -100)), vermelho))[2] < h0 - 3, 'vermelho − vai para o magenta')
  assert.ok(oklch(...aplicar(com((a) => (a.calibracao.vermelhoSaturacao = 100)), vermelho))[1] > c0 * 1.1)
  assert.ok(oklch(...aplicar(com((a) => (a.calibracao.vermelhoSaturacao = -100)), vermelho))[1] < c0 * 0.9)
  // tinta das sombras: magenta (+) ou verde (−) só no escuro
  const escuro = aplicar(com((a) => (a.calibracao.sombrasTinta = 100)), cinza(-4))
  assert.ok(escuro[1] < escuro[0] && escuro[1] < escuro[2], 'magenta na sombra')
  const verde = aplicar(com((a) => (a.calibracao.sombrasTinta = -100)), cinza(-4))
  assert.ok(verde[1] > verde[0] && verde[1] > verde[2], 'verde na sombra')
  aplicar(com((a) => (a.calibracao.sombrasTinta = 100)), cinza(1)).forEach((v) => perto(v, cinza(1)[0], 1e-9, 'claro não muda'))
})

test('desbotar: levanta o preto, monótono, sem tocar na razão das altas', () => {
  let anterior = -1
  for (const v of [0, 25, 50, 100]) {
    const s = aplicar(com((a) => (a.efeitos.desbotar = v)), [0, 0, 0])
    assert.ok(s[0] > anterior)
    anterior = s[0]
  }
  perto(anterior, VEU, 1e-12)
  const alto = aplicar(com((a) => (a.efeitos.desbotar = 100)), [4, 4, 4])
  perto(alto[0], 4 + VEU, 1e-12)
})

test('uniformes: os números que a GPU recebe, e a conta em bloco igual à conta por pixel', () => {
  const a = neutro()
  Object.assign(a.luz, { exposicao: 0.3, contraste: 25, altas: -40, sombras: 30 })
  a.cor.vibracao = 30
  a.misturador.luz[5] = -30
  a.misturador.matiz[1] = 20
  a.tonalizacao.sombras = { matiz: 220, saturacao: 20, luz: -10 }
  a.curva.pontos.r = [[0, 0], [0.5, 0.55], [1, 1]]
  a.curva.claros = 30
  a.calibracao.azulSaturacao = 20
  a.efeitos.desbotar = 10
  a.branco = { modo: 'manual', temperatura: 6100, tinta: 12 }
  const u = uniformes(normalizar(a), contexto)
  assert.ok(Object.entries(u.passos).every(([k, v]) => v === (k !== 'pb')), JSON.stringify(u.passos))
  for (const m of [u.entrada, u.calibracao, u.cor.paraLms, u.cor.deLms, u.cor.lmsParaLab, u.cor.labParaLms]) assert.ok(m.length === 9 && m.every(Number.isFinite))
  assert.ok(u.tom.tabela instanceof Float32Array && u.tom.tabela.length === (u.tom.evMax - u.tom.evMin) * u.tom.passosPorEv + 2)
  assert.ok(u.tom.tabela.every((v) => Number.isFinite(v) && v > 0))
  assert.equal(u.canais.length, 3)
  assert.ok(u.canais.every((t) => t instanceof Float32Array && t.length === u.tom.tabela.length))
  assert.ok(u.cor.matiz.tabela instanceof Float32Array && u.cor.matiz.tabela.length === (u.cor.matiz.tamanho + 1) * u.cor.matiz.colunas)
  assert.equal(u.eps, EPS)
  assert.equal(u.cinza, CINZA)
  // determinístico
  const u2 = uniformes(normalizar(a), contexto)
  assert.deepEqual(u.tom.tabela, u2.tom.tabela)
  assert.deepEqual(u.cor.matiz.tabela, u2.cor.matiz.tabela)
  // bloco = pixel (a menos do float32 do bloco)
  const ponto = criarPonto(normalizar(a), contexto)
  const rnd = sorteio(6)
  const n = 4000
  const dados = new Float32Array(n * 3)
  for (let i = 0; i < dados.length; i++) dados[i] = rnd() ** 3 * 4 - 0.001
  const copia = Float32Array.from(dados)
  ponto.aplicarEm(dados, n)
  for (let i = 0; i < n; i++) {
    const s = ponto.aplicar(copia[i * 3], copia[i * 3 + 1], copia[i * 3 + 2], [0, 0, 0])
    for (let k = 0; k < 3; k++) perto(dados[i * 3 + k], s[k], 1e-6 * Math.max(1, Math.abs(s[k])), 'bloco contra pixel')
    assert.ok(s.every(Number.isFinite))
  }
})

test('desempenho da cadeia de ponto (ns por pixel, medido)', (t) => {
  const rnd = sorteio(7)
  const n = 400000
  const dados = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const cor = cores[(rnd() * 24) | 0]
    const k = 2 ** (rnd() * 6 - 4)
    dados.set(cor.map((v) => v * k), i * 3)
  }
  const medir = (nome, mexe) => {
    const ponto = com(mexe)
    const d = Float32Array.from(dados)
    ponto.aplicarEm(d, 20000)
    const t0 = performance.now()
    ponto.aplicarEm(d, n)
    const ns = ((performance.now() - t0) * 1e6) / n
    t.diagnostic(`${nome}: ${ns.toFixed(1)} ns/px`)
    return ns
  }
  medir('neutro', () => {})
  medir('luz', (a) => Object.assign(a.luz, { contraste: 20, altas: -30, sombras: 20 }))
  medir('luz + cor', (a) => {
    a.luz.contraste = 20
    a.cor.vibracao = 20
    a.cor.saturacao = 10
  })
  const tudo = medir('tudo ligado', (a) => {
    Object.assign(a.luz, { contraste: 20, altas: -30 })
    a.cor.vibracao = 30
    a.misturador.luz[5] = -30
    a.tonalizacao.sombras = { matiz: 220, saturacao: 20, luz: 0 }
    a.curva.pontos.r = [[0, 0], [0.5, 0.55], [1, 1]]
    a.calibracao.azulSaturacao = 20
    a.efeitos.desbotar = 10
  })
  // trava só o absurdo (a máquina de teste varia): 5 µs por pixel seria um laço quebrado
  assert.ok(tudo < 5000)
})
