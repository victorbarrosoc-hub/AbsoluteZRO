// Biblioteca de SFX do usuário (análise da montagem · Beta): uma pasta escolhida por ele, indexada pelo nome dos
// arquivos e das subpastas. A página sugere sons daqui para os pontos da sequência e toca a prévia pelo protocolo do
// app (só arquivos desta pasta). Nada é copiado nem enviado: o índice fica em <dados do app>/sfx.json.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const SONS = /\.(wav|wave|aif|aiff|mp3|m4a|aac|flac|ogg)$/i
const MAX = 20000
const CONFIG = 'sfx.json'

const dentro = (pai, filho) => {
  const r = path.relative(pai, filho)
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r))
}

/** Duração de um WAV pelo cabeçalho (fmt + data); null para outros formatos ou arquivo estranho. */
async function duracaoWav(abs) {
  let fh
  try {
    fh = await fsp.open(abs, 'r')
    const b = Buffer.alloc(4096)
    const { bytesRead } = await fh.read(b, 0, b.length, 0)
    if (bytesRead < 12 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null
    let o = 12
    let bytesPorSeg = 0
    while (o + 8 <= bytesRead) {
      const id = b.toString('ascii', o, o + 4)
      const tam = b.readUInt32LE(o + 4)
      if (id === 'fmt ') bytesPorSeg = b.readUInt32LE(o + 16)
      if (id === 'data') {
        if (!bytesPorSeg) return null
        // data com tamanho 0 ou absurdo (gravação cortada): usa o resto do arquivo
        const st = await fh.stat()
        const dados = tam && tam <= st.size ? tam : st.size - o - 8
        return Math.round((dados / bytesPorSeg) * 1000) / 1000
      }
      o += 8 + tam + (tam % 2)
    }
    return null
  } catch {
    return null
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}

async function varrer(raiz, rel = '', out = []) {
  if (out.length >= MAX) return out
  let itens = []
  try {
    itens = await fsp.readdir(path.join(raiz, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of itens) {
    if (e.name.startsWith('.')) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) await varrer(raiz, r, out)
    else if (e.isFile() && SONS.test(e.name)) out.push(r)
    if (out.length >= MAX) break
  }
  return out
}

class Biblioteca {
  constructor({ stateDir }) {
    this.stateDir = stateDir
    this.cfg = { pasta: null, arquivos: [] }
    try {
      const c = JSON.parse(fs.readFileSync(path.join(stateDir, CONFIG), 'utf8'))
      if (c && Array.isArray(c.arquivos)) this.cfg = c
    } catch {}
  }

  estado() {
    return { pasta: this.cfg.pasta, total: this.cfg.arquivos.length, arquivos: this.cfg.arquivos }
  }

  /** Indexa (ou reindexa) a pasta: caminho, caminho relativo e duração dos WAV. */
  async indexar(pasta = this.cfg.pasta) {
    if (!pasta) throw new Error('Escolha a pasta da sua biblioteca de SFX.')
    const raiz = path.resolve(pasta)
    const st = await fsp.stat(raiz).catch(() => null)
    if (!st || !st.isDirectory()) throw new Error('Essa pasta não existe ou não abre.')
    const rels = await varrer(raiz)
    const arquivos = []
    for (const rel of rels) {
      const abs = path.join(raiz, ...rel.split('/'))
      arquivos.push({ caminho: abs, rel, duracao: /\.wave?$/i.test(rel) ? await duracaoWav(abs) : null })
    }
    this.cfg = { pasta: raiz, arquivos, indexadoEm: new Date().toISOString() }
    await fsp.mkdir(this.stateDir, { recursive: true })
    const f = path.join(this.stateDir, CONFIG)
    await fsp.writeFile(f + '.tmp', JSON.stringify(this.cfg))
    await fsp.rename(f + '.tmp', f)
    return this.estado()
  }

  /** A prévia só toca arquivos de dentro da pasta da biblioteca. */
  permitido(abs) {
    return !!(this.cfg.pasta && dentro(this.cfg.pasta, path.resolve(String(abs || ''))))
  }
}

module.exports = { Biblioteca, duracaoWav, SONS }
