// Número do build, nome com o build (o padrão que a Absolute ZRO reconhece) e a limpeza do Release.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build, nomeComBuild, paraApagar, TAG, MANTER } from '../scripts/release.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('build = número da execução + base; sem execução é 0 (desenvolvimento)', () => {
  assert.equal(build({}), 0)
  assert.equal(build({ GITHUB_RUN_NUMBER: '12' }), 12)
  assert.equal(build({ GITHUB_RUN_NUMBER: '12', CARRO_DESKTOP_BUILD_BASE: '100' }), 112)
  assert.equal(TAG, 'carro-versao-de-teste')
})

test('nome com o build bate com o padrão do catálogo da Absolute ZRO (apps/hub-web/lib/desktop-apps.ts)', () => {
  const mac = nomeComBuild('0.1.0', 7, 'mac')
  const win = nomeComBuild('0.1.0', 7, 'windows')
  assert.equal(mac, 'CarroDoFreela-0.1.0-b7-mac-universal.dmg')
  assert.equal(win, 'CarroDoFreela-0.1.0-b7-windows-setup.exe')
  const catalogo = fs.readFileSync(path.resolve(RAIZ, '../../../apps/hub-web/lib/desktop-apps.ts'), 'utf8')
  const padroes = [...catalogo.matchAll(/re: \/(\^CarroDoFreela-[^ ]+?\$)\//g)].map((m) => new RegExp(m[1]))
  assert.equal(padroes.length, 2)
  assert.ok(padroes.some((re) => re.test(mac)))
  assert.ok(padroes.some((re) => re.test(win)))
  // e o electron-builder gera o nome antes do build com o mesmo começo e fim
  const yml = fs.readFileSync(path.join(RAIZ, 'electron-builder.yml'), 'utf8')
  assert.match(yml, /artifactName: CarroDoFreela-\$\{version\}-mac-universal\.\$\{ext\}/)
  assert.match(yml, /artifactName: CarroDoFreela-\$\{version\}-windows-setup\.\$\{ext\}/)
})

test(`limpeza: ficam os ${MANTER} últimos builds e o versao.json`, () => {
  const nomes = [
    'versao.json',
    'CarroDoFreela-0.1.0-b7-mac-universal.dmg',
    'CarroDoFreela-0.1.0-b8-windows-setup.exe',
    'CarroDoFreela-0.1.0-b9-mac-universal.dmg',
    'CarroDoFreela-sha256-b9-mac.json',
    'CarroDoFreela-0.1.0-b10-windows-setup.exe',
  ]
  assert.deepEqual(paraApagar(nomes, 10), ['CarroDoFreela-0.1.0-b7-mac-universal.dmg'])
  assert.deepEqual(paraApagar(nomes, 12), nomes.slice(1, 5))
})
