// O motor inteiro: revelar (geometria, faixas, tela), os automáticos, os histogramas e a cartela de cores de ponta a
// ponta (cena → sensor → base → tela).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { neutro, normalizar } from '../src/motor/ajustes.js'
import { autoBranco, autoExposicao } from '../src/motor/auto.js'
import { baseDeImagem, prepararBase } from '../src/motor/base.js'
import { CURVAS, matrizEntre } from '../src/motor/cor/espacos.js'
import { mulV } from '../src/motor/cor/matriz.js'
import { histogramaDaCena, histogramaDaTela } from '../src/motor/histograma.js'
import { criarPonto } from '../src/motor/ponto.js'
import { contextoDe, geometria, paraBytes, revelar, revelarEmBytes } from '../src/motor/revelar.js'
import { CINZA, criarTela, telaDe } from '../src/motor/tela.js'
import { CARTELA, cena, deSrgb8, deltaECor, fotografar, latitudeDeTeste, oklch, sorteio } from './apoio-motor.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a} (tolerância ${tol})`)

// base montada à mão (cena já pronta), para os testes de geometria e de laço
function baseDe(imagem, extra = {}) {
  return {
    imagem,
    latitude: null,
    branco: { kelvin: 6500, tinta: 10 },
    origem: 'imagem',
    exposicaoBase: 0,
    orientacao: 1,
    ruido: null,
    reduzir: 1,
    folgaAltas: 0,
    ...extra,
  }
}

// imagem em que cada pixel tem um valor só dele
function numerada(largura, altura) {
  const dados = new Float32Array(largura * altura * 3)
  for (let i = 0; i < largura * altura; i++) dados.set([0.02 + i * 0.002, 0.03 + i * 0.001, 0.5 - i * 0.001], i * 3)
  return { largura, altura, dados }
}

// as oito orientações do EXIF, escritas do jeito mais direto possível (referência independente do motor)
function orientar(imagem, orientacao) {
  const { largura: w, altura: h, dados } = imagem
  const troca = orientacao >= 5
  const W = troca ? h : w
  const H = troca ? w : h
  const saida = new Float32Array(W * H * 3)
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      let x
      let y
      if (orientacao === 1) [x, y] = [u, v]
      else if (orientacao === 2) [x, y] = [w - 1 - u, v]
      else if (orientacao === 3) [x, y] = [w - 1 - u, h - 1 - v]
      else if (orientacao === 4) [x, y] = [u, h - 1 - v]
      else if (orientacao === 5) [x, y] = [v, u]
      else if (orientacao === 6) [x, y] = [v, h - 1 - u]
      else if (orientacao === 7) [x, y] = [w - 1 - v, h - 1 - u]
      else [x, y] = [w - 1 - v, u]
      for (let c = 0; c < 3; c++) saida[(v * W + u) * 3 + c] = dados[(y * w + x) * 3 + c]
    }
  }
  return { largura: W, altura: H, dados: saida }
}

function naTela(imagem, id = 'srgb') {
  const tela = criarTela(id)
  const dados = new Float32Array(imagem.dados.length)
  tela.aplicarEm(imagem.dados, dados, imagem.largura * imagem.altura)
  return { largura: imagem.largura, altura: imagem.altura, dados }
}

function iguais(a, b, tol, msg) {
  assert.deepEqual([a.largura, a.altura], [b.largura, b.altura], `${msg}: tamanho`)
  let pior = 0
  for (let i = 0; i < a.dados.length; i++) pior = Math.max(pior, Math.abs(a.dados[i] - b.dados[i]))
  assert.ok(pior <= tol, `${msg}: pior diferença ${pior}`)
}

