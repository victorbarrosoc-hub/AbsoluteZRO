// Número do build no repositório AbsoluteZRO (scripts/numero-build.mjs) e o Release que a limpeza mexe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroDoBuild } from '../scripts/numero-build.mjs'
import { TAG, paraApagar } from '../scripts/limpar-release.mjs'

test('build = execução + base; sem execução, 0 (desenvolvimento)', () => {
  assert.equal(numeroDoBuild({ GITHUB_RUN_NUMBER: '1', SOBEDESCE_BUILD_BASE: '1000' }), 1001)
  assert.equal(numeroDoBuild({ GITHUB_RUN_NUMBER: '57' }), 57)
  assert.equal(numeroDoBuild({ GITHUB_RUN_NUMBER: '5', SOBEDESCE_BUILD_BASE: 'x' }), 5)
  assert.equal(numeroDoBuild({ SOBEDESCE_BUILD_BASE: '1000' }), 0)
  assert.equal(numeroDoBuild({}), 0)
})

test('o primeiro build daqui é mais novo que o último do repositório antigo (b379)', () => {
  assert.ok(numeroDoBuild({ GITHUB_RUN_NUMBER: '1', SOBEDESCE_BUILD_BASE: '1000' }) > 379)
})

test('a limpeza só mexe no Release de teste do AbsoluteZRO', () => {
  assert.equal(TAG, 'sobedesce-versao-de-teste')
  const nomes = ['SOBEDESCE-0.1.0-b1001-mac-universal.dmg', 'SOBEDESCE-0.1.0-b1004-mac-universal.dmg', 'versao.json']
  assert.deepEqual(paraApagar(nomes.map(name => ({ name })), 1004).map(a => a.name), ['SOBEDESCE-0.1.0-b1001-mac-universal.dmg'])
})
