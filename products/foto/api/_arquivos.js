// Armazenamento das prévias de galeria: um adaptador com duas pontas.
//
//   pasta local   FOTO_ARQUIVOS_DIR. Só para desenvolver e para os testes: na Vercel o disco some a cada função, então
//                 lá a pasta é ignorada (nunca fingir que publicou).
//   S3 compatível FOTO_S3_ENDPOINT, FOTO_S3_REGION, FOTO_S3_BUCKET, FOTO_S3_KEY_ID e FOTO_S3_SECRET. Serve para o
//                 Supabase Storage (…/storage/v1/s3), R2 ou S3: endereço no estilo de caminho (endpoint/bucket/chave),
//                 assinatura SigV4 escrita aqui com node:crypto (conferida contra os vetores publicados pela AWS em
//                 test/arquivos.test.js). O bucket é PRIVADO e só existe depois de o titular autorizar.
//
// Sem nenhuma das duas, `armazenamento()` devolve null e as rotas de galeria respondem 503 { erro: 'sem_armazenamento' }.
//
// Os bytes passam SEMPRE pelo servidor do app (a CSP só deixa 'self'): o fotógrafo envia cada prévia por PUT
// (api/foto/galerias.js) e o cliente recebe por GET com o token de um link vivo (api/link/porta.js). Nada é listado: a
// chave de cada arquivo vem do banco (`g/<galeria>/<foto>`; com `-m` no fim, a miniatura).
//
// O que entra: só image/jpeg ou image/webp (pelos primeiros bytes, não pelo cabeçalho do pedido), até 4 MB (512 KB a
// miniatura), com o tamanho e o sha256 declarados no registro da foto, e sem posição de GPS (EXIF ou XMP): a tela já
// tira os metadados; o servidor confere.

import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { banco } from './_banco.js'

export const MAX_PREVIA = 4 * 1024 * 1024
export const MAX_MINI = 512 * 1024
export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/webp']
/** A chave de um arquivo: g/<galeria>/<foto>, com -m no fim para a miniatura. Nada fora disso entra ou sai. */
export const CHAVE = /^g\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-m)?$/

const sha256Hex = (dados) => createHash('sha256').update(dados).digest('hex')
const SHA_VAZIO = sha256Hex('')

// ───────── conferência do arquivo ─────────

/** O tipo pelos primeiros bytes: 'image/jpeg', 'image/webp' ou null. */
export function tipoDaImagem(bytes) {
  if (!bytes || bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** O bloco TIFF do EXIF tem o ponteiro para o diretório de GPS (etiqueta 0x8825)? */
function tiffTemGps(t) {
  if (t.length < 14) return false
  const ordem = t.toString('latin1', 0, 2)
  if (ordem !== 'II' && ordem !== 'MM') return false
  const pequeno = ordem === 'II'
  const u16 = (i) => (pequeno ? t.readUInt16LE(i) : t.readUInt16BE(i))
  const u32 = (i) => (pequeno ? t.readUInt32LE(i) : t.readUInt32BE(i))
  if (u16(2) !== 42) return false
  const ifd = u32(4)
  if (ifd + 2 > t.length) return false
  const n = u16(ifd)
  for (let k = 0; k < n; k++) {
    const i = ifd + 2 + k * 12
    if (i + 12 > t.length) return false
    if (u16(i) === 0x8825) return true
  }
  return false
}

const xmpTemGps = (texto) => /exif:GPS|GPSLatitude|GPSLongitude|GPSAltitude|GPSPosition/i.test(texto)
const EXIF = 'Exif\0\0'

/** A imagem carrega posição de GPS (EXIF ou XMP)? JPEG: os APP1 antes da imagem. WebP: os blocos EXIF e XMP. */
export function temGps(bytes) {
  const tipo = tipoDaImagem(bytes)
  if (tipo === 'image/jpeg') {
    let i = 2
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return false
      const marca = bytes[i + 1]
      if (marca === 0xff) {
        i += 1
        continue
      }
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
        i += 2
        continue
      }
      if (marca === 0xda || marca === 0xd9) return false
      const tam = bytes.readUInt16BE(i + 2)
      if (tam < 2) return false
      const dados = bytes.subarray(i + 4, Math.min(i + 2 + tam, bytes.length))
      if (marca === 0xe1) {
        if (dados.toString('latin1', 0, 6) === EXIF) {
          if (tiffTemGps(dados.subarray(6))) return true
        } else if (dados.toString('latin1', 0, 19) === 'http://ns.adobe.com' && xmpTemGps(dados.toString('latin1'))) return true
      }
      i += 2 + tam
    }
    return false
  }
  if (tipo === 'image/webp') {
    let i = 12
    while (i + 8 <= bytes.length) {
      const nome = bytes.toString('latin1', i, i + 4)
      const tam = bytes.readUInt32LE(i + 4)
      const dados = bytes.subarray(i + 8, Math.min(i + 8 + tam, bytes.length))
      if (nome === 'EXIF' && tiffTemGps(dados.toString('latin1', 0, 6) === EXIF ? dados.subarray(6) : dados)) return true
      if (nome === 'XMP ' && xmpTemGps(dados.toString('latin1'))) return true
      i += 8 + tam + (tam % 2)
    }
  }
  return false
}

