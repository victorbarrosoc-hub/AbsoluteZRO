// A base do motor: do mosaico do sensor à cena linear. Cena sintética com semente → mosaico de uma câmera conhecida →
// prepararBase tem de devolver a cena.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { baseDeImagem, corDaCamera, prepararBase } from '../src/motor/base.js'
import { matrizAdaptacao } from '../src/motor/cor/adaptacao.js'
import { temperaturaDeXy, xyDeTemperatura } from '../src/motor/cor/branco.js'
import { D50, D65, luminancia, rgbParaXyz, xyParaXYZ } from '../src/motor/cor/espacos.js'
import { diagonal, misturarM } from '../src/motor/cor/matriz.js'
import {
  CAMERA,
  PADROES,
  XTRANS,
  cena,
  deSrgb8,
  deltaE,
  fotografar,
  inversa,
  latitudeDeTeste,
  mascaraDeBorda,
  miolo,
  mulM,
  mulV,
  psnr,
  sorteio,
} from './apoio-motor.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}, veio ${a} (tolerância ${tol})`)

// cena sem nada estourado (o maior valor fica em 0,82 do teto do sensor)
const imagem = cena(11, 240, 160, { ganho: 0.55 })
const dentro = miolo(imagem)
const borda = mascaraDeBorda(imagem)

function plana(cor, largura = 64, altura = 48) {
  const dados = new Float32Array(largura * altura * 3)
  for (let i = 0; i < largura * altura; i++) dados.set(cor, i * 3)
  return { largura, altura, dados }
}

test('cor chapada volta exata nos dois demosaicos e nos quatro padrões de Bayer', () => {
  for (const cor of [deSrgb8(194, 150, 130), deSrgb8(56, 61, 150), [0.18, 0.18, 0.18], [0.7, 0.72, 0.69]]) {
    const img = plana(cor)
    for (const nome of Object.keys(PADROES)) {
      const { negativo } = fotografar(img, { padrao: PADROES[nome], branco: 16383, preto: 512 })
      for (const demosaico of ['rapido', 'qualidade']) {
        const base = prepararBase(negativo, { demosaico })
        assert.equal(base.demosaico, demosaico)
        assert.equal(base.origem, 'raw')
        assert.deepEqual([base.imagem.largura, base.imagem.altura], [64, 48])
        // erro só do arredondamento do sensor de 14 bits
        const e = deltaE(img, base.imagem)
        assert.ok(e.pior < 4e-4, `${nome} ${demosaico}: pior ΔE ${e.pior}`)
      }
    }
  }
})

test('cena com bordas: PSNR e ΔE dentro do limite, e o demosaico de qualidade ganha do rápido na borda', (t) => {
  const medidas = {}
  for (const demosaico of ['rapido', 'qualidade']) {
    const base = prepararBase(fotografar(imagem).negativo, { demosaico })
    medidas[demosaico] = {
      tudo: deltaE(imagem, base.imagem, dentro),
      borda: deltaE(imagem, base.imagem, borda),
      psnr: psnr(imagem, base.imagem, dentro),
      psnrBorda: psnr(imagem, base.imagem, borda),
    }
    const m = medidas[demosaico]
    t.diagnostic(`${demosaico}: ΔE médio ${m.tudo.medio.toFixed(4)}, p99 ${m.tudo.p99.toFixed(4)}, pior ${m.tudo.pior.toFixed(3)}`)
    t.diagnostic(
      `${demosaico}: na borda ΔE ${m.borda.medio.toFixed(4)} (${m.borda.pixels} px); PSNR ${m.psnr.toFixed(2)} dB, na borda ${m.psnrBorda.toFixed(2)} dB`,
    )
  }
  const { rapido, qualidade } = medidas
  assert.ok(rapido.tudo.medio < 0.009 && rapido.tudo.p99 < 0.07, 'rápido: ΔE')
  assert.ok(rapido.psnr > 37, `rápido: PSNR ${rapido.psnr}`)
  assert.ok(qualidade.tudo.medio < 0.007 && qualidade.tudo.p99 < 0.05, 'qualidade: ΔE')
  assert.ok(qualidade.psnr > 39, `qualidade: PSNR ${qualidade.psnr}`)
  // na borda: pelo menos 15% menos erro e 1 dB a mais
  assert.ok(qualidade.borda.medio < rapido.borda.medio * 0.85, `borda: ${qualidade.borda.medio} contra ${rapido.borda.medio}`)
  assert.ok(qualidade.psnrBorda > rapido.psnrBorda + 1, `PSNR na borda: ${qualidade.psnrBorda} contra ${rapido.psnrBorda}`)
  assert.ok(qualidade.tudo.pior < rapido.tudo.pior, 'e o pior pixel também é melhor')
  // os outros padrões dão o mesmo nível
  for (const nome of ['bggr', 'grbg', 'gbrg']) {
    const base = prepararBase(fotografar(imagem, { padrao: PADROES[nome] }).negativo, { demosaico: 'qualidade' })
    assert.ok(deltaE(imagem, base.imagem, dentro).medio < 0.007, nome)
  }
  assert.throws(() => prepararBase(fotografar(imagem).negativo, { demosaico: 'outro' }), /demosaico/)
  assert.throws(() => prepararBase(fotografar(imagem).negativo, { reduzir: 3 }), /reduzir/)
})

