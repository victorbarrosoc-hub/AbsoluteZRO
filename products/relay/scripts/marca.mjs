// Gera os PNG da marca a partir dos SVG/HTML (ícones do app instalado e a imagem de compartilhamento).
// node scripts/marca.mjs (precisa do Chromium do Playwright). Os PNG vão para o Git; a fonte é o SVG.

import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { servir } from './servir.mjs'

const raiz = new URL('..', import.meta.url)
const svg = await readFile(new URL('marca/relay-icone.svg', raiz), 'utf8')
const navegador = await chromium.launch()
const pagina = await navegador.newPage()
for (const [nome, lado, cantos] of [
  ['relay-192.png', 192, true],
  ['relay-512.png', 512, true],
  ['apple-touch-icon.png', 180, false], // o iPhone recorta os cantos sozinho: placa quadrada
]) {
  await pagina.setViewportSize({ width: lado, height: lado })
  const s = cantos ? svg : svg.replace(/rx="232"/g, 'rx="0"')
  await pagina.setContent(`<body style="margin:0;background:transparent">${s.replace('<svg', `<svg style="display:block" width="${lado}" height="${lado}"`)}</body>`)
  await pagina.screenshot({ path: new URL(`marca/app/${nome}`, raiz).pathname, omitBackground: cantos })
}
const servidor = await servir({ porta: 8099 })
await pagina.setViewportSize({ width: 1200, height: 630 })
await pagina.goto('http://127.0.0.1:8099/marca/og.html')
await pagina.evaluate(() => document.fonts.ready)
await pagina.screenshot({ path: new URL('marca/og.png', raiz).pathname })
servidor.close()
await navegador.close()
console.log('marca/app/*.png e marca/og.png atualizados')
