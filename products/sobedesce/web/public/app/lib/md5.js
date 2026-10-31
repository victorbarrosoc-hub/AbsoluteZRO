// MD5 incremental, pequeno e sem dependências (RFC 1321). Serve para conferir o arquivo que subiu: o Drive devolve
// o md5Checksum do que recebeu e aqui calculamos o do arquivo do aparelho, em pedaços, sem guardar o arquivo inteiro
// na memória. Roda no Web Worker (lib/md5-worker.js), na própria página (sem Worker) e no Node (testes).
// MD5 não é para segurança aqui: é só a mesma soma que o Google usa para dizer "o conteúdo é este".

const K = new Int32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
])
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
const G = new Uint8Array(64)
for (let i = 0; i < 64; i++) G[i] = i < 16 ? i : i < 32 ? (5 * i + 1) % 16 : i < 48 ? (3 * i + 5) % 16 : (7 * i) % 16

export class Md5 {
  constructor() {
    this.h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476])
    this.x = new Int32Array(16)
    this.buf = new Uint8Array(64)
    this.n = 0 // bytes no buf
    this.total = 0 // bytes vistos (até 2^53, sobra)
  }

  /** Um bloco de 64 bytes a partir de b[o]. */
  _block(b, o) {
    const x = this.x
    for (let j = 0; j < 16; j++, o += 4) x[j] = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
    const h = this.h
    let a = h[0]
    let bb = h[1]
    let c = h[2]
    let d = h[3]
    for (let i = 0; i < 64; i++) {
      let f
      if (i < 16) f = (bb & c) | (~bb & d)
      else if (i < 32) f = (d & bb) | (~d & c)
      else if (i < 48) f = bb ^ c ^ d
      else f = c ^ (bb | ~d)
      const t = (a + f + K[i] + x[G[i]]) | 0
      a = d
      d = c
      c = bb
      bb = (bb + ((t << S[i]) | (t >>> (32 - S[i])))) | 0
    }
    h[0] = (h[0] + a) | 0
    h[1] = (h[1] + bb) | 0
    h[2] = (h[2] + c) | 0
    h[3] = (h[3] + d) | 0
  }

  /** Mais bytes (Uint8Array ou ArrayBuffer). */
  update(data) {
    const b = data instanceof Uint8Array ? data : new Uint8Array(data)
    let i = 0
    this.total += b.length
    if (this.n) {
      const need = 64 - this.n
      const take = Math.min(need, b.length)
      this.buf.set(b.subarray(0, take), this.n)
      this.n += take
      i = take
      if (this.n < 64) return this
      this._block(this.buf, 0)
      this.n = 0
    }
    for (; i + 64 <= b.length; i += 64) this._block(b, i)
    if (i < b.length) {
      this.buf.set(b.subarray(i), 0)
      this.n = b.length - i
    }
    return this
  }

  /** A soma em hexadecimal minúsculo (como o md5Checksum do Drive). Depois disto o objeto não serve mais. */
  hex() {
    const total = this.total
    const pad = new Uint8Array(this.n < 56 ? 64 - this.n : 128 - this.n)
    pad[0] = 0x80
    // tamanho em bits, 64 bits little-endian
    const lo = (total % 0x20000000) * 8
    const hi = Math.floor(total / 0x20000000)
    const end = pad.length - 8
    for (let k = 0; k < 4; k++) {
      pad[end + k] = (lo >>> (8 * k)) & 0xff
      pad[end + 4 + k] = (hi >>> (8 * k)) & 0xff
    }
    this.update(pad)
    let out = ''
    for (let k = 0; k < 4; k++) {
      const v = this.h[k]
      for (let s = 0; s < 32; s += 8) out += ((v >>> s) & 0xff).toString(16).padStart(2, '0')
    }
    return out
  }
}

/** MD5 de um texto (UTF-8) ou de bytes, de uma vez. */
export function md5(data) {
  const b = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return new Md5().update(b).hex()
}

export const PEDACO_MD5 = 8 * 1024 * 1024

/**
 * MD5 de um Blob/File lido em pedaços (Blob.slice), sem carregar o arquivo inteiro. `pausa` entre pedaços deixa a
 * página respirar quando roda fora do Worker. onProgress(feito, total). signal.aborted → para no próximo pedaço.
 */
export async function md5DoBlob(blob, { onProgress, signal, pausa = null, pedaco = PEDACO_MD5 } = {}) {
  const h = new Md5()
  const total = blob.size
  for (let pos = 0; pos < total; ) {
    if (signal?.aborted) throw Object.assign(new Error('Conferência interrompida.'), { aborted: true })
    const fim = Math.min(pos + pedaco, total)
    h.update(new Uint8Array(await blob.slice(pos, fim).arrayBuffer()))
    pos = fim
    onProgress?.(pos, total)
    if (pausa) await pausa()
  }
  return h.hex()
}
