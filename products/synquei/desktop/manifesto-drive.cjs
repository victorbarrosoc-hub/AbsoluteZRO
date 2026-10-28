// Download do Drive vindo do SOBEDESCE (plano SD→SQ): a linha v2 do .sobedesce/descargas.jsonl e o recibo que o
// Synquei devolve em <pasta>/Synquei/preparos.jsonl.
//
// O manifesto é entrada não confiável (qualquer um pode escrever um arquivo na pasta): só passa o que segue o contrato
// à risca (packages/media-contracts/src/preparo.ts, DriveDownloadSchema): campos conhecidos, caminhos relativos sem
// "..", contagens que batem, limites. Depois, cada arquivo é conferido no disco (existe, tamanho igual, não está
// baixando de novo); o que falta ou mudou vira pendência no recibo, nunca some em silêncio. Nada aqui importa o Electron.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const OP = /^[A-Za-z0-9_-]{6,100}$/
const DRIVE_ID = /^[\w-]{1,200}$/
const MD5 = /^[0-9a-f]{32}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ARQUIVOS = 50_000
const MAX_EXEMPLOS = 30
const RECIBO = path.join('Synquei', 'preparos.jsonl')
const FORMATO_RECIBO = 'synquei.preparo/1'
const ESTADOS = ['recebido', 'preparando', 'preparado', 'com_pendencias', 'erro']
const CONTAGENS = ['organizados', 'sincronizados', 'ignorados', 'pendentes', 'ausentes', 'alterados', 'movidos', 'revisar']
const LISTAS = ['ausentes', 'alterados', 'movidos', 'revisar']
const PARCIAL = '.sobedesce-part'

const objeto = (o) => !!o && typeof o === 'object' && !Array.isArray(o)
const so = (o, chaves) => objeto(o) && Object.keys(o).every((k) => chaves.includes(k))
const inteiro = (v) => Number.isSafeInteger(v) && v >= 0
const texto = (v, max, min = 1) => typeof v === 'string' && v.length >= min && v.length <= max
const nomeSeguro = (s) => texto(s, 255) && !/[/\\\0]/.test(s) && s !== '.' && s !== '..'

/** Caminho relativo à pasta: "/" como separador, sem raiz, sem "..", ".", segmento vazio, "\" ou NUL. */
function relSeguro(p) {
  return texto(p, 1024) && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !/[\\\0]/.test(p) && !p.split('/').some((s) => s === '' || s === '.' || s === '..')
}

/**
 * A linha v2 (sobedesce.descarga/2, tipo 'drive.download'), conferida à risca.
 * @returns {{ ok: true, linha: object } | { ok: false, erro: string }}
 */