test('geometria: orientação do EXIF, giro e espelho copiam os pixels certos, sem reamostrar', () => {
  const imagem = numerada(7, 5)
  for (let orientacao = 1; orientacao <= 8; orientacao++) {
    const saida = revelar(baseDe(imagem, { orientacao }), neutro())
    iguais(saida, naTela(orientar(imagem, orientacao)), 0, `orientação ${orientacao}`)
    assert.deepEqual(saida.quadro, { largura: saida.largura, altura: saida.altura })
  }
  const com = (g) => {
    const a = neutro()
    Object.assign(a.geometria, g)
    return revelar(baseDe(imagem), a)
  }
  // giro de 90° no sentido horário = orientação 6; 180° = 3; 270° = 8
  iguais(com({ giro: 90 }), naTela(orientar(imagem, 6)), 0, 'giro 90')
  iguais(com({ giro: 180 }), naTela(orientar(imagem, 3)), 0, 'giro 180')
  iguais(com({ giro: 270 }), naTela(orientar(imagem, 8)), 0, 'giro 270')
  iguais(com({ espelhoH: true }), naTela(orientar(imagem, 2)), 0, 'espelho horizontal')
  iguais(com({ espelhoV: true }), naTela(orientar(imagem, 4)), 0, 'espelho vertical')
  // a ordem: EXIF, depois giro, depois espelho (o espelho vale no que a pessoa vê)
  const a = neutro()
  Object.assign(a.geometria, { giro: 90, espelhoH: true })
  iguais(revelar(baseDe(imagem, { orientacao: 6 }), a), naTela(orientar(orientar(orientar(imagem, 6), 6), 2)), 0, 'EXIF + giro + espelho')
  assert.equal(geometria(baseDe(imagem), normalizar(a)).exata, true)
})

test('geometria: corte em fração do quadro e ângulo com o maior retângulo de mesma proporção', () => {
  const imagem = numerada(20, 10)
  const a = neutro()
  a.geometria.corte = { x: 0.25, y: 0.2, l: 0.5, a: 0.6 }
  const cortada = revelar(baseDe(imagem), a)
  assert.deepEqual([cortada.largura, cortada.altura], [10, 6])
  const inteira = naTela(imagem)
  for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) assert.equal(cortada.dados[(y * 10 + x) * 3], inteira.dados[((y + 2) * 20 + x + 5) * 3])
  // o corte vale no quadro já girado
  a.geometria.giro = 90
  const girada = revelar(baseDe(imagem), a)
  assert.deepEqual([girada.largura, girada.altura], [5, 12])

  // ângulo: imagem lisa continua lisa, e o quadro é o maior retângulo de mesma proporção que cabe
  const lisa = { largura: 300, altura: 200, dados: new Float32Array(300 * 200 * 3).fill(0.18) }
  for (const angulo of [-45, -7.5, 3, 20, 45]) {
    const b = neutro()
    b.geometria.angulo = angulo
    const g = geometria(baseDe(lisa), normalizar(b))
    const t = (Math.abs(angulo) * Math.PI) / 180
    const fator = 1 / (Math.cos(t) + 1.5 * Math.sin(t))
    assert.deepEqual([g.largura, g.altura], [Math.floor(300 * fator), Math.floor(200 * fator)], `ângulo ${angulo}`)
    assert.equal(g.exata, false)
    perto(g.largura / g.altura, 1.5, 0.02, 'proporção')
    const saida = revelar(baseDe(lisa), b)
    const esperado = CURVAS.srgb.codificar(CINZA)
    for (const v of saida.dados) perto(v, esperado, 1e-5, `ângulo ${angulo}: imagem lisa`)
    // os quatro cantos do quadro caem dentro da foto (nada de borda inventada)
    const [m0, m1, m2, m3, m4, m5] = g.mapa
    for (const [u, v] of [
      [0, 0],
      [g.largura, 0],
      [0, g.altura],
      [g.largura, g.altura],
    ]) {
      const x = m0 * u + m1 * v + m2
      const y = m3 * u + m4 * v + m5
      assert.ok(x >= -1e-6 && x <= 300 + 1e-6 && y >= -1e-6 && y <= 200 + 1e-6, `canto (${u}, ${v}) → (${x}, ${y})`)
    }
  }
  // sentido: ângulo positivo gira a foto no sentido horário — um ponto à direita do centro desce
  const ponto = { largura: 201, altura: 201, dados: new Float32Array(201 * 201 * 3).fill(0.05) }
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) ponto.dados.fill(2, ((100 + dy) * 201 + 160 + dx) * 3, ((100 + dy) * 201 + 160 + dx) * 3 + 3)
  const c = neutro()
  c.geometria.angulo = 30
  const rodada = revelar(baseDe(ponto), c)
  let melhor = [0, 0, -1]
  for (let y = 0; y < rodada.altura; y++)
    for (let x = 0; x < rodada.largura; x++)
      if (rodada.dados[(y * rodada.largura + x) * 3] > melhor[2]) melhor = [x, y, rodada.dados[(y * rodada.largura + x) * 3]]
  perto(melhor[0] - (rodada.largura - 1) / 2, 60 * Math.cos(Math.PI / 6), 1.5, 'x do ponto')
  perto(melhor[1] - (rodada.altura - 1) / 2, 60 * Math.sin(Math.PI / 6), 1.5, 'y do ponto')
  // a reamostragem não inventa valores fora dos vizinhos (sem anel escuro em volta da alta luz)
  let menor = Infinity
  for (const v of rodada.dados) menor = Math.min(menor, v)
  perto(menor, naTela({ largura: 1, altura: 1, dados: new Float32Array([0.05, 0.05, 0.05]) }).dados[0], 1e-6, 'sem valor abaixo do fundo')
  assert.throws(() => revelar(baseDe(imagem), neutro(), { regiao: { x: 15, y: 0, largura: 10, altura: 5 } }), /região/)
})

