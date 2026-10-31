// Um ZIP de verdade, montado nos testes (Word, Excel e PowerPoint são ZIP com XML). `flags` e `tamanhoFalso` servem
// para montar arquivos ruins de propósito (protegido por senha, tamanho que mente).
import { deflateRawSync } from 'node:zlib'

function crc32(b: Uint8Array) {
  let c = ~0
  for (const x of b) {
    c ^= x
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

export function zip(arquivos: Record<string, string | Uint8Array>, opcoes: { flags?: number; tamanhoFalso?: number } = {}): Uint8Array {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let off = 0
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.from(conteudo)
    const comp = deflateRawSync(dados)
    const n = Buffer.from(nome)
    const crc = crc32(dados)
    const tam = opcoes.tamanhoFalso ?? dados.length
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0)
    l.writeUInt16LE(20, 4)
    l.writeUInt16LE(opcoes.flags ?? 0, 6)
    l.writeUInt16LE(8, 8)
    l.writeUInt32LE(crc, 14)
    l.writeUInt32LE(comp.length, 18)
    l.writeUInt32LE(tam, 22)
    l.writeUInt16LE(n.length, 26)
    locais.push(l, n, comp)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(opcoes.flags ?? 0, 8)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(comp.length, 20)
    c.writeUInt32LE(tam, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(off, 42)
    centrais.push(c, n)
    off += 30 + n.length + comp.length
  }
  const dir = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(Object.keys(arquivos).length, 8)
  fim.writeUInt16LE(Object.keys(arquivos).length, 10)
  fim.writeUInt32LE(dir.length, 12)
  fim.writeUInt32LE(off, 16)
  return new Uint8Array(Buffer.concat([...locais, dir, fim]))
}

/** Um .docx mínimo com os parágrafos dados. */
export const docx = (...paragrafos: string[]) =>
  zip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': `<w:document><w:body>${paragrafos.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  })