test('preto por sensel com padrão, saturação efetiva da Latitude e negativos sem corte', () => {
  // padrão de preto 2×2 somado ao sensor: a base tem de sair igual à do sensor sem padrão
  const img = plana([0.3, 0.25, 0.2])
  const limpo = fotografar(img, { margem: { x: 0, y: 0, direita: 0, baixo: 0 } })
  const comPadrao = fotografar(img, { margem: { x: 0, y: 0, direita: 0, baixo: 0 } })
  const valores = new Float32Array([0, 6, -4, 3])
  const s = comPadrao.negativo.sensor
  for (let y = 0; y < s.altura; y++) for (let x = 0; x < s.largura; x++) s.dados[y * s.largura + x] += valores[(y % 2) * 2 + (x % 2)]
  comPadrao.negativo.preto.padrao = { linhas: 2, colunas: 2, valores }
  const a = prepararBase(limpo.negativo)
  const b = prepararBase(comPadrao.negativo)
  assert.ok(deltaE(a.imagem, b.imagem).pior < 1e-6, 'padrão de preto')

  // o arquivo declara saturação 4095, mas o sensor satura em 3400: a Latitude corrige, e a cena volta no lugar
  const real = fotografar(img, { branco: 3400 })
  real.negativo.branco.declarado = [4095, 4095, 4095]
  const semMedida = prepararBase(real.negativo)
  const comMedida = prepararBase(real.negativo, { latitude: latitudeDeTeste({ branco: [3400, 3400, 3400] }) })
  assert.ok(deltaE(img, comMedida.imagem).pior < 1e-3, 'com a saturação medida')
  perto(semMedida.imagem.dados[1] / comMedida.imagem.dados[1], (3400 - 256) / (4095 - 256), 1e-3, 'sem a medida a foto sai mais escura')
  assert.equal(comMedida.latitude.branco[0], 3400)

  // campo quase preto com ruído de leitura: os negativos ficam e a média não ganha viés
  const escuro = plana([0.0004, 0.0004, 0.0004], 200, 150)
  const ruidoso = fotografar(escuro, { ruido: { leitura: 3, ganho: 0.6 }, semente: 3 })
  const base = prepararBase(ruidoso.negativo)
  let soma = 0
  let menor = Infinity
  let negativos = 0
  const Y = luminancia('rec2020')
  for (let i = 0; i < 200 * 150; i++) {
    const y = Y[0] * base.imagem.dados[i * 3] + Y[1] * base.imagem.dados[i * 3 + 1] + Y[2] * base.imagem.dados[i * 3 + 2]
    soma += y
    menor = Math.min(menor, y)
    if (y < 0) negativos++
  }
  assert.ok(menor < -0.0005, `o menor valor é negativo: ${menor}`)
  assert.ok(negativos > 200 * 150 * 0.15, `${negativos} pixels negativos`)
  // com corte em zero a média subiria para perto de 0,0007; sem corte fica em 0,0004 (± o ruído da média)
  perto(soma / (200 * 150), 0.0004, 5e-5, 'média sem viés')
})

