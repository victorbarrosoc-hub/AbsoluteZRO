// Grava os arquivos de marca/ e o ícone do app (build/icon.png) a partir de src/marca.js, com a Figtree carregada.
//   node scripts/marca.mjs   (depois do npm run vendor)
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { assinatura, estrelaComBrilho, favicon, icone, simbolo, wordmark } from '../src/marca.js'

const f = (p) => new URL(`../${p}`, import.meta.url)
writeFileSync(f('marca/aeon-wordmark.svg'), wordmark())
writeFileSync(f('marca/aeon-simbolo.svg'), simbolo())
writeFileSync(f('marca/aeon-simbolo-largo.svg'), simbolo({ forma: 'larga' }))
writeFileSync(f('marca/aeon-simbolo-palco.svg'), simbolo({ forma: 'larga', brilho: true }))
writeFileSync(f('marca/aeon-assinatura.svg'), assinatura())
writeFileSync(f('marca/aeon-assinatura-palco.svg'), assinatura({ brilho: true }))
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
// imagem de compartilhamento (og.jpg, 1200×630): a estrela acesa sobre a salina, o nome e a frase
const salina = readFileSync(f('marca/home/salina.jpg')).toString('base64')
await p.setViewportSize({ width: 1200, height: 630 })
await p.setContent(`${estilo}<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:#000 url(data:image/jpeg;base64,${salina}) center 70%/cover;color:#fff;font-family:Figtree">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,0) 40%,rgba(0,0,0,.75))"></div>
<svg viewBox="-160 -105 320 210" style="position:absolute;left:300px;top:20px;width:600px">${estrelaComBrilho({ cx: 0, cy: 0, r: 100, forma: 'larga', id: 'og' })}</svg>
<div style="position:absolute;left:0;right:0;top:432px;display:grid;justify-items:center;gap:22px">${wordmark({ cor: '#fff' }).replace('<svg ', '<svg style="height:44px;width:auto" ')}
<div style="font-size:17px;letter-spacing:.5em;opacity:.75;margin-left:.5em">TIME IS YOURS.</div></div></div>`)
await p.evaluate(() => document.fonts.ready)
writeFileSync(f('marca/og.jpg'), await p.screenshot({ type: 'jpeg', quality: 86 }))
await b.close()
console.log('marca/ e build/icon.png atualizados')
