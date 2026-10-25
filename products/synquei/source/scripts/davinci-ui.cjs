// Gera os ícones da janelinha do Synquei no DaVinci (desktop/davinci-ui/*.png) com os mesmos desenhos e cores do app
// (tema escuro). O Qt do Resolve não desenha SVG nem cantos arredondados dentro do texto: vão como PNG em 2x.
// Uso: node scripts/davinci-ui.cjs (precisa do Playwright com o Chromium).
const path = require('node:path')
const { chromium } = require('playwright')

const OUT = path.join(__dirname, '..', 'desktop', 'davinci-ui')
const ICON = {
  sync: '<path d="M4 9h3l2-4 3 14 3-10 2 4h3"/>',
  film: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5h.01"/>',
  timeline: '<path d="M4 6h9M7 12h11M4 18h7"/><path d="M16 3v6M20 15v6"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
}
const svg = (name, color, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`
// cor do tom a 14% sobre o cartão (#161618), como o color-mix do app
const mix = (hex, a, base = '#161618') => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, b] = p(hex)
  const [R, G, B] = p(base)
  return `rgb(${Math.round(R + (r - R) * a)},${Math.round(G + (g - G) * a)},${Math.round(B + (b - B) * a)})`
}
const tile = (name, tone, size, radius, icon) => `<div style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${mix(tone, 0.16)};display:grid;place-items:center">${svg(name, tone, icon)}</div>`
// mesma paleta escura dos aparelhos (app/js/media/devices.js)
const PALETA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#8e8e93']
const thumb = (c) => `<div style="width:40px;height:40px;border-radius:10px;background:#0b0b0c;box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 8px;box-sizing:border-box">${[14, 24, 18].map((w, i) => `<i style="display:block;height:4px;width:${w}px;border-radius:2px;background:${c};opacity:${[1, 0.75, 0.55][i]}"></i>`).join('')}</div>`

const ARQ = {
  'tile-projeto': tile('film', '#9085e9', 34, 10, 18),
  'tile-fila': tile('clock', '#c98500', 34, 10, 18),
  'tile-ultimo': tile('timeline', '#199e70', 34, 10, 18),
  'tile-historico': tile('folder', '#3987e5', 34, 10, 18),
  'status-ok': tile('check', '#30d158', 48, 14, 24),
  'status-esperando': tile('clock', '#ff9f0a', 48, 14, 24),
  'status-erro': tile('warn', '#ff453a', 48, 14, 24),
  'status-off': tile('sync', '#8e8e93', 48, 14, 24),
  'botao-sync': svg('sync', '#0b0b0c', 18),
  'botao-check': svg('check', '#f5f5f7', 18),
  'botao-folder': svg('folder', '#f5f5f7', 18),
  ...Object.fromEntries(PALETA.map((c, i) => [`thumb-${i}`, thumb(c)])),
}

;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ deviceScaleFactor: 2 })
  for (const [nome, html] of Object.entries(ARQ)) {
    await p.setContent(`<html><body style="margin:0;background:transparent"><div id="x" style="display:inline-block">${html}</div></body></html>`)
    await (await p.$('#x')).screenshot({ path: path.join(OUT, `${nome}.png`), omitBackground: true })
  }
  await b.close()
  console.log(Object.keys(ARQ).length, 'ícones em', OUT)
})()
