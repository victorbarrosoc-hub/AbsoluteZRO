// Ronda única dos pedidos (src/engine/ronda-pedidos.js): uma pergunta para todos os tipos, recuo de 30 s até 5 min
// quando não aparece nada, volta a 30 s com pedido ou quando a pessoa mexe no app (CPU da Vercel, 09/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpError } from '../src/net/http.js'
import { RondaPedidos, proximoIntervalo, RONDA_PADRAO } from '../src/engine/ronda-pedidos.js'
import { PedidosFrames } from '../src/engine/pedidos-frames.js'

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

function nuvem(respostas) {
  const pedidos = []
  return {
    signedIn: true,
    pedidos,
    async request(method, path) {
      pedidos.push(`${method} ${path}`)
      const r = respostas.shift()
      if (r instanceof Error) throw r
      return { data: { pedidos: r || [] } }
    },
  }
}

test('recuo: 30 s, 1, 2, 4 e no máximo 5 min sem pedido; com pedido volta a 30 s', () => {
  const seq = []
  let t = RONDA_PADRAO.minMs
  for (let i = 0; i < 6; i++) seq.push((t = proximoIntervalo(t, false)))
  assert.deepEqual(seq, [60_000, 120_000, 240_000, 300_000, 300_000, 300_000])
  assert.equal(proximoIntervalo(300_000, true), 30_000)
  // por hora, parado: 12 perguntas (antes, 4 tipos × 2–3 por minuto = ~540)
  assert.equal(Math.round(3_600_000 / RONDA_PADRAO.maxMs), 12)
})

test('uma pergunta só (tipo=todos) e cada tipo recebe só os pedidos dele', async () => {
  const cloud = nuvem([
    [
      { id: 'a', tipo: 'proxy', status: 'pendente' },
      { id: 'b', tipo: 'frames', status: 'pendente' },
      { id: 'c', tipo: 'relay', status: 'pendente' },
      { id: 'd', status: 'pendente' }, // sem tipo: proxy (pedido antigo)
      { id: 'e', tipo: 'frames', status: 'gerando' }, // já com outro computador
    ],
  ])
  const ronda = new RondaPedidos({ cloud, log: () => {} })
  const recebidos = {}
  for (const tipo of ['proxy', 'frames', 'formato', 'relay']) ronda.ouvir({ tipo, consultar: (l) => (recebidos[tipo] = l.map((p) => p.id)) })
  await ronda.rodar()
  ronda.close()
  assert.deepEqual(cloud.pedidos, ['GET /api/proxies/pedidos?status=pendente&tipo=todos'])
  assert.deepEqual(recebidos, { proxy: ['a', 'd'], frames: ['b'], relay: ['c'] })
  assert.equal(ronda.intervalo, RONDA_PADRAO.minMs)
})

test('parado o intervalo cresce; mexer no app (acordar) volta ao curto e pergunta logo', async () => {
  const cloud = nuvem([[], [], [], []])
  let agora = 0
  const ronda = new RondaPedidos({ cloud, log: () => {}, now: () => agora })
  ronda.ouvir({ tipo: 'proxy', consultar: () => {} })
  await ronda.rodar()
  assert.equal(ronda.intervalo, 60_000)
  await ronda.rodar()
  assert.equal(ronda.intervalo, 120_000)
  ronda.acordar(5)
  assert.equal(ronda.intervalo, RONDA_PADRAO.minMs)
  await espera(40)
  assert.equal(cloud.pedidos.length, 3, 'acordar pergunta logo')
  ronda.close()
})

test('site sem a rota ou recusando: para por 30 min, sem martelar', async () => {
  const cloud = nuvem([new HttpError(404, {})])
  let agora = 1_000
  const ronda = new RondaPedidos({ cloud, log: () => {}, now: () => agora })
  ronda.ouvir({ tipo: 'proxy', consultar: () => assert.fail('não devia entregar nada') })
  await ronda.rodar()
  await ronda.rodar()
  assert.equal(cloud.pedidos.length, 1)
  agora += RONDA_PADRAO.semSiteMs + 1
  cloud.request = async (m, p) => (cloud.pedidos.push(`${m} ${p}`), { data: { pedidos: [] } })
  await ronda.rodar()
  assert.equal(cloud.pedidos.length, 2)
  ronda.close()
})

test('volta que acaba na hora (sem conta) não prende a ronda', async () => {
  const cloud = nuvem([[]])
  cloud.signedIn = false
  const ronda = new RondaPedidos({ cloud, log: () => {} })
  ronda.ouvir({ tipo: 'proxy', consultar: () => {} })
  await ronda.rodar()
  assert.equal(ronda.rodando, null)
  cloud.signedIn = true
  await ronda.rodar()
  assert.equal(cloud.pedidos.length, 1, 'depois de entrar na conta, volta a perguntar')
  ronda.close()
})

test('com a ronda, o tipo não pergunta sozinho: usa a lista que ela trouxe', async () => {
  const cloud = nuvem([])
  const ronda = new RondaPedidos({ cloud, log: () => {} })
  const pf = new PedidosFrames({ cloud, frames: () => null, ronda, log: () => {} })
  pf.start()
  assert.deepEqual(ronda.ouvintes, [pf])
  assert.equal(pf.timer, null, 'sem relógio próprio')
  await pf.consultar([{ id: 'x', tipo: 'frames', status: 'pendente' }])
  assert.deepEqual(cloud.pedidos, [], 'não fez GET sozinho')
  await pf.close()
  ronda.close()
})
