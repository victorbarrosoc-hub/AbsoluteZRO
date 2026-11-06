// Espelho dos instaladores em São Paulo (ADR 0043). Roda no job "versao" de cada workflow de app de computador, depois
// do versao.json gerado e antes de ele subir para o Release:
//
//   node scripts/espelho-apps.mjs <tag-do-release> <caminho/do/versao.json>
//
// 1. baixa do Release (gh release download) os dois instaladores que o versao.json aponta e confere o SHA-256 de cada;
// 2. sobe os dois para o bucket público `apps` do Supabase AbsoluteZRO-SP em apps/<tag>/<arquivo> (S3, assinatura v4);
// 3. grava no versao.json o campo `espelho` (a pasta pública) e sobe o versao.json para o espelho também;
// 4. apaga do espelho o que for de builds antigos dessa tag (fica só o build atual: cabe folgado na cota do Pro).
//
// Sem os secrets (SUPABASE_STORAGE_S3_ENDPOINT, SUPABASE_STORAGE_S3_ACCESS_KEY_ID, SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY):
// avisa e sai com 0, sem mexer no versao.json (o HUB e a central seguem só com o GitHub). Qualquer falha antes do
// passo 3 também deixa o versao.json como estava. Sem dependências: fetch e crypto do Node 22.

import { execFileSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const BUCKET = 'apps'
export const REGIAO_PADRAO = 'sa-east-1'
const NOME = /^[A-Za-z0-9._-]{1,120}$/
const TAG = /^[A-Za-z0-9._-]{1,80}$/
const SHA = /^[0-9a-f]{64}$/
const VAZIO = createHash('sha256').update('').digest('hex')

const hex = (b) => createHash('sha256').update(b).digest('hex')
const hmac = (chave, texto) => createHmac('sha256', chave).update(texto).digest()
/** RFC 3986, como a AWS pede na query (encodeURIComponent deixa !'()* de fora). */
const codificar = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** Configuração a partir do ambiente; null = espelho desligado (falta algum secret). */
export function configuracao(env = process.env) {
  const endpoint = String(env.SUPABASE_STORAGE_S3_ENDPOINT || '')
    .trim()
    .replace(/\/+$/, '')
  const chave = String(env.SUPABASE_STORAGE_S3_ACCESS_KEY_ID || '').trim()
  const segredo = String(env.SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY || '').trim()
  if (!endpoint || !chave || !segredo) return null
  return { endpoint, chave, segredo, regiao: String(env.SUPABASE_STORAGE_S3_REGION || '').trim() || REGIAO_PADRAO, bucket: BUCKET }
}

/**
 * A pasta pública da tag no espelho, a partir do endpoint S3 do projeto:
 * https://<ref>.storage.supabase.co/storage/v1/s3 (ou <ref>.supabase.co) → https://<ref>.supabase.co/storage/v1/object/public/apps/<tag>.
 * null se o endpoint não for de um projeto Supabase (o HUB só aceita essa forma).
 */
export function pastaPublica(endpoint, tag, bucket = BUCKET) {
  let u
  try {
    u = new URL(endpoint)
  } catch {
    return null
  }
  const m = /^([a-z0-9]{20})(?:\.storage)?\.supabase\.co$/.exec(u.hostname)
  if (u.protocol !== 'https:' || !m || !TAG.test(tag)) return null
  return `https://${m[1]}.supabase.co/storage/v1/object/public/${bucket}/${tag}`
}

/** 20130524T000000Z e 20130524 */
function datas(agora) {
  const iso = agora
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { amz: iso, dia: iso.slice(0, 8) }
}

/**
 * Assinatura v4 da AWS (o S3 do Supabase usa a mesma). Devolve os cabeçalhos para o pedido (Authorization, x-amz-date,
 * x-amz-content-sha256 e os `cabecalhos` dados). `hashCorpo`: SHA-256 hexadecimal do corpo.
 */
export function assinar({ metodo, url, cabecalhos = {}, hashCorpo = VAZIO, chave, segredo, regiao, servico = 's3', agora = new Date() }) {
  const u = new URL(url)
  const { amz, dia } = datas(agora)
  const todos = { ...Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), String(v)])) }
  todos.host = u.host
  todos['x-amz-content-sha256'] = hashCorpo
  todos['x-amz-date'] = amz
  const nomes = Object.keys(todos).sort()
  const canonicos = nomes.map((n) => `${n}:${todos[n].trim().replace(/\s+/g, ' ')}\n`).join('')
  const assinados = nomes.join(';')
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [codificar(k), codificar(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const pedido = [metodo, u.pathname || '/', query, canonicos, assinados, hashCorpo].join('\n')
  const escopo = `${dia}/${regiao}/${servico}/aws4_request`
  const texto = ['AWS4-HMAC-SHA256', amz, escopo, hex(pedido)].join('\n')
  const k = hmac(hmac(hmac(hmac(`AWS4${segredo}`, dia), regiao), servico), 'aws4_request')
  const assinatura = createHmac('sha256', k).update(texto).digest('hex')
  const { host: _host, ...semHost } = todos
  return { ...semHost, authorization: `AWS4-HMAC-SHA256 Credential=${chave}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}` }
}

/** Endereço S3 (estilo caminho, como o Supabase pede) de uma chave do bucket. */
export function enderecoS3(c, chave = '') {
  const caminho = chave ? '/' + chave.split('/').map(codificar).join('/') : ''
  return `${c.endpoint}/${codificar(c.bucket)}${caminho}`
}

/** As chaves de uma resposta ListObjectsV2 (XML) e o token da próxima página. */
export function lerLista(xml) {
  const desfazer = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  const chaves = [...String(xml).matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => desfazer(m[1]))
  const truncado = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const prox = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)
  return { chaves, proxima: truncado && prox ? desfazer(prox[1]) : null }
}

