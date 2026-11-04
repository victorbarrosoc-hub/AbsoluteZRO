// REVELAFILM · PNG da marca: as logos do topo (claro e escuro, 4× a altura de 28 px) e o og.jpg (1200×630), a partir dos
// SVG de scripts/marca-revela.py e da foto do topo da página inicial (um frame dos exemplos, revelado no Lab).
// Uso: node scripts/marca-png.mjs (precisa do Playwright; os arquivos entram no repositório).

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')
const raiz = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, raiz))
const dataUrl = (p, tipo) => `data:${tipo};base64,${ler(p).toString('base64')}`

const navegador = await chromium.launch()
const pagina = await navegador.newPage()

for (const nome of ['revela-logo', 'revela-logo-claro']) {
  const svg = ler(`marca/${nome}.svg`).toString()
  const [, , , w, h] = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/).map(Number)
  const alto = 112
  const largo = Math.round((alto * w) / h)
  await pagina.setViewportSize({ width: largo, height: alto })
  await pagina.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${largo}px;height:${alto}px}</style><img src="${dataUrl(`marca/${nome}.svg`, 'image/svg+xml')}">`)
  await pagina.locator('img').evaluate((i) => i.decode())
  writeFileSync(new URL(`marca/${nome}.png`, raiz), await pagina.screenshot({ type: 'png', omitBackground: true }))
}

await pagina.setViewportSize({ width: 1200, height: 630 })
await pagina.setContent(`<style>
html,body{margin:0}
.og{position:relative;width:1200px;height:630px;overflow:hidden;background:#0b0a09}
.og>.foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:60% 40%}
.og::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgb(11 10 9/.92) 18%,rgb(11 10 9/.55) 46%,rgb(11 10 9/0) 70%)}
.logo{position:absolute;z-index:1;left:80px;top:270px;height:90px}
</style><div class="og"><img class="foto" src="${dataUrl('marca/home/hero-filme.jpg', 'image/jpeg')}"><img class="logo" src="${dataUrl('marca/revela-logo.svg', 'image/svg+xml')}"></div>`)
for (const i of await pagina.locator('img').all()) await i.evaluate((n) => n.decode())
writeFileSync(new URL('og.jpg', raiz), await pagina.screenshot({ type: 'jpeg', quality: 86 }))
await navegador.close()
console.log('marca/revela-logo.png, marca/revela-logo-claro.png, og.jpg')
