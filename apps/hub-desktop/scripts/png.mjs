// PNG sem dependências (só zlib do Node): lê PNG de 8 bits (cinza, RGB, RGBA, cinza+alfa; sem entrelaçamento),
// grava RGBA, reduz por média de área e compõe camadas. Basta para os ícones e o fundo do DMG.

import zlib from 'node:zlib'

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CANAIS = { 0: 1, 2: 3, 4: 2, 6: 4 }

/** @returns {{ width: number, height: number, data: Uint8ClampedArray }} RGBA */
export function lerPng(buf) {
  if (!buf.subarray(0, 8).equals(ASSINATURA)) throw new Error('não é PNG')
  let pos = 8
  let ihdr = null
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const tipo = buf.toString('latin1', pos + 4, pos + 8)
    const dados = buf.subarray(pos + 8, pos + 8 + len)
    if (tipo === 'IHDR') ihdr = { width: dados.readUInt32BE(0), height: dados.readUInt32BE(4), bits: dados[8], cor: dados[9], entrelacado: dados[12] }
    else if (tipo === 'IDAT') idat.push(dados)
    else if (tipo === 'IEND') break
    pos += 12 + len
  }
  if (!ihdr) throw new Error('PNG sem IHDR')
  const canais = CANAIS[ihdr.cor]
  if (ihdr.bits !== 8 || !canais || ihdr.entrelacado) throw new Error(`PNG não suportado (bits ${ihdr.bits}, cor ${ihdr.cor}); salve como RGBA de 8 bits`)
  const cru = zlib.inflateSync(Buffer.concat(idat))
  const { width, height } = ihdr
  const linha = width * canais
  const px = Buffer.alloc(linha * height)
  for (let y = 0; y < height; y++) {
    const filtro = cru[y * (linha + 1)]
    const src = y * (linha + 1) + 1
    const dst = y * linha
    for (let x = 0; x < linha; x++) {
      const a = x >= canais ? px[dst + x - canais] : 0
      const b = y > 0 ? px[dst - linha + x] : 0
      const c = x >= canais && y > 0 ? px[dst - linha + x - canais] : 0
      let v = cru[src + x]
      if (filtro === 1) v += a
      else if (filtro === 2) v += b
      else if (filtro === 3) v += (a + b) >> 1
      else if (filtro === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[dst + x] = v & 255
    }
  }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * canais
    const d = i * 4
    if (canais === 1 || canais === 2) {
      data[d] = data[d + 1] = data[d + 2] = px[s]
      data[d + 3] = canais === 2 ? px[s + 1] : 255
    } else {
      data[d] = px[s]
      data[d + 1] = px[s + 1]
      data[d + 2] = px[s + 2]
      data[d + 3] = canais === 4 ? px[s + 3] : 255
    }
  }
  return { width, height, data }
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function bloco(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

/** Grava RGBA de 8 bits (filtro Paeth/Sub por linha, o menor). */
export function gravarPng({ width, height, data }) {
  const linha = width * 4
  const cru = Buffer.alloc((linha + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (linha + 1)
    cru[o] = 1 // Sub: bom o bastante para ícones e fundos
    for (let x = 0; x < linha; x++) {
      const v = data[y * linha + x]
      const a = x >= 4 ? data[y * linha + x - 4] : 0
      cru[o + 1 + x] = (v - a) & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([ASSINATURA, bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(cru, { level: 9 })), bloco('IEND', Buffer.alloc(0))])
}

/** Redimensiona por média de área com alfa pré-multiplicado (sem halo escuro nas bordas). */
export function redimensionar(img, w, h) {
  const { width: W, height: H, data } = img
  const out = new Uint8ClampedArray(w * h * 4)
  const sx = W / w
  const sy = H / h
  for (let y = 0; y < h; y++) {
    const y0 = y * sy
    const y1 = y0 + sy
    for (let x = 0; x < w; x++) {
      const x0 = x * sx
      const x1 = x0 + sx
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let peso = 0
      for (let yy = Math.floor(y0); yy < Math.min(H, Math.ceil(y1)); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0)
        for (let xx = Math.floor(x0); xx < Math.min(W, Math.ceil(x1)); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0)
          const p = wx * wy
          const i = (yy * W + xx) * 4
          const al = data[i + 3] / 255
          r += data[i] * al * p
          g += data[i + 1] * al * p
          b += data[i + 2] * al * p
          a += al * p
          peso += p
        }
      }
      const o = (y * w + x) * 4
      if (a > 0) {
        out[o] = r / a
        out[o + 1] = g / a
        out[o + 2] = b / a
      }
      out[o + 3] = (a / peso) * 255
    }
  }
  return { width: w, height: h, data: out }
}

/** Cola `cima` sobre `base` (alfa normal) na posição x, y, com opacidade. Altera `base`. */
export function compor(base, cima, x0, y0, opacidade = 1) {
  for (let y = 0; y < cima.height; y++) {
    const by = y + y0
    if (by < 0 || by >= base.height) continue
    for (let x = 0; x < cima.width; x++) {
      const bx = x + x0
      if (bx < 0 || bx >= base.width) continue
      const i = (y * cima.width + x) * 4
      const j = (by * base.width + bx) * 4
      const a = (cima.data[i + 3] / 255) * opacidade
      if (!a) continue
      for (let c = 0; c < 3; c++) base.data[j + c] = cima.data[i + c] * a + base.data[j + c] * (1 - a)
      base.data[j + 3] = Math.min(255, base.data[j + 3] + a * 255)
    }
  }
  return base
}
