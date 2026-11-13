// .cube (src/estilo/cube.js) e o look em LUT 3D (src/estilo/look.js): ler, escrever, interpolar, guardar e assar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'

import { neutro } from '../src/motor/ajustes.js'
import { revelar } from '../src/motor/revelar.js'
import { ErroCube, escreverCube, lerCube } from '../src/estilo/cube.js'
import { aplicarLut, aplicarLutEm, assar, compactar, criarLut, descompactar, lookDaPredefinicao, reamostrar } from '../src/estilo/look.js'
import { aplicar, criarPredefinicao } from '../src/estilo/predefinicao.js'
import { estilosDaCasa } from '../src/estilo/biblioteca.js'
import { baseDe, caminhoDoTitular, cenaDeSessao, deltaEMedio, emBytes, lerDoTitular, precisaDoTitular, sorteio } from './apoio-estilo.js'

const AGORA = '2026-11-13T12:00:00.000Z'

test('.cube: lê TITLE, LUT_3D_SIZE, DOMAIN_*, comentários e o dialeto do Resolve; escreve e lê de volta', () => {
  const lut = criarLut(3, (r, g, b, s) => {
    s[0] = 1 - r
    s[1] = g * 0.5
    s[2] = b
  })
  const texto = escreverCube({ ...lut, titulo: 'Inverte "vermelho"' })
  assert.ok(texto.startsWith('TITLE "Inverte  vermelho"\nLUT_3D_SIZE 3\n'))
  const lida = lerCube(texto)
  assert.equal(lida.lado, 3)
  assert.deepEqual(lida.dominio, { min: [0, 0, 0], max: [1, 1, 1] })
  for (let i = 0; i < lut.dados.length; i++) assert.ok(Math.abs(lida.dados[i] - lut.dados[i]) < 1e-6)
  // o vermelho varia mais rápido: a segunda linha de dados é r = 0,5
  assert.equal(texto.split('\n')[3], '0.500000 0.000000 0.000000')
  const resolve = lerCube(`# feito à mão\r\nLUT_3D_SIZE 2\r\nLUT_3D_INPUT_RANGE 0 2\r\n${'0 0 0\r\n'.repeat(8)}`)
  assert.deepEqual(resolve.dominio, { min: [0, 0, 0], max: [2, 2, 2] })
  const com = lerCube(`TITLE "x"\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\nLUT_3D_SIZE 2\nKEYWORD qualquer\n${'0.1 0.2 0.3\n'.repeat(8)}`)
  assert.equal(com.avisos.length, 1)
  assert.equal(lerCube(new TextEncoder().encode(texto)).lado, 3)
})

test('.cube: recusa clara do que não é lido', () => {
  const casos = [
    ['', 'vazia'],
    ['LUT_1D_SIZE 4\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n', 'so-1d'],
    ['LUT_1D_SIZE 2\nLUT_3D_SIZE 2\n0 0 0\n', 'com-shaper'],
    ['0 0 0\n', 'sem-tamanho'],
    ['LUT_3D_SIZE 1\n', 'lado'],
    ['LUT_3D_SIZE 99\n', 'lado'],
    ['LUT_3D_SIZE 2\n0 0 0\n', 'incompleta'],
    [`LUT_3D_SIZE 2\n${'0 0 0\n'.repeat(9)}`, 'incompleta'],
    ['LUT_3D_SIZE 2\n0 0 x\n', 'linha'],
    [`LUT_3D_SIZE 2\nDOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n${'0 0 0\n'.repeat(8)}`, 'dominio'],
  ]
  for (const [texto, codigo] of casos) {
    assert.throws(
      () => lerCube(texto),
      (e) => e instanceof ErroCube && e.codigo === codigo && e.message.length > 10,
      codigo,
    )
  }
})

test('tetraédrica: identidade exata, função afim exata, eixo cinza preservado e domínio respeitado', () => {
  const rnd = sorteio(5)
  const id = aplicarLut(criarLut(17))
  const s = [0, 0, 0]
  for (let i = 0; i < 2000; i++) {
    const c = [rnd(), rnd(), rnd()]
    id(c[0], c[1], c[2], s)
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(s[k] - c[k]) < 1e-6)
  }
  // a interpolação tetraédrica reproduz exatamente qualquer função afim amostrada na grade
  const afim = (r, g, b, o) => {
    o[0] = 0.1 + 0.5 * r + 0.2 * g + 0.1 * b
    o[1] = 0.8 * g - 0.1 * r + 0.05
    o[2] = 0.3 * b + 0.3 * r + 0.3 * g
    return o
  }
  const f = aplicarLut(criarLut(5, afim))
  const esperado = [0, 0, 0]
  for (let i = 0; i < 2000; i++) {
    const [r, g, b] = [rnd(), rnd(), rnd()]
    f(r, g, b, s)
    afim(r, g, b, esperado)
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(s[k] - esperado[k]) < 1e-5)
  }
  // uma LUT que só mexe no cinza mantém o cinza cinza entre os nós (a diagonal é aresta de todos os tetraedros)
  const curva = aplicarLut(
    criarLut(5, (r, g, b, o) => {
      o[0] = r ** 0.7
      o[1] = g ** 0.7
      o[2] = b ** 0.7
    }),
  )
  for (let v = 0; v <= 1; v += 0.01) {
    curva(v, v, v, s)
    assert.ok(Math.abs(s[0] - s[1]) < 1e-7 && Math.abs(s[1] - s[2]) < 1e-7)
  }
  // entrada fora do domínio fica presa na grade; NaN cai no zero
  id(2, -1, Number.NaN, s)
  assert.deepEqual([...s], [1, 0, 0])
  const dois = aplicarLut({ ...criarLut(3), dominio: { min: [0, 0, 0], max: [2, 2, 2] } })
  dois(1, 1, 1, s)
  assert.ok(Math.abs(s[0] - 0.5) < 1e-6)
})