test('altas luzes: canal cortado recuperado, branco sem tinta, e nada cortado em 1,0', () => {
  const W = 200
  const H = 140
  const mancha = (cor, pico) => {
    const d = new Float32Array(W * H * 3)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const l = 0.15 + pico * Math.exp(-2.2 * (((x - 100) / 60) ** 2 + ((y - 70) / 45) ** 2))
        d.set([l * cor[0], l * cor[1], l * cor[2]], (y * W + x) * 3)
      }
    }
    return { largura: W, altura: H, dados: d }
  }
  for (const [nome, cor, pico] of [
    ['luz quente', [1, 0.75, 0.45], 1.6],
    ['luz azulada', [0.6, 0.8, 1], 1.5],
    ['luz neutra', [1, 1, 1], 1.7],
  ]) {
    const img = mancha(cor, pico)
    const base = prepararBase(fotografar(img).negativo)
    assert.ok(base.cortado.um > 0.02 && base.cortado.tres === 0, `${nome}: ${JSON.stringify(base.cortado)}`)
    let pior = 0
    let soma = 0
    let n = 0
    let maior = 0
    let piorRazao = 0
    for (let y = 6; y < H - 6; y++) {
      for (let x = 6; x < W - 6; x++) {
        const o = (y * W + x) * 3
        const verdade = img.dados[o + 1]
        const g = base.imagem.dados[o + 1]
        maior = Math.max(maior, g)
        if (verdade < 0.9) continue // só onde o verde do sensor cortou (ou quase)
        const e = Math.abs(g - verdade) / verdade
        pior = Math.max(pior, e)
        soma += e
        n++
        piorRazao = Math.max(piorRazao, Math.abs(base.imagem.dados[o] / g - cor[0] / cor[1]), Math.abs(base.imagem.dados[o + 2] / g - cor[2] / cor[1]))
      }
    }
    // o verde cortado volta com erro médio < 1% e pior < 5%; a cor da luz não muda (razão entre canais a 3%)
    assert.ok(soma / n < 0.01, `${nome}: erro médio ${soma / n}`)
    assert.ok(pior < 0.05, `${nome}: pior erro ${pior}`)
    assert.ok(piorRazao < 0.03, `${nome}: razão entre canais ${piorRazao}`)
    // passa de 1,0: é alta luz de verdade
    assert.ok(maior > 1.25, `${nome}: maior verde ${maior}`)
    assert.ok(base.folgaAltas > 0.4 && base.folgaAltas < 1.5, `${nome}: folga ${base.folgaAltas}`)
  }
  // os três canais estourados: o miolo fica branco exato, mesmo com luz colorida, e a transição não tinge
  for (const cor of [
    [1, 1, 1],
    [1, 0.75, 0.45],
  ]) {
    const img = mancha(cor, 7)
    const base = prepararBase(fotografar(img).negativo, { demosaico: 'qualidade' })
    assert.ok(base.cortado.tres > 0.1)
    const c = (70 * W + 100) * 3
    const [r, g, b] = base.imagem.dados.slice(c, c + 3)
    perto(r / g, 1, 1e-3, 'miolo neutro')
    perto(b / g, 1, 1e-3, 'miolo neutro')
    assert.ok(g > 2, `o branco reconstruído fica no teto do canal mais forte: ${g}`)
    if (cor[1] === 1) {
      // luz neutra: em nenhum pixel aparece cor (croma relativa abaixo de 0,03 em toda a mancha)
      let piorCroma = 0
      for (let y = 8; y < H - 8; y++) {
        for (let x = 8; x < W - 8; x++) {
          const o = (y * W + x) * 3
          const [pr, pg, pb] = base.imagem.dados.slice(o, o + 3)
          piorCroma = Math.max(piorCroma, (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) / pg)
        }
      }
      assert.ok(piorCroma < 0.06, `branco tingido: ${piorCroma}`)
    }
  }
  // sem nada cortado a reconstrução nem roda
  const calma = prepararBase(fotografar(imagem).negativo)
  assert.deepEqual(calma.cortado, { um: 0, dois: 0, tres: 0 })
  assert.equal(calma.folgaAltas, 0)
})

