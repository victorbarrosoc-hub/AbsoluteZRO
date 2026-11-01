// Roda no Electron (scripts/icones-bandeja.mjs chama): desenha o ícone da barra de menus (Mac) e da bandeja (Windows) a
// partir do gesto oficial do Maestro (products/maestro/public/brand/maestro-symbol.svg), numa cor só, no Chromium,
// direto em cada tamanho de pixel (1x, 1,5x e 2x: nada de reduzir uma imagem grande, que borra o traço fino).
//   Mac:     ícone de modelo (template image: preto com transparência; o sistema pinta claro ou escuro), 20×16 pt
//   Windows: grafite para a barra de tarefas clara e branco para a escura, 16×16 px
// "rodando" acrescenta o ponto do cronômetro no canto de baixo (o gesto sobe para a direita: o canto fica livre).
// O gesto ganha um contorno da própria cor para não sumir a 16 px; o desenho é o mesmo.
//
//   electron scripts/renderizar-bandeja.cjs <maestro-symbol.svg> <pasta-de-saída>

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const [svgArq, saida] = process.argv.slice(-2)
const fonte = fs.readFileSync(svgArq, 'utf8')
const d = (fonte.match(/<path[^>]*\sd="([^"]+)"/) || [])[1]
if (!d) throw new Error('o símbolo oficial não tem o path do gesto')

// [arquivo, largura, altura, escala, cor, rodando]
const ALVOS = []
for (const [sufixo, k] of [
  ['', 1],
  ['@2x', 2],
]) {
  ALVOS.push([`bandejaTemplate${sufixo}.png`, 20 * k, 16 * k, k, '#000000', false])
  ALVOS.push([`bandejaRodandoTemplate${sufixo}.png`, 20 * k, 16 * k, k, '#000000', true])
}
for (const [sufixo, k] of [
  ['', 1],
  ['@1.5x', 1.5],
  ['@2x', 2],
]) {
  for (const [tema, cor] of [
    ['claro', '#1d1d1f'],
    ['escuro', '#ffffff'],
  ]) {
    ALVOS.push([`bandeja-windows-${tema}${sufixo}.png`, 16 * k, 16 * k, k, cor, false])
    ALVOS.push([`bandeja-windows-${tema}-rodando${sufixo}.png`, 16 * k, 16 * k, k, cor, true])
  }
}

// o gesto ocupa 240×122 no desenho original; aqui cabe na largura com 1 px (na escala) de folga de cada lado
function icone(w, h, k, cor, rodando) {
  const gw = w - 2 * k
  const s = gw / 240
  const gh = 122 * s
  const y = (h - gh) / 2 - (rodando ? 1.5 * k : 0)
  // contorno em unidades do desenho: ~0,7 px na tela, em qualquer escala
  const contorno = (0.7 * k) / s
  const ponto = rodando ? `<circle cx="${w - 3.2 * k}" cy="${h - 3.2 * k}" r="${2.4 * k}" fill="${cor}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <g transform="translate(${k} ${y}) scale(${s})"><path d="${d}" fill="${cor}" stroke="${cor}" stroke-width="${contorno}" stroke-linejoin="round" stroke-linecap="round"/></g>${ponto}</svg>`
}

app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(saida, { recursive: true })
    // uma página só com todos, um abaixo do outro; depois recorta cada um no pixel exato
    let y = 0
    const lugares = ALVOS.map(([nome, w, h, k, cor, rodando]) => {
      const l = { nome, x: 0, y, w, h, svg: icone(w, h, k, cor, rodando) }
      y += h + 4
      return l
    })
    const W = 64
    const H = y
    const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden}
      div{position:absolute;left:0;line-height:0}</style></head><body>${lugares.map((l) => `<div style="top:${l.y}px">${l.svg}</div>`).join('')}</body></html>`
    const w = new BrowserWindow({
      width: W,
      height: H,
      show: false,
      frame: false,
      transparent: true,
      useContentSize: true,
      webPreferences: { offscreen: true, javascript: false, deviceScaleFactor: 1, zoomFactor: 1 },
    })
    const arq = path.join(saida, 'bandeja.html')
    fs.writeFileSync(arq, html)
    await w.loadFile(arq)
    fs.rmSync(arq, { force: true })
    await new Promise((ok) => setTimeout(ok, 500))
    const img = await w.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
    const tam = img.getSize()
    if (tam.width !== W || tam.height !== H) throw new Error(`captura ${tam.width}×${tam.height}, esperava ${W}×${H}`)
    for (const l of lugares) {
      fs.writeFileSync(path.join(saida, l.nome), img.crop({ x: l.x, y: l.y, width: l.w, height: l.h }).toPNG())
      console.log(`${l.nome} ${l.w}×${l.h}`)
    }
    w.destroy()
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
