// Revela · ícones do app instalado (Adicionar à Tela de Início no iPhone, instalar no Android e no computador).
// Saem do mesmo marca/revela-icone.svg, sem o canto arredondado: o sistema recorta o ícone do jeito dele.
// Uso: node scripts/icones-app.mjs (precisa do Playwright; os PNG vão para marca/app/ e entram no repositório).

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')
const raiz = new URL('..', import.meta.url)
const svg = readFileSync(new URL('marca/revela-icone.svg', raiz), 'utf8')
  .replace(/rx="186"/, 'rx="0"') // fundo até a borda
  .replace(/<rect x="101"[^>]*\/>/, '') // sem o fio de luz da borda

const TAMANHOS = [
  ['apple-touch-icon.png', 180],
  ['revela-192.png', 192],
  ['revela-512.png', 512],
]
const navegador = await chromium.launch()
const pagina = await navegador.newPage()
for (const [nome, lado] of TAMANHOS) {
  await pagina.setViewportSize({ width: lado, height: lado })
  await pagina.setContent(
    `<style>html,body{margin:0;background:#0c0c0e}svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`,
  )
  writeFileSync(new URL(`marca/app/${nome}`, raiz), await pagina.screenshot({ type: 'png' }))
}
await navegador.close()
