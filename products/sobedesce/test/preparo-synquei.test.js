// "Preparar no Synquei" depois de um download do Drive (src/engine/manifesto.js, src/engine/preparo-synquei.js,
// public/lib/preparo.js, src/backup/synquei.js): a linha v2 na pasta baixada, o recibo do Synquei de volta e o que a
// tela mostra em cada caso. O fim do arquivo baixa uma pasta de verdade pelo mock do Drive.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { acessoDaPasta, gravarManifesto, lerLinhaRecibo, lerRecibo, manifestoDoLote, pastaBaixada, RESUMO_ARQUIVO, RESUMO_PASTA } from '../src/engine/manifesto.js'
import { PreparoError, PreparoSynquei } from '../src/engine/preparo-synquei.js'
import { aberturaSynquei, CENTRAL_BAIXAR, linkSynquei, SYNQUEI_BAIXAR } from '../src/backup/synquei.js'
import { estadoPreparo } from '../public/lib/preparo.js'
import { TransferManager } from '../src/engine/manager.js'
import { Settings } from '../src/config.js'
import { DriveClient } from '../src/google/drive.js'
import { Hasher } from '../src/engine/hasher.js'
import { planDownloads } from '../src/engine/planner.js'
import { closeHttp } from '../src/net/http.js'
import { makeTmpDir, setupDrive, waitFor } from './helpers.js'
import { virtualMd5 } from './mock-drive.js'

after(() => closeHttp())

const md5 = (n) => n.toString(16).padStart(32, '0')

/** Uma pasta baixada de mentira: os arquivos no disco e os registros como o motor deixa no fim. */
async function lote(raiz, arquivos, { pasta = 'Gravação 28-10 · Ação & Cia', batchId = 'bLoteTeste01' } = {}) {
  const records = []
  let i = 0
  for (const a of arquivos) {
    i++
    const relPath = `${pasta}/${a.rel}`
    const abs = path.join(raiz, ...relPath.split('/'))
    await fs.mkdir(path.dirname(abs), { recursive: true })
    if (!a.faltando) await fs.writeFile(abs, Buffer.alloc(a.size ?? 10, i))
    records.push({
      id: `t${i}`,
      type: 'download',
      batchId,
      status: a.status || 'completed',
      name: relPath.split('/').pop(),
      relPath,
      size: a.declarado !== undefined ? a.declarado : (a.size ?? 10),
      source: { fileId: `arquivoDrive${i}`, md5: a.semMd5 ? null : md5(i) },
      dest: { path: abs, tempPath: abs + '.sobedesce-part' },
      verify: a.verify !== undefined ? a.verify : { state: 'ok', expected: md5(i), actual: md5(i) },
    })
  }
  return { records, batch: { id: batchId, type: 'download', label: pasta, origem: { pastaId: 'pastaDrive01', pasta } }, pasta: path.join(raiz, pasta) }
}

test('pastaBaixada: uma pasta inteira; arquivo solto, duas pastas ou caminho que não bate = null', () => {
  const r = (relPath, dest) => ({ relPath, dest: { path: dest } })
  const raiz = path.resolve('/Volumes/SSD/Downloads')
  assert.deepEqual(pastaBaixada([r('ZRO/A.mp4', path.join(raiz, 'ZRO', 'A.mp4')), r('ZRO/Som/Z.wav', path.join(raiz, 'ZRO', 'Som', 'Z.wav'))]), { raiz, nome: 'ZRO', pasta: path.join(raiz, 'ZRO') })
  assert.equal(pastaBaixada([r('A.mp4', path.join(raiz, 'A.mp4'))]), null)
  assert.equal(pastaBaixada([r('ZRO/A.mp4', path.join(raiz, 'ZRO', 'A.mp4')), r('Outra/B.mp4', path.join(raiz, 'Outra', 'B.mp4'))]), null)
  assert.equal(pastaBaixada([r('ZRO/A.mp4', path.join(raiz, 'ZRO', 'A (2).mp4'))]), null)
  assert.equal(pastaBaixada([r('ZRO/../x', path.join(raiz, 'x'))]), null)
  assert.equal(pastaBaixada([]), null)
})

