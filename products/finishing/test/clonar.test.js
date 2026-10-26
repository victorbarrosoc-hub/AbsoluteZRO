import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicar, assar } from '../src/cor/cube.js'
import { clonarLut, mesmoQuadro, orientarPar } from '../src/cor/clonar.js'
import { lerParaLightroom, presetLightroom } from '../src/cor/lightroom.js'
import { criarRevelaLook } from '../src/cor/looks.js'
import { aplicarEmImagem, cena, distanciaMedia, lookConhecido } from './apoio.js'

test('Clonar LUT: o antes e depois de um frame refaz o look em outra cena', () => {
  const antes = cena(5, 320, 180)
  const clone = clonarLut(antes, aplicarEmImagem(antes, lookConhecido))
  assert.ok(clone.resumo.erro < 0.01, `erro no próprio frame: ${clone.resumo.erro}`)
  const outra = cena(9, 320, 180)
  const alvo = aplicarEmImagem(outra, lookConhecido)
  const lut = assar(clone.aplicar, 33)
  const saida = aplicarEmImagem(outra, (r, g, b) => aplicar(lut, r, g, b))
  const antesDist = distanciaMedia(outra, alvo)
  const depoisDist = distanciaMedia(saida, alvo)
  assert.ok(depoisDist < antesDist * 0.25, `clone longe do look: ${depoisDist} (sem nada: ${antesDist})`)
})

test('Clonar LUT: frame igual nos dois lados não mexe; tamanhos diferentes recusam', () => {
  const img = cena(3, 160, 90)
  const clone = clonarLut(img, img)
  for (const c of [
    [0.2, 0.3, 0.4],
    [0.8, 0.5, 0.1],
    [0.5, 0.5, 0.5],
  ])
    clone.aplicar(...c).forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 0.01, `${c} mudou para ${v}`))
  assert.throws(() => clonarLut(img, cena(3, 80, 45)), /mesmo tamanho/)
})

test('preset Lightroom: identidade fica zerada; o look vira curvas e HSL num .xmp válido', () => {
  const nada = lerParaLightroom((r, g, b) => [r, g, b])
  for (const c of nada.curvas) c.forEach(([x, y]) => assert.equal(x, y))
  for (const f of Object.values(nada.hsl)) assert.deepEqual(f, { matiz: 0, saturacao: 0, luz: 0 })

  const look = criarRevelaLook()
  const { curvas, hsl } = lerParaLightroom(look.aplicar)
  // sombras frias e altas quentes do Revela Look aparecem nas curvas por canal
  assert.ok(curvas[2][1][1] > curvas[0][1][1], 'sombra devia ter mais azul que vermelho')
  assert.ok(curvas[0][9][1] > curvas[2][9][1], 'alta devia ter mais vermelho que azul')
  assert.ok(hsl.Green.matiz < 0, 'verde devia girar para o amarelo')

  const xmp = presetLightroom(look.aplicar, 'Revela <Look> & cia')
  assert.match(xmp, /^<x:xmpmeta xmlns:x="adobe:ns:meta\/"/)
  assert.match(xmp, /crs:PresetType="Normal"/)
  assert.match(xmp, /<crs:ToneCurvePV2012Red>/)
  assert.match(xmp, /crs:HueAdjustmentGreen="-\d+"/)
  assert.match(xmp, /Revela &lt;Look&gt; &amp; cia/)
  // todo valor de HSL dentro do que o Lightroom aceita
  for (const [, v] of xmp.matchAll(/Adjustment\w+="(-?\d+)"/g)) assert.ok(Math.abs(Number(v)) <= 100)
})

// "log para tela" sintético: curva forte (o contraste que o grade põe num frame lavado) e um pouco de cor nas altas
const deLog = (r, g, b) => {
  const s = (v) => 1 / (1 + Math.exp(-9 * (v - 0.45)))
  const n = (v) => (s(v) - s(0)) / (s(1) - s(0))
  return [Math.min(1, n(r) * 1.03), n(g), n(b) * 0.95]
}
const lavar = (img) => aplicarEmImagem(img, (r, g, b) => [0.25 + r * 0.5, 0.25 + g * 0.5, 0.25 + b * 0.5])

test('Clonar LUT: a curva do grade vale em outra cena, e mais frames do mesmo grade acertam melhor', () => {
  const [a, b, c] = [11, 12, 13].map((s) => lavar(cena(s, 240, 135)))
  const umFrame = clonarLut(a, aplicarEmImagem(a, deLog))
  const doisFrames = clonarLut([a, b], [aplicarEmImagem(a, deLog), aplicarEmImagem(b, deLog)])
  assert.equal(doisFrames.resumo.frames, 2)
  const alvo = aplicarEmImagem(c, deLog)
  const semNada = distanciaMedia(c, alvo)
  const comUm = distanciaMedia(aplicarEmImagem(c, umFrame.aplicar), alvo)
  const comDois = distanciaMedia(aplicarEmImagem(c, doisFrames.aplicar), alvo)
  assert.ok(comUm < semNada * 0.15, `um frame: ${comUm} (sem nada: ${semNada})`)
  assert.ok(comDois <= comUm * 1.02, `dois frames (${comDois}) deviam acertar pelo menos como um (${comUm})`)
  assert.throws(() => clonarLut([a, b], [a]), /seu frame com a cor/)
})

test('Clonar LUT: o par novo se orienta sozinho e frame de outra cena é recusado', () => {
  const a = lavar(cena(21, 240, 135))
  const b = lavar(cena(22, 240, 135))
  const lut = clonarLut(a, aplicarEmImagem(a, deLog))
  const bCor = aplicarEmImagem(b, deLog)
  for (const [x, y] of [
    [b, bCor],
    [bCor, b],
  ]) {
    const par = orientarPar(lut, x, y)
    assert.equal(par.antes, b, 'o "sem a cor" devia ser o frame lavado')
    assert.equal(par.depois, bCor)
  }
  assert.equal(orientarPar(lut, a, bCor), null)
  assert.ok(mesmoQuadro(b, bCor))
  assert.ok(!mesmoQuadro(a, bCor))
})
