// As cópias do Absolute ZRO para computador (scripts/compartilhado.mjs) são idênticas às de apps/hub-desktop.
// Falhou? `npm run compartilhado` e commit das cópias.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { COMPARTILHADOS, diferentes, RAIZ } from '../scripts/compartilhado.mjs'

test('cópias de apps/hub-desktop em dia', () => {
  assert.ok(COMPARTILHADOS.includes('desktop/atualizador.cjs'))
  assert.deepEqual(diferentes(), [])
})

test('marca e ícone oficiais: o wordmark flat do HUB e o ícone do TPeasy, sem cópia diferente', () => {
  const ler = (p) => fs.readFileSync(path.resolve(RAIZ, p))
  assert.ok(ler('desktop/paginas/marca.svg').equals(ler('../../../apps/hub-web/public/brand/absolute-zro-grafite.svg')))
  assert.ok(ler('desktop/paginas/simbolo.svg').equals(ler('../icons/favicon.svg')))
  assert.equal(fs.existsSync(path.resolve(RAIZ, 'desktop/paginas/marca.webp')), false) // nada do feixe de luz antigo
})
