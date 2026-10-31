// npm run icones:bandeja: gera o ícone do cronômetro na barra de menus (Mac, ícone de modelo) e na bandeja (Windows,
// claro e escuro), parado e rodando, em 1x/1,5x/2x, a partir do gesto oficial do Maestro
// (products/maestro/public/brand/maestro-symbol.svg). O desenho no Chromium fica em scripts/renderizar-bandeja.cjs
// (roda no Electron; no Linux sem tela, use xvfb-run). Saída em desktop/bandeja/ (faça commit; `npm test` confere).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SIMBOLO = path.resolve(RAIZ, '..', 'public', 'brand', 'maestro-symbol.svg')
export const SAIDA = path.join(RAIZ, 'desktop', 'bandeja')

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const electron = process.env.ELECTRON_BIN || createRequire(import.meta.url)('electron')
  fs.mkdirSync(SAIDA, { recursive: true })
  const args = [path.join(RAIZ, 'scripts', 'renderizar-bandeja.cjs'), SIMBOLO, SAIDA]
  if (process.platform === 'linux') args.unshift('--no-sandbox')
  execFileSync(electron, args, { stdio: 'inherit' })
}
