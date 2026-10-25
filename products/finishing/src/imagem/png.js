// PNG sem dependência: lê 8 e 16 bits (cinza, cinza+alfa, RGB, RGBA; sem entrelaçamento) e grava RGB 8 bits.
// Basta para o protótipo: o Resolve exporta still em PNG. JPEG e outros entram pela versão web (o navegador decodifica).

import { crc32, deflateSync, inflateSync } from 'node:zlib'

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CANAIS = { 0: 1, 2: 3, 4: 2, 6: 4 }

/** PNG → `{ largura, altura, pixels }` com pixels RGB em 0–1 (Float32Array). */
export function lerPng(buf) {
  if (!buf.subarray(0, 8).equals(ASSINATURA)) throw new Error('Não é um PNG')
  let pos = 8
  let ihdr
  const idat = []
  while (pos < buf.length) {
    const tam = buf.readUInt32BE(pos)
    const tipo = buf.toString('latin1', pos + 4, pos + 8)
    const dados = buf.subarray(pos + 8, pos + 8 + tam)
    if (tipo === 'IHDR') ihdr = dados
    else if (tipo === 'IDAT') idat.push(dados)
    else if (tipo === 'IEND') break
    pos += 12 + tam
  }
  if (!ihdr) throw new Error('PNG sem cabeçalho')
  const largura = ihdr.readUInt32BE(0)
  const altura = ihdr.readUInt32BE(4)
  const bits = ihdr[8]
  const tipoCor = ihdr[9]
  if (ihdr[12] !== 0) throw new Error('PNG entrelaçado não é suportado; exporte sem entrelaçamento')
  const canais = CANAIS[tipoCor]
  if (!canais || (bits !== 8 && bits !== 16)) throw new Error('PNG precisa ser 8 ou 16 bits, sem paleta')

  const bpp = (canais * bits) / 8
  const linha = largura * bpp
  const bruto = inflateSync(Buffer.concat(idat))
  const img = Buffer.alloc(linha * altura)
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (linha + 1)]
    const src = bruto.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1))
    const dst = img.subarray(y * linha, (y + 1) * linha)
    const ant = y ? img.subarray((y - 1) * linha, y * linha) : null
    for (let x = 0; x < linha; x++) {
      const a = x >= bpp ? dst[x - bpp] : 0
      const b = ant ? ant[x] : 0
      const c = ant && x >= bpp ? ant[x - bpp] : 0
      let v = src[x]
      if (filtro === 1) v += a
      else if (filtro === 2) v += b
      else if (filtro === 3) v += (a + b) >> 1
      else if (filtro === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filtro !== 0) throw new Error('PNG com filtro inválido')
      dst[x] = v & 0xff
    }
  }

  const max = bits === 16 ? 65535 : 255
  const amostra = bits === 16 ? (i) => img.readUInt16BE(i * 2) / max : (i) => img[i] / max
  const pixels = new Float32Array(largura * altura * 3)
  for (let p = 0; p < largura * altura; p++) {
    const base = p * canais
    const cinza = canais < 3
    pixels[p * 3] = amostra(base)
    pixels[p * 3 + 1] = amostra(cinza ? base : base + 1)
    pixels[p * 3 + 2] = amostra(cinza ? base : base + 2)
  }
  return { largura, altura, pixels }
}

function bloco(tipo, dados) {
  const t = Buffer.from(tipo, 'latin1')
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(dados.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0)
  return Buffer.concat([tam, t, dados, crc])
}

/** `{ largura, altura, pixels }` (0–1) → PNG RGB 8 bits. */
export function gravarPng({ largura, altura, pixels }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const linha = largura * 3
  const bruto = Buffer.alloc((linha + 1) * altura)
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < linha; x++) bruto[y * (linha + 1) + 1 + x] = Math.round(Math.min(1, Math.max(0, pixels[y * linha + x])) * 255)
  return Buffer.concat([ASSINATURA, bloco('IHDR', ihdr), bloco('IDAT', deflateSync(bruto)), bloco('IEND', Buffer.alloc(0))])
}