test('manifesto: lote conferido vira a linha v2 com MD5, ids do Drive e tamanhos; acentos e símbolos no caminho', async () => {
  const raiz = await makeTmpDir('sd-prep-')
  const { records, batch, pasta } = await lote(raiz, [{ rel: 'Câmera A/C0001 #1 & 50%.MP4', size: 30 }, { rel: 'Som/ZOOM0001.WAV', size: 20 }, { rel: 'Roteiro.docx', size: 5, verify: null }])
  const m = await manifestoDoLote({ batch, records, agora: new Date('2026-10-28T12:00:00Z'), versao: '0.1.0+77' })
  assert.equal(m.ok, true, m.motivo)
  assert.equal(m.pasta, pasta)
  const l = m.linha
  assert.equal(l.v, 2)
  assert.equal(l.tipo, 'drive.download')
  assert.equal(l.op, 'bLoteTeste01')
  assert.equal(l.app_versao, '0.1.0+77')
  assert.equal(l.project_id, null)
  assert.deepEqual(l.origem, { tipo: 'drive', pasta_id: 'pastaDrive01', pasta: 'Gravação 28-10 · Ação & Cia' })
  assert.deepEqual(l.destino, { pasta: 'Gravação 28-10 · Ação & Cia', caminho: pasta })
  assert.equal(l.estado, 'parcial', 'um sem conferência: nunca "conferido"')
  assert.deepEqual(l.verificacao, { algoritmo: 'md5', total: 3, conferidos: 2, sem_conferencia: 1, tamanho: true })
  assert.equal(l.bytes, 55)
  assert.deepEqual(l.arquivos.map((a) => a.rel), ['Câmera A/C0001 #1 & 50%.MP4', 'Roteiro.docx', 'Som/ZOOM0001.WAV'])
  const doc = l.arquivos.find((a) => a.rel === 'Roteiro.docx')
  assert.deepEqual(doc, { rel: 'Roteiro.docx', nome: 'Roteiro.docx', size: 5, file_id: 'arquivoDrive3', md5: null, conferido: false })
  assert.equal(l.arquivos[0].nome, 'C0001 #1 & 50%.MP4')
  assert.equal(l.arquivos[0].conferido, true)
  // nada de conta, e-mail, token, link
  const texto = JSON.stringify(l)
  for (const proibido of ['accountId', 'token', '@', 'https://', 'session']) assert.ok(!texto.includes(proibido), proibido)

  // todos conferidos = 'conferido'
  const tudo = await lote(await makeTmpDir('sd-prep-'), [{ rel: 'A.mov' }, { rel: 'B/C.wav' }])
  assert.equal((await manifestoDoLote(tudo)).linha.estado, 'conferido')
})

test('manifesto: não sai com arquivo baixando, interrompido, diferente, sumido ou com outro tamanho', async () => {
  const motivo = async (arqs) => {
    const raiz = await makeTmpDir('sd-prep-')
    const m = await manifestoDoLote(await lote(raiz, arqs))
    assert.equal(m.ok, false)
    return m.motivo
  }
  assert.match(await motivo([{ rel: 'A.mov' }, { rel: 'B.mov', status: 'running' }]), /não terminou/)
  assert.match(await motivo([{ rel: 'A.mov' }, { rel: 'B.mov', status: 'paused' }]), /não terminou/)
  assert.match(await motivo([{ rel: 'A.mov' }, { rel: 'B.mov', status: 'failed' }]), /não terminou/)
  assert.match(await motivo([{ rel: 'A.mov', verify: { state: 'mismatch', expected: md5(1), actual: md5(9) } }]), /diferente/)
  assert.match(await motivo([{ rel: 'A.mov', faltando: true }]), /Não achei A\.mov/)
  assert.match(await motivo([{ rel: 'A.mov', size: 10, declarado: 11 }]), /tamanho/)
  // cancelado não conta (o resto segue); só cancelado = nada
  const raiz = await makeTmpDir('sd-prep-')
  const l = await lote(raiz, [{ rel: 'A.mov' }, { rel: 'B.mov', status: 'canceled', faltando: true }])
  const m = await manifestoDoLote(l)
  assert.equal(m.ok, true)
  assert.equal(m.linha.arquivos.length, 1)
  assert.match((await manifestoDoLote({ ...l, records: l.records.map((r) => ({ ...r, status: 'canceled' })) })).motivo, /Nada/)
  // arquivo solto (sem pasta) não tem "uma pasta" para preparar
  const solto = { batch: { id: 'bSolto0001' }, records: [{ ...l.records[0], relPath: 'A.mov', dest: { path: path.join(raiz, 'A.mov') } }] }
  assert.match((await manifestoDoLote(solto)).motivo, /pasta baixada inteira/)
})