test('revelar em faixas e por região: o pedaço é igual ao mesmo pedaço da foto inteira, com tudo ligado', () => {
  const imagem = cena(3, 300, 200, { ganho: 0.6 })
  const { negativo } = fotografar(imagem, { ruido: { leitura: 3, ganho: 0.6 } })
  const base = prepararBase(negativo, { latitude: latitudeDeTeste() })
  const a = neutro()
  Object.assign(a.luz, { exposicao: 0.3, contraste: 20, altas: -30, sombras: 25 })
  Object.assign(a.presenca, { clareza: 40, textura: 30, neblina: 30 })
  Object.assign(a.detalhe, { nitidez: 60, ruidoLuz: 40, ruidoCor: 40, mascara: 30 })
  Object.assign(a.efeitos, { grao: 30, vinheta: -40 })
  a.geometria.angulo = 3
  a.cor.vibracao = 20
  a.branco.modo = 'auto'
  const inteira = revelar(base, a)
  assert.ok(inteira.dados.every((v) => v >= 0 && v <= 1))
  for (const [faixa, ladrilho] of [
    [16, 2048],
    [37, 50],
    [500, 111],
    [64, 64],
  ]) {
    const outra = revelar(base, a, { faixa, ladrilho })
    iguais(outra, inteira, 2e-6, `faixas de ${faixa} linhas, ladrilhos de ${ladrilho} colunas`)
  }
  const regiao = { x: 40, y: 30, largura: 120, altura: 90 }
  const pedaco = revelar(base, a, { regiao, faixa: 37 })
  assert.deepEqual([pedaco.largura, pedaco.altura], [120, 90])
  assert.deepEqual(pedaco.quadro, inteira.quadro)
  let pior = 0
  for (let y = 0; y < 90; y++)
    for (let x = 0; x < 120; x++)
      for (let c = 0; c < 3; c++) {
        pior = Math.max(pior, Math.abs(pedaco.dados[(y * 120 + x) * 3 + c] - inteira.dados[((y + 30) * inteira.largura + x + 40) * 3 + c]))
      }
  assert.ok(pior < 2e-6, `região contra a foto inteira: ${pior}`)
  // bytes direto = revelar + paraBytes
  const bytes = revelarEmBytes(base, a, { bits: 8 })
  assert.deepEqual(bytes.dados, paraBytes(inteira))
  const b16 = revelarEmBytes(base, a, { bits: 16, regiao })
  assert.deepEqual(b16.dados, paraBytes(pedaco, { bits: 16 }))
  // semLocal: pula a vizinhança (e o ruído), o resto é igual ao dos mesmos ajustes sem vizinhança
  const semVizinhanca = structuredClone(a)
  semVizinhanca.presenca = neutro().presenca
  semVizinhanca.detalhe = neutro().detalhe
  semVizinhanca.efeitos.grao = 0
  semVizinhanca.efeitos.vinheta = 0
  iguais(revelar(base, a, { semLocal: true }), revelar(base, semVizinhanca), 0, 'semLocal')
  // a semente muda o grão e mais nada
  const outroGrao = revelar(base, a, { semente: 99 })
  assert.notDeepEqual(outroGrao.dados, inteira.dados)
  iguais(revelar(base, a, { semente: 99 }), outroGrao, 0, 'mesma semente')
})

