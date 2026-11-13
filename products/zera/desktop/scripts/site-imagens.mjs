// ZERA · imagens do site (products/zera/site): as telas do app (scripts/telas.mjs, dados de exemplo) viram webp no
// tamanho do site, e a imagem de compartilhar (og.png, 1200×630) sai do título com a tela do mapa. Tudo pelo Chromium
// do Playwright (sem outra dependência). Uso: node scripts/site-imagens.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const site = path.join(aqui, '..', '..', 'site')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zera-telas-'))
execFileSync(process.execPath, [path.join(aqui, 'telas.mjs'), tmp], { stdio: 'inherit' })

const ESCOLHA = { mapa: '4-pasta', limpar: '5-limpar', revisar: '7-revisar' }
const nav = await chromium.launch()
const p = await nav.newPage()
fs.mkdirSync(path.join(site, 'telas'), { recursive: true })
for (const [nome, tela] of Object.entries(ESCOLHA)) {
  for (const tema of ['claro', 'escuro']) {
    const png = fs.readFileSync(path.join(tmp, `${tema}-${tela}.png`)).toString('base64')
    const webp = await p.evaluate(async (dados) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + dados
      await img.decode()
      const c = document.createElement('canvas')
      c.width = 1600
      c.height = Math.round((img.height / img.width) * 1600)
      const g = c.getContext('2d')
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, c.width, c.height)
      return c.toDataURL('image/webp', 0.86).split(',')[1]
    }, png)
    fs.writeFileSync(path.join(site, 'telas', `${nome}-${tema}.webp`), Buffer.from(webp, 'base64'))
  }
}

// imagem de compartilhar: claro, título à esquerda, o mapa à direita
const fonte = fs.readFileSync(path.join(site, 'fontes', 'figtree-latin-wght-normal.woff2')).toString('base64')
const mapa = fs.readFileSync(path.join(site, 'telas', 'mapa-claro.webp')).toString('base64')
await p.setViewportSize({ width: 1200, height: 630 })
await p.setContent(`<!doctype html><style>
  @font-face { font-family: F; src: url(data:font/woff2;base64,${fonte}); font-weight: 300 900; }
  body { margin: 0; width: 1200px; height: 630px; background: #f5f5f7; font-family: F; color: #1d1d1f; overflow: hidden; position: relative; }
  .t { position: absolute; left: 72px; top: 150px; width: 470px; }
  p { margin: 0 0 18px; font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #6e6e73; }
  h1 { margin: 0; font-size: 84px; line-height: 1.02; letter-spacing: -.04em; font-weight: 800; }
  h1 span { font-weight: 300; }
  .m { position: absolute; left: 560px; top: 90px; width: 760px; padding: 16px 16px 22px; border-radius: 26px 26px 0 0; background: #0b0b0d; box-shadow: 0 30px 80px rgb(0 0 0 / .2); }
  .m img { display: block; width: 100%; border-radius: 4px; }
</style><div class="t"><p>ZERA</p><h1><span>Espaço livre,</span> sem medo.</h1></div><div class="m"><img src="data:image/webp;base64,${mapa}"></div>`)
await p.waitForTimeout(300)
await p.screenshot({ path: path.join(site, 'og.png') })
await nav.close()
fs.rmSync(tmp, { recursive: true, force: true })
console.log('imagens do site prontas em', site)
