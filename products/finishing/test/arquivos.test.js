import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import { aplicar, assar, escreverCube, lerCube } from '../src/cor/cube.js'
import { codigoParaOklab, oklabParaCodigo } from '../src/cor/oklab.js'
import { gravarPng, lerPng } from '../src/imagem/png.js'
import { aplicarEmImagem, cena, lookConhecido } from './apoio.js'

const identidade = (r, g, b) => [r, g, b]

test('Oklab: branco é L 1 sem cor, e o código volta igual', () => {
  const [L, a, b] = codigoParaOklab(1, 1, 1)
  assert.ok(Math.abs(L - 1) < 1e-4 && Math.abs(a) < 1e-4 && Math.abs(b) < 1e-4)
  for (const c of [
    [0.1, 0.5, 0.9],
    [0.7, 0.3, 0.2],
    [0, 0, 0],
  ]) {
    const v = oklabParaCodigo(...codigoParaOklab(...c))
    v.forEach((x, i) => assert.ok(Math.abs(x - c[i]) < 1e-5))
  }
  // cor fora do Rec.709 perde saturação, não vira lixo
  assert.ok(oklabParaCodigo(0.6, 0.4, 0.3).every((x) => x >= 0 && x <= 1))
})

test('.cube: grava e lê de volta; identidade interpola sem erro', () => {
  const lut = assar(identidade, 17)
  const texto = escreverCube(lut, 'teste "com aspas"\nquebra')
  assert.match(texto, /^TITLE "teste  com aspas  quebra"\nLUT_3D_SIZE 17\n/)
  assert.equal(texto.trim().split('\n').length, 4 + 17 ** 3)
  const lido = lerCube(texto)
  assert.equal(lido.tamanho, 17)
  for (const p of [
    [0.13, 0.77, 0.5],
    [0, 1, 0.999],
  ]) {
    aplicar(lido, ...p).forEach((v, i) => assert.ok(Math.abs(v - p[i]) < 1e-5))
  }
  assert.throws(() => assar(identidade, 32), /17, 33 ou 65/)
  assert.throws(() => lerCube('LUT_3D_SIZE 2\n0 0 0\n'), /incompleto/)
})

// grava um PNG com o filtro escolhido em cada linha, para conferir a leitura dos cinco filtros
function pngComFiltros(largura, altura, rgb) {
  const linha = largura * 3
  const partes = []
  for (let y = 0; y < altura; y++) {
    const f = y % 5
    const atual = rgb.subarray(y * linha, (y + 1) * linha)
    const ant = y ? rgb.subarray((y - 1) * linha, y * linha) : new Uint8Array(linha)
    const out = Buffer.alloc(linha + 1)
    out[0] = f
    for (let x = 0; x < linha; x++) {
      const a = x >= 3 ? atual[x - 3] : 0
      const b = ant[x]
      const c = x >= 3 ? ant[x - 3] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]
      out[x + 1] = (atual[x] - pred) & 0xff
    }
    partes.push(out)
  }
  const bloco = (t, d) => {
    const tb = Buffer.from(t, 'latin1')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(d.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([tb, d])) >>> 0)
    return Buffer.concat([len, tb, d, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(partes))),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

test('PNG: lê os cinco filtros e grava de volta igual', () => {
  const largura = 7
  const altura = 10
  const rgb = Uint8Array.from({ length: largura * altura * 3 }, (_, i) => (i * 37 + (i >> 3) * 11) & 0xff)
  const img = lerPng(pngComFiltros(largura, altura, rgb))
  assert.equal(img.largura, largura)
  img.pixels.forEach((v, i) => assert.equal(Math.round(v * 255), rgb[i]))
  const devolta = lerPng(gravarPng(img))
  devolta.pixels.forEach((v, i) => assert.equal(Math.round(v * 255), rgb[i]))
  assert.throws(() => lerPng(Buffer.from('não é png')), /Não é um PNG/)
})

test('linha de comando: referência + material → .cube e prévia', () => {
  const dir = mkdtempSync(join(tmpdir(), 'finishing-'))
  try {
    writeFileSync(join(dir, 'ref.png'), gravarPng(aplicarEmImagem(cena(11), lookConhecido)))
    writeFileSync(join(dir, 'mat.png'), gravarPng(cena(12)))
    const saida = execFileSync(process.execPath, [
      new URL('../src/cli.js', import.meta.url).pathname,
      '--referencia',
      join(dir, 'ref.png'),
      '--material',
      join(dir, 'mat.png'),
      '--saida',
      join(dir, 'look.cube'),
      '--previa',
      join(dir, 'previa.png'),
    ]).toString()
    assert.match(saida, /LUT 33³ gravada/)
    assert.match(saida, /Sombras:/)
    assert.equal(lerCube(readFileSync(join(dir, 'look.cube'), 'utf8')).tamanho, 33)
    assert.equal(lerPng(readFileSync(join(dir, 'previa.png'))).largura, 160)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
