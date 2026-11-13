// Vizinhança do motor: filtros de base, clareza e textura, neblina, ruído, nitidez, grão e vinheta.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { neutro } from '../src/motor/ajustes.js'
import { luminancia } from '../src/motor/cor/espacos.js'
import { LOCAL, aplicarLocal, caixa, campoDeGrao, contrasteLocal, estimarRuido, filtroGuiado, gaussiano, grao, limitesDaNitidez, luzDoAr, margemLocal, minimo, nitidez, reduzirRuido, temLocal, temRuido, tirarNeblina, vinheta } from '../src/motor/local.js'
import { cena, deltaE, sorteio } from './apoio-motor.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a} (tolerância ${tol})`)
const Y = luminancia('rec2020')

function bloco(imagem, extra = {}) {
  return { largura: imagem.largura, altura: imagem.altura, dados: Float32Array.from(imagem.dados), x0: 0, y0: 0, quadro: { largura: imagem.largura, altura: imagem.altura }, escala: 1, ...extra }
}

function cinza(largura, altura, f) {
  const dados = new Float32Array(largura * altura * 3)
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.fill(f(x, y), (y * largura + x) * 3, (y * largura + x) * 3 + 3)
  return { largura, altura, dados }
}

const ev = (imagem, x, y) => Math.log2(imagem.dados[(y * imagem.largura + x) * 3 + 1] / 0.18)

test('filtros de base: caixa, mínimo e gaussiano contra a conta direta; filtro guiado guarda a borda', () => {
  const rnd = sorteio(1)
  const w = 37
  const h = 23
  const plano = new Float32Array(w * h).map(() => rnd())
  for (const r of [1, 3, 8, 40]) {
    const rapida = caixa(plano, w, h, r)
    const menor = minimo(plano, w, h, r)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let soma = 0
        let n = 0
        let min = Infinity
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
            soma += plano[yy * w + xx]
            min = Math.min(min, plano[yy * w + xx])
            n++
          }
        }
        perto(rapida[y * w + x], soma / n, 1e-9, `caixa r=${r}`)
        assert.equal(menor[y * w + x], min, `mínimo r=${r}`)
      }
    }
  }
  assert.deepEqual([...caixa(plano, w, h, 0)], [...plano].map((v) => v))
  // gaussiano: constante fica constante, a média se mantém, o desvio de um impulso é o pedido
  const constante = new Float32Array(w * h).fill(0.7)
  for (const v of gaussiano(constante, w, h, 1.3)) perto(v, 0.7, 1e-6)
  const impulso = new Float32Array(41 * 41)
  impulso[20 * 41 + 20] = 1
  const g = gaussiano(impulso, 41, 41, 2)
  let soma = 0
  let m2 = 0
  for (let y = 0; y < 41; y++) for (let x = 0; x < 41; x++) {
    soma += g[y * 41 + x]
    m2 += g[y * 41 + x] * (x - 20) ** 2
  }
  perto(soma, 1, 1e-5, 'soma')
  perto(Math.sqrt(m2), 2, 0.02, 'desvio')
  // filtro guiado: degrau de 2 passa quase intacto com eps pequeno; textura fina some
  const degrau = new Float32Array(64 * 16)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) degrau[y * 64 + x] = (x < 32 ? 0 : 2) + 0.05 * Math.sin(x * 2.1 + y)
  const base = filtroGuiado(degrau, degrau, 64, 16, 4, 0.04)
  assert.ok(base[8 * 64 + 30] < 0.15 && base[8 * 64 + 33] > 1.85, 'a borda continua onde estava')
  let ondaAntes = 0
  let ondaDepois = 0
  for (let x = 4; x < 24; x++) {
    ondaAntes += Math.abs(degrau[8 * 64 + x] - degrau[8 * 64 + x + 1])
    ondaDepois += Math.abs(base[8 * 64 + x] - base[8 * 64 + x + 1])
  }
  assert.ok(ondaDepois < ondaAntes * 0.3, 'a textura fina foi alisada')
  const liso = new Float32Array(64 * 16).fill(1.5)
  for (const v of filtroGuiado(liso, liso, 64, 16, 5, 0.01)) perto(v, 1.5, 1e-6)
})

