/**
 * Anexos do Laboratório da Z: descobre o tipo pelo conteúdo (nunca só pela extensão), confere o tamanho e tira o texto
 * de documentos do Office sem executar nada.
 *
 * - Imagem (JPEG, PNG, GIF, WebP) e PDF vão como são para o Claude, que lê os dois de forma nativa.
 * - Word, Excel e PowerPoint (.docx, .xlsx, .pptx) são ZIP com XML: lemos só as partes de texto, com limite de
 *   entradas, de tamanho descompactado e de proporção (contra "bomba de zip"), sem macro, sem entidade externa de XML
 *   (só as 5 entidades básicas e as numéricas são traduzidas) e sem seguir link.
 * - Texto, CSV, Markdown e JSON: UTF-8 válido, sem byte nulo.
 * - .doc/.xls/.ppt antigos (formato binário) e qualquer outra coisa: recusados com a explicação do que fazer.
 * - Áudio e vídeo não passam por aqui: o navegador tira o áudio e manda em pedaços para a transcrição.
 * Nada é guardado: o texto volta para quem enviou; imagem e PDF vão para os arquivos da Anthropic com validade de 24 h.
 */
import { inflateRawSync } from 'node:zlib'
import { DomainError } from '@zro/observability'

/** Limite de um arquivo no servidor (o corpo de uma função da Vercel para em 4,5 MB). */
export const Z_ANEXO_MAX_BYTES = 4 * 1024 * 1024
export const Z_TEXTO_MAX_BYTES = 1024 * 1024
/** Texto que vai para a Z por anexo. Passou disso, corta e avisa (a Z e a pessoa sabem). */
export const Z_TEXTO_MAX_CARACTERES = 150_000
const ZIP_MAX_ENTRADAS = 3000
const ZIP_MAX_ENTRADA = 25 * 1024 * 1024
const ZIP_MAX_TOTAL = 60 * 1024 * 1024
const ZIP_MAX_PROPORCAO = 250

export type ZTipoArquivo = 'imagem' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'texto'
export type ZMidia = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'

export type ZArquivoLido =
  | { tipo: 'imagem'; mime: Exclude<ZMidia, 'application/pdf'>; nome: string; bytes: number }
  | { tipo: 'pdf'; mime: 'application/pdf'; nome: string; bytes: number }
  | { tipo: 'texto'; origem: 'docx' | 'xlsx' | 'pptx' | 'texto'; nome: string; bytes: number; texto: string; cortado: boolean }

const comeca = (b: Uint8Array, ...sig: number[]) => sig.every((v, i) => b[i] === v)

/** Nome seguro para mostrar e mandar à IA: sem caminho, sem controle, até 120 caracteres. */
export function nomeSeguro(nome: string): string {
  const base = [...(nome.split(/[\\/]/).pop() ?? '')]
    .filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f && !'<>"'.includes(c))
    .join('')
    .trim()
  return (base || 'arquivo').slice(0, 120)
}

const extensao = (nome: string) => /\.([a-z0-9]{1,6})$/i.exec(nome)?.[1]?.toLowerCase() ?? ''