function validarLinhaDrive(d) {
  const nao = (erro) => ({ ok: false, erro })
  if (!so(d, ['v', 'app', 'app_versao', 'tipo', 'op', 'project_id', 'quando', 'origem', 'destino', 'estado', 'verificacao', 'bytes', 'arquivos'])) return nao('campos fora do contrato')
  if (d.v !== 2 || d.app !== 'sobedesce' || d.tipo !== 'drive.download') return nao('não é um download do Drive (v2)')
  if (!texto(d.app_versao, 60)) return nao('versão do app inválida')
  if (!OP.test(String(d.op))) return nao('op inválido')
  if (d.project_id != null && !(typeof d.project_id === 'string' && UUID.test(d.project_id))) return nao('project_id inválido')
  if (!(typeof d.quando === 'string' && ISO.test(d.quando) && Number.isFinite(Date.parse(d.quando)))) return nao('data inválida')
  const o = d.origem
  if (!so(o, ['tipo', 'pasta_id', 'pasta']) || o.tipo !== 'drive' || !(o.pasta_id === null || DRIVE_ID.test(String(o.pasta_id))) || !texto(o.pasta, 300)) return nao('origem inválida')
  const de = d.destino
  if (!so(de, ['pasta', 'caminho']) || !nomeSeguro(de.pasta) || !(de.caminho == null || texto(de.caminho, 4096))) return nao('destino inválido')
  if (!['conferido', 'parcial'].includes(d.estado)) return nao('estado inválido')
  const v = d.verificacao
  if (!so(v, ['algoritmo', 'total', 'conferidos', 'sem_conferencia', 'tamanho']) || v.algoritmo !== 'md5' || v.tamanho !== true || ![v.total, v.conferidos, v.sem_conferencia].every(inteiro)) return nao('verificação inválida')
  if (!inteiro(d.bytes)) return nao('bytes inválido')
  if (!Array.isArray(d.arquivos) || !d.arquivos.length || d.arquivos.length > MAX_ARQUIVOS) return nao('lista de arquivos inválida')
  const vistos = new Set()
  let conferidos = 0
  let soma = 0
  for (const a of d.arquivos) {
    if (!so(a, ['rel', 'nome', 'size', 'file_id', 'md5', 'conferido'])) return nao('arquivo com campos fora do contrato')
    if (!relSeguro(a.rel)) return nao(`caminho inválido: ${String(a.rel).slice(0, 80)}`)
    if (a.rel.endsWith(PARCIAL)) return nao(`arquivo pela metade no manifesto: ${a.rel.slice(0, 80)}`)
    if (!nomeSeguro(a.nome) || !(a.rel === a.nome || a.rel.endsWith(`/${a.nome}`))) return nao(`nome inválido: ${a.rel.slice(0, 80)}`)
    if (!inteiro(a.size) || !DRIVE_ID.test(String(a.file_id))) return nao(`arquivo inválido: ${a.rel.slice(0, 80)}`)
    if (typeof a.conferido !== 'boolean' || (a.conferido ? !MD5.test(String(a.md5)) : a.md5 !== null)) return nao(`conferência inválida: ${a.rel.slice(0, 80)}`)
    if (vistos.has(a.rel)) return nao(`arquivo repetido: ${a.rel.slice(0, 80)}`)
    vistos.add(a.rel)
    if (a.conferido) conferidos++
    soma += a.size
  }
  if (v.total !== d.arquivos.length || v.conferidos !== conferidos || v.sem_conferencia !== v.total - conferidos) return nao('contagens não batem com os arquivos')
  if ((d.estado === 'conferido') !== (conferidos === d.arquivos.length)) return nao('estado não bate com a verificação')
  if (soma !== d.bytes) return nao('bytes não batem com a soma')
  return { ok: true, linha: d }
}

const dentro = (pai, filho) => {
  const r = path.relative(pai, filho)
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r))
}

async function statDe(abs) {
  try {
    return await fsp.stat(abs)
  } catch (err) {
    return err && (err.code === 'EACCES' || err.code === 'EPERM') ? 'sem_acesso' : null
  }
}

// Pastas que o Synquei cria em volta (e as do próprio SOBEDESCE) não entram na busca por arquivo movido.
const FORA_DA_BUSCA = /^(\.sobedesce|\.sobedesce-anteriores|Synquei|Assets|Exports)(\/|$)|(^|\/)\.(DS_Store|Trashes|Spotlight-V100|fseventsd)(\/|$)|(^|\/)\._/