test('gravar: no mesmo descargas.jsonl dos cartões, sem repetir; linha pela metade não estraga a nova', async () => {
  const raiz = await makeTmpDir('sd-prep-')
  const l = await lote(raiz, [{ rel: 'A.mov' }])
  const { pasta, linha } = await manifestoDoLote(l)
  const arq = path.join(pasta, RESUMO_PASTA, RESUMO_ARQUIVO)
  await fs.mkdir(path.dirname(arq), { recursive: true })
  const v1 = JSON.stringify({ v: 1, app: 'sobedesce', id: 'cartao1', cartao: { pasta: 'x' } })
  await fs.writeFile(arq, `${v1}\n{"v":1,"app":"sobed`)
  assert.equal(await gravarManifesto(pasta, linha), true)
  assert.equal(await gravarManifesto(pasta, { ...linha, quando: '2030-01-01T00:00:00.000Z' }), false, 'pedir de novo não repete')
  const linhas = (await fs.readFile(arq, 'utf8')).split('\n')
  assert.equal(linhas[0], v1)
  assert.equal(linhas[1], '{"v":1,"app":"sobed')
  assert.deepEqual(JSON.parse(linhas[2]), linha)
  assert.equal(linhas[3], '')
  // mudou (arquivo baixado de novo): grava outra linha, a última vale
  assert.equal(await gravarManifesto(pasta, { ...linha, bytes: 99 }), true)
  assert.equal((await fs.readFile(arq, 'utf8')).trim().split('\n').length, 4)
})

const recibo = (o = {}) => ({
  formato: 'synquei.preparo/1',
  op: 'bLoteTeste01',
  app_versao: '1.0.0+1001',
  quando: '2026-10-28T12:00:10.000Z',
  estado: 'preparado',
  resultado: { organizados: 3, sincronizados: 2, ignorados: 1, pendentes: 0, ausentes: 0, alterados: 0, movidos: 0, revisar: 0 },
  exemplos: { ausentes: [], alterados: [], movidos: [], revisar: [] },
  ...o,
})

test('recibo: a última linha do op vale; adulterado, de outro op, estragado ou pela metade fica de fora', async () => {
  const raiz = await makeTmpDir('sd-prep-')
  const pasta = path.join(raiz, 'P')
  assert.deepEqual(await lerRecibo(pasta, 'bLoteTeste01'), { acesso: 'sem_pasta', recibo: null })
  await fs.mkdir(path.join(pasta, 'Synquei'), { recursive: true })
  assert.deepEqual(await lerRecibo(pasta, 'bLoteTeste01'), { acesso: 'ok', recibo: null })
  const arq = path.join(pasta, 'Synquei', 'preparos.jsonl')
  const linhas = [
    recibo({ estado: 'recebido', quando: '2026-10-28T12:00:01Z' }),
    recibo({ op: 'outroLote01', estado: 'erro', quando: '2026-10-28T12:00:20Z' }),
    recibo({ estado: 'preparando', quando: '2026-10-28T12:00:02Z' }),
  ]
  await fs.writeFile(arq, linhas.map((x) => JSON.stringify(x)).join('\n') + '\nlixo bLoteTeste01\n' + JSON.stringify(recibo({ resultado: { organizados: -1 } })) + '\n' + JSON.stringify(recibo({ estado: 'hackeado' })) + '\n' + JSON.stringify(recibo({ estado: 'preparado', quando: '2026-10-28T12:00:30Z' })).slice(0, 40))
  const r = await lerRecibo(pasta, 'bLoteTeste01')
  assert.equal(r.recibo.estado, 'preparando', 'a linha pela metade no fim espera; as inválidas ficam de fora')
  assert.equal(lerLinhaRecibo({ ...recibo(), formato: 'outro/1' }), null)
  assert.equal(lerLinhaRecibo({ ...recibo(), op: '../x' }), null)
  assert.equal(lerLinhaRecibo({ ...recibo(), quando: 'ontem' }), null)
  const lim = lerLinhaRecibo(recibo({ exemplos: { ausentes: Array.from({ length: 99 }, (_, i) => `a${i}`), alterados: [7, 'b'], movidos: 'x', revisar: [] }, erro: 'x'.repeat(999) }))
  assert.equal(lim.exemplos.ausentes.length, 30)
  assert.deepEqual(lim.exemplos.alterados, ['b'])
  assert.deepEqual(lim.exemplos.movidos, [])
  assert.equal(lim.erro.length, 300)
})

