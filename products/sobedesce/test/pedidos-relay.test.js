// "Gerar versões com o Relay" pedido pelo Maestro (src/engine/pedidos-relay.js): pega só pedidos "relay", um por vez,
// converte nos trabalhos do Relay da tela (src/server/relay.js) e conta ao site: andamento que só cresce, "pronto" só
// com o arquivo novo e o MD5, erro com a frase. Cancelado no Maestro para antes de subir; fechar o app antes de subir
// devolve para a fila e no meio do envio vira erro; sem ffmpeg não pega nada. Com o ffmpeg de verdade e o Drive falso,
// o master vira a versão na pasta de entregas pedida, ao lado de nada e sem tocar no original.
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { PedidosRelay, fracTotal, MSG } from '../src/engine/pedidos-relay.js'
import { RelayJobs } from '../src/server/relay.js'
import { RELAY_MARCA } from '../src/media/relay.js'
import { GeradorPrevias } from '../src/media/previa-fila.js'
import { detectarMotor } from '../src/media/previa.js'
import { HttpError, closeHttp } from '../src/net/http.js'
import { setupDrive, md5File } from './helpers.js'

after(() => closeHttp())

const sleep = ms => new Promise(r => setTimeout(r, ms))
const MD5 = '0123456789abcdef0123456789abcdef'
const ffmpegDoSistema = (() => {
  try {
    const r = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
})()

/**
 * O site de mentira: a fila (só "relay"), pegar de uma vez só, e as regras do PATCH (o computador que pegou; final
 * não muda; cancelado responde 409). `cancelar(id)` é o Maestro cancelando.
 */
function fakeSite(pedidos, { cair = 0 } = {}) {
  const fila = new Map(pedidos.map(p => [p.id, { ...p }]))
  const chamadas = []
  let quedas = cair
  const site = {
    signedIn: true,
    chamadas,
    fila,
    cancelar: id => Object.assign(fila.get(id), { status: 'cancelado' }),
    async request(method, url, { body } = {}) {
      chamadas.push({ method, url, body })
      if (method === 'GET') return { status: 200, data: { ok: true, pedidos: [...fila.values()].filter(p => p.status === 'pendente').reverse() } }
      const id = decodeURIComponent(url.split('/')[4])
      const p = fila.get(id)
      const recusa = s => {
        throw new HttpError(s, { body: { ok: false }, method, url })
      }
      if (!p) recusa(404)
      if (method === 'POST' && url.endsWith('/pegar')) {
        if (p.status !== 'pendente') recusa(409)
        p.status = 'gerando'
        return { status: 200, data: { ok: true } }
      }
      if (method === 'PATCH') {
        if (p.status !== 'gerando') recusa(409)
        if (body.status === 'pronto' && quedas-- > 0) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
        if (body.status === 'pronto' && !body.saida) recusa(400)
        if (body.status === 'gerando' && typeof body.frac === 'number') p.frac = Math.max(p.frac ?? 0, body.frac)
        else Object.assign(p, { status: body.status, erro: body.erro ?? null, saida: body.saida ?? null })
        return { status: 200, data: { ok: true } }
      }
      return { status: 200, data: { ok: true } }
    },
  }
  return site
}

const pedido = (id, preset = 'whatsapp', extra = {}) => ({ id, tipo: 'relay', fileId: `f-${id}`, contaGoogleId: 'cg1', nome: `${id}.mov`, status: 'pendente', ajustes: { preset, pastaId: 'entregas', ref: 'versao-1' }, ...extra })
const patches = site => site.chamadas.filter(c => c.method === 'PATCH').map(c => ({ id: c.url.split('/')[4], ...c.body }))

/** Os trabalhos do Relay com um conversor de mentira (`fazer` decide como termina) e um Drive que acha qualquer arquivo. */
function fakeJobs({ fazer, ffmpeg = '/usr/bin/ffmpeg' } = {}) {
  const ctx = {
    manager: {
      previas: { emVaga: () => {}, motor: async () => ({ ffmpeg: ffmpeg ? { path: ffmpeg } : null }) },
      driveFor: () => ({ getItem: async id => ({ id, name: `${id}.mov`, size: 10, parents: ['orig'], isFolder: false }) }),
      records: new Map(),
    },
    hub: { send: () => {} },
    log: () => {},
  }
  const recebidos = []
  const converter = async o => {
    recebidos.push(o)
    return fazer(o)
  }
  return { jobs: new RelayJobs(ctx, { converter }), recebidos }
}

const pronto = o => ({ fileId: `out-${o.item.id}`, nome: `${o.item.id} (WhatsApp).mp4`, size: 2048, conferido: true, md5: MD5, pastaId: o.parentId })

describe('versões do Maestro (pedidos do Relay)', () => {
  test('andamento total por fase, só subindo', () => {
    const seq = [fracTotal('esperando'), fracTotal('baixando', 0.5), fracTotal('analisando'), fracTotal('convertendo', 0.5), fracTotal('enviando', 1), fracTotal('conferindo')]
    assert.deepEqual(
      seq.map(n => Math.round(n * 1000) / 1000),
      [0, 0.075, 0.15, 0.5, 0.98, 0.98],
    )
  })

  test('pega só os do Relay, converte na pasta pedida e conta pronto com o arquivo e o MD5', async () => {
    const site = fakeSite([pedido('p1'), pedido('p2', 'youtube-1080')])
    const { jobs, recebidos } = fakeJobs({
      fazer: async o => {
        o.onFase('convertendo', 0.6)
        await o.antesDeSubir()
        o.onFase('enviando', 0.5)
        return pronto(o)
      },
    })
    const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, andamentoMs: 0, log: () => {} })
    assert.equal(await w.consultar(), 2)
    await w.close()
    assert.deepEqual(
      recebidos.map(o => [o.item.id, o.destino, o.parentId, o.pedido]),
      [
        ['f-p1', 'whatsapp', 'entregas', 'p1'],
        ['f-p2', 'youtube-1080', 'entregas', 'p2'],
      ],
      'o mais antigo primeiro, com a pasta de entregas',
    )
    assert.equal(site.fila.get('p1').status, 'pronto')
    assert.deepEqual(site.fila.get('p1').saida, { arquivoId: 'out-f-p1', nome: 'f-p1 (WhatsApp).mp4', tamanho: 2048, md5: MD5, pastaId: 'entregas' })
    const fracs = patches(site).filter(x => x.id === 'p1' && x.status === 'gerando').map(x => x.frac)
    assert.ok(fracs.length >= 2 && fracs.every((f, i) => i === 0 || f >= fracs[i - 1]), `andamento só cresce: ${fracs}`)
    assert.equal(jobs.list().find(j => j.arquivo.id === 'f-p1').origem, 'maestro', 'aparece na tela do Relay como do Maestro')
  })

  test('preset com a cor da Revela: recusado com o aviso, nunca convertido sem a cor', async () => {
    const relay = await import('../src/media/relay.js')
    const site = fakeSite([pedido('k', 'whatsapp')])
    const { jobs, recebidos } = fakeJobs({ fazer: async o => pronto(o) })
    const original = relay.DESTINOS_RELAY.find(p => p.id === 'whatsapp')
    original.cor = { entrada: 'slog3', tom: 'suave', look: null }
    try {
      const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, log: () => {} })
      await w.consultar()
      await w.close()
    } finally {
      delete original.cor
    }
    assert.deepEqual([site.fila.get('k').status, site.fila.get('k').erro], ['erro', MSG.cor])
    assert.equal(recebidos.length, 0)
  })

  test('"pronto" só com o MD5: sem conferência é erro; falha do conversor vai com a frase; preset que não existe aqui', async () => {
    const site = fakeSite([pedido('a'), pedido('b'), pedido('c', 'nao-existe')])
    const { jobs } = fakeJobs({
      fazer: async o => {
        if (o.item.id === 'f-a') return { ...pronto(o), conferido: false, md5: undefined }
        throw new Error('o ffmpeg não abriu este arquivo como vídeo nem áudio')
      },
    })
    const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, log: () => {} })
    await w.consultar()
    await w.close()
    assert.deepEqual(
      ['a', 'b', 'c'].map(id => [site.fila.get(id).status, site.fila.get(id).erro]),
      [
        ['erro', MSG.semMd5],
        ['erro', 'o ffmpeg não abriu este arquivo como vídeo nem áudio'],
        ['erro', MSG.destino],
      ],
    )
  })

  test('cancelado no Maestro: o sinal antes de subir recebe 409 e nada sobe; outro computador levou = não mexe', async () => {
    const site = fakeSite([pedido('x'), pedido('y')])
    let subiu = 0
    const { jobs } = fakeJobs({
      fazer: async o => {
        if (o.item.id === 'f-x') site.cancelar('x')
        await o.antesDeSubir()
        subiu++
        return pronto(o)
      },
    })
    // y: outro computador pega primeiro
    const original = site.request.bind(site)
    site.request = async (m, u, o) => {
      if (m === 'POST' && u.includes('/y/pegar')) site.fila.get('y').status = 'gerando'
      return original(m, u, o)
    }
    const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, log: () => {} })
    assert.equal(await w.consultar(), 0)
    await w.close()
    assert.equal(subiu, 0)
    assert.equal(site.fila.get('x').status, 'cancelado', 'cancelado continua cancelado')
    assert.equal(patches(site).some(x => x.id === 'x' && x.status !== 'gerando'), false)
    assert.equal(jobs.list().find(j => j.arquivo.id === 'f-x').status, 'canceled')
  })

  test('fechar o app: antes de subir volta para a fila; no meio do envio vira erro (nunca uma segunda conversão sozinha)', async () => {
    for (const [onde, esperado] of [
      ['convertendo', { status: 'pendente', erro: null }],
      ['enviando', { status: 'erro', erro: MSG.fechouEnviando }],
    ]) {
      const site = fakeSite([pedido('z')])
      let w
      const { jobs } = fakeJobs({
        fazer: async o => {
          if (onde === 'enviando') await o.antesDeSubir()
          setTimeout(() => w.close(), 5)
          await new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('parou'), { name: 'AbortError' })), { once: true }))
        },
      })
      w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, log: () => {} })
      await w.consultar()
      const p = site.fila.get('z')
      assert.deepEqual({ status: p.status, erro: p.erro }, esperado, onde)
    }
  })

  test('a resposta do "pronto" que cai é repetida (mesmo estado, mesmo computador); sem ffmpeg não pega nada', async () => {
    const site = fakeSite([pedido('r')], { cair: 1 })
    const { jobs } = fakeJobs({ fazer: async o => pronto(o) })
    const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, esperaContarMs: 1, log: () => {} })
    await w.consultar()
    await w.close()
    assert.equal(site.fila.get('r').status, 'pronto')
    assert.equal(patches(site).filter(x => x.status === 'pronto').length, 2)

    const semFfmpeg = fakeSite([pedido('s')])
    const sf = fakeJobs({ fazer: async o => pronto(o), ffmpeg: null })
    const w2 = new PedidosRelay({ cloud: semFfmpeg, relay: () => sf.jobs, pollMs: 60_000, log: () => {} })
    assert.equal(await w2.consultar(), 0)
    await w2.close()
    assert.equal(semFfmpeg.fila.get('s').status, 'pendente')
    assert.equal(semFfmpeg.chamadas.some(c => c.url.endsWith('/pegar')), false)
  })

  test('site antigo (sem o tipo "relay"): pausa e não insiste', async () => {
    const site = fakeSite([])
    site.request = async (m, u) => {
      site.chamadas.push({ method: m, url: u })
      throw new HttpError(400, { body: { ok: false }, method: m, url: u })
    }
    const { jobs } = fakeJobs({ fazer: async o => pronto(o) })
    const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, log: () => {} })
    await w.consultar()
    await w.consultar()
    await w.close()
    assert.equal(site.chamadas.length, 1)
  })

  test('de verdade: ffmpeg do sistema e o Drive falso, a versão sobe na pasta de entregas com o MD5 conferido', { skip: !ffmpegDoSistema && 'sem ffmpeg neste computador', timeout: 120_000 }, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sobedesce-pedido-relay-'))
    t.after(() => fs.rm(dir, { recursive: true, force: true }))
    const master = path.join(dir, 'master.mov')
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'prores_ks', '-profile:v', '0', '-c:a', 'pcm_s16le', master])
    assert.equal(r.status, 0, r.stderr?.toString())
    const env = await setupDrive()
    t.after(() => env.cleanup())
    const projeto = env.mock.addFolder('Aurora')
    const entregas = env.mock.addFolder('05 Entregas', projeto.id)
    const conteudo = await fs.readFile(master)
    const original = env.mock.addFile('Master.mov', projeto.id, { content: conteudo })
    const motor = await detectarMotor({ candidates: [{ path: ffmpegDoSistema, origem: 'sistema' }], resourcesPath: undefined, braw: async () => null })
    const gerador = new GeradorPrevias({ detect: async () => motor, tmpRoot: dir, selfCheck: false })
    const jobs = new RelayJobs({ manager: { previas: gerador, driveFor: () => env.drive, records: new Map() }, hub: { send: () => {} }, log: () => {} })
    const site = fakeSite([{ id: 'v1', tipo: 'relay', fileId: original.id, contaGoogleId: 'cg1', nome: 'Master.mov', status: 'pendente', ajustes: { preset: 'whatsapp', pastaId: entregas.id, ref: 'versao-1' } }])
    const w = new PedidosRelay({ cloud: site, relay: () => jobs, pollMs: 60_000, andamentoMs: 0, log: () => {} })
    assert.equal(await w.consultar(), 1)
    await w.close()
    const p = site.fila.get('v1')
    assert.equal(p.status, 'pronto', p.erro ?? '')
    assert.equal(p.saida.nome, 'Master (WhatsApp).mp4')
    assert.equal(p.saida.pastaId, entregas.id)
    const noDrive = env.mock.getItem(p.saida.arquivoId)
    assert.deepEqual(noDrive.parents, [entregas.id], 'na pasta de entregas')
    assert.equal(noDrive.appProperties?.sobedesce, RELAY_MARCA)
    assert.equal(noDrive.appProperties?.pedido, 'v1')
    const baixado = path.join(dir, 'baixado.mp4')
    await fs.writeFile(baixado, env.mock.readContent(p.saida.arquivoId))
    assert.equal(await md5File(baixado), p.saida.md5)
    assert.equal(p.saida.tamanho, (await fs.stat(baixado)).size)
    // o original continua igual, no mesmo lugar
    assert.deepEqual(env.mock.readContent(original.id), conteudo)
    assert.deepEqual(env.mock.getItem(original.id).parents, [projeto.id])
    await sleep(1)
  })
})