test('tudo neutro: nenhum passo de vizinhança mexe na imagem', () => {
  const imagem = cena(2, 96, 64)
  const a = neutro()
  assert.equal(temLocal(a), false)
  assert.equal(temRuido(a), false)
  assert.equal(margemLocal(a, { largura: 96, altura: 64 }, 1), 0)
  const b = bloco(imagem)
  aplicarLocal(b, a, {})
  reduzirRuido(b, { luz: 0, cor: 0, ruido: { a: 1e-4, b: 1e-6 } })
  assert.deepEqual(b.dados, imagem.dados)
  for (const f of [contrasteLocal, tirarNeblina, nitidez, grao, vinheta]) {
    const c = bloco(imagem)
    f(c, {})
    assert.deepEqual(c.dados, imagem.dados, f.name)
  }
})

test('clareza e textura: mexem no relevo, não no plano, e a borda não ganha halo', () => {
  // plano: nada muda
  const plano = bloco(cinza(200, 80, () => 0.3), { quadro: { largura: 4000, altura: 1600 }, x0: 1000, y0: 500 })
  contrasteLocal(plano, { textura: 100, clareza: 100 })
  for (const v of plano.dados) perto(v, 0.3, 1e-6)
  // onda de 0,2 EV de amplitude, período de 60 px numa foto de 4000 px: é clareza (o raio é 1,2% do lado maior = 48 px)
  const onda = (largura, periodo, amp) => cinza(largura, 60, (x) => 0.18 * 2 ** (amp * Math.sin((2 * Math.PI * x) / periodo)))
  const amplitude = (imagem) => {
    let lo = Infinity
    let hi = -Infinity
    for (let x = 150; x < imagem.largura - 150; x++) {
      const e = ev(imagem, x, 30)
      lo = Math.min(lo, e)
      hi = Math.max(hi, e)
    }
    return (hi - lo) / 2
  }
  const quadro = { largura: 4000, altura: 60 }
  let anterior = 0
  for (const clareza of [-100, -50, 0, 50, 100]) {
    const b = bloco(onda(600, 60, 0.1), { quadro })
    contrasteLocal(b, { clareza })
    const amp = amplitude(b)
    assert.ok(amp > anterior, `clareza ${clareza}: amplitude ${amp}`)
    anterior = amp
    if (clareza === 0) perto(amp, 0.1, 1e-4)
  }
  assert.ok(anterior > 0.14, 'clareza +100 aumenta o relevo em mais de 40%')
  // textura age no detalhe fino (período de 6 px) e a clareza também o pega; a textura não mexe na onda larga
  const fino = bloco(onda(600, 6, 0.05), { quadro })
  contrasteLocal(fino, { textura: 100 })
  assert.ok(amplitude(fino) > 0.065, `textura no fino: ${amplitude(fino)}`)
  const largo = bloco(onda(600, 200, 0.1), { quadro })
  contrasteLocal(largo, { textura: 100 })
  perto(amplitude(largo), 0.1, 0.01, 'textura não mexe na onda larga')
  // borda de 2 EV: o que passa além dos dois patamares (o halo) fica abaixo de 0,06 EV com tudo em +100
  const degrau = bloco(cinza(600, 60, (x) => (x < 300 ? 0.09 : 0.36)), { quadro })
  contrasteLocal(degrau, { textura: 100, clareza: 100 })
  let halo = 0
  for (let x = 20; x < 580; x++) halo = Math.max(halo, x < 300 ? Math.abs(ev(degrau, x, 30) + 1) : Math.abs(ev(degrau, x, 30) - 1))
  assert.ok(halo < 0.06, `halo de ${halo} EV numa borda de 2 EV`)
  // e a cor não muda: só a luz
  const cor = bloco(cena(5, 120, 80), { quadro: { largura: 1200, altura: 800 } })
  const antes = Float32Array.from(cor.dados)
  contrasteLocal(cor, { clareza: 60, textura: 40 })
  for (let i = 0; i < antes.length; i += 3) {
    if (antes[i + 1] < 1e-3) continue
    perto(cor.dados[i] / cor.dados[i + 1], antes[i] / antes[i + 1], 1e-4 * (antes[i] / antes[i + 1]), 'razão entre canais')
  }
})