/** Um TransferManager de mentira: só o que o PreparoSynquei usa. */
function falsoManager(records, batch) {
  const m = new EventEmitter()
  m.records = new Map(records.map((r) => [r.id, r]))
  m.batches = new Map([[batch.id, batch]])
  m.setBatchInfo = (id, k, v) => {
    m.batches.get(id)[k] = v
    return true
  }
  return m
}

test('serviço: lote concluído grava; pedido devolve o link com op; recibo muda o estado; sem recibo = "não confirmou"', async () => {
  const raiz = await makeTmpDir('sd-prep-')
  const l = await lote(raiz, [{ rel: 'A.mov' }, { rel: 'Som/B.wav' }])
  const mgr = falsoManager(l.records, l.batch)
  let agora = Date.parse('2026-10-28T12:00:00Z')
  const svc = new PreparoSynquei({ manager: mgr, intervaloMs: 0, esperaMs: 45_000, agora: () => agora, versao: '0.1.0+5' }).start()
  mgr.emit('lote-concluido', { batch: l.batch })
  await svc.fila
  const sq = l.batch.synquei
  assert.deepEqual({ op: sq.op, pasta: sq.pasta, total: sq.total, conferidos: sq.conferidos, semConferencia: sq.semConferencia }, { op: 'bLoteTeste01', pasta: l.pasta, total: 2, conferidos: 2, semConferencia: 0 })
  assert.equal(estadoPreparo(sq, { terminado: false }), null, 'nunca com arquivo baixando')
  assert.equal(estadoPreparo(sq, { terminado: true }).fase, 'pronto')

  const r = await svc.preparar('bLoteTeste01')
  const u = new URL(r.link)
  assert.equal(u.protocol, 'synquei:')
  assert.equal(u.searchParams.get('pasta'), l.pasta)
  assert.equal(u.searchParams.get('op'), 'bLoteTeste01')
  assert.equal(estadoPreparo(l.batch.synquei, { terminado: true }).fase, 'aguardando')

  // o Synquei respondeu: recebido → preparando → com pendências
  const arq = path.join(l.pasta, 'Synquei', 'preparos.jsonl')
  await fs.mkdir(path.dirname(arq), { recursive: true })
  agora += 5000
  await fs.appendFile(arq, JSON.stringify(recibo({ estado: 'preparando', quando: new Date(agora).toISOString() })) + '\n')
  await svc.verificar()
  assert.equal(estadoPreparo(l.batch.synquei, { terminado: true }).fase, 'preparando')
  agora += 5000
  await fs.appendFile(arq, JSON.stringify(recibo({ estado: 'com_pendencias', quando: new Date(agora).toISOString(), resultado: { ...recibo().resultado, pendentes: 2, ausentes: 1, revisar: 1 }, exemplos: { ausentes: ['Som/B.wav'], alterados: [], movidos: [], revisar: ['A.mov'] } })) + '\n')
  await svc.verificar()
  const e = estadoPreparo(l.batch.synquei, { terminado: true })
  assert.equal(e.fase, 'pendencias')
  assert.equal(e.texto, 'Preparado · 2 pendências')
  assert.match(e.detalhe, /1 ausente: Som\/B\.wav/)
  assert.match(e.detalhe, /1 sincronia para revisar/)

  // pedir de novo: o recibo antigo não vale para o pedido novo; sem resposta em 45 s, "não confirmou"
  agora += 60_000
  await svc.preparar('bLoteTeste01')
  assert.equal(estadoPreparo(l.batch.synquei, { terminado: true }).fase, 'aguardando')
  agora += 46_000
  await svc.verificar()
  const sem = estadoPreparo(l.batch.synquei, { terminado: true })
  assert.equal(sem.fase, 'sem_resposta')
  assert.equal(sem.atualizar, true)
  // o recibo chega atrasado (Synquei atualizado): vale
  await fs.appendFile(arq, JSON.stringify(recibo({ quando: new Date(agora).toISOString(), repetido: true })) + '\n')
  await svc.verificar()
  assert.equal(estadoPreparo(l.batch.synquei, { terminado: true }).fase, 'preparado')
  assert.equal(estadoPreparo(l.batch.synquei, { terminado: true }).detalhe, '3 organizados · 2 sincronizados · 1 ignorado')
  await svc.close()
})