async function todosOsArquivos(raiz, rel = '', out = [], limite = MAX_ARQUIVOS * 2) {
  let itens
  try {
    itens = await fsp.readdir(path.join(raiz, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of itens) {
    if (out.length >= limite) break
    const r = rel ? `${rel}/${e.name}` : e.name
    if (FORA_DA_BUSCA.test(r) || r.endsWith(PARCIAL) || r.endsWith('.sobedesce-parcial')) continue
    if (e.isDirectory()) await todosOsArquivos(raiz, r, out, limite)
    else if (e.isFile()) out.push(r)
  }
  return out
}

/**
 * Confere cada arquivo do manifesto na pasta (raiz = onde o manifesto foi achado, não o `caminho` gravado):
 *  - presente: existe, é arquivo, tamanho igual e não tem um ".sobedesce-part" ao lado (baixando de novo);
 *  - ausente: não está lá (ou não dá para ler); movido: sumiu do lugar, mas há um (e só um) arquivo com o mesmo nome e
 *    tamanho em outro canto da pasta — entra pelo lugar novo e vai para o recibo;
 *  - alterado: tamanho diferente, ou está sendo baixado de novo.
 * Nomes com acento: tenta o caminho como veio, em NFC e em NFD (macOS).
 */
async function conferirArquivos(raiz, linha) {
  raiz = path.resolve(raiz)
  const presentes = []
  const ausentes = []
  const alterados = []
  const movidos = []
  const faltando = []
  for (const a of linha.arquivos) {
    let achado = null
    let semAcesso = false
    for (const rel of new Set([a.rel, a.rel.normalize('NFC'), a.rel.normalize('NFD')])) {
      const abs = path.join(raiz, ...rel.split('/'))
      if (!dentro(raiz, abs)) continue
      const st = await statDe(abs)
      if (st === 'sem_acesso') semAcesso = true
      else if (st) {
        achado = { rel, abs, st }
        break
      }
    }
    if (!achado) {
      if (semAcesso) ausentes.push(a.rel)
      else faltando.push(a)
      continue
    }
    if (!achado.st.isFile() || achado.st.size !== a.size || fs.existsSync(achado.abs + PARCIAL)) {
      alterados.push(a.rel)
      continue
    }
    try {
      await fsp.access(achado.abs, fs.constants.R_OK)
    } catch {
      ausentes.push(a.rel)
      continue
    }
    presentes.push({ rel: achado.rel, abs: achado.abs, size: achado.st.size, mtimeMs: achado.st.mtimeMs })
  }
  if (faltando.length) {
    // procura pelo nome + tamanho no resto da pasta (um candidato só; dois iguais = não dá para saber, fica ausente)
    const usados = new Set(presentes.map((p) => p.rel))
    const porChave = new Map()
    for (const rel of await todosOsArquivos(raiz)) {
      if (usados.has(rel)) continue
      const st = await statDe(path.join(raiz, ...rel.split('/')))
      if (!st || st === 'sem_acesso' || !st.isFile()) continue
      const k = `${path.posix.basename(rel).normalize('NFC')}|${st.size}`
      const l = porChave.get(k) || []
      l.push({ rel, st })
      porChave.set(k, l)
    }
    for (const a of faltando) {
      const l = porChave.get(`${a.nome.normalize('NFC')}|${a.size}`) || []
      if (l.length === 1 && !usados.has(l[0].rel)) {
        const novo = l[0]
        usados.add(novo.rel)
        movidos.push(`${a.rel} → ${novo.rel}`)
        presentes.push({ rel: novo.rel, abs: path.join(raiz, ...novo.rel.split('/')), size: novo.st.size, mtimeMs: novo.st.mtimeMs, movidoDe: a.rel })
      } else ausentes.push(a.rel)
    }
  }
  return { presentes, ausentes, alterados, movidos }
}

/** Uma linha do recibo (synquei.preparo/1), já no formato do contrato. */
function linhaRecibo({ op, estado, versao, resultado = {}, exemplos = {}, repetido = false, erro = null, projectId = null, agora = new Date() }) {
  if (!OP.test(String(op))) throw new Error('op inválido')
  if (!ESTADOS.includes(estado)) throw new Error('estado inválido')
  const r = {
    formato: FORMATO_RECIBO,
    op: String(op),
    app_versao: String(versao || '0').slice(0, 60),
    quando: agora.toISOString(),
    project_id: typeof projectId === 'string' && UUID.test(projectId) ? projectId : null,
    estado,
    resultado: Object.fromEntries(CONTAGENS.map((k) => [k, inteiro(resultado[k]) ? resultado[k] : 0])),
    exemplos: Object.fromEntries(LISTAS.map((k) => [k, (Array.isArray(exemplos[k]) ? exemplos[k] : []).map((s) => String(s).replace(/ → .*/, '')).filter(relSeguro).slice(0, MAX_EXEMPLOS)])),
  }
  if (repetido) r.repetido = true
  if (erro) r.erro = String(erro).slice(0, 300)
  return r
}

module.exports = { validarLinhaDrive, conferirArquivos, linhaRecibo, relSeguro, OP, RECIBO, FORMATO_RECIBO, ESTADOS, MAX_ARQUIVOS, PARCIAL }
