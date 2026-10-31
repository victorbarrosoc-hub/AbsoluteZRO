// "Preparar no Synquei" depois de um download do Drive (plano SD→SQ, etapas 2 e 4).
//
// Ida: quando um lote de download de UMA pasta do Drive termina sem nenhum arquivo diferente do original, o motor grava
// uma linha v2 (sobedesce.descarga/2, tipo 'drive.download') em <pasta baixada>/.sobedesce/descargas.jsonl — o mesmo
// arquivo das linhas v1 dos cartões (Backup Automático); quem só conhece a v1 pula a linha. O Synquei acha a operação
// pelo `op` do link synquei://organizar?pasta=…&op=<id do lote>.
//
// Volta: o Synquei grava o recibo (synquei.preparo/1) em <pasta>/Synquei/preparos.jsonl. Sem recibo, o SOBEDESCE nunca
// diz que preparou.
//
// Contrato de referência: packages/media-contracts/src/preparo.ts (DriveDownloadSchema, PreparoSchema). Leitores:
// products/synquei/desktop/manifesto-drive.cjs e packages/integrations/src/sobedesce.ts (parseDescargas → drive).
// O manifesto não leva conta, e-mail, token nem link assinado: só ids e nomes do Drive, tamanhos e MD5.
import fs from 'node:fs/promises'
import path from 'node:path'
import { APP_VERSION } from '../config.js'
import { readBuildInfo } from '../version.js'

export const RESUMO_PASTA = '.sobedesce'
export const RESUMO_ARQUIVO = 'descargas.jsonl'
export const RECIBO_PASTA = 'Synquei'
export const RECIBO_ARQUIVO = 'preparos.jsonl'
export const MAX_ARQUIVOS = 50_000
export const OP_RE = /^[A-Za-z0-9_-]{6,100}$/
const DRIVE_ID = /^[\w-]{1,200}$/
const MD5 = /^[0-9a-f]{32}$/
const ESTADOS_RECIBO = new Set(['recebido', 'preparando', 'preparado', 'com_pendencias', 'erro'])
const CONTAGENS = ['organizados', 'sincronizados', 'ignorados', 'pendentes', 'ausentes', 'alterados', 'movidos', 'revisar']
const LISTAS = ['ausentes', 'alterados', 'movidos', 'revisar']
const RECIBO_MAX_LIDO = 1024 * 1024 // só o fim do arquivo (as linhas mais novas)

/** "0.2.0+1234" (build do CI) ou "0.2.0+dev". */
export function appVersao(build = readBuildInfo().build) {
  return `${APP_VERSION}+${build > 0 ? build : 'dev'}`
}

const seg = (p) => String(p || '').split('/')

/**
 * A pasta baixada de um lote: todos os arquivos dentro da mesma pasta de cima (relPath "Pasta/…") e no mesmo lugar do
 * disco. Arquivo solto, várias pastas ou caminho que não bate = null (não há "uma pasta" para preparar).
 */
export function pastaBaixada(records) {
  let raiz = null
  let topo = null
  for (const r of records) {
    const partes = seg(r.relPath)
    const dest = String(r.dest?.path || '')
    if (partes.length < 2 || partes.some((s) => !s || s === '.' || s === '..') || !dest) return null
    const sufixo = path.join(...partes)
    if (!dest.endsWith(path.sep + sufixo)) return null
    const r0 = dest.slice(0, dest.length - sufixo.length - 1)
    if (raiz == null) {
      raiz = r0
      topo = partes[0]
    } else if (r0 !== raiz || partes[0] !== topo) return null
  }
  if (raiz == null || !path.isAbsolute(raiz)) return null
  return { raiz, nome: topo, pasta: path.join(raiz, topo) }
}

/**
 * A linha v2 de um lote de download, ou o motivo de não haver. Confere no disco que cada arquivo existe com o tamanho
 * esperado (a verificação "tamanho" do contrato); o MD5 vem do que o motor já conferiu ao baixar.
 * @returns {Promise<{ ok: true, pasta: string, linha: object } | { ok: false, motivo: string }>}
 */
