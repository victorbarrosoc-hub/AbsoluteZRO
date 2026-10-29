// npm run icones: gera os ícones do app a partir do ícone oficial do Maestro (products/maestro/src/app/icon.svg).
// O desenho no Chromium fica em scripts/renderizar-icone.cjs (roda no Electron; no Linux sem tela, use xvfb-run);
// o .icns e o .ico saem com o mesmo código do Absolute ZRO para computador (apps/hub-desktop/scripts/icons.mjs e
// png.mjs, sem dependências).
//
// Saídas (faça commit): build/icon-source-mac.png e build/icon-source-windows.png (1024, o que o Chromium desenhou),
// build/icon.png (Mac, 1024), build/icon.icns, build/icon.ico, build/icon-windows.png (256, janela no Windows) e
// build/icon-linux.png (512). `npm test` confere (test/icones.test.mjs).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gravarPng, lerPng, redimensionar } from '../../../../apps/hub-desktop/scripts/png.mjs'
import { montarIcns, montarIco } from '../../../../apps/hub-desktop/scripts/icons.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(RAIZ, 'build')
export const ICONE_OFICIAL = path.resolve(RAIZ, '..', 'src', 'app', 'icon.svg')

function renderizar() {
  const electron = process.env.ELECTRON_BIN || createRequire(import.meta.url)('electron')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-icone-'))
  const args = [path.join(RAIZ, 'scripts', 'renderizar-icone.cjs'), ICONE_OFICIAL, tmp]
  if (process.platform === 'linux') args.unshift('--no-sandbox')
  execFileSync(electron, args, { stdio: 'inherit' })
  fs.copyFileSync(path.join(tmp, 'mac-1024.png'), path.join(BUILD, 'icon-source-mac.png'))
  fs.copyFileSync(path.join(tmp, 'windows-1024.png'), path.join(BUILD, 'icon-source-windows.png'))
  fs.rmSync(tmp, { recursive: true, force: true })
}

function gerar() {
  const abrir = (f) => {
    const img = lerPng(fs.readFileSync(path.join(BUILD, f)))
    if (img.width !== 1024 || img.height !== 1024) throw new Error(`build/${f} precisa ter 1024×1024`)
    return img
  }
  const mac = abrir('icon-source-mac.png')
  const win = abrir('icon-source-windows.png')
  const grava = (nome, buf) => {
    fs.writeFileSync(path.join(BUILD, nome), buf)
    console.log(`build/${nome} (${Math.round(buf.length / 1024)} KB)`)
  }
  grava('icon.png', gravarPng(mac))
  grava('icon.icns', montarIcns(mac))
  grava('icon.ico', montarIco(win))
  grava('icon-windows.png', gravarPng(redimensionar(win, 256, 256)))
  grava('icon-linux.png', gravarPng(redimensionar(win, 512, 512)))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    fs.mkdirSync(BUILD, { recursive: true })
    // --sem-desenhar: só refaz .icns/.ico/PNGs a partir de build/icon-source-*
    if (!process.argv.includes('--sem-desenhar')) renderizar()
    gerar()
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }
}
