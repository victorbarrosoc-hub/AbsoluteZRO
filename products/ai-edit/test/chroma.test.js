// Remover fundo verde (src/chroma.js e app/chroma.js): a conta de referência, a cor medida na borda, a operação na linha
// (imutável, desfaz) e o shader da placa no Chromium de verdade, conferido pixel a pixel contra a conta.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import { CORES, PADRAO, corDaBorda, normalizar, recortar, recortarPixel } from '../src/chroma.js'
import { juntarContinuos as juntar } from '../src/linha.js'
import { CABECALHOS_SITE, servir } from '../scripts/servidor.mjs'

const verde = [0, 177 / 255, 64 / 255]
const pele = [0.86, 0.62, 0.5]

test('conta: o verde some, a pele fica, a borda é meio termo e o reflexo verde sai', () => {
  const aj = normalizar(PADRAO)
  assert.equal(recortarPixel(...verde, aj).a, 0)
  assert.equal(recortarPixel(0, 0.55, 0.2, aj).a, 0, 'a sombra no fundo continua fundo (só a cor conta)')
  assert.equal(recortarPixel(...pele, aj).a, 1)
  // metade fundo, metade pele (o fio de cabelo, a borda desfocada): meio transparente
  const borda = recortarPixel(0.43, 0.657, 0.37, aj).a
  assert.ok(borda > 0.3 && borda < 0.7, `borda meio transparente, veio ${borda}`)
  const reflexo = recortarPixel(0.7, 0.8, 0.5, aj)
  assert.ok(reflexo.a > 0.9)
  assert.ok(reflexo.g < 0.8 && reflexo.g >= 0.7, 'o verde a mais vai para o nível do vermelho')
  const azul = normalizar({ ...PADRAO, cor: CORES.azul })
  assert.equal(recortarPixel(0, 71 / 255, 187 / 255, azul).a, 0)
  assert.equal(recortarPixel(...verde, azul).a, 1, 'com a chave azul, o verde fica')
})

test('a cor do fundo vem da borda do quadro; sem borda colorida, o verde padrão', () => {
  const w = 40
  const h = 24
  const img = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const meio = x > 12 && x < 28 && y > 6
      img.set(meio ? [220, 160, 130, 255] : [12, 190, 70, 255], i)
    }
  assert.equal(corDaBorda(img, w, h), '#0CBE46')
  assert.equal(corDaBorda(new Uint8ClampedArray(w * h * 4).fill(128), w, h), PADRAO.cor)
})

test('na linha: liga, ajusta dentro dos limites e desliga sem tocar a linha antiga; clipes com recortes diferentes não se juntam', () => {
  const linha = { clipes: [{ id: 'a', midia: 'm', ini: 0, fim: 10 }, { id: 'b', midia: 'm', ini: 10, fim: 20 }] }
  const ligada = recortar(linha, 'a', { cor: '#12ab34', tolerancia: 9, suavidade: 0.05, derramamento: -1 })
  assert.equal(linha.clipes[0].chroma, undefined)
  assert.deepEqual(ligada.clipes[0].chroma, { cor: '#12AB34', tolerancia: 0.4, suavidade: 0.05, derramamento: 0 })
  assert.equal(recortar(ligada, 'a', ligada.clipes[0].chroma), ligada, 'nada mudou: a mesma linha')
  assert.equal(recortar(ligada, 'a', null).clipes[0].chroma, undefined)
  assert.equal(juntar(ligada).clipes.length, 2)
  assert.equal(juntar(recortar(ligada, 'b', ligada.clipes[0].chroma)).clipes.length, 1)
})

let s
let navegador
before(async () => {
  s = await servir({ cabecalhos: CABECALHOS_SITE })
  navegador = await createRequire(import.meta.url)('playwright').chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
})
after(async () => {
  await navegador?.close()
  s?.servidor.close()
})

test('no Chromium: o shader da placa dá o mesmo alfa e a mesma cor que a conta', async () => {
  const p = await navegador.newPage()
  const erros = []
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(s.url + 'entrar.html')
  const cores = [verde, pele, [0.43, 0.657, 0.37], [0.7, 0.8, 0.5], [0, 0.55, 0.2], [0.1, 0.1, 0.1]]
  const r = await p.evaluate(async (cores) => {
    const { Recorte, medirCor } = await import('/app/chroma.js')
    const { PADRAO } = await import('/src/chroma.js')
    const fonte = new OffscreenCanvas(cores.length, 1)
    const fx = fonte.getContext('2d')
    cores.forEach(([r, g, b], i) => {
      fx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`
      fx.fillRect(i, 0, 1, 1)
    })
    const rec = new Recorte(new OffscreenCanvas(cores.length, 1))
    if (!rec.pronto) return { semGl: true }
    const tela = rec.desenhar(fonte, PADRAO)
    const leitura = new OffscreenCanvas(cores.length, 1)
    const lx = leitura.getContext('2d', { willReadFrequently: true })
    lx.drawImage(tela, 0, 0)
    const dados = lx.getImageData(0, 0, cores.length, 1).data
    // a cor medida num quadro de fundo verde com uma pessoa no meio
    const q = new OffscreenCanvas(320, 180)
    const qx = q.getContext('2d')
    qx.fillStyle = '#00b140'
    qx.fillRect(0, 0, 320, 180)
    qx.fillStyle = '#dca080'
    qx.fillRect(110, 40, 100, 140)
    return { px: [...dados], fonte: [...fx.getImageData(0, 0, cores.length, 1).data], cor: medirCor(q, 320, 180) }
  }, cores)
  assert.ok(!r.semGl, 'sem WebGL2 no Chromium de teste')
  for (let i = 0; i < cores.length; i++) {
    const [R, G, B] = r.fonte.slice(i * 4, i * 4 + 3).map((v) => v / 255)
    const ref = recortarPixel(R, G, B, PADRAO)
    const a = r.px[i * 4 + 3] / 255
    assert.ok(Math.abs(a - ref.a) < 0.02, `cor ${i}: alfa ${a} × conta ${ref.a}`)
    // a cor só vale onde há alfa (o canvas guarda pré-multiplicado e perde a cor do que é transparente)
    if (ref.a > 0.9) assert.ok(Math.abs(r.px[i * 4 + 1] / 255 - ref.g) < 0.02, `cor ${i}: verde ${r.px[i * 4 + 1] / 255} × conta ${ref.g}`)
  }
  assert.equal(r.cor, '#00B140')
  assert.deepEqual(erros, [])
})
