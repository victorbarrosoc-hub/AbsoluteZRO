// Para onde a exportação vai: uma pasta escolhida (File System Access, com escrita) ou um .zip baixado.
//
// A pasta NUNCA é sobrescrita: os nomes que já existem lá são lidos antes, `criarNomes` (src/exportar/nome.js) desvia
// deles com -2, -3, e cada arquivo ainda é conferido na hora de criar (alguém pode ter posto um igual no meio do lote).
// Nada é apagado nem movido: só se cria arquivo novo (e a subpasta da receita, se faltar).
//
// O .zip é "guardado" (método 0, sem compressão: JPEG e TIFF já vêm comprimidos), com nomes em UTF-8 (bit 11) e o
// CRC-32 calculado no worker da saída. PKWARE APPNOTE 6.3.10: 4.3.7 cabeçalho local, 4.3.12 diretório central,
// 4.3.16 fim do diretório. Sem ZIP64: acima de 4 GB ou de 65.535 arquivos, a pessoa precisa escolher uma pasta.

import { criarNomes, segmentosDaPasta } from '../../../src/exportar/nome.js'

export const temPasta = () => typeof globalThis.showDirectoryPicker === 'function'
const LIMITE_ZIP = 0xffffffff
const LIMITE_ENTRADAS = 0xffff

/** Pede a pasta (dentro de um clique). null se a pessoa desistiu ou o navegador não deixa. */
export async function escolherPasta() {
  if (!temPasta()) return null
  try {
    const pasta = await showDirectoryPicker({ id: 'foto-exportar', mode: 'readwrite' })
    if (pasta.requestPermission && (await pasta.requestPermission({ mode: 'readwrite' })) !== 'granted') return null
    return pasta
  } catch {
    return null
  }
}

async function nomesDe(pasta) {
  const nomes = []
  for await (const [nome, entrada] of pasta.entries()) if (entrada.kind === 'file') nomes.push(nome)
  return nomes
}

const existe = (pasta, nome) =>
  pasta.getFileHandle(nome).then(
    () => true,
    (e) => (e?.name === 'NotFoundError' ? false : Promise.reject(e)),
  )

/**
 * Destino numa pasta. `subpasta`: o `pasta` da receita (com fichas). Devolve { tipo, onde, gravar(contexto, saida),
 * fechar() }; `gravar` devolve o nome que ficou.
 */
export async function destinoPasta(raiz, { subpasta = '', contexto = {}, modelo, extensao }) {
  let pasta = raiz
  const caminho = [raiz.name]
  for (const s of segmentosDaPasta(subpasta, contexto)) {
    pasta = await pasta.getDirectoryHandle(s, { create: true })
    caminho.push(s)
  }
  const nomes = criarNomes({ modelo, extensao, existentes: await nomesDe(pasta) })
  return {
    tipo: 'pasta',
    onde: caminho.join('/'),
    async gravar(ctx, { bytes }) {
      let nome = nomes.proximo(ctx)
      // alguém criou um igual depois da leitura: o próximo nome livre (nunca por cima)
      while (await existe(pasta, nome)) nome = nomes.proximo({ ...ctx })
      const arquivo = await pasta.getFileHandle(nome, { create: true })
      const escrita = await arquivo.createWritable()
      try {
        await escrita.write(bytes)
        await escrita.close()
      } catch (e) {
        await escrita.abort?.().catch(() => {})
        throw e
      }
      return nome
    },
    async fechar() {
      return null
    },
  }
}

// ─────────── zip ───────────

function dataDos(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, dia }
}

function cabecalho(tamanho, preencher) {
  const b = new Uint8Array(tamanho)
  const v = new DataView(b.buffer)
  preencher(v)
  return b
}

/**
 * Destino .zip, montado em partes de Blob (o navegador guarda em disco o que for grande). `nome`: o nome do arquivo
 * baixado. `baixar()` entrega o .zip com tudo o que já foi gravado (pode ser chamado de novo depois de repetir as
 * que falharam).
 */
export function destinoZip({ nome, subpasta = '', contexto = {}, modelo, extensao }) {
  const prefixo = segmentosDaPasta(subpasta, contexto).join('/')
  const nomes = criarNomes({ modelo, extensao })
  const partes = []
  const central = []
  let deslocamento = 0
  const { hora, dia } = dataDos()
  const codificador = new TextEncoder()
  let url = null
  return {
    tipo: 'zip',
    onde: nome,
    get arquivos() {
      return central.length
    },
    async gravar(ctx, { bytes, crc }) {
      const final = nomes.proximo(ctx)
      const caminho = codificador.encode(prefixo ? `${prefixo}/${final}` : final)
      if (central.length >= LIMITE_ENTRADAS || deslocamento + bytes.length + 30 + caminho.length > LIMITE_ZIP) {
        throw new Error('Grande demais para um .zip. Escolha uma pasta.')
      }
      const local = cabecalho(30 + caminho.length, (v) => {
        v.setUint32(0, 0x04034b50, true)
        v.setUint16(4, 20, true)
        v.setUint16(6, 0x0800, true)
        v.setUint16(8, 0, true)
        v.setUint16(10, hora, true)
        v.setUint16(12, dia, true)
        v.setUint32(14, crc >>> 0, true)
        v.setUint32(18, bytes.length, true)
        v.setUint32(22, bytes.length, true)
        v.setUint16(26, caminho.length, true)
        v.setUint16(28, 0, true)
      })
      local.set(caminho, 30)
      partes.push(local, new Blob([bytes]))
      central.push({ caminho, crc: crc >>> 0, tamanho: bytes.length, onde: deslocamento })
      deslocamento += local.length + bytes.length
      return final
    },
    /** O .zip inteiro como Blob (o que foi gravado até agora). */
    blob() {
      const diretorio = central.map((e) => {
        const c = cabecalho(46 + e.caminho.length, (v) => {
          v.setUint32(0, 0x02014b50, true)
          v.setUint16(4, 0x0314, true) // feito em Unix, versão 2.0
          v.setUint16(6, 20, true)
          v.setUint16(8, 0x0800, true)
          v.setUint16(10, 0, true)
          v.setUint16(12, hora, true)
          v.setUint16(14, dia, true)
          v.setUint32(16, e.crc, true)
          v.setUint32(20, e.tamanho, true)
          v.setUint32(24, e.tamanho, true)
          v.setUint16(28, e.caminho.length, true)
          v.setUint32(38, (0o100644 << 16) >>> 0, true) // arquivo comum, rw-r--r--
          v.setUint32(42, e.onde, true)
        })
        c.set(e.caminho, 46)
        return c
      })
      const tamanhoCentral = diretorio.reduce((s, c) => s + c.length, 0)
      const fim = cabecalho(22, (v) => {
        v.setUint32(0, 0x06054b50, true)
        v.setUint16(8, central.length, true)
        v.setUint16(10, central.length, true)
        v.setUint32(12, tamanhoCentral, true)
        v.setUint32(16, deslocamento, true)
      })
      return new Blob([...partes, ...diretorio, fim], { type: 'application/zip' })
    },
    /** Baixa o .zip (um clique num link de blob:). */
    baixar() {
      if (url) URL.revokeObjectURL(url)
      url = URL.createObjectURL(this.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      a.rel = 'noopener'
      document.body.append(a)
      a.click()
      a.remove()
      return url
    },
    async fechar() {
      return null
    },
  }
}