test('ajustes neutros num RAW: revelação base nas três telas, com o que não cabe comprimido', () => {
  const imagem = cena(4, 160, 120)
  const base = prepararBase(fotografar(imagem).negativo, { demosaico: 'qualidade' })
  for (const tela of ['srgb', 'p3', 'rec2020']) {
    const saida = revelar(base, neutro(), { tela })
    assert.equal(saida.espaco, tela)
    assert.deepEqual([saida.largura, saida.altura], [160, 120])
    assert.ok(saida.dados.every((v) => v >= 0 && v <= 1 && Number.isFinite(v)))
  }
  // as três telas mostram a mesma cor (a cena cabe em sRGB): compara em luz linear Rec.2020
  const srgb = revelar(base, neutro(), { tela: 'srgb' })
  const p3 = revelar(base, neutro(), { tela: 'p3' })
  const paraTrabalho = { srgb: matrizEntre('srgb', 'rec2020'), p3: matrizEntre('p3', 'rec2020') }
  let soma = 0
  let pior = 0
  let n = 0
  for (let i = 0; i < 160 * 120; i += 7) {
    const a = mulV(paraTrabalho.srgb, [...srgb.dados.slice(i * 3, i * 3 + 3)].map(CURVAS.srgb.decodificar))
    const b = mulV(paraTrabalho.p3, [...p3.dados.slice(i * 3, i * 3 + 3)].map(CURVAS.srgb.decodificar))
    const d = deltaECor(a, b)
    soma += d
    pior = Math.max(pior, d)
    n++
  }
  // iguais onde a cor cabe nas duas; onde não cabe em sRGB (franja de borda, alta luz saturada) a diferença é a compressão
  assert.ok(soma / n < 0.002, `sRGB contra P3: ΔE médio ${soma / n}`)
  assert.ok(pior < 0.08, `sRGB contra P3: pior ΔE ${pior}`)
  assert.throws(() => revelar(base, neutro(), { tela: 'cmyk' }), /desconhecida/)
})

test('branco estourado no sensor sai branco na tela, e continua branco com a exposição mais baixa', () => {
  // mancha de luz que estoura os três canais no meio, sobre cinza
  const W = 120
  const H = 80
  const dados = new Float32Array(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) dados.fill(0.15 + 9 * Math.exp(-3 * (((x - 60) / 30) ** 2 + ((y - 40) / 22) ** 2)), (y * W + x) * 3, (y * W + x) * 3 + 3)
  const base = prepararBase(fotografar({ largura: W, altura: H, dados }).negativo, { latitude: latitudeDeTeste() })
  assert.ok(base.cortado.tres > 0.05 && base.folgaAltas > 0.9)
  const centro = (40 * W + 60) * 3
  for (const exposicao of [0, -0.4, 1]) {
    const a = neutro()
    a.luz.exposicao = exposicao
    const saida = revelar(base, a)
    for (let c = 0; c < 3; c++) assert.ok(saida.dados[centro + c] > 0.995, `exposição ${exposicao}: centro em ${saida.dados[centro + c]}`)
  }
  // e a margem da tela inclui o que a reconstrução recuperou: o anel com um ou dois canais cortados não é branco chapado
  const saida = revelar(base, neutro())
  const degraus = new Set()
  for (let x = 60; x < 110; x++) degraus.add(Math.round(saida.dados[(40 * W + x) * 3 + 1] * 255))
  assert.ok(degraus.size > 25, `a alta luz tem degradê até o branco (${degraus.size} tons)`)
  const tela = telaDe('srgb', neutro(), base)
  perto(tela.curva.altas, Math.log2(1 / CINZA) + base.folgaAltas, 1e-9, 'margem de altas = saturação + folga')
})

