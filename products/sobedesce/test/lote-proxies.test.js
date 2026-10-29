// Originais no Drive, proxies ainda andando (pedido do titular: "só sei se eu abrir ali, posso acabar limpando a fila
// sem querer"). Três partes:
//  - o cartão do lote fechado diz o que falta (public/lib/transferencias.js: proxiesDoLote, proxyResumo);
//  - os números do lote ("104 GB em 1 h 12 min · 24,6 MB/s"), do motor (src/engine/lote-tempo.js) à tela;
//  - limpar a lista mantém o lote com proxy pendente e nunca cancela o proxy (TransferManager de verdade, Drive falso).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Settings } from '../src/config.js'
import { DriveClient } from '../src/google/drive.js'
import { TransferManager } from '../src/engine/manager.js'
import { LoteTempo } from '../src/engine/lote-tempo.js'
import { planUploads } from '../src/engine/planner.js'
import { GeradorPrevias } from '../src/media/previa-fila.js'
import { closeHttp } from '../src/net/http.js'
import { numerosLote, numerosTexto, proxiesDoLote, proxyPendente, proxyResumo } from '../public/lib/transferencias.js'
import { duracao } from '../public/lib/format.js'
import { detalheSair, dicaBandeja, modeloMenuBandeja, textoProxies } from '../desktop/bandeja.js'
import { makeTmpDir, setupDrive, waitFor } from './helpers.js'

after(() => closeHttp())

const MIN = 60_000
const up = (id, status, estado, extra = {}) => ({ id, type: 'upload', status, size: 4e9, previa: estado ? { estado, ...extra } : undefined })

// ───── cartão do lote ─────

test('cartão fechado: originais no Drive com proxies pendentes diz "gerando proxies 3 de 26" sem abrir', () => {
  const items = [
    ...Array.from({ length: 3 }, (_, i) => up(`p${i}`, 'completed', 'pronta')),
    up('g', 'completed', 'gerando', { frac: 0.5 }),
    ...Array.from({ length: 22 }, (_, i) => up(`f${i}`, 'completed', 'fila')),
  ]
  const px = proxiesDoLote(items)
  assert.equal(px.total, 26)
  assert.equal(px.pendentes, 23)
  assert.equal(px.feitos, 3)
  assert.ok(px.frac > 3 / 26 && px.frac < 4 / 26, 'o que está gerando conta pela metade do caminho')
  const r = proxyResumo(px, { originais: true })
  assert.equal(r.tom, 'trabalhando')
  assert.equal(r.texto, 'Originais no Drive · gerando proxies 3 de 26')
  assert.equal(r.curto, 'proxies 3/26')
  // Ainda subindo originais: sem "Originais no Drive".
  assert.equal(proxyResumo(px, { originais: false }).texto, 'Gerando proxies 3 de 26')
  // Tudo pausado ("Pausar tudo").
  const pausados = proxiesDoLote([up('a', 'completed', 'pronta'), up('b', 'completed', 'pausada')])
  assert.equal(proxyResumo(pausados, { originais: true }).texto, 'Originais no Drive · proxies pausados 1 de 2')
  assert.equal(proxyResumo(pausados, { originais: true }).tom, 'pausado')
})