export async function manifestoDoLote({ batch, records, agora = new Date(), versao = appVersao(), projectId = null }) {
  const recs = (records || []).filter((r) => r?.type === 'download' && r.status !== 'canceled')
  if (!recs.length) return { ok: false, motivo: 'Nada foi baixado neste lote.' }
  if (recs.some((r) => r.status !== 'completed' && r.status !== 'skipped')) return { ok: false, motivo: 'O lote ainda não terminou.' }
  if (recs.some((r) => r.verify?.state === 'mismatch')) return { ok: false, motivo: 'Algum arquivo chegou diferente do original. Baixe de novo antes de preparar.' }
  if (recs.length > MAX_ARQUIVOS) return { ok: false, motivo: `O lote tem mais de ${MAX_ARQUIVOS.toLocaleString('pt-BR')} arquivos.` }
  const onde = pastaBaixada(recs)
  if (!onde) return { ok: false, motivo: 'O Synquei prepara uma pasta baixada inteira (um download, uma pasta).' }
  const arquivos = []
  for (const r of recs.sort((a, b) => (a.relPath < b.relPath ? -1 : 1))) {
    const rel = seg(r.relPath).slice(1).join('/')
    const fileId = String(r.source?.fileId || '')
    if (!DRIVE_ID.test(fileId)) return { ok: false, motivo: 'Arquivo sem id do Drive no lote.' }
    let st
    try {
      st = await fs.stat(r.dest.path)
    } catch (err) {
      return { ok: false, motivo: err?.code === 'ENOENT' ? `Não achei ${rel} na pasta baixada.` : `Não consegui ler ${rel} (${err?.code || 'erro'}).` }
    }
    if (!st.isFile()) return { ok: false, motivo: `${rel} não é um arquivo.` }
    if (r.size != null && st.size !== Number(r.size)) return { ok: false, motivo: `${rel} mudou de tamanho depois do download.` }
    const md5 = r.verify?.state === 'ok' && MD5.test(String(r.verify?.actual || '')) ? String(r.verify.actual) : null
    arquivos.push({ rel, nome: rel.split('/').pop(), size: st.size, file_id: fileId, md5, conferido: md5 !== null })
  }
  const conferidos = arquivos.filter((a) => a.conferido).length
  const origem = batch?.origem && typeof batch.origem === 'object' ? batch.origem : {}
  const linha = {
    v: 2,
    app: 'sobedesce',
    app_versao: String(versao).slice(0, 60),
    tipo: 'drive.download',
    op: String(batch?.id || ''),
    project_id: projectId,
    quando: agora.toISOString(),
    origem: {
      tipo: 'drive',
      pasta_id: DRIVE_ID.test(String(origem.pastaId || '')) ? String(origem.pastaId) : null,
      pasta: String(origem.pasta || onde.nome).slice(0, 300),
    },
    destino: { pasta: onde.nome, caminho: onde.pasta },
    estado: conferidos === arquivos.length ? 'conferido' : 'parcial',
    verificacao: { algoritmo: 'md5', total: arquivos.length, conferidos, sem_conferencia: arquivos.length - conferidos, tamanho: true },
    bytes: arquivos.reduce((s, a) => s + a.size, 0),
    arquivos,
  }
  if (!OP_RE.test(linha.op)) return { ok: false, motivo: 'Lote sem id.' }
  return { ok: true, pasta: onde.pasta, linha }
}

const semHora = (l) => JSON.stringify({ ...l, quando: null })

/**
 * Acrescenta a linha ao descargas.jsonl da pasta. Pedir de novo não repete: se a última linha deste `op` já é igual
 * (fora a hora), nada muda. Devolve true se gravou.
 */
