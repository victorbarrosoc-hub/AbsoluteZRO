// A família Absolute ZRO vista do AEON: o Maestro entra no lançamento em Beta grátis, atrás de uma chave só
// (MAESTRO_NA_FAMILIA, virada por scripts/lancamento-maestro.mjs na raiz), com o ícone dele em marca/familia.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { FAMILIA } from '../src/familia.js'

const fonte = readFileSync(new URL('../src/familia.js', import.meta.url), 'utf8')

test('Maestro: chave única, link oficial e ícone próprio; entra só com a chave ligada', () => {
  const chave = /^const MAESTRO_NA_FAMILIA = (true|false)$/m.exec(fonte)
  assert.ok(chave)
  assert.match(fonte, /\{ id: 'maestro', nome: 'Maestro', href: 'https:\/\/maestro\.absolutezro\.com', icone: 'maestro\.svg'/)
  assert.ok(existsSync(new URL('../marca/familia/maestro.svg', import.meta.url)))
  assert.equal(
    FAMILIA.some((f) => f.id === 'maestro'),
    chave[1] === 'true',
  )
})

test('cada ícone da família existe em marca/familia', () => {
  for (const f of FAMILIA) if (f.icone !== 'absolute-zro') assert.ok(existsSync(new URL(`../marca/familia/${f.icone}`, import.meta.url)), f.icone)
})
