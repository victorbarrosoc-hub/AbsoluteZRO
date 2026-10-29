// As cópias em vendor/ batem com os pacotes (npm run vendor): ninguém edita a biblioteca à mão.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXTENSOES, extensao } from '../scripts/vendor.mjs'

const raiz = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, raiz))

test('vendor/ igual a node_modules (com o import das extensões trocado)', () => {
  assert.ok(ler('vendor/mediabunny.min.mjs').equals(ler('node_modules/mediabunny/dist/bundles/mediabunny.min.mjs')))
  for (const e of EXTENSOES) assert.equal(ler(`vendor/${e.arquivo}`).toString(), extensao(e), e.pacote)
})