test('cor da câmera: matriz única D65, dois iluminantes por 1/T e ForwardMatrix', () => {
  const img = plana([0.35, 0.45, 0.25])
  // matriz única (LibRaw)
  const unica = fotografar(img)
  const base = prepararBase(unica.negativo)
  assert.ok(deltaE(img, base.imagem).pior < 6e-4)
  perto(base.branco.kelvin, temperaturaDeXy(D65).kelvin, 1, 'branco D65')
  perto(base.branco.tinta, temperaturaDeXy(D65).tinta, 0.1)
  assert.equal(base.branco.neutroCamera.length, 3)
  perto(Math.max(...base.branco.neutroCamera), 1, 1e-12)

  // DNG com as duas matrizes iguais: tem de dar o mesmo que a matriz única
  const duas = fotografar(img, {
    origem: 'dng',
    matrizes: [
      { kelvin: 2856, xyzParaCamera: CAMERA },
      { kelvin: 6504, xyzParaCamera: CAMERA },
    ],
  })
  duas.negativo.cor.neutroComoFotografado = duas.neutro
  delete duas.negativo.wb.comoFotografado
  assert.ok(deltaE(img, prepararBase(duas.negativo).imagem).pior < 6e-4, 'DNG, ColorMatrix')
  // com ForwardMatrix coerente (Bradford D65 → D50 · câmera⁻¹ · neutro, normalizada em Y = 1)
  const semBranco = mulM(inversa(CAMERA), diagonal(duas.neutro))
  const y = mulV(semBranco, [1, 1, 1])[1]
  const fm = mulM(matrizAdaptacao(xyParaXYZ(D65), xyParaXYZ(D50), 'bradford'), semBranco).map((v) => v / y)
  for (const m of duas.negativo.cor.matrizes) m.cameraParaXyzD50 = fm
  assert.ok(deltaE(img, prepararBase(duas.negativo).imagem).pior < 6e-4, 'DNG, ForwardMatrix')

  // duas matrizes diferentes: sob luz de 3400 K a matriz usada é a interpolada por 1/T, e o neutro sai neutro
  const quente = CAMERA.map((v, i) => v * (1 + 0.06 * Math.sin(i * 1.7)))
  const matrizes = [
    { kelvin: 2856, xyzParaCamera: quente },
    { kelvin: 6504, xyzParaCamera: CAMERA },
  ]
  for (const T of [2856, 3400, 5000, 6504, 9000]) {
    const g = Math.min(1, Math.max(0, (1 / T - 1 / 6504) / (1 / 2856 - 1 / 6504)))
    const cm = misturarM(quente, CAMERA, g)
    const luz = xyParaXYZ(xyDeTemperatura(T, 0))
    const neutro = mulV(cm, luz)
    const cor = corDaCamera({ cor: { origem: 'dng', matrizes, neutroComoFotografado: neutro }, wb: {} })
    perto(cor.branco.kelvin, T, T * 2e-3, `temperatura medida sob ${T} K`)
    perto(cor.branco.tinta, 0, 0.3, `tinta sob ${T} K`)
    // um objeto neutro (a câmera vê k·neutro; com o branco aplicado, k·(1, 1, 1)) sai neutro, com a mesma luz
    const saida = mulV(cor.paraRec2020, [0.5, 0.5, 0.5])
    saida.forEach((v) => perto(v, 0.5, 1e-9, `neutro sob ${T} K`))
    perto(Math.min(...cor.ganhos), 1, 1e-12, 'o menor ganho é 1')
  }
  // sem branco gravado: assume a luz do dia da matriz mais fria
  const semWb = corDaCamera({ cor: { origem: 'libraw', matrizes: [{ kelvin: 6504, xyzParaCamera: CAMERA }] }, wb: {} })
  mulV(semWb.paraRec2020, [1, 1, 1]).forEach((v) => perto(v, 1, 1e-9))
})

