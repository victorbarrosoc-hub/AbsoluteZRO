// A prévia JPEG que a câmera grava dentro do RAW (ARW, NEF, CR2, CR3, RAF, DNG, ORF, RW2…). Quase todo RAW leva uma
// (é o que o visor da câmera mostra), quase sempre no começo do arquivo. Em vez de entender cada formato, lê o começo
// do arquivo e pega o maior JPEG inteiro que achar (do FF D8 FF ao FF D9 que fecha). Só lê: o RAW não é alterado.
// Usado pela prévia do cartão (Cartões) e pela foto da montagem (src/server/montagens.js).
import fsp from 'node:fs/promises'
import path from 'node:path'

export const RAW_EXTS = ['.arw', '.srf', '.sr2', '.nef', '.nrw', '.cr2', '.cr3', '.crw', '.raf', '.dng', '.orf', '.rw2', '.pef', '.srw', '.3fr', '.iiq', '.gpr']
export const ehRaw = (p) => RAW_EXTS.includes(path.extname(String(p)).toLowerCase())

const MIN = 8 * 1024 // menor que isso é miniatura de 160 px, não vale

/** O maior JPEG completo dentro de `buf` (Buffer), ou null. */
export function maiorJpeg(buf) {
  let melhor = null
  let i = 0
  while (i < buf.length - 3) {
    const ini = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i)
    if (ini < 0) break
    const fim = acharFim(buf, ini + 3)
    if (fim < 0) break
    const tam = fim - ini
    if (tam >= MIN && (!melhor || tam > melhor.tam)) melhor = { ini, tam }
    i = fim
  }
  return melhor ? buf.subarray(melhor.ini, melhor.ini + melhor.tam) : null
}

/**
 * Fim do JPEG que começa antes de `de`: anda pelos segmentos (FF xx + tamanho) até o SOS e depois procura o FF D9 que
 * não é dado (FF 00) nem marcador de reinício (FF D0–D7). Devolve a posição logo depois do FF D9, ou -1.
 */
function acharFim(buf, de) {
  let p = de - 1 // no FF do primeiro marcador depois do SOI
  while (p < buf.length - 4) {
    if (buf[p] !== 0xff) return -1
    const m = buf[p + 1]
    if (m === 0xd9) return p + 2
    if (m === 0xda) {
      // dados da imagem até o próximo marcador de verdade
      let q = p + 2 + buf.readUInt16BE(p + 2)
      while (q < buf.length - 1) {
        if (buf[q] === 0xff && buf[q + 1] !== 0x00 && !(buf[q + 1] >= 0xd0 && buf[q + 1] <= 0xd7)) break
        q++
      }
      if (q >= buf.length - 1) return -1
      if (buf[q + 1] === 0xd9) return q + 2
      p = q
      continue
    }
    if (m === 0xff) {
      p++
      continue
    }
    p += 2 + buf.readUInt16BE(p + 2)
  }
  return -1
}

/** A prévia JPEG embutida no RAW em `caminho` (lendo até `max` bytes do começo), ou null. */
export async function jpegDoRaw(caminho, { max = 48 * 1024 * 1024 } = {}) {
  let fh
  try {
    fh = await fsp.open(caminho, 'r')
    const { size } = await fh.stat()
    const n = Math.min(size, max)
    const buf = Buffer.alloc(n)
    await fh.read(buf, 0, n, 0)
    return maiorJpeg(buf)
  } catch {
    return null
  } finally {
    await fh?.close().catch(() => {})
  }
}
