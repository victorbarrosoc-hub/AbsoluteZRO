// Grava os arquivos da marca AEON a partir de src/marca.js e o ícone do app (build/icon.png, app/icone.svg).
//   node scripts/marca.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { icone, simbolo, wordmark } from '../src/marca.js'

const f = (p) => new URL(`../${p}`, import.meta.url)
writeFileSync(f('marca/aeon-wordmark.svg'), wordmark())
writeFileSync(f('marca/aeon-wordmark-branco.svg'), wordmark({ cor: '#f5f5f7' }))
writeFileSync(f('marca/aeon-wordmark-grafite.svg'), wordmark({ cor: '#1d1d1f' }))
writeFileSync(f('marca/aeon-simbolo.svg'), simbolo())
writeFileSync(f('marca/aeon-simbolo-branco.svg'), simbolo({ cor: '#f5f5f7' }))
writeFileSync(f('marca/aeon-simbolo-grafite.svg'), simbolo({ cor: '#1d1d1f' }))
writeFileSync(f('marca/aeon-icone.svg'), icone())
writeFileSync(f('app/icone.svg'), icone())
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } })
await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:1024px;height:1024px;display:block}</style>${icone()}`)
writeFileSync(f('build/icon.png'), await p.screenshot({ omitBackground: true }))
await p.setViewportSize({ width: 180, height: 180 })
await p.setContent(`<style>html,body{margin:0;background:#0b0b0d}svg{width:180px;height:180px;display:block;transform:scale(1.22)}</style>${icone()}`)
writeFileSync(f('marca/apple-touch-icon.png'), await p.screenshot())
await b.close()
console.log('marca/ e build/icon.png atualizados')
