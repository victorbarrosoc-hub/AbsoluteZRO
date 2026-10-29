// Revela · um .zip sem compressão (método "store"), o bastante para entregar um pacote de LUTs num arquivo só, sem
// biblioteca de fora. Abre no Finder, no Explorer e em qualquer descompactador.

const TABELA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** `arquivos`: [{ nome, dados (string ou Uint8Array) }] → Uint8Array do .zip. Nomes em UTF-8. */
export function criarZip(arquivos) {
  const enc = new TextEncoder()
  const partes = []
  const centrais = []
  let pos = 0
  for (const a of arquivos) {
    const nome = enc.encode(a.nome)
    const dados = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados
    const crc = crc32(dados)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nomes em UTF-8
    local.setUint16(8, 0, true) // store
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, nome.length, true)
    partes.push(new Uint8Array(local.buffer), nome, dados)
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, dados.length, true)
    central.setUint32(24, dados.length, true)
    central.setUint16(28, nome.length, true)
    central.setUint32(42, pos, true)
    centrais.push(new Uint8Array(central.buffer), nome)
    pos += 30 + nome.length + dados.length
  }
  const tamCentral = centrais.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamCentral, true)
  fim.setUint32(16, pos, true)
  const todas = [...partes, ...centrais, new Uint8Array(fim.buffer)]
  const out = new Uint8Array(todas.reduce((s, p) => s + p.length, 0))
  let i = 0
  for (const p of todas) {
    out.set(p, i)
    i += p.length
  }
  return out
}