test('ColorChecker de ponta a ponta: cena → sensor → base → tela, com ΔE limitado', (t) => {
  // cartela de 24 cores, 20×20 px cada, com moldura cinza; sensor de 14 bits
  const lado = 20
  const borda = 4
  const W = 6 * (lado + borda) + borda
  const H = 4 * (lado + borda) + borda
  const dados = new Float32Array(W * H * 3).fill(0.1)
  const cores = CARTELA.map(([, r, g, b]) => deSrgb8(r, g, b))
  cores.forEach((cor, i) => {
    const x0 = borda + (i % 6) * (lado + borda)
    const y0 = borda + Math.floor(i / 6) * (lado + borda)
    for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) dados.set(cor, ((y0 + y) * W + x0 + x) * 3)
  })
  const cartela = { largura: W, altura: H, dados }
  const { negativo } = fotografar(cartela, { branco: 16383, preto: 512, ruido: { leitura: 2.5, ganho: 0.4 } })
  const tela = criarTela('srgb')
  const paraTrabalho = matrizEntre('srgb', 'rec2020')
  for (const demosaico of ['rapido', 'qualidade']) {
    const base = prepararBase(negativo, { demosaico, latitude: latitudeDeTeste({ branco: [16383, 16383, 16383], preto: [512, 512, 512] }) })
    // margens manuais iguais às da tela de referência, para a conta direta valer
    const a = neutro()
    a.tela.margemAltas = 3.5
    a.tela.margemSombras = 8
    const saida = revelar(base, a)
    let piorDireto = 0
    let somaDireto = 0
    let piorOriginal = 0
    let piorMatiz = 0
    cores.forEach((cor, i) => {
      const x0 = borda + (i % 6) * (lado + borda) + 4
      const y0 = borda + Math.floor(i / 6) * (lado + borda) + 4
      const media = [0, 0, 0]
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) for (let c = 0; c < 3; c++) media[c] += saida.dados[((y0 + y) * W + x0 + x) * 3 + c] / 144
      const medido = mulV(paraTrabalho, media.map(CURVAS.srgb.decodificar))
      // (a) contra a conta direta: a mesma cor de cena passada pela tela, sem sensor nem demosaico
      const direto = mulV(paraTrabalho, tela.aplicar(cor[0], cor[1], cor[2], [0, 0, 0]).map(CURVAS.srgb.decodificar))
      const d = deltaECor(medido, direto)
      piorDireto = Math.max(piorDireto, d)
      somaDireto += d
      // (b) contra a cartela original: o que muda é a luz (a curva de tons dá contraste); o matiz fica
      piorOriginal = Math.max(piorOriginal, deltaECor(medido, cor))
      const [, C0, h0] = oklch(...cor)
      if (C0 > 0.03) {
        let dh = Math.abs(oklch(...medido)[2] - h0)
        if (dh > 180) dh = 360 - dh
        piorMatiz = Math.max(piorMatiz, dh)
      }
    })
    t.diagnostic(`${demosaico}: contra a conta direta ΔE médio ${(somaDireto / 24).toFixed(5)}, pior ${piorDireto.toFixed(5)}`)
    t.diagnostic(`${demosaico}: contra a cartela original pior ΔE ${piorOriginal.toFixed(3)}, pior desvio de matiz ${piorMatiz.toFixed(2)}°`)
    assert.ok(piorDireto < 0.004, `${demosaico}: pior ΔE contra a conta direta ${piorDireto}`)
    assert.ok(piorOriginal < 0.12, `${demosaico}: pior ΔE contra a cartela ${piorOriginal}`)
    assert.ok(piorMatiz < 3, `${demosaico}: matiz ${piorMatiz}°`)
  }
})

test('look: a função entra sobre o código da tela, na quantidade pedida, só quando há look escolhido', () => {
  const base = baseDe(cena(6, 40, 30))
  const inverter = (r, g, b, saida) => {
    saida[0] = 1 - r
    saida[1] = 1 - g
    saida[2] = 1 - b
  }
  const a = neutro()
  const semLook = revelar(base, a, { look: inverter })
  iguais(semLook, revelar(base, a), 0, 'sem look.id o look não roda')
  a.look = { id: 'teste', quantidade: 100 }
  const comLook = revelar(base, a, { look: inverter })
  for (let i = 0; i < comLook.dados.length; i++) perto(comLook.dados[i], 1 - semLook.dados[i], 1e-6)
  a.look.quantidade = 50
  for (const v of revelar(base, a, { look: inverter }).dados) perto(v, 0.5, 1e-6, 'metade do caminho')
})

test('exposição automática: conservadora, explicada e presa ao que o arquivo tem', () => {
  const sensor = (ganho, latitude) => prepararBase(fotografar(cena(8, 160, 120, { ganho })).negativo, { latitude })
  // cena escura: sobe, mas só 60% do caminho, e diz por quê
  const escura = autoExposicao(sensor(0.12, latitudeDeTeste()))
  assert.ok(escura.exposicao > 0.5 && escura.exposicao <= 2)
  perto(escura.exposicao, -escura.medidas.media * 0.6, 0.011, '60% do caminho')
  assert.ok(escura.porque.length >= 1 && /abaixo do cinza/.test(escura.porque[0]), escura.porque.join(' '))
  // arquivo com pouco chão (ruído a 5,6 EV do cinza): o automático para antes
  const ruidoso = autoExposicao(sensor(0.12, latitudeDeTeste({ margem: { acimaDoCinza: 2.47, abaixoDoCinza: 5.6 } })))
  perto(ruidoso.exposicao, 0.6, 0.011, 'limite pelo ruído')
  assert.ok(
    ruidoso.porque.some((p) => /ruído/.test(p)),
    ruidoso.porque.join(' '),
  )
  perto(ruidoso.limites.max, 0.6, 1e-9)
  // cena clara: desce 40% do caminho, e nunca abaixo do ponto em que o branco do arquivo viraria cinza
  const clara = autoExposicao(sensor(1.6, latitudeDeTeste()))
  assert.ok(clara.exposicao < 0 && clara.exposicao >= clara.limites.min)
  perto(clara.limites.min, 2 - Math.log2(1 / 0.18) - sensor(1.6, latitudeDeTeste()).folgaAltas, 1e-6)
  // cinza médio: não mexe
  const lisa = baseDe({ largura: 50, altura: 40, dados: new Float32Array(50 * 40 * 3).fill(0.18) })
  const noPonto = autoExposicao(lisa)
  assert.equal(noPonto.exposicao, 0)
  assert.ok(/já está/.test(noPonto.porque[0]))
  // sem Latitude valem os limites do próprio automático; a exposição base do arquivo entra na medida
  const semMedida = autoExposicao(baseDe({ largura: 50, altura: 40, dados: new Float32Array(50 * 40 * 3).fill(0.001) }))
  assert.equal(semMedida.exposicao, 2)
  assert.ok(semMedida.porque.some((p) => /teto/.test(p)))
  const comBase = autoExposicao(baseDe({ largura: 50, altura: 40, dados: new Float32Array(50 * 40 * 3).fill(0.09) }, { exposicaoBase: 1 }))
  assert.equal(comBase.exposicao, 0)
  // determinístico
  assert.deepEqual(autoExposicao(lisa), autoExposicao(lisa))
})