test('cartão: proxies prontos, falhas com "Tentar de novo" e o que não conta', () => {
  const prontos = proxiesDoLote(Array.from({ length: 26 }, (_, i) => up(`p${i}`, 'completed', 'pronta')))
  assert.deepEqual(proxyResumo(prontos, { originais: true }), { tom: 'ok', texto: '26 proxies prontos', curto: '26 proxies prontos' })
  assert.equal(proxyResumo(prontos, { originais: true, proxyMs: 18 * MIN }).texto, '26 proxies prontos em 18 min')
  const falhas = proxiesDoLote([...Array.from({ length: 24 }, (_, i) => up(`p${i}`, 'completed', 'pronta')), up('x', 'completed', 'falhou'), up('y', 'skipped', 'falhou')])
  assert.equal(proxyResumo(falhas, { originais: true }).texto, '2 proxies falharam · 24 prontos')
  assert.deepEqual(falhas.falhouIds, ['x', 'y'], 'os ids vão para POST /api/transfers/proxy')
  assert.equal(proxyResumo(proxiesDoLote([up('x', 'completed', 'falhou')])).texto, '1 proxy falhou')
  // Já tinha proxy, pulado à mão, áudio (sem previa), download e cancelado: lote sem proxy.
  const nada = proxiesDoLote([up('a', 'completed', 'dispensada'), up('b', 'completed', 'cancelada'), up('c', 'completed', null), { id: 'd', type: 'download', status: 'completed', previa: { estado: 'fila' } }, up('e', 'canceled', 'fila')])
  assert.equal(nada.total, 0)
  assert.equal(proxyResumo(nada), null)
  assert.equal(proxyPendente(up('a', 'completed', 'enviando')), true)
  assert.equal(proxyPendente(up('a', 'completed', 'pronta')), false)
  assert.equal(proxyPendente({ type: 'download', previa: { estado: 'fila' } }), false)
})

// ───── números do lote ─────

test('números do lote: "104 GB em 1 h 12 min · 24,6 MB/s", média pelo tempo andando (pausa fora)', () => {
  assert.equal(duracao(38_000), '38 s')
  assert.equal(duracao(12 * MIN), '12 min')
  assert.equal(duracao(72 * MIN), '1 h 12 min')
  assert.equal(duracao(180 * MIN), '3 h')
  const t0 = 1_800_000_000_000
  // 104 GB a 24,6 MB/s = 4228 s andando; do começo ao último conferido, 1 h 12 min (teve uma pausa).
  const ativoMs = Math.round((104e9 / 24.6e6) * 1000)
  const batch = { id: 'b', stats: { inicio: t0, fim: t0 + 72 * MIN, ativoMs, bytes: 104e9, proxyMs: 18 * MIN } }
  const items = [{ status: 'completed', startedAt: t0, finishedAt: t0 + 72 * MIN, size: 104e9 }]
  const n = numerosLote(batch, items)
  assert.equal(n.duracaoMs, 72 * MIN)
  assert.equal(n.ativoMs, ativoMs)
  assert.ok(Math.abs(n.velocidade - 24.6e6) < 10, `velocidade ${n.velocidade}`)
  assert.equal(n.estimado, false)
  assert.equal(numerosTexto(n).texto, '104 GB em 1 h 12 min · 24,6 MB/s')
  assert.deepEqual(numerosTexto(n).partes, ['104 GB em 1 h 12 min', '24,6 MB/s'])
  assert.match(numerosTexto(n).dica, /Proxies: 18 min gerando e subindo/)
  assert.match(numerosTexto(n).dica, /Transferindo de fato: 1 h 10 min/)
  assert.match(numerosTexto(n).dica, /≈ 197 Mbps/)

  // Lote de uma versão anterior (sem stats): relógio inteiro e o que chegou (o que já estava no Drive não conta).
  const velho = numerosLote({ id: 'v' }, [
    { status: 'completed', startedAt: t0, finishedAt: t0 + 10 * MIN, size: 6e9 },
    { status: 'skipped', startedAt: t0, finishedAt: t0 + MIN, size: 9e9 },
  ])
  assert.equal(velho.estimado, true)
  assert.equal(velho.bytes, 6e9)
  assert.equal(numerosTexto(velho).texto, '6 GB em 10 min · 10,0 MB/s')
  assert.match(numerosTexto(velho).dica, /versão anterior/)
  // Nada chegou, ou tudo já estava lá: sem números.
  assert.equal(numerosLote({ id: 'x' }, [{ status: 'running', startedAt: t0 }]), null)
  assert.equal(numerosLote({ id: 'x', stats: { inicio: t0, fim: t0 + MIN, ativoMs: MIN, bytes: 0 } }, []), null)
})

