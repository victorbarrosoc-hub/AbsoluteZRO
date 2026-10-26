// build/icon.png (1024×1024) a partir de app/icone.svg, desenhado no Chromium. Rode depois de mudar o ícone.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync(new URL('../app/icone.svg', import.meta.url), 'utf8')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } })
await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', '<svg width="1024" height="1024" ')}`)
writeFileSync(new URL('../build/icon.png', import.meta.url), await p.screenshot({ omitBackground: true }))
await b.close()
console.log('build/icon.png atualizado')