test('nitidez: o halo numa borda degrau nunca passa do limite; plano não muda; a máscara segura o que não é borda', () => {
  const quadro = { largura: 400, altura: 40 }
  for (const [quantidade, detalhe, raio] of [[40, 25, 1], [150, 0, 1], [150, 100, 3], [80, 50, 0.5]]) {
    const { ganho, limite } = limitesDaNitidez({ nitidez: quantidade, detalhe })
    const degrau = bloco(cinza(400, 40, (x) => (x < 200 ? 0.12 : 0.24)), { quadro })
    nitidez(degrau, { nitidez: quantidade, raio, detalhe })
    let halo = 0
    for (let x = 10; x < 390; x++) {
      const e = ev(degrau, x, 20)
      halo = Math.max(halo, x < 200 ? Math.log2(0.12 / 0.18) - e : e - Math.log2(0.24 / 0.18))
    }
    assert.ok(halo > 0, 'a borda ficou mais dura')
    assert.ok(halo <= ganho * limite + 1e-4, `nitidez ${quantidade}, detalhe ${detalhe}: halo ${halo} EV, limite ${ganho * limite}`)
    // longe da borda nada muda
    perto(ev(degrau, 60, 20), Math.log2(0.12 / 0.18), 1e-5)
  }
  // o limite cresce com o detalhe e o ganho com a quantidade
  assert.ok(limitesDaNitidez({ nitidez: 40, detalhe: 100 }).limite > limitesDaNitidez({ nitidez: 40, detalhe: 0 }).limite)
  perto(limitesDaNitidez({ nitidez: 150 }).ganho, LOCAL.nitidez.ganho, 1e-12)
  // máscara: textura fraca (0,02 EV) perde a nitidez, a borda forte não
  const mista = () => bloco(cinza(400, 40, (x, y) => (x < 200 ? 0.12 : 0.24) * 2 ** (0.02 * Math.sin(x * 1.9 + y * 0.7))), { quadro })
  const semMascara = mista()
  const comMascara = mista()
  const original = mista()
  nitidez(semMascara, { nitidez: 100, raio: 1, detalhe: 50 })
  nitidez(comMascara, { nitidez: 100, raio: 1, detalhe: 50, mascara: 80 })
  const mudou = (b, x0, x1) => {
    let s = 0
    for (let x = x0; x < x1; x++) s += Math.abs(ev(b, x, 20) - ev(original, x, 20))
    return s / (x1 - x0)
  }
  assert.ok(mudou(comMascara, 40, 160) < mudou(semMascara, 40, 160) * 0.15, 'a textura fraca ficou de fora')
  assert.ok(mudou(comMascara, 198, 202) > mudou(semMascara, 198, 202) * 0.7, 'a borda continua nítida')
  // na prévia reduzida o raio encolhe junto; quando some (menos de um quarto de pixel), a nitidez não roda
  const previa = bloco(cinza(100, 10, (x) => (x < 50 ? 0.12 : 0.24)), { quadro: { largura: 100, altura: 10 }, escala: 0.2 })
  nitidez(previa, { nitidez: 150, raio: 1 })
  assert.deepEqual(previa.dados, cinza(100, 10, (x) => (x < 50 ? 0.12 : 0.24)).dados)
})