test('branco automático: tira a dominante dos tons neutros, anda só parte do caminho e sabe quando não mexer', () => {
  const croma = (cor) => {
    const [L, C] = oklch(...cor)
    return C / L
  }
  // cena com cinzas (a cartela tem seis) e uma dominante quente moderada: tudo multiplicado por (1,09; 1; 0,92)
  const limpa = cena(9, 200, 140, { ganho: 0.6 })
  const quente = { largura: 200, altura: 140, dados: Float32Array.from(limpa.dados, (v, i) => v * [1.09, 1, 0.92][i % 3]) }
  const base = baseDe(quente, { branco: { kelvin: 5200, tinta: 5 } })
  const auto = autoBranco(base)
  assert.equal(auto.mudou, true)
  assert.ok(auto.temperatura < 5200, `a luz medida é mais quente que a gravada: ${auto.temperatura} K`)
  assert.ok(auto.usados > 0.02 && auto.porque.length >= 1)
  assert.ok(/tons neutros/.test(auto.porque[0]))
  // aplicar o resultado deixa um cinza da cena mais neutro (o automático anda 80% do caminho)
  const a = neutro()
  a.branco = { modo: 'manual', temperatura: auto.temperatura, tinta: auto.tinta }
  const ponto = criarPonto(a, contextoDe(base, a))
  const cinzaComDominante = [0.18 * 1.09, 0.18, 0.18 * 0.92]
  const corrigido = ponto.aplicar(...cinzaComDominante, [0, 0, 0])
  assert.ok(croma(corrigido) < croma(cinzaComDominante) * 0.45, `croma do cinza: ${croma(cinzaComDominante)} → ${croma(corrigido)}`)
  // modo 'auto' em revelar usa a mesma medida
  const b = neutro()
  b.branco.modo = 'auto'
  const ctx = contextoDe(base, b)
  assert.deepEqual(ctx.brancoAuto, { kelvin: auto.temperatura, tinta: auto.tinta })
  iguais(revelar(base, b), revelar(base, a), 0, "modo 'auto' = manual com o número do automático")
  // foto já neutra: não mexe
  const neutra = autoBranco(baseDe(limpa, { branco: { kelvin: 5200, tinta: 5 } }))
  assert.ok(Math.abs(neutra.temperatura - 5200) < 250 && Math.abs(neutra.tinta - 5) < 6, `${neutra.temperatura} K, tinta ${neutra.tinta}`)
  // foto sem tons neutros (só cor saturada): mantém o branco e diz que a confiança é baixa
  const saturada = { largura: 60, altura: 40, dados: new Float32Array(60 * 40 * 3) }
  for (let i = 0; i < 60 * 40; i++) saturada.dados.set(i % 2 ? [0.5, 0.05, 0.02] : [0.02, 0.3, 0.05], i * 3)
  const semNeutros = autoBranco(baseDe(saturada, { branco: { kelvin: 4800, tinta: -3 } }))
  assert.deepEqual([semNeutros.temperatura, semNeutros.tinta, semNeutros.mudou, semNeutros.confianca], [4800, -3, false, 'baixa'])
  assert.ok(/neutros/.test(semNeutros.porque[0]))
  // dominante enorme: não é a luz, é a cena — o automático não mexe e diz por quê
  const absurda = { largura: 200, altura: 140, dados: Float32Array.from(limpa.dados, (v, i) => v * [1.12, 1, 0.9][i % 3] ** 3) }
  const recusado = autoBranco(baseDe(absurda, { branco: { kelvin: 5200, tinta: 5 } }))
  assert.deepEqual([recusado.temperatura, recusado.tinta, recusado.mudou, recusado.confianca], [5200, 5, false, 'baixa'])
  assert.ok(/cena/.test(recusado.porque[0]))
})

