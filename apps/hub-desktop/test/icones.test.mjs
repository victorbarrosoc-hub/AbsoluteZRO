// Os ícones gerados existem e são válidos (o mesmo formato que o electron-builder e os sistemas leem).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { lerPng, gravarPng, redimensionar } from '../scripts/png.mjs'
import { montarIco, montarIcns } from '../scripts/icons.mjs'

const BUILD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build')
const ler = (f) => fs.readFileSync(path.join(BUILD, f))

function entradasIcns(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'icns')
  assert.equal(buf.readUInt32BE(4), buf.length)
  const out = {}
  for (let p = 8; p < buf.length;) {
    const tipo = buf.toString('latin1', p, p + 4)
    const len = buf.readUInt32BE(p + 4)
    out[tipo] = lerPng(buf.subarray(p + 8, p + len))
    p += len
  }
  return out
}

function entradasIco(buf) {
  assert.equal(buf.readUInt16LE(2), 1)
  const n = buf.readUInt16LE(4)
  return Array.from({ length: n }, (_, i) => {
    const e = 6 + i * 16
    const png = lerPng(buf.subarray(buf.readUInt32LE(e + 12), buf.readUInt32LE(e + 12) + buf.readUInt32LE(e + 8)))
    assert.equal(png.width, buf[e] || 256)
    return png.width
  })
}

test('png: lê, reduz e grava sem perder o alfa', () => {
  const img = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) }
  for (let i = 3; i < 64; i += 8) img.data[i] = 0
  const volta = lerPng(gravarPng(img))
  assert.deepEqual([...volta.data], [...img.data])
  const meio = redimensionar(img, 2, 2)
  assert.equal(meio.data[3], 128)
  assert.equal(meio.data[0], 255, 'sem halo escuro')
})

test('ícones do app: 1024 no Mac, .icns e .ico válidos', () => {
  const mac = lerPng(ler('icon.png'))
  assert.deepEqual([mac.width, mac.height], [1024, 1024])
  // a arte do Mac já vem com o squircle: o canto é transparente
  assert.equal(mac.data[3], 0)
  const icns = entradasIcns(ler('icon.icns'))
  assert.equal(icns.ic10.width, 1024)
  assert.equal(icns.ic07.width, 128)
  const ico = entradasIco(ler('icon.ico'))
  for (const l of [16, 32, 48, 256]) assert.ok(ico.includes(l), `ico sem ${l}px`)
  assert.equal(lerPng(ler('icon-windows.png')).width, 256)
  const bg = lerPng(ler('background.png'))
  assert.deepEqual([bg.width, bg.height], [540, 380])
  assert.deepEqual([lerPng(ler('background@2x.png')).width, lerPng(ler('background@2x.png')).height], [1080, 760])
})

test('montarIcns/montarIco geram a estrutura certa', () => {
  const img = { width: 1024, height: 1024, data: new Uint8ClampedArray(1024 * 1024 * 4).fill(200) }
  assert.deepEqual(Object.keys(entradasIcns(montarIcns(img))).sort(), ['ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'])
  assert.deepEqual(entradasIco(montarIco(img, [16, 256])), [16, 256])
})
