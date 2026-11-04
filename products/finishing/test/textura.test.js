// A textura de filme (src/cor/textura.js) e a DCTL que vai para o Resolve (src/cor/dctl.js): o grão é o mesmo nos dois
// lados (mesmo hash, mesma gaussiana em grade), a física de cada efeito vai no sentido certo e o pacote leva a DCTL.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEXTURA_NEUTRA, aplicarTextura, campoDeGrao, lerTextura, pesoDoGrao, ruido, tabelaDoGrao, texturaAtiva } from '../src/cor/textura.js'
import { escreverDctlTextura } from '../src/cor/dctl.js'
import { montarPacote } from '../src/cor/pacote.js'

test('grão: campo gaussiano de média 0 e variância 1 em todo tamanho, determinístico pela semente', () => {
  for (const s of [0.4, 1, 2.5, 5]) {
    const f = campoDeGrao(160, 100, s, 0, 3)
    let m = 0
    let v = 0
    for (const x of f) {
      m += x
      v += x * x
    }
    m /= f.length
    v = v / f.length - m * m
    assert.ok(Math.abs(m) < 0.12 && Math.abs(v - 1) < 0.12, `sigma ${s}: média ${m}, variância ${v}`)
  }
  assert.deepEqual(campoDeGrao(40, 30, 1.2, 1, 9), campoDeGrao(40, 30, 1.2, 1, 9))
  assert.notDeepEqual(campoDeGrao(40, 30, 1.2, 1, 9), campoDeGrao(40, 30, 1.2, 1, 10))
})

test('grão: a conta da DCTL (soma 2D na grade) dá o mesmo campo da prévia (separável), pixel a pixel', () => {
  // reimplementação literal da função `campo` da DCTL
  const campoDctl = (px, py, s, c, semente) => {
    const k = Math.max(1, Math.floor(s / 1.5))
    const r = Math.ceil(3 * s)
    const i0 = Math.floor((px - r) / k)
    const i1 = Math.ceil((px + r) / k)
    const j0 = Math.floor((py - r) / k)
    const j1 = Math.ceil((py + r) / k)
    let soma = 0
    let nx = 0
    let ny = 0
    for (let i = i0; i <= i1; i++) nx += Math.exp(-((px - i * k) ** 2) / (s * s))
    for (let j = j0; j <= j1; j++) {
      const gy = Math.exp((-0.5 * (py - j * k) ** 2) / (s * s))
      ny += gy * gy
      let linha = 0
      for (let i = i0; i <= i1; i++) linha += ruido(i, j, c, semente) * Math.exp((-0.5 * (px - i * k) ** 2) / (s * s))
      soma += linha * gy
    }
    return soma / Math.sqrt(nx * ny)
  }
  for (const s of [0.6, 3.2]) {
    const w = 50
    const f = campoDeGrao(w, 40, s, 2, 7)
    for (const [x, y] of [
      [0, 0],
      [13, 7],
      [49, 39],
      [25, 20],
    ])
      assert.ok(Math.abs(f[y * w + x] - campoDctl(x, y, s, 2, 7)) < 1e-4, `sigma ${s} (${x},${y})`)
  }
})

test('textura: neutra não muda nada; o grão preserva a luz média; o preto fica preto; a halation é vermelha', () => {
  const w = 120
  const h = 80
  const img = new Float32Array(w * h * 3).fill(0.18)
  assert.equal(texturaAtiva(TEXTURA_NEUTRA), false)
  assert.deepEqual(aplicarTextura(img, w, h, TEXTURA_NEUTRA), img)
  // grão: média do log da luz quase igual
  const g = aplicarTextura(img, w, h, { grao: 1 })
  let m = 0
  for (let i = 0; i < g.length; i++) m += Math.log2(g[i] / 0.18)
  assert.ok(Math.abs(m / g.length) < 0.01)
  assert.ok(g.some((v) => Math.abs(v - 0.18) > 0.001))
  // preto continua preto (o grão é densidade: multiplica)
  const preto = aplicarTextura(new Float32Array(w * h * 3), w, h, { grao: 2 })
  assert.ok(preto.every((v) => v === 0))
  // halation: um ponto forte acende o vermelho em volta mais que o verde, e o verde mais que o azul
  const forte = new Float32Array(w * h * 3).fill(0.05)
  for (let y = 38; y < 42; y++) for (let x = 58; x < 62; x++) forte.fill(20, (y * w + x) * 3, (y * w + x) * 3 + 3)
  const o = aplicarTextura(forte, w, h, { halation: 1 }, { largura: 1920 })
  const i = (40 * w + 52) * 3
  assert.ok(o[i] - 0.05 > o[i + 1] - 0.05 && o[i + 1] - 0.05 > o[i + 2] - 0.05 && o[i] > 0.06, `${o[i]} ${o[i + 1]} ${o[i + 2]}`)
})

