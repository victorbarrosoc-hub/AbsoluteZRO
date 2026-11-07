// Os ícones gerados (npm run icones) existem, são do tamanho certo e vêm do ícone oficial.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { lerPng } from '../../../../apps/hub-desktop/scripts/png.mjs'

const BUILD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build')
const ler = (f) => fs.readFileSync(path.join(BUILD, f))
const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4))

test('PNGs nos tamanhos de cada sistema, com fundo transparente', () => {
  for (const [f, lado] of [
    ['icon.png', 1024],
    ['icon-source-mac.png', 1024],
    ['icon-source-windows.png', 1024],
    ['icon-windows.png', 256],
    ['icon-linux.png', 512],
  ]) {
    const img = lerPng(ler(f))
    assert.equal(img.width, lado, f)
    assert.equal(img.height, lado, f)
    assert.equal(px(img, 0, 0)[3], 0, `${f}: canto transparente`)
  }
})

test('é o ícone oficial: placa com os cantos do app, sem margem em branco no Windows e com o grid da Apple no Mac', () => {
  const win = lerPng(ler('icon-source-windows.png'))
  assert.equal(px(win, 4, 4)[3], 0) // canto arredondado
  assert.equal(px(win, 512, 512)[3], 255)
  const mac = lerPng(ler('icon-source-mac.png'))
  // grid da Apple: margem transparente em volta do corpo de 824 px
  assert.equal(px(mac, 40, 512)[3], 0)
  assert.equal(px(mac, 512, 980)[3], 0)
  assert.equal(px(mac, 512, 512)[3], 255)
})

test('.icns e .ico válidos', () => {
  const icns = ler('icon.icns')
  assert.equal(icns.toString('latin1', 0, 4), 'icns')
  assert.equal(icns.readUInt32BE(4), icns.length)
  assert.ok(icns.includes(Buffer.from('ic10')))
  const ico = ler('icon.ico')
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 7)
})