/** Tipo pelo conteúdo. A extensão só desempata texto (csv, md, json) e precisa bater com o que o conteúdo diz. */
export function descobrirTipo(bytes: Uint8Array, nome: string): ZTipoArquivo {
  const ext = extensao(nome)
  if (comeca(bytes, 0xff, 0xd8, 0xff)) return 'imagem'
  if (comeca(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'imagem'
  if (comeca(bytes, 0x47, 0x49, 0x46, 0x38)) return 'imagem'
  if (comeca(bytes, 0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'imagem'
  if (comeca(bytes, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf'
  if (comeca(bytes, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))
    throw new DomainError('invalid_input', 'Formato antigo do Office (.doc, .xls, .ppt). Salve como .docx, .xlsx ou .pptx e envie de novo.')
  if (comeca(bytes, 0x50, 0x4b, 0x03, 0x04)) {
    const nomes = new Set(lerZip(bytes).entradas.map((e) => e.nome))
    if (nomes.has('word/document.xml')) return 'docx'
    if (nomes.has('xl/workbook.xml')) return 'xlsx'
    if (nomes.has('ppt/presentation.xml')) return 'pptx'
    throw new DomainError('invalid_input', 'Arquivo compactado que não é Word, Excel ou PowerPoint.')
  }
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext))
    throw new DomainError('invalid_input', 'Áudio e vídeo vão pela transcrição, não por aqui.')
  if (bytes.length <= Z_TEXTO_MAX_BYTES && pareceTexto(bytes)) return 'texto'
  throw new DomainError('invalid_input', 'Tipo de arquivo não suportado. Envie imagem, PDF, Word, Excel, PowerPoint, texto ou CSV.')
}

function pareceTexto(bytes: Uint8Array): boolean {
  if (bytes.subarray(0, 8192).includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

const MIME_IMAGEM = (b: Uint8Array): Exclude<ZMidia, 'application/pdf'> =>
  comeca(b, 0xff, 0xd8, 0xff) ? 'image/jpeg' : comeca(b, 0x89, 0x50) ? 'image/png' : comeca(b, 0x47, 0x49) ? 'image/gif' : 'image/webp'

function cortar(texto: string): { texto: string; cortado: boolean } {
  const limpo = texto
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
  if (limpo.length <= Z_TEXTO_MAX_CARACTERES) return { texto: limpo, cortado: false }
  return { texto: limpo.slice(0, Z_TEXTO_MAX_CARACTERES), cortado: true }
}

/** Lê um arquivo enviado: confere tamanho e tipo, e tira o texto quando é documento. */
export function lerArquivo(bytes: Uint8Array, nomeOriginal: string): ZArquivoLido {
  const nome = nomeSeguro(nomeOriginal)
  if (!bytes.length) throw new DomainError('invalid_input', 'Arquivo vazio.')
  if (bytes.length > Z_ANEXO_MAX_BYTES) throw new DomainError('invalid_input', 'Arquivo grande demais (até 4 MB por aqui).')
  const tipo = descobrirTipo(bytes, nome)
  if (tipo === 'imagem') return { tipo, mime: MIME_IMAGEM(bytes), nome, bytes: bytes.length }
  if (tipo === 'pdf') return { tipo, mime: 'application/pdf', nome, bytes: bytes.length }
  if (tipo === 'texto') return { tipo: 'texto', origem: 'texto', nome, bytes: bytes.length, ...cortar(new TextDecoder().decode(bytes)) }
  const zip = lerZip(bytes)
  const texto = tipo === 'docx' ? textoDeDocx(zip) : tipo === 'xlsx' ? textoDeXlsx(zip) : textoDePptx(zip)
  if (!texto.trim()) throw new DomainError('invalid_input', 'Não achei texto neste documento.')
  return { tipo: 'texto', origem: tipo, nome, bytes: bytes.length, ...cortar(texto) }
}

// ───────────── ZIP (só leitura, com limites) ─────────────

type EntradaZip = { nome: string; metodo: number; compactado: number; tamanho: number; inicio: number; flags: number }
export type Zip = { bytes: Uint8Array; entradas: EntradaZip[] }

/** Diretório central do ZIP. Recusa ZIP64, criptografia, método desconhecido e tamanho fora dos limites. */
export function lerZip(bytes: Uint8Array): Zip {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ruim = (m = 'Documento corrompido ou em formato não suportado.') => new DomainError('invalid_input', m)
  let fim = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw ruim()
  const total = dv.getUint16(fim + 10, true)
  const tamDir = dv.getUint32(fim + 12, true)
  let p = dv.getUint32(fim + 16, true)
  if (total > ZIP_MAX_ENTRADAS) throw ruim('Documento com partes demais.')
  if (p === 0xffffffff || p + tamDir > bytes.length) throw ruim()
  const entradas: EntradaZip[] = []
  let soma = 0
  for (let n = 0; n < total; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw ruim()
    const flags = dv.getUint16(p + 8, true)
    const metodo = dv.getUint16(p + 10, true)
    const compactado = dv.getUint32(p + 20, true)
    const tamanho = dv.getUint32(p + 24, true)
    const lnome = dv.getUint16(p + 28, true)
    const lextra = dv.getUint16(p + 30, true)
    const lcom = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + lnome))
    p += 46 + lnome + lextra + lcom
    if (flags & 0x1) throw ruim('Documento protegido por senha. Tire a senha e envie de novo.')
    if (compactado === 0xffffffff || tamanho === 0xffffffff || local === 0xffffffff) throw ruim('Documento grande demais.')
    if (metodo !== 0 && metodo !== 8) throw ruim()
    if (tamanho > ZIP_MAX_ENTRADA) throw ruim('Uma parte do documento é grande demais.')
    if (compactado > 0 && tamanho / compactado > ZIP_MAX_PROPORCAO) throw ruim('Documento suspeito (compactação fora do normal).')
    soma += tamanho
    if (soma > ZIP_MAX_TOTAL) throw ruim('Documento grande demais depois de descompactado.')
    if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50) throw ruim()
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    if (inicio + compactado > bytes.length) throw ruim()
    entradas.push({ nome, metodo, compactado, tamanho, inicio, flags })
  }
  return { bytes, entradas }
}

/** Uma parte do ZIP como texto (UTF-8). O tamanho de saída é travado no que o diretório declarou. */
export function parteDoZip(zip: Zip, nome: string): string | null {
  const e = zip.entradas.find((x) => x.nome === nome)
  if (!e) return null
  const dados = zip.bytes.subarray(e.inicio, e.inicio + e.compactado)
  let saida: Uint8Array
  try {
    saida = e.metodo === 0 ? dados : inflateRawSync(dados, { maxOutputLength: Math.max(1, e.tamanho) })
  } catch {
    throw new DomainError('invalid_input', 'Documento corrompido ou em formato não suportado.')
  }
  if (saida.length !== e.tamanho) throw new DomainError('invalid_input', 'Documento corrompido ou em formato não suportado.')
  return new TextDecoder().decode(saida)
}

// ───────────── XML do Office (texto puro, sem entidades externas) ─────────────

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export function decodificarXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return n > 0 && n < 0x110000 && n !== 0xfffe && n !== 0xffff ? String.fromCodePoint(n) : ''
    }
    return ENTIDADES[e.toLowerCase()] ?? ''
  })
}

