// O núcleo do Relay embutido nas outras plataformas (docs/integration-contracts/relay.md, "núcleo embutido") tem de
// ser igual ao daqui: mudou o Relay, copie para elas no mesmo commit. O SOBEDESCE confere o mesmo do lado dele.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const relay = (p) => readFileSync(new URL(`../${p}`, import.meta.url))
const outro = (p) => readFileSync(new URL(`../../${p}`, import.meta.url))

const COPIAS = [
  ['sobedesce/src/relay/presets.js', 'src/presets.js'],
  ['sobedesce/src/relay/plano.js', 'src/plano.js'],
  ['sobedesce/src/relay/ffmpeg.js', 'src/ffmpeg.js'],
  ['sobedesce/src/relay/personalizado.js', 'src/personalizado.js'],
  ['sobedesce/web/public/app/relay/src/presets.js', 'src/presets.js'],
  ['sobedesce/web/public/app/relay/src/plano.js', 'src/plano.js'],
  ['sobedesce/web/public/app/relay/app/motor.js', 'app/motor.js'],
  ['sobedesce/web/public/app/relay/app/escala.js', 'app/escala.js'],
  ['sobedesce/public/relay-icone.svg', 'marca/relay-icone.svg'],
  ['sobedesce/web/public/app/icons/relay.svg', 'marca/relay-icone.svg'],
  ...readdirSync(new URL('../vendor/', import.meta.url))
    .filter((f) => /\.(mjs|txt)$/.test(f))
    .map((f) => [`sobedesce/web/public/app/relay/vendor/${f}`, `vendor/${f}`]),
]

test('o núcleo embutido no SOBEDESCE é igual ao do Relay', () => {
  for (const [copia, original] of COPIAS) assert.ok(outro(copia).equals(relay(original)), `products/${copia} diferente de products/relay/${original}: copie de novo`)
})

test('o HUB mostra o ícone oficial', () => {
  assert.ok(readFileSync(new URL('../../../apps/hub-web/public/products/relay.svg', import.meta.url)).equals(relay('marca/relay-icone.svg')))
})
