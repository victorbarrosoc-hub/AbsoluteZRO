// ZERA · as telas principais em PNG (claro e escuro), com o window.zera de mentira (test/falso.js): para conferir o
// visual e para o material do lançamento. Uso: node scripts/telas.mjs [pasta de saída] (padrão: telas/).
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const saida = path.resolve(process.argv[2] || path.join(aqui, '..', 'telas'))
fs.mkdirSync(saida, { recursive: true })
const pagina = pathToFileURL(path.join(aqui, '..', 'desktop', 'interface', 'index.html')).href

const nav = await chromium.launch()
for (const tema of ['claro', 'escuro']) {
  const ctx = await nav.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2, colorScheme: tema === 'escuro' ? 'dark' : 'light' })
  await ctx.addInitScript({ path: path.join(aqui, '..', 'test', 'falso.js') })
  const p = await ctx.newPage()
  const foto = (nome) => p.screenshot({ path: path.join(saida, `${tema}-${nome}.png`) })
  await p.goto(pagina + '?lento=1')
  await p.waitForSelector('[data-pronto="1"]')
  if (tema === 'escuro') await p.click('#btn-tema')
  await p.waitForTimeout(1500)
  await foto('1-discos')
  await p.locator('.disco').first().click()
  await p.waitForTimeout(4200)
  await foto('2-varrendo')
  await p.waitForSelector('#tela-mapa:not([hidden])', { timeout: 20000 })
  await p.waitForTimeout(1600)
  await foto('3-mapa')
  await p.locator('.item', { hasText: 'Users' }).click()
  await p.waitForTimeout(900)
  await p.locator('.item', { hasText: 'ana' }).click()
  await p.waitForTimeout(1400)
  await foto('4-pasta')
  const caixa = await p.locator('#anel').boundingBox()
  await p.mouse.move(caixa.x + caixa.width * 0.72, caixa.y + caixa.height * 0.5)
  await p.waitForTimeout(500)
  await foto('4-foco')
  await p.click('[data-aba="limpar"]')
  await p.waitForTimeout(1200)
  await foto('5-limpar')
  await p.locator('.cartao', { hasText: 'Caches de edição' }).click()
  await p.waitForTimeout(900)
  await foto('6-grupo')
  await p.locator('.folha-pe .vidro--tinta').click()
  await p.waitForTimeout(500)
  await p.click('#btn-revisar')
  await p.waitForTimeout(900)
  await foto('7-revisar')
  await p.locator('.folha-pe .vidro--tinta').click()
  await p.waitForTimeout(2200)
  await foto('8-pronto')
  await ctx.close()
}
await nav.close()
console.log('telas em', saida)