test('ruído: o modelo do arquivo guia a limpeza — menos ruído, mesma média, borda no lugar', (t) => {
  const w = 240
  const h = 120
  const a = 3e-4
  const b = 2e-6
  const rnd = sorteio(11)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  // dois patamares (0,05 e 0,4) com ruído de Poisson + leitura por canal (ruído de cor incluído)
  const limpa = cinza(w, h, (x) => (x < w / 2 ? 0.05 : 0.4))
  const suja = { largura: w, altura: h, dados: Float32Array.from(limpa.dados, (v) => v + gauss() * Math.sqrt(a * v + b) * 1.7) }
  const medir = (imagem, x0, x1) => {
    let s = 0
    let s2 = 0
    let cor = 0
    let n = 0
    for (let y = 8; y < h - 8; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * w + x) * 3
        const v = Y[0] * imagem.dados[o] + Y[1] * imagem.dados[o + 1] + Y[2] * imagem.dados[o + 2]
        s += v
        s2 += v * v
        cor += (imagem.dados[o] - imagem.dados[o + 2]) ** 2
        n++
      }
    }
    return { media: s / n, desvio: Math.sqrt(s2 / n - (s / n) ** 2), cor: Math.sqrt(cor / n) }
  }
  const quadro = { largura: 6000, altura: 3000 }
  const ruido = { a, b }
  const antes = { escuro: medir(suja, 10, 100), claro: medir(suja, 140, 230) }
  const so = (opcoes) => {
    const bl = bloco(suja, { quadro })
    reduzirRuido(bl, { ...opcoes, ruido })
    return bl
  }
  const luz = so({ luz: 60 })
  const cor = so({ cor: 60 })
  const tudo = so({ luz: 100, cor: 100 })
  for (const [nome, x0, x1] of [['escuro', 10, 100], ['claro', 140, 230]]) {
    const l = medir(luz, x0, x1)
    const c = medir(cor, x0, x1)
    const m = medir(tudo, x0, x1)
    t.diagnostic(`${nome}: desvio de luz ${antes[nome].desvio.toExponential(2)} → ${l.desvio.toExponential(2)} (luz 60) → ${m.desvio.toExponential(2)} (100); ruído de cor ${antes[nome].cor.toExponential(2)} → ${c.cor.toExponential(2)} (cor 60)`)
    // o mesmo ajuste limpa igual no escuro e no claro: é para isso que a variância é estabilizada
    assert.ok(l.desvio < antes[nome].desvio * 0.5, `${nome}: luz 60 corta o desvio pela metade`)
    assert.ok(m.desvio < antes[nome].desvio * 0.25, `${nome}: luz 100 corta para um quarto`)
    assert.ok(c.cor < antes[nome].cor * 0.4, `${nome}: ruído de cor`)
    // só a cor: a luz fica como estava
    perto(c.desvio, antes[nome].desvio, antes[nome].desvio * 0.15, `${nome}: cor não mexe na luz`)
    // a média não ganha viés (menos de 1%)
    perto(m.media, antes[nome].media, antes[nome].media * 0.01, `${nome}: média`)
  }
  // a borda entre os patamares continua uma borda: a 3 px de cada lado o valor já é o do patamar (a 3%)
  const linha = (imagem, x) => {
    let s = 0
    for (let y = 8; y < h - 8; y++) s += imagem.dados[(y * w + x) * 3 + 1]
    return s / (h - 16)
  }
  perto(linha(tudo, w / 2 - 4), 0.05, 0.05 * 0.04, 'borda, lado escuro')
  perto(linha(tudo, w / 2 + 3), 0.4, 0.4 * 0.03, 'borda, lado claro')
  // sem modelo de ruído não há o que fazer
  const semModelo = bloco(suja, { quadro })
  reduzirRuido(semModelo, { luz: 80, cor: 80, ruido: null })
  assert.deepEqual(semModelo.dados, suja.dados)
  // estimativa para foto sem modelo: acerta o tamanho do ruído (fator de 2) e não confunde borda com ruído
  const estimado = estimarRuido(suja)
  assert.equal(estimado.origem, 'estimado')
  const previsto = a * 1.7 ** 2 * (Y[0] ** 2 + Y[1] ** 2 + Y[2] ** 2)
  assert.ok(estimado.a > previsto / 2 && estimado.a < previsto * 2, `a estimado ${estimado.a}, esperado perto de ${previsto}`)
  assert.ok(estimarRuido(limpa).a < previsto / 100, 'imagem limpa: quase nada')
})