export async function gravarManifesto(pasta, linha) {
  const dir = path.join(pasta, RESUMO_PASTA)
  const arq = path.join(dir, RESUMO_ARQUIVO)
  let texto = ''
  try {
    texto = await fs.readFile(arq, 'utf8')
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  let ultima = null
  for (const l of texto.split('\n')) {
    if (!l.includes(linha.op)) continue
    try {
      const d = JSON.parse(l)
      if (d?.v === 2 && d.op === linha.op) ultima = d
    } catch {}
  }
  if (ultima && semHora(ultima) === semHora(linha)) return false
  await fs.mkdir(dir, { recursive: true })
  // linha pela metade (gravação interrompida) fica sozinha: a nova começa numa linha própria
  const prefixo = texto && !texto.endsWith('\n') ? '\n' : ''
  await fs.appendFile(arq, `${prefixo}${JSON.stringify(linha)}\n`)
  return true
}

/** A pasta está lá e dá para ler? 'ok' | 'sem_pasta' (apagada, movida, disco desconectado) | 'sem_permissao'. */
export async function acessoDaPasta(pasta) {
  try {
    const st = await fs.stat(pasta)
    if (!st.isDirectory()) return 'sem_pasta'
    await fs.access(pasta, fs.constants.R_OK)
    await fs.readdir(pasta)
    return 'ok'
  } catch (err) {
    return err?.code === 'EACCES' || err?.code === 'EPERM' ? 'sem_permissao' : 'sem_pasta'
  }
}

const inteiro = (v) => Number.isSafeInteger(v) && v >= 0

/** Uma linha do recibo, conferida campo a campo (entrada não confiável). null se não for um recibo válido. */
export function lerLinhaRecibo(d) {
  if (!d || typeof d !== 'object' || d.formato !== 'synquei.preparo/1') return null
  if (!OP_RE.test(String(d.op || '')) || !ESTADOS_RECIBO.has(d.estado)) return null
  const ms = Date.parse(String(d.quando || ''))
  if (!Number.isFinite(ms)) return null
  const res = d.resultado && typeof d.resultado === 'object' ? d.resultado : null
  if (!res || !CONTAGENS.every((k) => inteiro(res[k]))) return null
  const ex = d.exemplos && typeof d.exemplos === 'object' ? d.exemplos : {}
  const exemplos = {}
  for (const k of LISTAS) exemplos[k] = (Array.isArray(ex[k]) ? ex[k] : []).filter((s) => typeof s === 'string' && s.length <= 1024).slice(0, 30)
  return {
    op: d.op,
    estado: d.estado,
    quando: new Date(ms).toISOString(),
    app_versao: typeof d.app_versao === 'string' ? d.app_versao.slice(0, 60) : null,
    resultado: Object.fromEntries(CONTAGENS.map((k) => [k, res[k]])),
    exemplos,
    repetido: d.repetido === true,
    erro: typeof d.erro === 'string' ? d.erro.slice(0, 300) : null,
  }
}

/**
 * O recibo mais novo do Synquei para esta operação: { acesso, recibo } (recibo null = o Synquei ainda não escreveu).
 * Lê só o fim do arquivo; linha estragada ou de outro op fica de fora.
 */
export async function lerRecibo(pasta, op) {
  const acesso = await acessoDaPasta(pasta)
  if (acesso !== 'ok') return { acesso, recibo: null }
  const arq = path.join(pasta, RECIBO_PASTA, RECIBO_ARQUIVO)
  let texto
  try {
    const fh = await fs.open(arq, 'r')
    try {
      const { size } = await fh.stat()
      const ini = Math.max(0, size - RECIBO_MAX_LIDO)
      const buf = Buffer.alloc(size - ini)
      await fh.read(buf, 0, buf.length, ini)
      texto = buf.toString('utf8')
      if (ini > 0) texto = texto.slice(texto.indexOf('\n') + 1)
    } finally {
      await fh.close()
    }
  } catch (err) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') return { acesso: 'sem_permissao', recibo: null }
    return { acesso, recibo: null }
  }
  const linhas = texto.split('\n')
  linhas.pop() // só as inteiras
  let recibo = null
  for (const l of linhas) {
    if (!l.includes(op)) continue
    try {
      const r = lerLinhaRecibo(JSON.parse(l))
      if (r && r.op === op) recibo = r
    } catch {}
  }
  return { acesso, recibo }
}