/**
 * Confere os bytes que chegaram contra o que foi registrado para a foto.
 * { ok: true } ou { ok: false, erro }: 'vazio' | 'grande' | 'tipo' | 'tamanho' | 'sha256' | 'gps'.
 */
export function conferirPrevia(bytes, { tipo, tamanho, sha256, maximo = MAX_PREVIA }) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) return { ok: false, erro: 'vazio' }
  if (bytes.length > maximo) return { ok: false, erro: 'grande' }
  const real = tipoDaImagem(bytes)
  if (!real || !TIPOS_DE_IMAGEM.includes(real) || real !== tipo) return { ok: false, erro: 'tipo' }
  if (bytes.length !== tamanho) return { ok: false, erro: 'tamanho' }
  if (sha256Hex(bytes) !== sha256) return { ok: false, erro: 'sha256' }
  if (temGps(bytes)) return { ok: false, erro: 'gps' }
  return { ok: true }
}

/** O corpo cru do pedido, até `maximo` bytes (a Vercel entrega application/octet-stream já como Buffer). Passou: lança 'grande'. */
export async function lerBytes(req, maximo) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maximo) throw new Error('grande')
    return req.body
  }
  if (Number(req.headers?.['content-length']) > maximo) throw new Error('grande')
  let tam = 0
  const partes = []
  for await (const p of req) {
    tam += p.length
    if (tam > maximo) throw new Error('grande')
    partes.push(p)
  }
  return Buffer.concat(partes)
}

// ───────── SigV4 ─────────

const codificar = (t) => encodeURIComponent(t).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const hmac = (chave, texto) => createHmac('sha256', chave).update(texto).digest()

/**
 * Assina um pedido com AWS Signature Version 4. Devolve os cabeçalhos para mandar (os que vieram, em minúsculas, mais
 * `x-amz-date` e `authorization`). `cabecalhos`: os que entram na assinatura além de host e x-amz-date (no S3,
 * `x-amz-content-sha256` é obrigatório). `sha256DoCorpo`: hex do corpo (vazio = o sha256 de nada).
 * No S3 o caminho é codificado uma vez; nos outros serviços, duas (regra da AWS).
 */
export function assinarV4({ metodo, url, cabecalhos = {}, sha256DoCorpo = SHA_VAZIO, regiao, servico = 's3', chaveId, segredo, agora = new Date() }) {
  const u = new URL(url)
  const data = agora.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const dia = data.slice(0, 8)
  const todos = { host: u.host, 'x-amz-date': data }
  for (const [k, v] of Object.entries(cabecalhos)) todos[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ')
  const nomes = Object.keys(todos).sort()
  const assinados = nomes.join(';')
  const uma = u.pathname
    .split('/')
    .map((p) => codificar(decodeURIComponent(p)))
    .join('/')
  const caminho = servico === 's3' ? uma : uma.split('/').map(codificar).join('/')
  const consulta = [...u.searchParams]
    .map(([k, v]) => [codificar(k), codificar(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const pedido = [metodo.toUpperCase(), caminho || '/', consulta, nomes.map((n) => `${n}:${todos[n]}\n`).join(''), assinados, sha256DoCorpo].join('\n')
  const escopo = `${dia}/${regiao}/${servico}/aws4_request`
  const texto = ['AWS4-HMAC-SHA256', data, escopo, sha256Hex(pedido)].join('\n')
  const chave = hmac(hmac(hmac(hmac(`AWS4${segredo}`, dia), regiao), servico), 'aws4_request')
  const assinatura = hmac(chave, texto).toString('hex')
  const saida = { ...todos, authorization: `AWS4-HMAC-SHA256 Credential=${chaveId}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}` }
  delete saida.host
  return saida
}

// ───────── as duas pontas ─────────

function chaveBoa(chave) {
  if (typeof chave !== 'string' || !CHAVE.test(chave)) throw new Error('arquivos: chave inválida')
  return chave
}

function pasta(raiz) {
  const base = resolve(raiz)
  const caminho = (chave) => {
    const alvo = resolve(base, chaveBoa(chave))
    if (!alvo.startsWith(base + sep)) throw new Error('arquivos: chave inválida')
    return alvo
  }
  return {
    tipo: 'pasta',
    async gravar(chave, bytes) {
      const alvo = caminho(chave)
      await mkdir(dirname(alvo), { recursive: true })
      const temp = `${alvo}.${process.pid}.${Date.now()}.parte`
      await writeFile(temp, bytes)
      await rename(temp, alvo)
    },
    async ler(chave) {
      return readFile(caminho(chave)).catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e)))
    },
    async apagar(chave) {
      const alvo = caminho(chave)
      await rm(alvo, { force: true })
      // a pasta da galeria some junto quando fica vazia
      await rmdir(dirname(alvo)).catch(() => {})
    },
  }
}

function s3({ endpoint, regiao, bucket, chaveId, segredo, buscar = fetch }) {
  const base = `${endpoint.replace(/\/+$/, '')}/${bucket}`
  const pedir = async (metodo, chave, corpo, tipo) => {
    const url = `${base}/${chaveBoa(chave)}`
    const sha = corpo ? sha256Hex(corpo) : SHA_VAZIO
    const cabecalhos = assinarV4({ metodo, url, cabecalhos: { 'x-amz-content-sha256': sha, ...(tipo ? { 'content-type': tipo } : {}) }, sha256DoCorpo: sha, regiao, chaveId, segredo })
    return buscar(url, { method: metodo, headers: cabecalhos, body: corpo, signal: AbortSignal.timeout(20000) })
  }
  return {
    tipo: 's3',
    async gravar(chave, bytes, tipo) {
      const r = await pedir('PUT', chave, bytes, tipo)
      if (!r.ok) throw new Error(`arquivos: o armazenamento recusou a gravação (${r.status})`)
    },
    async ler(chave) {
      const r = await pedir('GET', chave)
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`arquivos: o armazenamento recusou a leitura (${r.status})`)
      return Buffer.from(await r.arrayBuffer())
    },
    async apagar(chave) {
      const r = await pedir('DELETE', chave)
      if (!r.ok && r.status !== 404) throw new Error(`arquivos: o armazenamento recusou apagar (${r.status})`)
    },
  }
}

