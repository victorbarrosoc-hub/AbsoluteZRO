// npm run bandeja: os ícones da barra de menus do Mac e da bandeja do Windows, a partir do símbolo oficial do RADION
// (products/radio/app/marca/radion-simbolo.svg, gerado por products/radio/scripts/marca.mjs). Mac: imagem modelo em preto
// com transparência (o sistema pinta no claro e no escuro), 22 e 44 px. Windows: o símbolo em cores, 32 px.
// Desenha no Chromium do Playwright (products/radio já tem). Faça commit das saídas em build/bandeja/.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = path.join(RAIZ, 'build', 'bandeja')
const SIMBOLO = path.resolve(RAIZ, '../app/marca/radion-simbolo.svg')

const svg = fs.readFileSync(SIMBOLO, 'utf8')
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const b = await chromium.launch()
const p = await b.newPage({ deviceScaleFactor: 1 })
async function desenhar(arquivo, lado, preto) {
  await p.setViewportSize({ width: lado, height: lado })
  // margem de 1/11 do lado, como os ícones do sistema; preto = filtro que apaga a cor e guarda a transparência
  const m = Math.round(lado / 11)
  await p.setContent(`<body style="margin:0;background:transparent"><img src="${src}" style="position:absolute;left:${m}px;top:${m}px;width:${lado - 2 * m}px;height:${lado - 2 * m}px;object-fit:contain;${preto ? 'filter:brightness(0)' : ''}"></body>`)
  await p.waitForTimeout(100)
  await p.screenshot({ path: path.join(SAIDA, arquivo), omitBackground: true })
}
fs.mkdirSync(SAIDA, { recursive: true })
await desenhar('radionTemplate.png', 22, true)
await desenhar('radionTemplate@2x.png', 44, true)
await desenhar('radion.png', 32, false)
await b.close()
console.log('build/bandeja pronta')