test('reduzir 2 e 4: o bloco do filtro de cor vira um pixel (prévia)', () => {
  const media = (fator) => {
    const w = Math.floor(imagem.largura / fator)
    const h = Math.floor(imagem.altura / fator)
    const d = new Float32Array(w * h * 3)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 3; c++) {
          let s = 0
          for (let dy = 0; dy < fator; dy++) for (let dx = 0; dx < fator; dx++) s += imagem.dados[((y * fator + dy) * imagem.largura + x * fator + dx) * 3 + c]
          d[(y * w + x) * 3 + c] = s / (fator * fator)
        }
    return { largura: w, altura: h, dados: d }
  }
  for (const fator of [2, 4]) {
    const base = prepararBase(fotografar(imagem).negativo, { reduzir: fator })
    assert.equal(base.demosaico, 'agrupado')
    assert.equal(base.reduzir, fator)
    assert.deepEqual([base.imagem.largura, base.imagem.altura], [240 / fator, 160 / fator])
    const e = deltaE(media(fator), base.imagem, miolo(base.imagem, 2))
    // o bloco 2×2 tem o vermelho e o azul em cantos opostos: na borda sobra meia amostra de franja
    assert.ok(e.medio < (fator === 2 ? 0.015 : 0.011), `reduzir ${fator}: ΔE médio ${e.medio}`)
  }
  // cor chapada: exata
  const chapada = plana([0.3, 0.2, 0.4], 64, 48)
  assert.ok(deltaE(plana([0.3, 0.2, 0.4], 16, 12), prepararBase(fotografar(chapada).negativo, { reduzir: 4 }).imagem).pior < 6e-4)
})

test('X-Trans: caminho básico, declarado em base.demosaico', () => {
  const { negativo } = fotografar(imagem, { padrao: XTRANS, tipo: 'xtrans' })
  for (const demosaico of ['rapido', 'qualidade']) {
    const base = prepararBase(negativo, { demosaico })
    assert.equal(base.demosaico, 'basica')
    const e = deltaE(imagem, base.imagem, dentro)
    assert.ok(e.medio < 0.018 && e.p99 < 0.16, `ΔE médio ${e.medio}, p99 ${e.p99}`)
  }
  const chapada = plana([0.3, 0.2, 0.4], 60, 48)
  const fx = fotografar(chapada, { padrao: XTRANS, tipo: 'xtrans' })
  assert.ok(deltaE(chapada, prepararBase(fx.negativo).imagem).pior < 6e-4, 'cor chapada')
  for (const fator of [2, 4]) {
    const base = prepararBase(fx.negativo, { reduzir: fator })
    assert.deepEqual([base.imagem.largura, base.imagem.altura], [60 / fator, 48 / fator])
    assert.ok(deltaE(plana([0.3, 0.2, 0.4], 60 / fator, 48 / fator), base.imagem).pior < 6e-4, `reduzir ${fator}`)
  }
  // altas luzes também valem no X-Trans (células 3×3)
  const forte = plana([1.3, 1.3, 1.3], 60, 48)
  const estourada = prepararBase(fotografar(forte, { padrao: XTRANS, tipo: 'xtrans' }).negativo)
  assert.ok(estourada.cortado.um + estourada.cortado.dois > 0.9)
  perto(estourada.imagem.dados[(24 * 60 + 30) * 3 + 1], 1.3, 0.03, 'verde recuperado')
})

