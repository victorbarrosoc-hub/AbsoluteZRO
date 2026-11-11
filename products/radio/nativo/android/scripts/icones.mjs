// RADION no Android: os ícones a partir da marca oficial (products/radio/scripts/marca.mjs), sem redesenho.
//   mipmap-*/ic_launcher.png             o ícone do app (o mesmo quadrado do iPhone; launchers antigos)
//   mipmap-*/ic_launcher_foreground.png  a camada da frente do ícone adaptativo: o símbolo com o círculo no centro
//                                        exato (regra do titular) e dentro da zona segura (66 de 108 dp)
//   drawable-*/ic_no_ar.png              o ícone da notificação: a silhueta branca do símbolo, círculo no centro
// Rode `node scripts/icones.mjs` (com o Playwright do ambiente e o ffmpeg) e confira as imagens antes de subir.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RES = join(AQUI, '../app/src/main/res')
const MARCA = join(AQUI, '../../../scripts/marca.mjs')
const { leque, icone, favicon, GRAFITE } = await import(pathToFileURL(MARCA).href)
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const b = await chromium.launch()
// desenha sempre em 1024 e reduz com o ffmpeg (o navegador, reduzindo o SVG direto, deforma as máscaras das lâminas)
const TMP = mkdtempSync(join(tmpdir(), 'radion-icones-'))
async function png(svg, tam, arquivo, css = '') {
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } })
  await p.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="1024" height="1024" style="display:block;${css}"></body></html>`)
  await p.evaluate(() => document.getElementById('i').decode())
  const grande = join(TMP, 'grande.png')
  await p.screenshot({ path: grande, omitBackground: true })
  await p.close()
  mkdirSync(dirname(arquivo), { recursive: true })
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', grande, '-vf', `scale=${tam}:${tam}:flags=lanczos`, arquivo])
}
// a frente do adaptativo: 108 unidades de lado, símbolo dentro do raio de 30 (a zona segura tem 33)
const frente = (() => {
  // desenhado em 1024, como o ícone oficial (em escala pequena as máscaras das lâminas perdem a forma)
  const L = 1024
  const k = (0.3 * L) / 128 // a ponta mais longe do leque fica a ~128 unidades do rebite
  const { defs, corpo } = leque(L / 2, L / 2, k, GRAFITE, 'a')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${L}"><defs>${defs}</defs>${corpo}</svg>`
})()
for (const [d, f] of Object.entries(DENS)) {
  await png(icone(false).replace('rx="228"', 'rx="0"'), Math.round(48 * f), join(RES, `mipmap-${d}/ic_launcher.png`))
  await png(frente, Math.round(108 * f), join(RES, `mipmap-${d}/ic_launcher_foreground.png`))
  await png(favicon(), Math.round(24 * f), join(RES, `drawable-${d}/ic_no_ar.png`), 'filter:brightness(0) invert(1)')
}
await b.close()
rmSync(TMP, { recursive: true, force: true })
console.log('ícones do Android prontos')
