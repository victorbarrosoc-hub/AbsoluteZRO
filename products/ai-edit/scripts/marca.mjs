// Grava os arquivos de marca/ e o ícone do app (build/icon.png) a partir de src/marca.js, com a Figtree carregada.
//   node scripts/marca.mjs   (depois do npm run vendor)
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { assinatura, favicon, icone, simbolo, wordmark } from '../src/marca.js'

const f = (p) => new URL(`../${p}`, import.meta.url)
writeFileSync(f('marca/aeon-wordmark.svg'), wordmark())
writeFileSync(f('marca/aeon-simbolo.svg'), simbolo())
writeFileSync(f('marca/aeon-simbolo-largo.svg'), simbolo({ forma: 'larga' }))
writeFileSync(f('marca/aeon-assinatura.svg'), assinatura())
writeFileSync(f('marca/aeon-icone.svg'), icone())
writeFileSync(f('marca/aeon-icone-claro.svg'), icone({ claro: true }))
writeFileSync(f('marca/aeon-favicon.svg'), favicon())
const fonte = readFileSync(f('vendor/fontes/figtree-latin-wght-normal.woff2')).toString('base64')
const estilo = `<style>@font-face{font-family:'Figtree';src:url(data:font/woff2;base64,${fonte}) format('woff2');font-weight:300 900}html,body{margin:0;background:transparent}svg{display:block}</style>`
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } })
await p.setContent(`${estilo}${icone().replace('<svg ', '<svg width="1024" height="1024" ')}`)
await p.evaluate(() => document.fonts.ready)
writeFileSync(f('build/icon.png'), await p.screenshot({ omitBackground: true }))
await p.setViewportSize({ width: 180, height: 180 })
await p.setContent(`${estilo}<div style="background:#0b0b0d">${icone().replace('<svg ', '<svg width="180" height="180" style="transform:scale(1.22)" ')}</div>`)
await p.evaluate(() => document.fonts.ready)
writeFileSync(f('marca/apple-touch-icon.png'), await p.screenshot())
await b.close()
console.log('marca/ e build/icon.png atualizados')