test('modelo de ruído: o que a Latitude mediu vira var = a·Y + b na imagem de trabalho', (t) => {
  const Y = luminancia('rec2020')
  const variancia = (imagemBase) => {
    const { largura, altura, dados } = imagemBase
    let s = 0
    let s2 = 0
    let n = 0
    for (let y = 4; y < altura - 4; y++) {
      for (let x = 4; x < largura - 4; x++) {
        const o = (y * largura + x) * 3
        const v = Y[0] * dados[o] + Y[1] * dados[o + 1] + Y[2] * dados[o + 2]
        s += v
        s2 += v * v
        n++
      }
    }
    return { media: s / n, variancia: s2 / n - (s / n) ** 2 }
  }
  const ruido = { leitura: 3, ganho: 0.6 }
  const latitude = latitudeDeTeste({ ruido: { ...ruido, origem: 'ajuste' } })
  for (const nivel of [0.02, 0.2, 0.6]) {
    const { negativo } = fotografar(plana([nivel, nivel, nivel], 240, 160), { ruido, semente: 5 })
    for (const reduzir of [1, 2]) {
      const base = prepararBase(negativo, { latitude, reduzir })
      assert.equal(base.ruido.origem, 'ajuste')
      const m = variancia(base.imagem)
      const previsto = base.ruido.a * m.media + base.ruido.b
      const razao = m.variancia / previsto
      t.diagnostic(`nível ${nivel}, reduzir ${reduzir}: medido/previsto = ${razao.toFixed(2)}`)
      // sem demosaico (reduzir 2) o modelo acerta; com ele é um teto por pixel (a interpolação faz média de vizinhos)
      assert.ok(reduzir === 2 ? Math.abs(razao - 1) < 0.08 : razao > 0.5 && razao < 1.05, `nível ${nivel}, reduzir ${reduzir}: ${razao}`)
    }
  }
  // sem Latitude, o NoiseProfile do DNG; sem nenhum, nulo
  const { negativo } = fotografar(plana([0.2, 0.2, 0.2]))
  assert.equal(prepararBase(negativo).ruido, null)
  negativo.perfilRuido = [{ escala: 2e-4, deslocamento: 4e-7 }]
  const doPerfil = prepararBase(negativo).ruido
  assert.equal(doPerfil.origem, 'perfil')
  assert.ok(doPerfil.a > 0 && doPerfil.b > 0)
})

test('baseDeImagem: formatos de entrada e os campos da base', () => {
  const rnd = sorteio(2)
  const rgb = new Uint8Array(30 * 20 * 3).map(() => Math.floor(rnd() * 256))
  const rgba = new Uint8ClampedArray(30 * 20 * 4)
  for (let i = 0; i < 600; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 7], i * 4)
  const a = baseDeImagem({ largura: 30, altura: 20, dados: rgb, canais: 3 })
  const b = baseDeImagem({ largura: 30, altura: 20, dados: rgba, canais: 4, orientacao: 6 })
  assert.deepEqual(a.imagem.dados, b.imagem.dados, 'o alfa é ignorado')
  assert.equal(b.orientacao, 6)
  assert.deepEqual([a.origem, a.latitude, a.exposicaoBase, a.ruido, a.folgaAltas], ['imagem', null, 0, null, 0])
  perto(a.branco.kelvin, 6504, 12)
  assert.ok(a.imagem.dados.every(Number.isFinite))
  // cinza médio do sRGB (código 118) vira 0,18 na cena; branco vira o topo da margem padrão; preto, o fundo
  const pontos = baseDeImagem({ largura: 3, altura: 1, dados: new Uint8Array([118, 118, 118, 255, 255, 255, 0, 0, 0]), canais: 3 })
  perto(pontos.imagem.dados[0], 0.18, 2e-3, 'cinza')
  perto(pontos.imagem.dados[3], 0.18 * 2 ** 3.5, 1e-4, 'branco')
  perto(pontos.imagem.dados[6], 0.18 * 2 ** -8, 1e-6, 'preto')
})

test('desempenho de prepararBase (medido em 2 MP; o de 24 MP está no relatório)', (t) => {
  const W = 1920
  const H = 1080
  const rnd = sorteio(1)
  const sensor = new Uint16Array(W * H)
  for (let i = 0; i < sensor.length; i++) sensor[i] = 256 + Math.floor(rnd() * 3000)
  const { negativo } = fotografar(plana([0.2, 0.2, 0.2], 8, 8), { margem: { x: 0, y: 0, direita: 0, baixo: 0 } })
  negativo.sensor = { largura: W, altura: H, dados: sensor }
  negativo.area = { x: 0, y: 0, largura: W, altura: H }
  for (const demosaico of ['rapido', 'qualidade']) {
    const t0 = performance.now()
    const base = prepararBase(negativo, { demosaico })
    const ms = performance.now() - t0
    t.diagnostic(`${demosaico}: ${ms.toFixed(0)} ms em ${((W * H) / 1e6).toFixed(1)} MP (${((ms * 1e6) / (W * H)).toFixed(0)} ns/px)`)
    assert.equal(base.imagem.dados.length, W * H * 3)
  }
})

