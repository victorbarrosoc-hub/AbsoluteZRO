// Roda no Electron (scripts/icones.mjs chama): desenha o ícone oficial do Rift Motion (products/rift-motion/marca/rift-icone.svg, placa
// quadrada até a borda) no Chromium, com os cantos arredondados do app e fundo transparente, e grava dois PNG 1024×1024:
//   mac-1024.png      o ícone no grid da Apple: corpo de 824 px centrado, com a sombra suave do Dock
//   windows-1024.png  o ícone ocupando o quadro
// Nada é redesenhado aqui: é a arte oficial, só posta no tamanho de cada sistema e recortada nos cantos (raio de 22,37%).
//
//   electron scripts/renderizar-icone.cjs <icone.svg|png> <pasta-de-saída>

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const [svgArq, saida] = process.argv.slice(-2)
const tipo = svgArq.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
const dado = `data:${tipo};base64,${fs.readFileSync(svgArq).toString('base64')}`

const pagina = (corpo) => `<!doctype html><html><head><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}
  img{position:absolute;display:block}
  ${corpo}
</style></head><body><img src="${dado}"></body></html>`

const COMPOSICOES = {
  // grid de ícone do macOS (Big Sur+): 824 de corpo em 1024, sombra 0 10px 20px a 28%
  'mac-1024.png': pagina('img{left:100px;top:92px;width:824px;height:824px;border-radius:184px;filter:drop-shadow(0 10px 10px rgb(0 0 0 / 0.28))}'),
  'windows-1024.png': pagina('img{left:0;top:0;width:1024px;height:1024px;border-radius:229px}'),
}

app.disableHardwareAcceleration()
// fechar a janela de um ícone não encerra o app antes do próximo
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(saida, { recursive: true })
    for (const [nome, html] of Object.entries(COMPOSICOES)) {
      const w = new BrowserWindow({
        width: 1024,
        height: 1024,
        show: false,
        frame: false,
        transparent: true,
        useContentSize: true,
        webPreferences: { offscreen: true, javascript: false, deviceScaleFactor: 1 },
      })
      w.webContents.setFrameRate(1)
      const arq = path.join(saida, `${nome}.html`)
      fs.writeFileSync(arq, html)
      await w.loadFile(arq)
      fs.rmSync(arq, { force: true })
      await new Promise((ok) => setTimeout(ok, 400))
      const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
      const png = img.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG()
      fs.writeFileSync(path.join(saida, nome), png)
      console.log(`${nome} ${img.getSize().width}×${img.getSize().height}`)
      w.destroy()
    }
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