test('LoteTempo: arquivos ao mesmo tempo contam uma vez, pausa fica fora, proxies à parte, fechar o app grava o que andou', () => {
  const lt = new LoteTempo()
  const b = { id: 'b' }
  const batches = new Map([['b', b]])
  lt.comecou(b, 0)
  lt.comecou(b, 10_000) // segundo arquivo junto: não soma de novo
  lt.bytes(b, 500)
  lt.parou(b, { ok: true, now: 30_000 })
  lt.parou(b, { now: 40_000 }) // pausou
  assert.equal(b.stats.ativoMs, 40_000)
  lt.comecou(b, 100_000) // retomou 60 s depois: a pausa não conta
  lt.bytes(b, 1500)
  lt.parou(b, { ok: true, now: 120_000 })
  assert.deepEqual({ ...b.stats }, { inicio: 0, fim: 120_000, ativoMs: 60_000, bytes: 2000, proxyMs: 0 })
  lt.parou(b, { now: 130_000 }) // parou a mais (não deveria acontecer): nada muda
  assert.equal(b.stats.ativoMs, 60_000)

  // Proxies: fila não conta; gerando → enviando é o mesmo trabalho; pronta fecha.
  assert.equal(lt.proxy(b, 'r1', 'fila', 130_000), false)
  assert.equal(lt.proxy(b, 'r1', 'analisando', 140_000), true)
  assert.equal(lt.proxy(b, 'r1', 'gerando', 141_000), false)
  lt.proxy(b, 'r1', 'enviando', 150_000)
  lt.proxy(b, 'r1', 'pronta', 160_000)
  lt.proxy(b, 'r2', 'gerando', 200_000)
  lt.proxy(b, 'r2', 'pausada', 205_000)
  assert.equal(b.stats.proxyInicio, 140_000)
  assert.equal(b.stats.proxyFim, 160_000)
  assert.equal(b.stats.proxyMs, 25_000)
  // Fechar o app no meio: o que andou até ali fica (e o lote continua de onde parou).
  lt.comecou(b, 300_000)
  lt.proxy(b, 'r2', 'gerando', 300_000)
  lt.fecharTudo(batches, 310_000)
  assert.equal(b.stats.ativoMs, 70_000)
  assert.equal(b.stats.proxyMs, 35_000)
  assert.equal(lt.runs.size + lt.proxies.size, 0)
  // Lixo vindo do disco não quebra.
  const sujo = { id: 's', stats: { ativoMs: 'x', bytes: -3 } }
  lt.bytes(sujo, 10)
  assert.equal(sujo.stats.bytes, 10)
  assert.equal(sujo.stats.ativoMs, 0)
})

test('bandeja: com os originais no Drive e proxies andando, não diz "Nenhuma transferência"', () => {
  assert.equal(textoProxies(0), null)
  assert.equal(textoProxies(1), 'Gerando 1 proxy')
  assert.equal(dicaBandeja(0, 3), 'SOBEDESCE · Gerando 3 proxies')
  assert.equal(dicaBandeja(2, 3), 'SOBEDESCE · 2 transferências em andamento')
  assert.deepEqual(
    modeloMenuBandeja(0, 3).filter(i => i.tipo === 'item' && !i.acao).map(i => i.rotulo),
    ['Gerando 3 proxies'],
  )
  assert.deepEqual(
    modeloMenuBandeja(1, 2).filter(i => i.tipo === 'item' && !i.acao).map(i => i.rotulo),
    ['1 transferência em andamento', 'Gerando 2 proxies'],
  )
  assert.match(detalheSair(0, 2), /originais já estão no Drive, mas faltam 2 proxies/)
  assert.match(detalheSair(3, 2), /^Há 3 transferências/)
})

// ───── motor: limpar a lista não cancela proxy ─────