// Arquivo já sem mosaico (Sony "sem perdas" M e S, DNG LinearRaw): o mesmo caminho de ida, sem o mosaico. `aplicado`
// grava o dado já multiplicado pelo branco, como o YCbCr da Sony.
function fotografarSemMosaico(img, { aplicado = false, preto = 256, branco = 4095 } = {}) {
  const { negativo, ganhos } = fotografar(plana([0.18, 0.18, 0.18], 2, 2)) // só os campos de cor da mesma câmera
  const cm = mulM(CAMERA, rgbParaXyz('rec2020'))
  const noBranco = mulV(CAMERA, xyParaXYZ(D65))
  const maior = Math.max(...noBranco)
  const { largura, altura, dados } = img
  const sensor = new Uint16Array(largura * altura * 3)
  for (let i = 0; i < largura * altura; i++) {
    for (let c = 0; c < 3; c++) {
      let s = ((cm[c * 3] * dados[i * 3] + cm[c * 3 + 1] * dados[i * 3 + 1] + cm[c * 3 + 2] * dados[i * 3 + 2]) / maior) * (branco - preto)
      if (aplicado) s *= ganhos[c]
      sensor[i * 3 + c] = Math.min(branco, Math.max(0, Math.round(preto + s)))
    }
  }
  return {
    ...negativo,
    sensor: { largura, altura, amostras: 3, dados: sensor },
    area: { x: 0, y: 0, largura, altura },
    cfa: { tipo: 'linear' },
    preto: { porCanal: [preto, preto, preto] },
    branco: { declarado: [branco, branco, branco] },
    wb: { comoFotografado: ganhos, ...(aplicado ? { aplicado: true } : {}) },
  }
}

test('sem mosaico: a cena volta sem demosaico, com o branco aplicado ou não, e a redução agrupa', () => {
  for (const aplicado of [false, true]) {
    const n = fotografarSemMosaico(imagem, { aplicado })
    const b = prepararBase(n)
    assert.equal(b.demosaico, null)
    assert.deepEqual([b.imagem.largura, b.imagem.altura], [imagem.largura, imagem.altura])
    const d = deltaE(b.imagem, imagem)
    assert.ok(d.medio < 0.004, `aplicado=${aplicado}: ΔE médio ${d.medio.toFixed(4)}`)
    const b2 = prepararBase(n, { reduzir: 2 })
    assert.equal(b2.demosaico, 'agrupado')
    assert.deepEqual([b2.imagem.largura, b2.imagem.altura], [imagem.largura / 2, imagem.altura / 2])
  }
})

test('sem mosaico: canal cortado é reconstruído pela razão da borda (só para cima)', () => {
  // uma mancha que passa do teto só no vermelho da câmera (laranja forte), sobre um fundo médio
  const img = plana([0.1, 0.1, 0.1], 96, 64)
  for (let y = 16; y < 48; y++) {
    for (let x = 24; x < 72; x++) {
      const r = Math.hypot(x - 48, (y - 32) * 1.5)
      const k = Math.max(0, 1 - r / 26)
      img.dados.set([0.1 + 2.2 * k, 0.1 + 0.9 * k, 0.1 + 0.35 * k], (y * 96 + x) * 3)
    }
  }
  const alto = prepararBase(fotografarSemMosaico(img, { branco: 65535, preto: 256 }))
  const n = fotografarSemMosaico(img, { branco: 4095 * 4, preto: 256 })
  const b = prepararBase(n)
  assert.ok(b.cortado.um > 0, 'houve canal cortado')
  // no miolo da mancha, o canal reconstruído chega perto do que um sensor sem corte veria (e nunca fica abaixo do corte)
  const i = (32 * 96 + 48) * 3
  const razao = b.imagem.dados[i] / alto.imagem.dados[i]
  assert.ok(razao > 0.8 && razao < 1.25, `vermelho reconstruído / verdadeiro = ${razao.toFixed(3)}`)
})