/** O que sai do espelho: tudo da pasta da tag que não for deste build. */
export function sobras(chaves, tag, manter) {
  const ficam = new Set(manter.map((n) => `${tag}/${n}`))
  return chaves.filter((k) => k.startsWith(`${tag}/`) && !ficam.has(k))
}

/** Os instaladores que o versao.json aponta, conferidos (nome e SHA-256 com forma esperada). */
export function instaladoresDoVersao(v) {
  const out = []
  for (const [campo, campoSha] of [
    ['arquivoMac', 'sha256Mac'],
    ['arquivoWindows', 'sha256Windows'],
  ]) {
    const nome = v && v[campo]
    const sha = String((v && v[campoSha]) || '').toLowerCase()
    if (!nome) continue
    if (!NOME.test(nome) || nome === 'versao.json' || !SHA.test(sha)) throw new Error(`${campo}/${campoSha} sem forma esperada no versao.json`)
    out.push({ nome, sha256: sha })
  }
  if (!out.length) throw new Error('o versao.json não aponta nenhum instalador')
  return out
}

/** versao.json com a pasta do espelho (os outros campos ficam como estão). */
export function comEspelho(v, pasta) {
  return { ...v, espelho: pasta }
}

const TIPOS = { '.dmg': 'application/x-apple-diskimage', '.exe': 'application/vnd.microsoft.portable-executable', '.json': 'application/json' }
export const tipoDe = (nome) => TIPOS[path.extname(nome).toLowerCase()] || 'application/octet-stream'

function hashDoArquivo(arquivo) {
  return new Promise((ok, falha) => {
    const h = createHash('sha256')
    createReadStream(arquivo)
      .on('data', (d) => h.update(d))
      .on('end', () => ok(h.digest('hex')))
      .on('error', falha)
  })
}

async function pedir(c, metodo, url, { corpo = null, cabecalhos = {}, f = globalThis.fetch } = {}) {
  const hashCorpo = corpo ? hex(corpo) : VAZIO
  const h = assinar({ metodo, url, cabecalhos, hashCorpo, chave: c.chave, segredo: c.segredo, regiao: c.regiao })
  return f(url, { method: metodo, headers: h, body: corpo ?? undefined, signal: globalThis.AbortSignal.timeout(15 * 60_000) })
}

async function comTentativas(o, fn) {
  let ultimo
  for (let t = 0; t < 3; t++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      console.log(`  ${o}: ${e.message} (tentativa ${t + 1} de 3)`)
      await new Promise((r) => setTimeout(r, 2000 * (t + 1)))
    }
  }
  throw ultimo
}

/** Sobe um arquivo (PUT). Instalador: cache longo (o nome tem o build); versao.json: 60 s. */
export async function subir(c, chave, corpo, { f = globalThis.fetch } = {}) {
  const nome = chave.split('/').pop()
  const cabecalhos = {
    'content-type': tipoDe(nome),
    'cache-control': nome === 'versao.json' ? 'public, max-age=60' : 'public, max-age=31536000, immutable',
  }
  return comTentativas(nome, async () => {
    const r = await pedir(c, 'PUT', enderecoS3(c, chave), { corpo, cabecalhos, f })
    if (!r.ok) throw new Error(`PUT respondeu ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`)
    await r.body?.cancel().catch(() => {})
  })
}

