// Fundo da janela do .dmg (540×380, e 1080×760 para tela Retina), no tema claro da marca: papel #fcfbfc com uma luz
// muito leve, o wordmark oficial em grafite no alto e uma seta fina do ícone do app para a pasta Aplicativos
// (posições em electron-builder.yml › dmg.contents). Origem do wordmark: build/marca-fonte.png, a versão PNG de
// apps/hub-web/public/brand/absolute-zro-grafite.svg (marca flat). Roda junto do `npm run icons`.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compor, gravarPng, lerPng, redimensionar } from './png.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(RAIZ, 'build')
// mesmas posições do dmg.contents (centro dos ícones, em pontos)
const APP = { x: 140, y: 214 }
const PASTA = { x: 400, y: 214 }
const PAPEL = [252, 251, 252]
const SETA = [134, 134, 139]

function fundo(escala) {
  const W = 540 * escala
  const H = 380 * escala
  const base = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }
  // papel com uma luz fria quase imperceptível atrás dos ícones (como o vidro do site), e o pé um tom abaixo
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const dx = (x / W - 0.5) / 0.7
      const dy = (y / H - 0.56) / 0.5
      const luz = Math.max(0, 1 - Math.hypot(dx, dy)) ** 2
      const pe = Math.max(0, (y / H - 0.7) / 0.3) * 4
      base.data[i] = PAPEL[0] - luz * 7 - pe
      base.data[i + 1] = PAPEL[1] - luz * 4 - pe
      base.data[i + 2] = PAPEL[2] - luz * 0 - pe
      base.data[i + 3] = 255
    }
  }
  // wordmark oficial no alto, centralizado
  const marca = lerPng(fs.readFileSync(path.join(BUILD, 'marca-fonte.png')))
  const mw = 168 * escala
  const mh = Math.round((marca.height / marca.width) * mw)
  compor(base, redimensionar(marca, mw, mh), Math.round((W - mw) / 2), 52 * escala, 0.9)
  // seta fina entre os dois ícones (linha + ponta), com borda suave
  const y0 = APP.y * escala
  const xa = (APP.x + 66) * escala
  const xb = (PASTA.x - 66) * escala
  const traco = 1.5 * escala
  const ponta = 7 * escala
  const pinta = (x, y, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return
    const i = (y * W + x) * 4
    for (let c = 0; c < 3; c++) base.data[i + c] = SETA[c] * a + base.data[i + c] * (1 - a)
  }
  const distSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  for (let y = Math.floor(y0 - ponta - 4); y <= y0 + ponta + 4; y++) {
    for (let x = Math.floor(xa - 4); x <= xb + 4; x++) {
      const d = Math.min(
        distSeg(x + 0.5, y + 0.5, xa, y0, xb, y0),
        distSeg(x + 0.5, y + 0.5, xb - ponta, y0 - ponta, xb, y0),
        distSeg(x + 0.5, y + 0.5, xb - ponta, y0 + ponta, xb, y0),
      )
      // a linha nasce clara e fica firme perto da pasta
      const fade = 0.2 + 0.6 * Math.min(1, Math.max(0, (x - xa) / (xb - xa)))
      pinta(x, y, Math.max(0, Math.min(1, traco / 2 + 0.5 - d)) * fade)
    }
  }
  return base
}

for (const [escala, nome] of [
  [1, 'background.png'],
  [2, 'background@2x.png'],
]) {
  const buf = gravarPng(fundo(escala))
  fs.writeFileSync(path.join(BUILD, nome), buf)
  console.log(`build/${nome} (${Math.round(buf.length / 1024)} KB)`)
}
