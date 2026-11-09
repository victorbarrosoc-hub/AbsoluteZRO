// CAMZRO · a marca (docs/marca/camzro.md): o Obturador 180°, escolhido pelo titular em 09/11/2026. O anel e a centelha
// da Absolute ZRO com meio disco dentro: o obturador em 180°, a luz entra pela metade aberta. Geometria só aqui (caixa
// 0 0 100 100), uma cor só. `node scripts/marca.mjs` escreve app/marca/ (símbolo, favicon e os ícones em PNG, com o
// Chromium do Playwright). Mudou a forma: rode de novo e refaça a og.png (`node scripts/telas-do-site.mjs`).

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GRAFITE = '#1d1d1f'
/** A centelha da Absolute ZRO (scripts/marca/vetor/vetorizar.py): centro em (74, 50), sobre o traço do anel. */
export const CENTELHA = 'M74 40.02C75 47.51 77.33 49 94.82 50C77.33 51 75 52.49 74 59.98C73 52.49 70.67 51 53.18 50C70.67 49 73 47.51 74 40.02Z'
/** O anel da Absolute ZRO (centro 44, 50; raios 34,3 e 25,7), em evenodd. */
export const ANEL = 'M9.7 50a34.3 34.3 0 1 0 68.6 0a34.3 34.3 0 1 0-68.6 0ZM18.3 50a25.7 25.7 0 1 0 51.4 0a25.7 25.7 0 1 0-51.4 0Z'
/** O obturador: a metade esquerda de um disco de raio 19 no centro do anel (180°: meio fechado, meio aberto). */
export const OBTURADOR = 'M44 31a19 19 0 0 0 0 38Z'
/** Abaixo de 20 px (favicon): só o anel, mais grosso e centrado, e o obturador; a centelha some (como no manual da marca). */
export const ANEL_MINI = 'M12 50a38 38 0 1 0 76 0a38 38 0 1 0-76 0ZM22.5 50a27.5 27.5 0 1 0 55 0a27.5 27.5 0 1 0-55 0Z'
export const OBTURADOR_MINI = 'M50 30a20 20 0 0 0 0 40Z'

/** O desenho em <path>s; a centelha vem primeiro (por trás), como no símbolo da Absolute ZRO. */
export const desenho = (cor) => `<path fill="${cor}" d="${CENTELHA}"/><path fill="${cor}" fill-rule="evenodd" d="${ANEL}"/><path fill="${cor}" d="${OBTURADOR}"/>`
export const desenhoMini = (cor) => `<path fill="${cor}" fill-rule="evenodd" d="${ANEL_MINI}"/><path fill="${cor}" d="${OBTURADOR_MINI}"/>`

export const simbolo = (cor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${desenho(cor)}</svg>\n`
/** Favicon: a forma pequena, grafite no claro e branca no escuro. */
export const favicon = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>path{fill:${GRAFITE}}@media (prefers-color-scheme:dark){path{fill:#fff}}</style><path fill-rule="evenodd" d="${ANEL_MINI}"/><path d="${OBTURADOR_MINI}"/></svg>\n`

/**
 * Ícone do app: a placa escura da família (1024, canto 232, #232327 → #0c0c0e) com o símbolo branco. No maskable a placa
 * vai até a borda e o símbolo cabe no círculo seguro (80%).
 */
export function icone({ maskable = false } = {}) {
  const escala = maskable ? 4.6 : 6
  const deslocamento = (1024 - 100 * escala) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232327"/><stop offset="1" stop-color="#0c0c0e"/></linearGradient></defs><rect width="1024" height="1024"${maskable ? '' : ' rx="232"'} fill="url(#p)"/><g transform="translate(${deslocamento} ${deslocamento}) scale(${escala})">${desenho('#fff')}</g></svg>\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saida = fileURLToPath(new URL('../app/marca', import.meta.url))
  writeFileSync(join(saida, 'simbolo-grafite.svg'), simbolo(GRAFITE))
  writeFileSync(join(saida, 'simbolo-branco.svg'), simbolo('#fff'))
  writeFileSync(join(saida, 'favicon.svg'), favicon())
  writeFileSync(join(saida, 'icone.svg'), icone())
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 })
    for (const [nome, lado, svg] of [
      ['icone-180.png', 180, icone()],
      ['icone-192.png', 192, icone()],
      ['icone-512.png', 512, icone()],
      ['icone-maskable-512.png', 512, icone({ maskable: true })],
    ]) {
      await page.setViewportSize({ width: lado, height: lado })
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`)
      await page.screenshot({ path: join(saida, nome), omitBackground: true })
    }
  } finally {
    await browser.close()
  }
  console.log('app/marca: simbolo-grafite.svg, simbolo-branco.svg, favicon.svg, icone.svg, icone-180/192/512 e maskable')
}
