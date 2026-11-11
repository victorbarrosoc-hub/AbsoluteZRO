// Imprevistos do cartão (09/11/2026): o que o Backup Automático deixa no cartão de propósito e a gravação que parece
// interrompida.
//  - Proxies e restos do sistema (LRV/LRF/THM da GoPro e do drone, ._ do Mac, .DS_Store, Thumbs.db): ficam no cartão
//    por padrão. Não são o material bruto, então não contam como "ficou algo de fora" e não seguram o "pode formatar".
//    O projeto pode levar tudo (`levarProxies`).
//  - Gravação interrompida: bateria acabou ou o cartão saiu no meio do clipe. O arquivo copia igualzinho ao do cartão
//    (o checksum bate), mas está quebrado: num MP4/MOV falta o índice (`moov`) ou um bloco passa do fim do arquivo; num
//    JPEG falta o marcador do fim. A tela avisa antes de a pessoa formatar. Só lê cabeçalhos: nada é alterado.
import fsp from 'node:fs/promises'
import path from 'node:path'

const PROXY = /\.(lrv|lrf|thm)$/i
const SISTEMA_ARQ = /(^|\/)(\._[^/]*|\.DS_Store|Thumbs\.db|desktop\.ini)$/i

/** Fica no cartão por padrão (proxy da câmera ou arquivo do sistema)? */
export function deixaNoCartao(relPath) {
  const r = String(relPath || '')
  return PROXY.test(r) || SISTEMA_ARQ.test(r)
}

const QUICKTIME = new Set(['mp4', 'mov', 'm4v', 'braw', 'insv', '3gp', 'crm'])
const JPEG = new Set(['jpg', 'jpeg'])
const ext = (p) => path.extname(String(p)).slice(1).toLowerCase()

/** Vale olhar este arquivo? (os formatos que dá para conferir só pelo cabeçalho) */
export const conferivel = (p) => QUICKTIME.has(ext(p)) || JPEG.has(ext(p))

const LEGIVEL = /^[A-Za-z0-9 ©_-]{4}$/

/**
 * Estrutura de um MP4/MOV pelos blocos do primeiro nível. Devolve null (parece inteiro), 'sem-indice' (não tem moov)
 * ou 'cortado' (um bloco diz ser maior que o arquivo). Formato que não parece QuickTime: null (não acusa).
 */
export async function conferirQuickTime(fh, tamanho) {
  let pos = 0
  let moov = false
  const buf = Buffer.alloc(16)
  for (let n = 0; n < 512 && pos < tamanho; n++) {
    if (tamanho - pos < 8) return 'cortado'
    const { bytesRead } = await fh.read(buf, 0, 16, pos)
    if (bytesRead < 8) return 'cortado'
    let size = buf.readUInt32BE(0)
    const tipo = buf.toString('latin1', 4, 8)
    if (!LEGIVEL.test(tipo)) return n === 0 ? null : 'cortado'
    if (tipo === 'moov') moov = true
    if (size === 1) {
      if (bytesRead < 16) return 'cortado'
      size = Number(buf.readBigUInt64BE(8))
    } else if (size === 0) {
      size = tamanho - pos // até o fim do arquivo (o mdat de uma gravação que não fechou costuma vir assim)
    }
    if (size < 8) return 'cortado'
    if (pos + size > tamanho) return 'cortado'
    pos += size
  }
  return moov ? null : 'sem-indice'
}

/** JPEG sem o marcador do fim (FF D9) nos últimos 64 KB: foi cortado. Arquivo que não começa como JPEG: não acusa. */
export async function conferirJpeg(fh, tamanho) {
  const ini = Buffer.alloc(2)
  await fh.read(ini, 0, 2, 0)
  if (!(ini[0] === 0xff && ini[1] === 0xd8)) return null
  const n = Math.min(tamanho, 64 * 1024)
  const buf = Buffer.alloc(n)
  await fh.read(buf, 0, n, tamanho - n)
  for (let i = n - 2; i >= 0; i--) if (buf[i] === 0xff && buf[i + 1] === 0xd9) return null
  return 'cortado'
}

/** O arquivo parece uma gravação interrompida? null = parece inteiro (ou não dá para dizer). */
export async function gravacaoInterrompida(caminho) {
  if (!conferivel(caminho)) return null
  let fh
  try {
    fh = await fsp.open(caminho, 'r')
    const { size } = await fh.stat()
    if (size === 0) return 'vazio'
    return QUICKTIME.has(ext(caminho)) ? await conferirQuickTime(fh, size) : await conferirJpeg(fh, size)
  } catch {
    return null // sem ler (o cartão saiu, permissão): não acusa
  } finally {
    await fh?.close().catch(() => {})
  }
}

/** Os arquivos do cartão que parecem gravação interrompida (caminhos relativos), lendo só cabeçalhos. */
export async function procurarInterrompidas(raiz, relPaths, { max = 5000 } = {}) {
  const out = []
  for (const rel of relPaths.filter(conferivel).slice(0, max)) {
    if (await gravacaoInterrompida(path.join(raiz, ...rel.split('/')))) out.push(rel)
  }
  return out
}

/** A pasta, dentro do mesmo lugar do cartão, para o que veio com nome repetido depois de a câmera zerar o contador. */
export const pastaContadorZerado = (nome) => `${nome} · contador zerado`