test('histogramas: da tela (luma e RGB) e da cena em EV em torno do cinza', () => {
  const rnd = sorteio(4)
  const tela = { largura: 64, altura: 32, espaco: 'srgb', dados: new Float32Array(64 * 32 * 3).map(() => rnd()) }
  tela.dados.set([1, 1, 1, 0, 0, 0], 0)
  const h = histogramaDaTela(tela)
  assert.equal(h.pixels, 64 * 32)
  for (const canal of [h.luma, h.r, h.g, h.b]) {
    assert.equal(canal.length, 256)
    assert.equal(
      canal.reduce((s, v) => s + v, 0),
      64 * 32,
    )
  }
  assert.equal(h.r[255] >= 1 && h.r[0] >= 1, true)
  perto(h.estourado[0], 1 / 2048, 1e-9)
  perto(h.preto[2], 1 / 2048, 1e-9)
  assert.equal(histogramaDaTela(tela, { casas: 64, passo: 2 }).pixels, 32 * 16)
  // imagem cinza: toda a luma numa casa só
  const cinza = histogramaDaTela({ largura: 8, altura: 8, dados: new Float32Array(192).fill(0.502) })
  assert.equal(cinza.luma[128], 64)

  // cena: cinza médio cai em 0 EV; cada stop anda `porEv` casas; o deslocamento soma
  const faz = (v) => ({ largura: 10, altura: 10, dados: new Float32Array(300).fill(v) })
  const c = histogramaDaCena(faz(0.18))
  assert.equal(c.casas.length, 20 * 4)
  assert.equal(c.casas[12 * 4], 100, 'cinza médio em 0 EV')
  assert.equal(histogramaDaCena(faz(0.36)).casas[13 * 4], 100, '+1 EV')
  assert.equal(histogramaDaCena(faz(0.18), { ev: -2 }).casas[10 * 4], 100, 'com a exposição em −2')
  assert.equal(histogramaDaCena(faz(0)).abaixo, 100, 'preto absoluto')
  assert.equal(histogramaDaCena(faz(-0.01)).abaixo, 100, 'ruído negativo')
  assert.equal(histogramaDaCena(faz(100)).acima, 100)
  // percentis numa rampa de −6 a +4 EV
  const rampa = { largura: 1000, altura: 1, dados: new Float32Array(3000) }
  for (let i = 0; i < 1000; i++) rampa.dados.fill(0.18 * 2 ** (-6 + (10 * i) / 1000), i * 3, i * 3 + 3)
  const r = histogramaDaCena(rampa)
  perto(r.percentil(0.5), -1, 0.05, 'mediana')
  perto(r.percentil(0.99), 3.9, 0.05)
  perto(r.percentil(0.01), -5.9, 0.05)
  assert.equal(r.pixels, 1000)
  // na base de um RAW: o topo do histograma fica onde a Latitude diz que o arquivo acaba
  const base = prepararBase(fotografar(cena(2, 120, 80, { ganho: 3 })).negativo)
  const topo = histogramaDaCena(base.imagem).percentil(0.9999)
  assert.ok(topo <= Math.log2(1 / CINZA) + base.folgaAltas + 1.2, `topo da cena em ${topo} EV`)
})

test('foto pronta com orientação: baseDeImagem + revelar põe a foto em pé', () => {
  const dados = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 0, 255, 255, 255, 0, 255])
  const base = baseDeImagem({ largura: 3, altura: 2, dados, canais: 3, orientacao: 6 })
  const saida = paraBytes(revelar(base, neutro()))
  // orientação 6 (girar 90° no sentido horário): 2×3, a coluna da esquerda da original vira a linha de cima, invertida
  assert.deepEqual([...saida.filter((_, i) => i % 4 !== 3)], [255, 255, 0, 255, 0, 0, 0, 255, 255, 0, 255, 0, 255, 0, 255, 0, 0, 255])
})