test('DCTL: controles com os valores do Lab, assinatura de transformação espacial e granularidade da película', () => {
  const t = lerTextura({ grao: 1.3, bitola: '16', halation: 0.7, difusao: 0.2, semente: 42 })
  const d = escreverDctlTextura(t, { negativo: '5219', titulo: 'Teste' })
  assert.match(d, /__DEVICE__ float3 transform\(int p_Width, int p_Height, int p_X, int p_Y, __TEXTURE__ p_TexR, __TEXTURE__ p_TexG, __TEXTURE__ p_TexB\)/)
  assert.equal((d.match(/DEFINE_UI_PARAMS\(/g) ?? []).length, 11)
  assert.match(d, /DEFINE_UI_PARAMS\(p_Grao, Grão, DCTLUI_SLIDER_FLOAT, 1\.300000f, 0\.0, 2\.0, 0\.01\)/)
  assert.match(d, /DEFINE_UI_PARAMS\(p_Bitola, Bitola, DCTLUI_COMBO_BOX, 2,/)
  assert.match(d, /DCTLUI_SLIDER_INT, 42, 0, 1000, 1\)/)
  assert.match(d, /__CONSTANT__ float GRANULARIDADE = 0\.034000f;/)
  // chaves balanceadas
  assert.equal((d.match(/\{/g) ?? []).length, (d.match(/\}/g) ?? []).length)
})

test('pacote: com textura leva a DCTL e o LEIA-ME põe a textura antes do look', () => {
  const p = montarPacote({ nome: 'Grão', base: 'revela', textura: { grao: 1, halation: 0.5 } }, { qc: false })
  const dctl = p.arquivos.find((a) => a.nome.endsWith('_Textura_DWG-DI.dctl'))
  assert.ok(dctl)
  const leia = p.arquivos.find((a) => a.nome.endsWith('LEIA-ME.txt')).dados
  assert.match(leia, /correção do frame \(CDL\) {2}→ {2}textura \(DCTL\) {2}→ {2}look \(LMT\)/)
  const sem = montarPacote({ nome: 'Limpo', base: 'revela' }, { qc: false })
  assert.equal(
    sem.arquivos.some((a) => a.nome.endsWith('.dctl')),
    false,
  )
})

test('grão pela física: pesa no pé do negativo, a cópia comprime as altas, e "Grão nas sombras" só mexe abaixo do cinza', () => {
  const t = tabelaDoGrao('5219')
  assert.ok(Math.abs(pesoDoGrao(t, 0) - 1) < 1e-9, 'cinza = 1')
  assert.ok(pesoDoGrao(t, -6) > 1.5, 'fundo do pé pesa')
  for (let e = -10; e <= 8; e += 0.25) assert.ok(pesoDoGrao(t, e) >= 0.5 && pesoDoGrao(t, e) <= 4, `limite em ${e}`)
  // a DCTL leva a mesma tabela
  const d = escreverDctlTextura({ ...TEXTURA_NEUTRA, grao: 1 }, { negativo: '5219' })
  assert.match(d, new RegExp(`PESO_GRAO\\[73\\] = \\{ ${t[0].toFixed(5)}f`))
  assert.match(d, /p_SombraGrao/)
})