function textoDeDocx(zip: Zip): string {
  const partes = ['word/document.xml', ...zip.entradas.map((e) => e.nome).filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n))]
  return partes
    .map((nome) => {
      const xml = parteDoZip(zip, nome) ?? ''
      let out = ''
      for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
        if (m[1] !== undefined) out += decodificarXml(m[1])
        else out += m[0] === '<w:tab/>' ? '\t' : '\n'
      }
      return out
    })
    .join('\n\n')
}

function textoDePptx(zip: Zip): string {
  const slides = zip.entradas
    .map((e) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(e.nome))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  return slides
    .map((m) => {
      const xml = parteDoZip(zip, m[0]) ?? ''
      let out = ''
      for (const t of xml.matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>|<a:br\/>/g)) out += t[1] !== undefined ? decodificarXml(t[1]) : '\n'
      return `Slide ${m[1]}\n${out.trim()}`
    })
    .join('\n\n')
}

function textoDeXlsx(zip: Zip): string {
  const compartilhados: string[] = []
  const sst = parteDoZip(zip, 'xl/sharedStrings.xml')
  if (sst) {
    for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      compartilhados.push([...si[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => decodificarXml(t[1]!)).join(''))
    }
  }
  const nomes = [...(parteDoZip(zip, 'xl/workbook.xml') ?? '').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decodificarXml(m[1]!))
  const planilhas = zip.entradas
    .map((e) => /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(e.nome))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  return planilhas
    .map((m, i) => {
      const xml = parteDoZip(zip, m[0]) ?? ''
      const linhas: string[] = []
      for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const celulas: string[] = []
        for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = c[1] ?? ''
          const corpo = c[2] ?? ''
          const t = /\bt="([^"]+)"/.exec(attrs)?.[1]
          const v = /<v>([^<]*)<\/v>/.exec(corpo)?.[1]
          let valor = ''
          if (t === 's' && v !== undefined) valor = compartilhados[Number(v)] ?? ''
          else if (t === 'inlineStr') valor = [...corpo.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((x) => decodificarXml(x[1]!)).join('')
          else if (v !== undefined) valor = decodificarXml(v)
          const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
          if (ref) {
            const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
            while (celulas.length < col && celulas.length < 200) celulas.push('')
          }
          celulas.push(valor.replace(/[\t\n]+/g, ' '))
        }
        while (celulas.length && !celulas[celulas.length - 1]) celulas.pop()
        if (celulas.length) linhas.push(celulas.join('\t'))
      }
      return `Planilha: ${nomes[i] ?? `Planilha ${m[1]}`}\n${linhas.join('\n')}`
    })
    .join('\n\n')
}
