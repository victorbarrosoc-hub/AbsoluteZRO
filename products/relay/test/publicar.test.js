// O site fica fechado até o lançamento: sem RELEASE=released, nada do conversor vai para o ar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicar } from '../scripts/publicar-site.mjs'

test('fechado por padrão: "Em breve" em todas as rotas, sem conversor, motor nem presets', () => {
  const saida = mkdtempSync(join(tmpdir(), 'relay-publico-'))
  try {
    assert.equal(publicar({ saida, aberto: false }), false)
    for (const r of ['index.html', 'converter.html', 'qualidade.html', 'marca/index.html', '404.html'])
      assert.match(readFileSync(join(saida, r), 'utf8'), /<title>Relay · Em breve<\/title>/, r)
    for (const f of ['app/converter.js', 'app/motor.js', 'src/presets.js', 'vendor/mediabunny.min.mjs']) assert.ok(!existsSync(join(saida, f)), `${f} no ar`)
    for (const f of ['app/relay.css', 'app/tema.js', 'marca/relay-icone.svg', 'marca/og.png', 'marca/app/apple-touch-icon.png']) assert.ok(existsSync(join(saida, f)), f)
  } finally {
    rmSync(saida, { recursive: true, force: true })
  }
})

test('aberto (RELEASE=released): o site inteiro', () => {
  const saida = mkdtempSync(join(tmpdir(), 'relay-publico-'))
  try {
    assert.equal(publicar({ saida, aberto: true }), true)
    for (const f of ['index.html', 'converter.html', 'app/motor.js', 'src/presets.js', 'vendor/mediabunny.min.mjs']) assert.ok(existsSync(join(saida, f)), f)
    assert.doesNotMatch(readFileSync(join(saida, 'index.html'), 'utf8'), /Em breve/)
  } finally {
    rmSync(saida, { recursive: true, force: true })
  }
})
