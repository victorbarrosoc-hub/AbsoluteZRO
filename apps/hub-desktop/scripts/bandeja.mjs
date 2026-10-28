// Ícone da barra de menus (Mac) e da bandeja (Windows/Linux) a partir do símbolo oficial
// (apps/hub-web/public/brand/absolute-zro-simbolo.svg, gerado por scripts/marca/vetor/vetorizar.py). A geometria vem
// do SVG: aqui só se lê o caminho e se rasteriza (supersampling 8×8, preenchimento par-ímpar), sem dependências.
//
//   build/bandeja/bandejaTemplate.png (20×16) e @2x (40×32): preto com alfa, "template" do macOS
//   build/bandeja/bandeja-branco.png e bandeja-grafite.png (16×16) e @2x (32×32): Windows e Linux
//
// Uso: npm run bandeja

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gravarPng } from './png.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SVG = path.resolve(AQUI, '..', '..', 'hub-web', 'public', 'brand', 'absolute-zro-simbolo.svg')
const SAIDA = path.resolve(AQUI, '..', 'build', 'bandeja')

/** Caminho SVG (M, L, H, V, C, A, Z, absolutos e relativos) → lista de polígonos fechados. */
export function achatar(d) {
  const tokens = d.match(/[MmLlHhVvCcAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || []
  const polis = []
  let atual = []
  let x = 0
  let y = 0
  let x0 = 0
  let y0 = 0
  let cmd = null
  let i = 0
  const num = () => Number(tokens[i++])
  const fechar = () => {
    if (atual.length > 2) polis.push(atual)
    atual = []
  }
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    if (C === 'Z') {
      fechar()
      x = x0
      y = y0
      continue
    }
    if (C === 'M') {
      fechar()
      x = (rel ? x : 0) + num()
      y = (rel ? y : 0) + num()
      x0 = x
      y0 = y
      atual.push([x, y])
      cmd = rel ? 'l' : 'L'
    } else if (C === 'L') {
      x = (rel ? x : 0) + num()
      y = (rel ? y : 0) + num()
      atual.push([x, y])
    } else if (C === 'H') {
      x = (rel ? x : 0) + num()
      atual.push([x, y])
    } else if (C === 'V') {
      y = (rel ? y : 0) + num()
      atual.push([x, y])
    } else if (C === 'C') {
      const bx = rel ? x : 0
      const by = rel ? y : 0
      const p1 = [bx + num(), by + num()]
      const p2 = [bx + num(), by + num()]
      const p3 = [bx + num(), by + num()]
      for (let k = 1; k <= 32; k++) {
        const t = k / 32
        const u = 1 - t
        atual.push([
          u * u * u * x + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * y + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ])
      }
      ;[x, y] = p3
    } else if (C === 'A') {
      let rx = Math.abs(num())
      let ry = Math.abs(num())
      const fi = (num() * Math.PI) / 180
      const grande = num() !== 0
      const horario = num() !== 0
      const x2 = (rel ? x : 0) + num()
      const y2 = (rel ? y : 0) + num()
      // conversão do arco por pontas para o arco pelo centro (SVG 1.1, apêndice F.6)
      const cf = Math.cos(fi)
      const sf = Math.sin(fi)
      const dx = (x - x2) / 2
      const dy = (y - y2) / 2
      const x1p = cf * dx + sf * dy
      const y1p = -sf * dx + cf * dy
      const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
      if (lambda > 1) {
        rx *= Math.sqrt(lambda)
        ry *= Math.sqrt(lambda)
      }
      const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
      const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
      let co = Math.sqrt(Math.max(0, num2 / den))
      if (grande === horario) co = -co
      const cxp = (co * rx * y1p) / ry
      const cyp = (-co * ry * x1p) / rx
      const cx = cf * cxp - sf * cyp + (x + x2) / 2
      const cy = sf * cxp + cf * cyp + (y + y2) / 2
      const ang = (ux, uy, vx, vy) => {
        const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
      }
      const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
      let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
      if (!horario && dt > 0) dt -= 2 * Math.PI
      if (horario && dt < 0) dt += 2 * Math.PI
      const passos = Math.max(8, Math.ceil((Math.abs(dt) / (2 * Math.PI)) * 256))
      for (let k = 1; k <= passos; k++) {
        const t = t1 + (dt * k) / passos
        atual.push([cx + rx * Math.cos(t) * cf - ry * Math.sin(t) * sf, cy + rx * Math.cos(t) * sf + ry * Math.sin(t) * cf])
      }
      x = x2
      y = y2
    } else throw new Error(`comando de caminho não suportado: ${cmd}`)
  }
  fechar()
  return polis
}

/** Dentro de algum dos polígonos (regra par-ímpar entre os polígonos do mesmo caminho)? */
function dentro(polis, px, py) {
  let par = false
  for (const p of polis)
    for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
      const [xa, ya] = p[a]
      const [xb, yb] = p[b]
      if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) par = !par
    }
  return par
}

/** Rasteriza os caminhos numa tela w×h, com o símbolo centrado e `margem` px de folga. Cor [r,g,b]. */
export function rasterizar(caminhos, w, h, cor, margem = 0.5, amostras = 8) {
  const pts = caminhos.flat(2)
  const minX = Math.min(...pts.map((p) => p[0]))
  const maxX = Math.max(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  const maxY = Math.max(...pts.map((p) => p[1]))
  const escala = Math.min((w - 2 * margem) / (maxX - minX), (h - 2 * margem) / (maxY - minY))
  const ox = (w - (maxX - minX) * escala) / 2 - minX * escala
  const oy = (h - (maxY - minY) * escala) / 2 - minY * escala
  const data = new Uint8ClampedArray(w * h * 4)
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      let n = 0
      for (let sy = 0; sy < amostras; sy++)
        for (let sx = 0; sx < amostras; sx++) {
          const x = (px + (sx + 0.5) / amostras - ox) / escala
          const y = (py + (sy + 0.5) / amostras - oy) / escala
          if (caminhos.some((c) => dentro(c, x, y))) n++
        }
      const i = (py * w + px) * 4
      data[i] = cor[0]
      data[i + 1] = cor[1]
      data[i + 2] = cor[2]
      data[i + 3] = Math.round((255 * n) / (amostras * amostras))
    }
  return { width: w, height: h, data }
}

export function caminhosDoSvg(svg) {
  return [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => achatar(m[1]))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const caminhos = caminhosDoSvg(fs.readFileSync(SVG, 'utf8'))
  fs.mkdirSync(SAIDA, { recursive: true })
  const PRETO = [0, 0, 0]
  const BRANCO = [255, 255, 255]
  const GRAFITE = [29, 29, 31]
  const saidas = [
    ['bandejaTemplate.png', 20, 16, PRETO],
    ['bandejaTemplate@2x.png', 40, 32, PRETO],
    ['bandeja-branco.png', 16, 16, BRANCO],
    ['bandeja-branco@2x.png', 32, 32, BRANCO],
    ['bandeja-grafite.png', 16, 16, GRAFITE],
    ['bandeja-grafite@2x.png', 32, 32, GRAFITE],
  ]
  for (const [nome, w, h, cor] of saidas) {
    const margem = w > 20 ? 1 : 0.5
    fs.writeFileSync(path.join(SAIDA, nome), gravarPng(rasterizar(caminhos, w, h, cor, margem)))
    console.log(`build/bandeja/${nome} ${w}×${h}`)
  }
}