test('grão: determinístico pela semente, igual em qualquer bloco, com a média no lugar', () => {
  const quadro = { largura: 400, altura: 300 }
  const base = cinza(400, 300, () => 0.18)
  const opcoes = { grao: 60, tamanho: 25, aspereza: 50, semente: 77 }
  const a = bloco(base)
  const b = bloco(base)
  grao(a, opcoes)
  grao(b, opcoes)
  assert.deepEqual(a.dados, b.dados, 'mesma foto, mesmo grão')
  const outra = bloco(base)
  grao(outra, { ...opcoes, semente: 78 })
  assert.notDeepEqual(outra.dados, a.dados, 'outra semente, outro grão')
  // um pedaço da foto recebe exatamente o grão que tem na foto inteira
  const pedaco = { largura: 100, altura: 80, dados: new Float32Array(100 * 80 * 3).fill(0.18), x0: 130, y0: 90, quadro, escala: 1 }
  grao(pedaco, opcoes)
  for (let y = 0; y < 80; y++) for (let x = 0; x < 100; x++) assert.equal(pedaco.dados[(y * 100 + x) * 3], a.dados[((y + 90) * 400 + x + 130) * 3])
  // estatística: o desvio em EV é o do controle (0,3 EV em 100), a média em EV é zero, os três canais andam juntos
  let s = 0
  let s2 = 0
  for (let i = 0; i < 400 * 300; i++) {
    const e = Math.log2(a.dados[i * 3] / 0.18)
    s += e
    s2 += e * e
    assert.equal(a.dados[i * 3], a.dados[i * 3 + 1])
  }
  const n = 400 * 300
  perto(s / n, 0, 0.01, 'média')
  perto(Math.sqrt(s2 / n - (s / n) ** 2), 0.6 * LOCAL.grao.ev, 0.6 * LOCAL.grao.ev * 0.05, 'desvio')
  // o campo: média 0 e desvio 1 (± 15%), e o tamanho muda a escala do grão
  let c = 0
  let c2 = 0
  for (let i = 0; i < 20000; i++) {
    const v = campoDeGrao(i * 7.31, i * 3.17, 2, 0.5, 5)
    c += v
    c2 += v * v
  }
  perto(c / 20000, 0, 0.03)
  perto(Math.sqrt(c2 / 20000), 1, 0.05)
  const vizinhos = (tamanho) => {
    const g = bloco(base, { quadro: { largura: 4000, altura: 3000 } })
    grao(g, { grao: 60, tamanho, aspereza: 0, semente: 3 })
    let d = 0
    for (let i = 0; i < 399; i++) d += Math.abs(g.dados[(150 * 400 + i) * 3] - g.dados[(150 * 400 + i + 1) * 3])
    return d
  }
  assert.ok(vizinhos(100) < vizinhos(0) * 0.6, 'grão maior varia mais devagar')
  // prévia reduzida a 1/4. Grão grande (célula de 16 px numa foto de 16000): a prévia mostra o MESMO grão, no mesmo
  // lugar. Grão fino (menor que o pixel da prévia): o desenho se perde, mas o desvio é o da média de 4×4 da foto cheia.
  const media4 = (b) => {
    const saida = new Float32Array(200 * 150)
    for (let y = 0; y < 150; y++) {
      for (let x = 0; x < 200; x++) {
        let m = 0
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) m += Math.log2(b.dados[((y * 4 + dy) * 800 + x * 4 + dx) * 3] / 0.18)
        saida[y * 200 + x] = m / 16
      }
    }
    return saida
  }
  const desvio = (v) => Math.sqrt(v.reduce((t, x) => t + x * x, 0) / v.length)
  for (const [ladoDaFoto, igual] of [[16000, true], [4000, false], [800, false]]) {
    const cheia = bloco(cinza(800, 600, () => 0.18), { quadro: { largura: ladoDaFoto, altura: ladoDaFoto * 0.75 } })
    grao(cheia, { grao: 80, tamanho: 100, aspereza: 0, semente: 9 })
    const previa = bloco(cinza(200, 150, () => 0.18), { quadro: { largura: ladoDaFoto / 4, altura: (ladoDaFoto * 0.75) / 4 }, escala: 0.25 })
    grao(previa, { grao: 80, tamanho: 100, aspereza: 0, semente: 9 })
    const deLonge = media4(cheia)
    const naPrevia = Float32Array.from({ length: 200 * 150 }, (_, i) => Math.log2(previa.dados[i * 3] / 0.18))
    perto(desvio(naPrevia), desvio(deLonge), desvio(deLonge) * 0.2, `foto de ${ladoDaFoto} px: desvio do grão na prévia`)
    if (igual) {
      let acordo = 0
      for (let i = 0; i < naPrevia.length; i++) acordo += naPrevia[i] * deLonge[i]
      const correlacao = acordo / (naPrevia.length * desvio(naPrevia) * desvio(deLonge))
      assert.ok(correlacao > 0.9, `a prévia e a foto cheia mostram o mesmo grão (correlação ${correlacao})`)
    }
  }
})

