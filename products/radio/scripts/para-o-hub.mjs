// Gera as cópias do rádio que o HUB serve em absolutezro.com/radio (ADR 0042: o rádio usa o login e o banco do HUB):
//   apps/hub-web/lib/radio/nucleo.ts   ← api/_nucleo.js (as regras), igual byte a byte depois do cabeçalho
//   apps/hub-web/lib/radio/arquivos.ts ← app/*.{html,css,js} e o QR, como texto, só do servidor (nada em public/:
//                                        app não lançado não aparece em lugar nenhum)
// tests/integration/radio.test.ts confere as duas. Mudou o app ou o núcleo: `node products/radio/scripts/para-o-hub.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RADIO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RADIO, '../../apps/hub-web/lib/radio')
export const CABECALHO_NUCLEO = `// GERADO de products/radio/api/_nucleo.js (scripts/para-o-hub.mjs; tests/integration/radio.test.ts confere). Não edite.
/* eslint-disable */
// @ts-nocheck
`
const JS = 'text/javascript; charset=utf-8'
export const ARQUIVOS = {
  'app.html': 'text/html; charset=utf-8',
  'app.css': 'text/css; charset=utf-8',
  'app.js': JS,
  'rtc.js': JS,
  'icones.js': JS,
  'som.js': JS,
  'qr.js': JS,
  'vendor/qrcode.mjs': JS,
  // a marca (SVG é texto; os PNG do iPhone ficam só no app separado)
  'marca/radion-simbolo.svg': 'image/svg+xml',
  'marca/radion-simbolo-branco.svg': 'image/svg+xml',
  'marca/favicon.svg': 'image/svg+xml',
}

export function gerar() {
  const nucleo = CABECALHO_NUCLEO + readFileSync(join(RADIO, 'api/_nucleo.js'), 'utf8')
  const linhas = Object.entries(ARQUIVOS).map(([f, tipo]) => `  ${JSON.stringify(f)}: { tipo: ${JSON.stringify(tipo)}, corpo: ${JSON.stringify(readFileSync(join(RADIO, 'app', f), 'utf8'))} },`)
  const arquivos = `// GERADO de products/radio/app (scripts/para-o-hub.mjs; tests/integration/radio.test.ts confere). Não edite à mão.
// O app do rádio dentro do HUB: só a rota /radio e /radio/app/<arquivo> entregam, e só para quem passa no gate.
import 'server-only'

export const RADIO_ARQUIVOS: Readonly<Record<string, { tipo: string; corpo: string }>> = {
${linhas.join('\n')}
}
`
  return { nucleo, arquivos }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { nucleo, arquivos } = gerar()
  mkdirSync(DESTINO, { recursive: true })
  writeFileSync(join(DESTINO, 'nucleo.ts'), nucleo)
  writeFileSync(join(DESTINO, 'arquivos.ts'), arquivos)
  console.log('apps/hub-web/lib/radio/{nucleo,arquivos}.ts gerados')
}