/**
 * O armazenamento configurado: { tipo: 'pasta' | 's3', gravar(chave, bytes, tipo), ler(chave) → Buffer | null,
 * apagar(chave) } ou null (sem configuração). `ambiente` e `buscar` existem para os testes.
 */
export function armazenamento(ambiente = process.env, buscar = fetch) {
  const v = (nome) => (ambiente[nome] || '').trim()
  const endpoint = v('FOTO_S3_ENDPOINT')
  if (/^https?:\/\//.test(endpoint) && v('FOTO_S3_BUCKET') && v('FOTO_S3_KEY_ID') && v('FOTO_S3_SECRET')) {
    return s3({ endpoint, regiao: v('FOTO_S3_REGION') || 'us-east-1', bucket: v('FOTO_S3_BUCKET'), chaveId: v('FOTO_S3_KEY_ID'), segredo: v('FOTO_S3_SECRET'), buscar })
  }
  if (v('FOTO_ARQUIVOS_DIR') && !v('VERCEL')) return pasta(v('FOTO_ARQUIVOS_DIR'))
  return null
}

/** As chaves dos arquivos de uma lista de fotos ({ chave, enviada_em, mini_enviada_em }): prévia e miniatura que existem. */
export const chavesDe = (fotos) => fotos.flatMap((f) => [...(f.enviada_em ? [f.chave] : []), ...(f.mini_enviada_em ? [`${f.chave}-m`] : [])])

/** Apaga uma lista de chaves. Devolve quantas foram. Falhou uma: lança (quem chama não apaga o registro). */
export async function apagarArquivos(arm, chaves) {
  let n = 0
  for (const chave of chaves) {
    await arm.apagar(chave)
    n += 1
  }
  return n
}

/**
 * Limpeza: galeria sem link vivo há mais de `dias` dias (o link venceu ou foi revogado, ou a galeria foi encerrada)
 * perde os arquivos. A ficha e a seleção ficam (o fotógrafo ainda lê o que o cliente escolheu); a galeria passa a
 * `encerrada`, com `arquivos_apagados_em`. Roda pela conexão do servidor (dono do schema): não é rota de pessoa.
 * Chamável (tarefa agendada ou à mão); agendar fica para depois. Devolve { ok, galerias, arquivos }.
 */
export async function limparVencidas({ dias = 30, arm = armazenamento() } = {}) {
  if (!arm) return { ok: false, erro: 'sem_armazenamento' }
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) throw new Error('limparVencidas: dias inválido')
  const sql = banco()
  const vencidas = await sql`
    select g.id
      from foto.galerias g
      join lateral (select max(least(l.expira_em, coalesce(l.revogado_em, l.expira_em))) as fim from foto.links l where l.galeria = g.id) v on true
     where g.estado <> 'rascunho' and g.arquivos_apagados_em is null and v.fim is not null
       and (case when g.estado = 'encerrada' then least(g.atualizada_em, v.fim) else v.fim end) < now() - make_interval(days => ${dias})
     order by g.criada_em`
  let arquivos = 0
  for (const g of vencidas) {
    const fotos = await sql`select chave, enviada_em, mini_enviada_em from foto.galeria_fotos where galeria = ${g.id} and (enviada_em is not null or mini_enviada_em is not null)`
    arquivos += await apagarArquivos(arm, chavesDe(fotos))
    await sql.begin(async (tx) => {
      await tx`update foto.galeria_fotos set enviada_em = null, mini_enviada_em = null where galeria = ${g.id}`
      await tx`update foto.galerias set estado = 'encerrada', arquivos_apagados_em = now() where id = ${g.id}`
    })
  }
  return { ok: true, galerias: vencidas.length, arquivos }
}
