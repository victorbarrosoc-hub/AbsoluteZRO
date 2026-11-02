// Wi-Fi celular ↔ computador descontinuado (titular, 02/11/2026): as rotas /api/p2p/* respondem 503 na hora. Aqui, os
// laços dos apps antigos (test/fixtures/p2p-antigo.js) contra essa resposta: os dois recuam (computador até 60 s,
// celular até 30 s), ninguém sai da conta e não há laço apertado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lacoCelularAntigo, lacoComputadorAntigo } from './fixtures/p2p-antigo.js'

// A resposta das rotas descontinuadas (web/src/lib/p2p/descontinuado.ts).
const resposta503 = () =>
  new Response(JSON.stringify({ erro: 'p2p_descontinuado', mensagem: 'x', proxima_em: 120_000 }), { status: 503, headers: { 'retry-after': '120' } })

test('computador antigo: 503 vira recuo de 2 s a 60 s, sem sair da conta', async () => {
  let pedidos = 0
  const pausas = []
  const cloud = {
    async request() {
      pedidos++
      const r = resposta503()
      throw Object.assign(new Error(`HTTP ${r.status}`), { name: 'HttpError', status: r.status, body: await r.json() })
    },
  }
  const fim = await lacoComputadorAntigo({ cloud, rodando: () => pedidos < 10, sleep: async (ms) => pausas.push(ms) })
  assert.equal(fim, 'parou', 'não sai da conta (503 não é 401)')
  assert.deepEqual(pausas.slice(0, 6), [2_000, 4_000, 8_000, 16_000, 32_000, 60_000])
  assert.ok(pausas.slice(5).every((ms) => ms === 60_000), 'depois, uma pergunta por minuto')
})

test('celular antigo: 503 vira recuo até 30 s, sem desligar o app', async () => {
  let pedidos = 0
  const pausas = []
  const fim = await lacoCelularAntigo({
    fetch: async () => (pedidos++, resposta503()),
    ativo: () => pedidos < 10,
    dormir: async (ms) => pausas.push(ms),
  })
  assert.equal(fim, 'parou')
  assert.deepEqual(pausas.slice(0, 5), [2_000, 4_000, 8_000, 16_000, 30_000])
  assert.ok(pausas.slice(4).every((ms) => ms === 30_000), 'depois, uma pergunta a cada 30 s (só com a tela à vista)')
})