const MOTOR = { via: 'ffmpeg', ffmpeg: { path: '/fake/ffmpeg', versao: '9.9', origem: 'app' }, encoder: { nome: 'libx264', hardware: false }, encoders: ['libx264'], label: 'teste' }

async function setup(t) {
  const env = await setupDrive()
  const dir = await makeTmpDir('sobedesce-lote-proxies-')
  const tmpRoot = await makeTmpDir('sobedesce-lote-proxies-tmp-')
  t.after(() => Promise.all([dir, tmpRoot].map(d => fs.rm(d, { recursive: true, force: true, maxRetries: 3 }))))
  let release
  const hold = new Promise(r => (release = r))
  const calls = []
  // Conversor de mentira que segura até `release()` (ou o abort).
  const gerar = async (file, { signal, onProgress }) => {
    calls.push(file)
    onProgress?.('analisando')
    onProgress?.('gerando', 0)
    await new Promise((resolve, reject) => {
      hold.then(resolve)
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('Interrompido.'), { name: 'AbortError' })), { once: true })
    })
    const d = await fs.mkdtemp(path.join(tmpRoot, 'p-'))
    const p = path.join(d, 'previa.mp4')
    await fs.writeFile(p, Buffer.alloc(2048, 9))
    return { estado: 'pronta', path: p, size: 2048, encoder: 'libx264', limpar: () => fs.rm(d, { recursive: true, force: true }) }
  }
  const s = new Settings(env.paths.settings)
  await s.load()
  await s.update({ keepAwake: false, verifyChecksums: false })
  const previas = new GeradorPrevias({ settings: s, detect: async () => MOTOR, gerar, tmpRoot, retryBaseMs: 5, selfCheck: false })
  const mk = () =>
    new TransferManager({
      settings: s,
      auth: env.auth,
      paths: env.paths,
      keepAwake: { active: false, setActive() {}, stop() {} },
      driveFactory: id => new DriveClient(env.auth, id, { ratePerSec: 1000, retryBaseMs: 5 }),
      taskOptions: { upload: { retryBaseMs: 5 } },
      thumbnailer: null,
      previas,
    })
  const m = mk()
  await m.init()
  t.after(async () => {
    release()
    await m.shutdown()
    await env.cleanup()
  })
  const send = async (paths, destFolderId) => {
    const plan = await planUploads({ drive: m.driveFor(env.accountId), accountId: env.accountId, paths, destFolderId })
    await m.add({ batch: plan.batch, records: plan.records })
    return { ids: plan.records.map(r => r.id), batchId: plan.batch.id }
  }
  return { env, m, dir, send, calls, release: () => release(), previas }
}