test('quantidade de 0 a 200 e LUT compacta (16 bits em base64) dentro da predefinição', () => {
  const lut = criarLut(9, (r, g, b, o) => {
    o[0] = Math.min(1, r * 1.1)
    o[1] = g * 0.9
    o[2] = b
  })
  const bloco = Float32Array.of(0.5, 0.5, 0.5, 0.2, 0.4, 0.6)
  assert.deepEqual([...aplicarLutEm(lut, Float32Array.from(bloco), 0)], [...bloco])
  const cem = aplicarLutEm(lut, Float32Array.from(bloco), 100)
  const duzentos = aplicarLutEm(lut, Float32Array.from(bloco), 200)
  assert.ok(Math.abs(cem[0] - 0.55) < 1e-6)
  assert.ok(Math.abs(duzentos[0] - 0.6) < 1e-6)
  const { look, cortados } = compactar(lut, 'Teste')
  assert.equal(cortados, 0)
  assert.equal(look.dados.length, Math.ceil((9 ** 3 * 6) / 3) * 4)
  const volta = descompactar(look)
  for (let i = 0; i < lut.dados.length; i++) assert.ok(Math.abs(volta.dados[i] - lut.dados[i]) <= 0.5 / 65535 + 1e-7)
  const fora = compactar({ lado: 2, dados: Float32Array.of(...new Array(24).fill(1.5)) })
  assert.equal(fora.cortados, 8)
  // a predefinição guarda o look e o motor aplica pelo gancho de revelar
  const p = criarPredefinicao({ nome: 'Com look', ajustes: {}, look }, { agora: AGORA })
  const base = baseDe(cenaDeSessao(3, 64, 48))
  const comLook = revelar(base, aplicar(p, neutro()), { look: lookDaPredefinicao(p) })
  const semLook = revelar(base, neutro())
  const conta = Float32Array.from(semLook.dados)
  aplicarLutEm(volta, conta, 100)
  for (let i = 0; i < conta.length; i++) assert.ok(Math.abs(comLook.dados[i] - conta[i]) < 1e-5)
  assert.equal(reamostrar(lut, 17).lado, 17)
})

test('assar: a predefinição neutra vira a identidade; um estilo assado sobre o neutro dá o mesmo que o motor', () => {
  const identidade = assar(criarPredefinicao({ nome: 'Nada', ajustes: {} }, { agora: AGORA }), { lado: 9 })
  const grade = criarLut(9)
  let pior = 0
  for (let i = 0; i < grade.dados.length; i++) pior = Math.max(pior, Math.abs(identidade.lut.dados[i] - grade.dados[i]))
  assert.ok(pior < 1 / 255, `identidade com erro de ${pior * 255} códigos`)
  const base = baseDe(cenaDeSessao(9, 160, 107))
  for (const id of ['casa-retrato-dourado', 'casa-editorial-frio', 'casa-palco-e-show-led-domado']) {
    const p = estilosDaCasa().find((x) => x.id === id)
    const { lut, deFora } = assar(p, { lado: 33 })
    assert.deepEqual(deFora, [])
    const motor = emBytes(base, aplicar(p, neutro()))
    const neutra = revelar(base, neutro())
    aplicarLutEm(lut, neutra.dados, 100)
    const viaLut = { largura: neutra.largura, altura: neutra.altura, dados: new Uint8ClampedArray(neutra.largura * neutra.altura * 4), espaco: 'srgb' }
    for (let i = 0, o = 0; i < neutra.dados.length; i += 3, o += 4) {
      viaLut.dados[o] = Math.round(neutra.dados[i] * 255)
      viaLut.dados[o + 1] = Math.round(neutra.dados[i + 1] * 255)
      viaLut.dados[o + 2] = Math.round(neutra.dados[i + 2] * 255)
      viaLut.dados[o + 3] = 255
    }
    const erro = deltaEMedio(motor, viaLut)
    assert.ok(erro < 0.4, `${p.nome}: ΔE médio ${erro.toFixed(2)} (× 100)`)
  }
  // o que depende de vizinhança não cabe em LUT e é dito
  const comClareza = assar(
    estilosDaCasa().find((x) => x.id === 'casa-esporte-acao'),
    { lado: 5 },
  )
  assert.ok(comClareza.deFora.includes('presenca.clareza'))
  // e a .cube assada é uma .cube que se lê
  assert.equal(lerCube(escreverCube(identidade.lut)).lado, 9)
})

test('titular: as .cube reais são lidas e aplicadas', async (t) => {
  const pasta = 'predefinicoes'
  if (!precisaDoTitular(t, pasta)) return
  const arquivos = readdirSync(caminhoDoTitular(pasta)).filter((f) => f.endsWith('.cube'))
  if (!arquivos.length) return t.skip('sem .cube na pasta do titular')
  for (const [k, f] of arquivos.entries()) {
    const lut = lerCube(await lerDoTitular(`${pasta}/${f}`))
    assert.ok([17, 32, 33, 64, 65].includes(lut.lado), `${f}: lado ${lut.lado}`)
    const cor = aplicarLut(lut)(0.5, 0.5, 0.5, [0, 0, 0])
    assert.ok(cor.every((v) => Number.isFinite(v)))
    const { look } = compactar(lut, f)
    assert.equal(descompactar(look).lado, lut.lado)
    t.diagnostic(`.cube ${k + 1}: lado ${lut.lado}, ${lut.avisos.length} avisos`)
  }
})