export async function listar(c, prefixo, { f = globalThis.fetch } = {}) {
  const chaves = []
  let token = null
  do {
    const u = new URL(enderecoS3(c))
    u.searchParams.set('list-type', '2')
    u.searchParams.set('prefix', prefixo)
    if (token) u.searchParams.set('continuation-token', token)
    const r = await pedir(c, 'GET', u.href, { f })
    if (!r.ok) throw new Error(`listar respondeu ${r.status}`)
    const l = lerLista(await r.text())
    chaves.push(...l.chaves)
    token = l.proxima
  } while (token)
  return chaves
}

export async function apagar(c, chave, { f = globalThis.fetch } = {}) {
  const r = await pedir(c, 'DELETE', enderecoS3(c, chave), { f })
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${chave} respondeu ${r.status}`)
  await r.body?.cancel().catch(() => {})
}

const aviso = (msg) => console.log(`::notice title=Espelho em São Paulo::${msg}`)
const alerta = (msg) => console.log(`::warning title=Espelho em São Paulo::${msg}`)

/**
 * O passo inteiro. `baixarDoRelease(tag, nome, pasta)` deixa o arquivo em pasta/nome (no CI, `gh release download`).
 * Devolve { pulado } ou { pasta, arquivos, apagados }.
 */
export async function espelhar({ tag, versaoJson, env = process.env, f = globalThis.fetch, baixarDoRelease = baixarComGh }) {
  if (!TAG.test(tag)) throw new Error(`tag inválida: ${tag}`)
  const c = configuracao(env)
  if (!c) {
    aviso('sem os secrets SUPABASE_STORAGE_S3_*: o build fica só no GitHub (passo pulado).')
    return { pulado: true }
  }
  const pasta = pastaPublica(c.endpoint, tag, c.bucket)
  if (!pasta) throw new Error('SUPABASE_STORAGE_S3_ENDPOINT não é o endpoint S3 de um projeto Supabase (https://<ref>.storage.supabase.co/storage/v1/s3)')
  const v = JSON.parse(await fs.readFile(versaoJson, 'utf8'))
  const arquivos = instaladoresDoVersao(v)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'espelho-'))
  try {
    for (const a of arquivos) {
      await baixarDoRelease(tag, a.nome, tmp)
      const local = path.join(tmp, a.nome)
      const obtido = await hashDoArquivo(local)
      if (obtido !== a.sha256) throw new Error(`${a.nome}: SHA-256 do Release (${obtido}) não bate com o versao.json`)
      const corpo = await fs.readFile(local)
      console.log(`subindo ${a.nome} (${(corpo.length / 1048576).toFixed(1)} MB)`)
      await subir(c, `${tag}/${a.nome}`, corpo, { f })
      await fs.rm(local, { force: true })
    }
    // só agora o versao.json passa a apontar o espelho: os instaladores já estão lá
    const novo = comEspelho(v, pasta)
    const texto = JSON.stringify(novo, null, 2)
    await fs.writeFile(versaoJson, texto)
    await subir(c, `${tag}/versao.json`, Buffer.from(texto), { f }).catch((e) => alerta(`versao.json não subiu para o espelho: ${e.message}`))
    let apagados = []
    try {
      apagados = sobras(await listar(c, `${tag}/`, { f }), tag, [...arquivos.map((a) => a.nome), 'versao.json'])
      for (const k of apagados) {
        await apagar(c, k, { f })
        console.log(`apagado do espelho: ${k}`)
      }
    } catch (e) {
      alerta(`não deu para limpar os builds antigos: ${e.message}`)
    }
    console.log(`espelho: ${pasta}`)
    return { pasta, arquivos: arquivos.map((a) => a.nome), apagados }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

function baixarComGh(tag, nome, pasta) {
  const repo = process.env.GITHUB_REPOSITORY || 'victorbarrosoc-hub/AbsoluteZRO'
  execFileSync('gh', ['release', 'download', tag, '-R', repo, '-p', nome, '-D', pasta, '--clobber'], { stdio: 'inherit' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, versaoJson] = process.argv.slice(2)
  if (!tag || !versaoJson) {
    console.error('uso: node scripts/espelho-apps.mjs <tag> <versao.json>')
    process.exit(2)
  }
  espelhar({ tag, versaoJson }).catch((e) => {
    alerta(`${e.message}. O build fica só no GitHub e o versao.json segue sem o espelho.`)
    process.exit(1)
  })
}
