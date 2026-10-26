// Grava os arquivos de marca/ e o ícone do app (build/icon.png) a partir de src/marca.js, com a Figtree carregada.
//   node scripts/marca.mjs   (depois do npm run vendor)
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { assinatura, favicon, icone, simbolo, wordmark } from '../src/marca.js'

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
// imagem de compartilhamento (og.jpg, 1200×630): a cena da falésia (a estrela é a luz dela), o nome e a frase
const falesia = readFileSync(f('marca/home/falesia.jpg')).toString('base64')
await p.setViewportSize({ width: 1200, height: 630 })
await p.setContent(`${estilo}<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:#000 url(data:image/jpeg;base64,${falesia}) center 30%/cover;color:#fff;font-family:Figtree">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.85))"></div>
<div style="position:absolute;left:0;right:0;bottom:56px;display:grid;justify-items:center;gap:20px">${wordmark({ cor: '#fff' }).replace('<svg ', '<svg style="height:42px;width:auto" ')}
<div style="font-size:16px;letter-spacing:.5em;opacity:.78;margin-left:.5em">TIME IS YOURS.</div></div></div>`)
await p.evaluate(() => document.fonts.ready)
writeFileSync(f('marca/og.jpg'), await p.screenshot({ type: 'jpeg', quality: 86 }))
await b.close()
console.log('marca/ e build/icon.png atualizados')
