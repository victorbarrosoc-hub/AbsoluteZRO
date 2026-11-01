// As cópias do Absolute ZRO para computador (scripts/compartilhado.mjs) são idênticas às de apps/hub-desktop.
// Falhou? `npm run compartilhado` e commit das cópias.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { COMPARTILHADOS, diferentes, RAIZ } from '../scripts/compartilhado.mjs'

test('cópias de apps/hub-desktop em dia', () => {
  // desde 01/11/2026 quem atualiza é a central Absolute ZRO: o motor do "Atualizar" não vem mais para cá
  assert.ok(!COMPARTILHADOS.includes('desktop/atualizador.cjs'))
  assert.equal(fs.existsSync(path.join(RAIZ, 'desktop/atualizador.cjs')), false)
  assert.deepEqual(diferentes(), [])
})

test('marca e ícone oficiais: o wordmark flat do HUB e o ícone do Relay, sem cópia diferente', () => {
  const ler = (p) => fs.readFileSync(path.resolve(RAIZ, p))
  assert.ok(ler('desktop/paginas/marca.svg').equals(ler('../../../apps/hub-web/public/brand/absolute-zro-grafite.svg')))
  assert.ok(ler('desktop/paginas/simbolo.svg').equals(ler('../marca/relay-icone.svg')))
  assert.equal(fs.existsSync(path.resolve(RAIZ, 'desktop/paginas/marca.webp')), false) // nada do feixe de luz antigo
})
