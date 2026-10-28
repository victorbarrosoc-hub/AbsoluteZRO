// Ícones da bandeja (Windows/Linux) e da barra de menus (Mac) a partir da geometria de build/icon.svg (o quadrado
// escuro com as duas pílulas, sobe roxo e desce azul). Sem dependências: rasteriza com supersampling 8×8 e grava PNG
// (zlib do Node) e ICO (PNGs embutidos).
//
//   desktop/bandeja/bandeja.ico            Windows: 16, 20, 24, 32, 40, 48 e 64 px (o sistema escolhe pela escala)
//   desktop/bandeja/bandeja.png e @2x      Linux: 16 e 32 px
//   desktop/bandeja/bandejaTemplate.png e @2x  Mac: só as pílulas, preto com alfa (o macOS pinta conforme a barra)
//
// Uso: node scripts/bandeja-icones.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const SAIDA = path.join(import.meta.dirname, '..', 'desktop', 'bandeja')

// Geometria de build/icon.svg (viewBox 1024).
const FUNDO = { x: 100, y: 100, w: 824, h: 824, r: 186, de: [0x23, 0x23, 0x27], ate: [0x0c, 0x0c, 0x0e] }
const PILULAS = [
  { x: 350, y: 256, w: 124, h: 406, r: 62, de: [0xb9, 0xa8, 0xff], ate: [0x7c, 0x5c, 0xff] },
  { x: 550, y: 362, w: 124, h: 406, r: 62, de: [0x3d, 0x9c, 0xff], ate: [0x7c, 0xc0, 0xff] },
]

function dentro(f, x, y) {
  if (x < f.x || y < f.y || x > f.x + f.w || y > f.y + f.h) return false
  const cx = Math.min(Math.max(x, f.x + f.r), f.x + f.w - f.r)
  const cy = Math.min(Math.max(y, f.y + f.r), f.y + f.h - f.r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= f.r ** 2
}

const mistura = (f, y) => {
  const t = Math.min(1, Math.max(0, (y - f.y) / f.h))
  return f.de.map((c, i) => c + (f.ate[i] - c) * t)
}

/** Rasteriza as formas no quadro `caixa` ({ x, y, lado } no espaço 1024) em `n`×`n` px RGBA. */
function rasterizar(n, caixa, formas, cor) {
  const SS = 8
  const px = Buffer.alloc(n * n * 4)
  for (let py = 0; py < n; py++) {
    for (let pxi = 0; pxi < n; pxi++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = caixa.x + ((pxi + (sx + 0.5) / SS) / n) * caixa.lado
          const y = caixa.y + ((py + (sy + 0.5) / SS) / n) * caixa.lado
          // a última forma que contém o ponto ganha (pílula por cima do fundo)
          let c = null
          for (const f of formas) if (dentro(f, x, y)) c = cor(f, y)
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a++
        }
      }
      const i = (py * n + pxi) * 4
      if (a) {
        px[i] = Math.round(r / a)
        px[i + 1] = Math.round(g / a)
        px[i + 2] = Math.round(b / a)
        px[i + 3] = Math.round((a / (SS * SS)) * 255)
      }
    }
  }
  return px
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function bloco(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const td = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(n, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0)
  ihdr.writeUInt32BE(n, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const cru = Buffer.alloc(n * (n * 4 + 1))
  for (let y = 0; y < n; y++) rgba.copy(cru, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(cru, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ])
}
function ico(imagens) {
  const cab = Buffer.alloc(6 + 16 * imagens.length)
  cab.writeUInt16LE(0, 0)
  cab.writeUInt16LE(1, 2)
  cab.writeUInt16LE(imagens.length, 4)
  let pos = cab.length
  imagens.forEach(({ n, dados }, i) => {
    const o = 6 + 16 * i
    cab[o] = n >= 256 ? 0 : n
    cab[o + 1] = n >= 256 ? 0 : n
    cab.writeUInt16LE(1, o + 4)
    cab.writeUInt16LE(32, o + 6)
    cab.writeUInt32LE(dados.length, o + 8)
    cab.writeUInt32LE(pos, o + 12)
    pos += dados.length
  })
  return Buffer.concat([cab, ...imagens.map(i => i.dados)])
}

// Colorido: o ícone do app inteiro, recortado no quadrado (sem a margem da sombra).
const COLORIDO = { x: FUNDO.x, y: FUNDO.y, lado: FUNDO.w }
const colorido = n => png(n, rasterizar(n, COLORIDO, [FUNDO, ...PILULAS], mistura))
// Template do Mac: só as pílulas, pretas, centradas com um respiro.
const TEMPLATE = { x: 232, y: 232, lado: 560 }
const template = n => png(n, rasterizar(n, TEMPLATE, PILULAS, () => [0, 0, 0]))

fs.mkdirSync(SAIDA, { recursive: true })
fs.writeFileSync(path.join(SAIDA, 'bandeja.ico'), ico([16, 20, 24, 32, 40, 48, 64].map(n => ({ n, dados: colorido(n) }))))
fs.writeFileSync(path.join(SAIDA, 'bandeja.png'), colorido(16))
fs.writeFileSync(path.join(SAIDA, 'bandeja@2x.png'), colorido(32))
fs.writeFileSync(path.join(SAIDA, 'bandejaTemplate.png'), template(18))
fs.writeFileSync(path.join(SAIDA, 'bandejaTemplate@2x.png'), template(36))
console.log(`ícones da bandeja em ${SAIDA}`)