test('vinheta: centro intacto, cantos na força pedida, simétrica e contínua entre blocos', () => {
  const quadro = { largura: 300, altura: 200 }
  const base = cinza(300, 200, () => 0.18)
  const escura = bloco(base)
  vinheta(escura, { vinheta: -100, meio: 50, suavidade: 50 })
  perto(ev(escura, 150, 100), 0, 1e-6, 'centro')
  perto(ev(escura, 0, 0), -LOCAL.vinheta.ev, 0.05, 'canto')
  perto(ev(escura, 0, 0), ev(escura, 299, 199), 1e-6, 'simétrica')
  perto(ev(escura, 299, 0), ev(escura, 0, 199), 1e-6)
  const clara = bloco(base)
  vinheta(clara, { vinheta: 50, meio: 50, suavidade: 50 })
  perto(ev(clara, 0, 0), LOCAL.vinheta.ev / 2, 0.05, 'positiva clareia')
  // monótona do centro para o canto
  let anterior = 1
  for (let i = 0; i <= 100; i++) {
    const e = ev(escura, Math.round(150 - 1.5 * i), Math.round(100 - i))
    assert.ok(e <= anterior + 1e-6)
    anterior = e
  }
  // meio maior = começa mais longe do centro
  const longe = bloco(base)
  vinheta(longe, { vinheta: -100, meio: 100, suavidade: 50 })
  assert.ok(ev(longe, 60, 40) > ev(escura, 60, 40))
  // o bloco usa a posição no quadro
  const pedaco = { largura: 50, altura: 40, dados: new Float32Array(50 * 40 * 3).fill(0.18), x0: 250, y0: 160, quadro, escala: 1 }
  vinheta(pedaco, { vinheta: -100, meio: 50, suavidade: 50 })
  assert.equal(pedaco.dados[(39 * 50 + 49) * 3], escura.dados[(199 * 300 + 299) * 3])
})