test('limpar concluídas mantém o lote com proxy pendente e o proxy continua; depois de pronto, limpa', async t => {
  const { env, m, dir, send, calls, release, previas } = await setup(t)
  const toasts = []
  m.on('toast', x => toasts.push(x))
  const pasta = env.mock.addFolder('Diária 02')
  const files = []
  for (const n of ['A001.mov', 'A002.mov', 'Som.wav']) {
    const p = path.join(dir, n)
    await fs.writeFile(p, Buffer.alloc(60_000, n.length))
    files.push(p)
  }
  const lote = await send(files, pasta.id)
  // Um lote só de áudio, sem proxy: esse sai na limpeza.
  const som = path.join(dir, 'Trilha.wav')
  await fs.writeFile(som, Buffer.alloc(30_000, 3))
  const outro = await send([som], pasta.id)
  await waitFor(() => [...lote.ids, ...outro.ids].every(id => m.get(id)?.status === 'completed'), { timeoutMs: 15_000, message: 'os originais não chegaram' })
  await waitFor(() => calls.length === 1, { timeoutMs: 5000, message: 'o proxy não começou' })
  const video = lote.ids.filter(id => /\.mov$/.test(m.get(id).name))
  assert.ok(video.every(id => proxyPendente(m.get(id))), 'os dois vídeos estão com proxy na fila ou gerando')
  // O aviso de "terminou" já diz que os proxies seguem.
  const aviso = toasts.find(x => x.batchId === lote.batchId)
  assert.match(aviso?.message || '', /terminou: 3 arquivos\. Gerando 2 proxies\./)

  // Cartão: originais no Drive, proxies 0 de 2.
  const items = lote.ids.map(id => m.get(id))
  assert.equal(proxyResumo(proxiesDoLote(items), { originais: true }).texto, 'Originais no Drive · gerando proxies 0 de 2')

  // Limpar: o lote fica inteiro (até o áudio, para o cartão não mudar de tamanho); o outro sai.
  const r = m.clearFinished()
  assert.deepEqual(r, { removidos: 1, mantidos: 1 })
  assert.ok(lote.ids.every(id => m.get(id)), 'o lote com proxy pendente continua na lista')
  assert.equal(m.get(outro.ids[0]), null)
  assert.ok(m.snapshot().batches.some(b => b.id === lote.batchId))
  // "Tirar da lista" um vídeo com proxy andando também não tira (nem cancela).
  assert.equal(await m.remove([video[0]]), 0)
  assert.ok(m.get(video[0]))
  // Nada foi cancelado: o proxy segue e o outro continua na fila.
  assert.ok(video.every(id => ['analisando', 'gerando', 'fila'].includes(m.get(id).previa.estado)))
  assert.equal(previas.queue.length + (previas.current ? 1 : 0), 2)

  release()
  await waitFor(() => video.every(id => m.get(id).previa?.estado === 'pronta'), { timeoutMs: 15_000, message: 'os proxies não ficaram prontos' })
  assert.equal(calls.length, 2)
  const b = m.snapshot().batches.find(x => x.id === lote.batchId)
  assert.ok(b.stats.bytes >= 180_000, `bytes do lote: ${b.stats.bytes}`)
  assert.ok(b.stats.inicio > 0 && b.stats.fim >= b.stats.inicio)
  assert.ok(b.stats.ativoMs > 0)
  assert.ok(b.stats.proxyMs > 0 && b.stats.proxyFim >= b.stats.proxyInicio)
  assert.ok(numerosLote(b, lote.ids.map(id => m.get(id))), 'a tela tem os números')

  // Agora sim: limpar tira o lote.
  assert.deepEqual(m.clearFinished(), { removidos: 3, mantidos: 0 })
  assert.equal(m.snapshot().transfers.length, 0)
})

test('números do lote ficam gravados (queue.json) e voltam ao abrir o app', async t => {
  const { env, m, dir, send, release } = await setup(t)
  release()
  const pasta = env.mock.addFolder('Gravado')
  const p = path.join(dir, 'Som.wav')
  await fs.writeFile(p, Buffer.alloc(80_000, 7))
  const lote = await send([p], pasta.id)
  await waitFor(() => m.get(lote.ids[0])?.status === 'completed', { timeoutMs: 15_000 })
  await m.shutdown()
  const saved = JSON.parse(await fs.readFile(env.paths.queue, 'utf8')).batches.find(b => b.id === lote.batchId)
  assert.ok(saved.stats.bytes >= 80_000)
  assert.ok(saved.stats.ativoMs > 0)
  assert.ok(saved.stats.fim >= saved.stats.inicio)
  const m2 = new TransferManager({ settings: m.settings, auth: env.auth, paths: env.paths, keepAwake: { active: false, setActive() {}, stop() {} }, driveFactory: id => new DriveClient(env.auth, id, { ratePerSec: 1000, retryBaseMs: 5 }), thumbnailer: null, previas: null })
  await m2.init()
  t.after(() => m2.shutdown())
  assert.deepEqual(m2.snapshot().batches.find(b => b.id === lote.batchId).stats, saved.stats)
})