test('serviço: pasta sumiu (disco desconectado) ou lote com problema = recusa com o motivo, nada de link', async () => {
  const raiz = await makeTmpDir('sd-prep-')
  const l = await lote(raiz, [{ rel: 'A.mov' }])
  const mgr = falsoManager(l.records, l.batch)
  const svc = new PreparoSynquei({ manager: mgr, intervaloMs: 0 })
  await svc.aoConcluir('bLoteTeste01')
  assert.ok(l.batch.synquei.op)
  await fs.rename(l.pasta, l.pasta + ' (movida)')
  await assert.rejects(svc.preparar('bLoteTeste01'), (err) => err instanceof PreparoError && err.status === 409 && /não está mais lá/.test(err.message))
  assert.equal(await acessoDaPasta(l.pasta), 'sem_pasta')
  await assert.rejects(svc.preparar('naoExiste01'), (err) => err.status === 404)

  const l2 = await lote(await makeTmpDir('sd-prep-'), [{ rel: 'A.mov', verify: { state: 'mismatch' } }], { batchId: 'bDiferente1' })
  const svc2 = new PreparoSynquei({ manager: falsoManager(l2.records, l2.batch), intervaloMs: 0 })
  await assert.rejects(svc2.preparar('bDiferente1'), /diferente/)
  assert.equal(estadoPreparo(l2.batch.synquei, { terminado: true }), null)
})

test('serviço: sem permissão para gravar na pasta baixada, o botão não aparece', { skip: process.getuid?.() === 0 && 'root ignora permissão' }, async () => {
  const raiz = await makeTmpDir('sd-prep-')
  const l = await lote(raiz, [{ rel: 'A.mov' }])
  await fs.chmod(l.pasta, 0o555)
  try {
    const svc = new PreparoSynquei({ manager: falsoManager(l.records, l.batch), intervaloMs: 0 })
    assert.equal(await svc.aoConcluir('bLoteTeste01'), null)
    assert.match(l.batch.synquei.indisponivel, /permissão/)
  } finally {
    await fs.chmod(l.pasta, 0o755)
  }
})

test('ponte: Synquei instalado abre; sem ele, a central (se houver) ou a página Downloads; link estranho, nada', () => {
  const link = linkSynquei(path.resolve('/Volumes/HD/Gravação'), null, 'bLoteTeste01')
  assert.deepEqual(aberturaSynquei({ link, temSynquei: true, temCentral: true }), { abrir: link, para: 'synquei' })
  assert.deepEqual(aberturaSynquei({ link, temSynquei: false, temCentral: true }), { abrir: CENTRAL_BAIXAR, para: 'central' })
  assert.deepEqual(aberturaSynquei({ link, temSynquei: false, temCentral: false }), { abrir: SYNQUEI_BAIXAR, para: 'site' })
  assert.equal(CENTRAL_BAIXAR, 'absolutezro://baixar')
  assert.equal(SYNQUEI_BAIXAR, 'https://absolutezro.com/baixar')
  for (const ruim of ['https://evil.example', 'synquei://outro?x', null, `synquei://organizar?${'a'.repeat(9000)}`]) assert.deepEqual(aberturaSynquei({ link: ruim, temSynquei: true, temCentral: true }), { abrir: null, para: null })
  assert.throws(() => linkSynquei(path.resolve('/x'), null, '../etc'), /Operação/)
  assert.throws(() => linkSynquei(path.resolve('/x'), null, 'a&b=c1'), /Operação/)
  assert.equal(new URL(linkSynquei(path.resolve('/x'))).searchParams.get('op'), null)
})

