// Revela · folha de contato para revisão de colorista: cada look do motor profissional nos frames de exemplo e numa
// cartela (ColorChecker, rampa de cinza, rampas de cor), pelo caminho inteiro: still Rec.709 → volta da tela → look →
// tela. Gera PNGs para olhar. Uso: node scripts/folha-de-contato.mjs <pasta-de-saída> [looks separados por vírgula]
import { createServer } from 'node:http'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const saida = process.argv[2] ?? 'folha'
const so = process.argv[3]?.split(',')
mkdirSync(saida, { recursive: true })
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' }
const srv = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end('<!doctype html><body style="margin:0;background:#111"></body>')
  }
  const f = join(RAIZ, p)
  if (!f.startsWith(RAIZ) || !existsSync(f)) {
    res.writeHead(404)
    return res.end()
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
}).listen(0)
const url = `http://127.0.0.1:${srv.address().port}/`
const nav = await chromium.launch()
const pagina = await nav.newPage({ viewport: { width: 1600, height: 900 } })
pagina.on('pageerror', (e) => console.error(e.message))
await pagina.goto(url)
const looks = await pagina.evaluate(async (so) => {
  const { GRUPOS } = await import('/src/cor/pelicula.js')
  return GRUPOS.flatMap((g) => g.looks.map((l) => l.id)).filter((id) => !so || so.includes(id))
}, so)
for (const frame of ['material-vestido', 'referencia-cavalo', 'revela-look', 'cartela']) {
  const png = await pagina.evaluate(
    async ({ frame, looks }) => {
      const { criarMotor, perfilDe, NEUTRO } = await import('/src/cor/pelicula.js')
      const { criarTela } = await import('/src/cor/cena.js')
      const { assar, aplicarTetra } = await import('/src/cor/cube.js')
      const { CARTELA } = await import('/src/cor/qc.js')
      const tela = criarTela('rec709')
      const W = 480
      let base
      if (frame === 'cartela') {
        // ColorChecker em cena (6×4) em cima, rampa de cinza de -7 a +7 stops e rampas de cor em baixo
        const H = 270
        base = { largura: W, altura: H, cena: true, px: new Float32Array(W * H * 3) }
        const cores = Object.values(CARTELA)
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            let c
            if (y < 160) c = cores[Math.floor(y / 40) * 6 + Math.floor(x / 80)]
            else if (y < 190) {
              const v = 0.18 * 2 ** ((x / W) * 14 - 7)
              c = [v, v, v]
            } else {
              const fila = Math.floor((y - 190) / 20)
              const h = (x / W) * Math.PI * 2
              const v = 0.18 * 2 ** (fila - 1.5)
              c = [v * (1 + 0.8 * Math.cos(h)), v * (1 + 0.8 * Math.cos(h - 2.1)), v * (1 + 0.8 * Math.cos(h + 2.1))]
            }
            base.px.set(c, (y * W + x) * 3)
          }
      } else {
        const bm = await createImageBitmap(await (await fetch(`/exemplos/${frame}.jpg`)).blob())
        const H = Math.round((bm.height / bm.width) * W)
        const c = new OffscreenCanvas(W, H)
        const ctx = c.getContext('2d')
        ctx.drawImage(bm, 0, 0, W, H)
        const d = ctx.getImageData(0, 0, W, H).data
        base = { largura: W, altura: H, cena: false, px: new Float32Array(W * H * 3) }
        for (let i = 0, j = 0; i < d.length; i += 4, j += 3) base.px.set([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], j)
      }
      const ids = ['neutro', ...looks]
      const col = 3
      const linhas = Math.ceil(ids.length / col)
      const cv = new OffscreenCanvas(col * W, linhas * (base.altura + 22))
      const ctx = cv.getContext('2d')
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.font = '14px sans-serif'
      for (const [k, id] of ids.entries()) {
        const motor = criarMotor(id === 'neutro' ? NEUTRO : perfilDe(id))
        // still: a LUT faz o caminho todo (volta da tela, look, tela), 33 pontos, como a prévia do app
        const f = base.cena ? (r, g, b) => tela.aplicar(motor.emCena([r, g, b])) : (r, g, b) => tela.aplicar(motor.emCena(tela.inverter(r, g, b)))
        const lut = base.cena ? null : assar(f, 33)
        const img = new ImageData(W, base.altura)
        for (let i = 0, j = 0; j < base.px.length; i += 4, j += 3) {
          const o = lut ? aplicarTetra(lut, base.px[j], base.px[j + 1], base.px[j + 2]) : f(base.px[j], base.px[j + 1], base.px[j + 2])
          img.data[i] = o[0] * 255
          img.data[i + 1] = o[1] * 255
          img.data[i + 2] = o[2] * 255
          img.data[i + 3] = 255
        }
        const x = (k % col) * W
        const y = Math.floor(k / col) * (base.altura + 22)
        ctx.putImageData(img, x, y + 22)
        ctx.fillStyle = '#ddd'
        ctx.fillText(id, x + 6, y + 16)
      }
      const blob = await cv.convertToBlob({ type: 'image/png' })
      return [...new Uint8Array(await blob.arrayBuffer())]
    },
    { frame, looks },
  )
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(saida, `${frame}.png`), Buffer.from(png))
  console.log(join(saida, `${frame}.png`))
}
await nav.close()
srv.close()