test('neblina: tirar devolve o contraste da cena encoberta; pôr faz o contrário', () => {
  // cena nítida + véu: I = J·t + A·(1 − t), com t caindo da esquerda para a direita
  const nitida = cena(21, 240, 160, { ganho: 0.6 })
  const A = [0.8, 0.82, 0.85]
  const encoberta = { largura: 240, altura: 160, dados: new Float32Array(nitida.dados.length) }
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 240; x++) {
      const t = 0.75 - 0.4 * (x / 240)
      for (let c = 0; c < 3; c++) encoberta.dados[(y * 240 + x) * 3 + c] = nitida.dados[(y * 240 + x) * 3 + c] * t + A[c] * (1 - t)
    }
  }
  const ar = luzDoAr(encoberta)
  // a luz do ar medida é clara e quase neutra, como o véu
  assert.ok(ar[1] > 0.5 && Math.abs(ar[0] / ar[1] - A[0] / A[1]) < 0.15, `luz do ar ${ar}`)
  const limpa = bloco(encoberta)
  tirarNeblina(limpa, { quantidade: 100, ar })
  const antes = deltaE(nitida, encoberta)
  const depois = deltaE(nitida, limpa)
  assert.ok(depois.medio < antes.medio * 0.75, `mais perto da cena nítida: ${antes.medio} → ${depois.medio}`)
  // o contraste local (desvio do log da luz) sobe com a quantidade
  const contraste = (imagem) => {
    let s = 0
    let s2 = 0
    let n = 0
    for (let i = 0; i < imagem.largura * imagem.altura; i++) {
      const v = Math.log2(Math.max(1e-4, imagem.dados[i * 3 + 1]))
      s += v
      s2 += v * v
      n++
    }
    return Math.sqrt(s2 / n - (s / n) ** 2)
  }
  let anterior = 0
  for (const quantidade of [-100, -50, 0, 50, 100]) {
    const b = bloco(encoberta)
    tirarNeblina(b, { quantidade, ar })
    const c = contraste(b)
    assert.ok(c > anterior, `neblina ${quantidade}: contraste ${c}`)
    anterior = c
    assert.ok(b.dados.every(Number.isFinite))
  }
  // sem a luz do ar no contexto, o bloco mede a sua
  const sozinho = bloco(encoberta)
  tirarNeblina(sozinho, { quantidade: 100 })
  assert.ok(deltaE(sozinho, limpa).medio < 0.02)
})

test('escala proporcional: a prévia reduzida com os mesmos ajustes parece com a foto cheia reduzida', () => {
  const cheia = cena(31, 480, 320, { ganho: 0.7 })
  // reduz por média 2×2
  const reduzir = (imagem) => {
    const w = imagem.largura / 2
    const h = imagem.altura / 2
    const d = new Float32Array(w * h * 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      d[(y * w + x) * 3 + c] = (imagem.dados[(2 * y * imagem.largura + 2 * x) * 3 + c] + imagem.dados[(2 * y * imagem.largura + 2 * x + 1) * 3 + c] + imagem.dados[((2 * y + 1) * imagem.largura + 2 * x) * 3 + c] + imagem.dados[((2 * y + 1) * imagem.largura + 2 * x + 1) * 3 + c]) / 4
    }
    return { largura: w, altura: h, dados: d }
  }
  const a = neutro()
  a.presenca.clareza = 70
  a.presenca.neblina = 30
  a.efeitos.vinheta = -50
  const ar = luzDoAr(reduzir(cheia))
  const grande = bloco(cheia)
  aplicarLocal(grande, a, { ar })
  const pequena = bloco(reduzir(cheia), { escala: 0.5 })
  aplicarLocal(pequena, a, { ar })
  const efeito = deltaE(reduzir(cheia), pequena).medio
  const diferenca = deltaE(reduzir(grande), pequena).medio
  assert.ok(efeito > 0.03, `os ajustes mudam a imagem (${efeito})`)
  assert.ok(diferenca < efeito * 0.2, `prévia contra exportação: ${diferenca} (o efeito é ${efeito})`)
  // a margem que um bloco precisa acompanha a escala
  assert.ok(margemLocal(a, { largura: 480, altura: 320 }, 1) > margemLocal(a, { largura: 240, altura: 160 }, 0.5))
})