test('tela: estados do lote (aguardando, preparando, preparado, pendências, erro, pasta inacessível)', () => {
  const base = { op: 'bLoteTeste01', pasta: '/x', total: 9, conferidos: 8, semConferencia: 1 }
  assert.equal(estadoPreparo(null, { terminado: true }), null)
  assert.equal(estadoPreparo({ indisponivel: 'O lote ainda não terminou.' }, { terminado: true }), null)
  assert.match(estadoPreparo(base, { terminado: true }).detalhe, /8 de 9 conferidos \(MD5\) · 1 sem conferência/)
  const pedido = { ...base, pedidoEm: '2026-10-28T12:00:00Z' }
  const r = (estado, o = {}) => ({ ...pedido, recibo: { estado, quando: '2026-10-28T12:00:05Z', resultado: recibo().resultado, exemplos: recibo().exemplos, ...o } })
  assert.equal(estadoPreparo(r('recebido'), { terminado: true }).fase, 'preparando')
  assert.equal(estadoPreparo(r('preparado'), { terminado: true }).botao, false)
  const erro = estadoPreparo(r('erro', { erro: 'O disco foi desconectado.' }), { terminado: true })
  assert.equal(erro.fase, 'erro')
  assert.equal(erro.detalhe, 'O disco foi desconectado.')
  // recibo de antes do pedido não vale: aguardando
  assert.equal(estadoPreparo({ ...r('preparado'), recibo: { ...r('preparado').recibo, quando: '2026-10-28T11:00:00Z' } }, { terminado: true }).fase, 'aguardando')
  assert.equal(estadoPreparo({ ...pedido, acesso: 'sem_permissao' }, { terminado: true }).detalhe, 'Sem permissão para ler a pasta baixada.')
  assert.equal(estadoPreparo({ ...pedido, acesso: 'sem_pasta' }, { terminado: true }).fase, 'sem_acesso')
})

test('de verdade: pasta do Drive baixada pela fila (mock) grava a linha v2 com o MD5 conferido de cada arquivo', async (t) => {
  const env = await setupDrive({})
  const dir = await makeTmpDir('sd-prep-dl-')
  const hasher = new Hasher({ cacheFile: path.join(env.home, 'hash-cache.json'), log: () => {} })
  t.after(async () => {
    await hasher.close()
    await env.cleanup()
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })
  })
  const s = new Settings(env.paths.settings)
  await s.load()
  await s.update({ keepAwake: false })
  const m = new TransferManager({ settings: s, auth: env.auth, hasher, paths: env.paths, keepAwake: { start() {}, stop() {}, active: false }, driveFactory: (id) => new DriveClient(env.auth, id, { ratePerSec: 1000, retryBaseMs: 5 }), taskOptions: { download: { retryBaseMs: 5 } } })
  await m.init()
  t.after(() => m.shutdown())
  const svc = new PreparoSynquei({ manager: m, intervaloMs: 0 }).start()
  t.after(() => svc.close())

  const pasta = env.mock.addFolder('Diária Única · São João')
  const sub = env.mock.addFolder('Câmera B', pasta.id)
  env.mock.addFile('C0001.MP4', pasta.id, { size: 70_000, seed: 3 })
  env.mock.addFile('ZOOM 0001.WAV', sub.id, { size: 40_000, seed: 4 })
  const plan = await planDownloads({ drive: m.driveFor(env.accountId), accountId: env.accountId, items: [{ id: pasta.id }], destDir: dir })
  assert.deepEqual(plan.batch.origem, { pastaId: pasta.id, pasta: 'Diária Única · São João' })
  await m.add({ batch: plan.batch, records: plan.records })
  await waitFor(() => m.batches.get(plan.batch.id)?.synquei?.op, { timeoutMs: 20_000, message: 'o manifesto não foi gravado' })
  const sq = m.batches.get(plan.batch.id).synquei
  assert.equal(sq.pasta, path.join(dir, 'Diária Única · São João'))
  assert.equal(sq.conferidos, 2)
  const linha = JSON.parse((await fs.readFile(path.join(sq.pasta, '.sobedesce', 'descargas.jsonl'), 'utf8')).trim())
  assert.equal(linha.op, plan.batch.id)
  assert.equal(linha.origem.pasta_id, pasta.id)
  assert.deepEqual(linha.arquivos.map((a) => [a.rel, a.size, a.md5]), [
    ['C0001.MP4', 70_000, await virtualMd5(3, 70_000)],
    ['Câmera B/ZOOM 0001.WAV', 40_000, await virtualMd5(4, 40_000)],
  ])
  // o lote vai para a tela com o estado do Synquei (e o arquivo da fila guarda)
  assert.ok(m.snapshot().batches.find((b) => b.id === plan.batch.id).synquei.op)
  const r = await svc.preparar(plan.batch.id)
  assert.equal(new URL(r.link).searchParams.get('op'), plan.batch.id)
})
