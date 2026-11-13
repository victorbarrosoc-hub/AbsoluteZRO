// Um .zip sem compressão (método 0, "store"), o bastante para levar arquivos de texto pequenos (os .xmp) para o disco
// da pessoa quando o navegador não deixa gravar na pasta. APPNOTE do PKWARE, 4.3: cabeçalho local + dados para cada
// arquivo, depois o diretório central e o fim do diretório. Nomes em UTF-8 (bit 11 do campo de flags).

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

/** Data e hora no formato do MS-DOS (o que o zip guarda). */
function dataDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, dia }
}

/**
 * `arquivos`: [{ caminho: 'pasta/IMG_0001.xmp', dados: Uint8Array | string }]. Devolve os bytes do .zip.
 * Caminho com barra normal, sem barra no começo e sem `..` (o que vier assim é limpo).
 */
export function montarZip(arquivos, { agora = new Date() } = {}) {
  const texto = new TextEncoder()
  const { hora, dia } = dataDos(agora)
  const partes = []
  const central = []
  let deslocamento = 0
  for (const a of arquivos) {
    const nome = texto.encode(
      String(a.caminho)
        .replace(/\\/g, '/')
        .split('/')
        .filter((p) => p && p !== '.' && p !== '..')
        .join('/'),
    )
    const dados = typeof a.dados === 'string' ? texto.encode(a.dados) : a.dados
    const crc = crc32(dados)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versão para extrair: 2.0
    local.setUint16(6, 0x0800, true) // UTF-8
    local.setUint16(8, 0, true) // store
    local.setUint16(10, hora, true)
    local.setUint16(12, dia, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, nome.length, true)
    local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nome, dados)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, hora, true)
    c.setUint16(14, dia, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, dados.length, true)
    c.setUint32(24, dados.length, true)
    c.setUint16(28, nome.length, true)
    c.setUint32(42, deslocamento, true)
    central.push(new Uint8Array(c.buffer), nome)
    deslocamento += 30 + nome.length + dados.length
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamanhoCentral, true)
  fim.setUint32(16, deslocamento, true)
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)]
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0))
  let p = 0
  for (const parte of todas) {
    saida.set(parte, p)
    p += parte.length
  }
  return saida
}