test('desempenho de revelar (medido em 2 MP; o de 24 MP está no relatório)', (t) => {
  const W = 1920
  const H = 1080
  const rnd = sorteio(3)
  const dados = new Float32Array(W * H * 3)
  const cores = CARTELA.map(([, r, g, b]) => deSrgb8(r, g, b))
  for (let i = 0; i < W * H; i++) {
    const cor = cores[(rnd() * 24) | 0]
    const k = 2 ** (rnd() * 5 - 3)
    dados.set(
      cor.map((v) => v * k),
      i * 3,
    )
  }
  const base = baseDe({ largura: W, altura: H, dados }, { origem: 'raw' })
  const medir = (nome, mexe, opcoes) => {
    const a = neutro()
    mexe(a)
    const t0 = performance.now()
    const saida = opcoes?.bytes ? revelarEmBytes(base, a, opcoes) : revelar(base, a, opcoes)
    const ms = performance.now() - t0
    t.diagnostic(`${nome}: ${ms.toFixed(0)} ms em 2,1 MP (${((ms * 1e6) / (W * H)).toFixed(0)} ns/px)`)
    assert.equal(saida.largura, W)
  }
  medir('neutro', () => {})
  medir('neutro, direto em 8 bits', () => {}, { bytes: true, bits: 8 })
  medir('luz e cor', (a) => {
    Object.assign(a.luz, { exposicao: 0.3, contraste: 20, altas: -30, sombras: 20 })
    a.cor.vibracao = 20
  })
  medir('luz, cor e vizinhança', (a) => {
    Object.assign(a.luz, { exposicao: 0.3, contraste: 20, altas: -30, sombras: 20 })
    a.cor.vibracao = 20
    Object.assign(a.presenca, { clareza: 30, textura: 20 })
    a.detalhe.nitidez = 40
    a.efeitos.vinheta = -20
  })
})

// O ganho de tempo aparece em foto grande (24 MP: medido no relatório); aqui, com 0,8 MP e a máquina dividida, o
// tempo só é informado.
test('neblina e clareza pelo mapa largo (foto grande): perto da conta bloco a bloco e sem depender do ladrilho', (t) => {
  // 1100 px de lado maior: o mapa largo entra (k = 2); cena com véu para a neblina ter o que tirar
  const imagem = cena(17, 1100, 720, { ganho: 0.5 })
  for (let i = 0; i < imagem.dados.length; i++) imagem.dados[i] = imagem.dados[i] * 0.6 + 0.25
  const base = baseDe(imagem)
  const a = neutro()
  Object.assign(a.presenca, { clareza: 60, neblina: 50, textura: 20 })
  a.geometria.angulo = 2
  const t0 = performance.now()
  const rapida = revelar(base, a)
  const msRapida = performance.now() - t0
  const t1 = performance.now()
  const exata = revelar(base, a, { vizinhancaExata: true })
  const msExata = performance.now() - t1
  const semEfeito = revelar(base, { ...neutro(), geometria: a.geometria })
  // o efeito (contra a mesma foto sem neblina nem clareza) e a diferença entre os dois caminhos, em código de tela
  let efeito = 0
  let diferenca = 0
  for (let i = 0; i < rapida.dados.length; i++) {
    efeito += Math.abs(exata.dados[i] - semEfeito.dados[i])
    diferenca += Math.abs(rapida.dados[i] - exata.dados[i])
  }
  efeito /= rapida.dados.length
  diferenca /= rapida.dados.length
  assert.ok(efeito > 0.02, `os ajustes mudam a foto (${efeito.toFixed(4)})`)
  assert.ok(diferenca < efeito * 0.15, `mapa largo contra bloco a bloco: ${diferenca.toFixed(4)} (efeito ${efeito.toFixed(4)})`)
  // o mapa é da foto inteira: faixas e ladrilhos não mudam nada
  iguais(revelar(base, a, { faixa: 61, ladrilho: 300 }), rapida, 2e-6, 'mapa largo em ladrilhos')
  iguais(revelar(base, a, { regiao: { x: 0, y: 0, largura: rapida.largura, altura: 200 } }), { ...rapida, altura: 200, dados: rapida.dados.subarray(0, rapida.largura * 200 * 3) }, 2e-6, 'região')
  t.diagnostic(`0,8 MP: mapa largo ${msRapida.toFixed(0)} ms, bloco a bloco ${msExata.toFixed(0)} ms; diferença ${diferenca.toFixed(4)} para um efeito de ${efeito.toFixed(4)}`)
})
