// Tela de entrada (decisão do titular, 28/10/2026): a Z continua a primeira aba, mas o app abre na tarefa quando há
// algo em andamento (public/lib/entrada.js). Rota explícita no endereço é respeitada (public/app.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { telaDeEntrada, cartaoEmAndamento, transferenciaEmAndamento } from '../public/lib/entrada.js'

const mapa = (...status) => new Map(status.map((s, i) => [`t${i}`, { status: s }]))

test('sem nada em andamento: entra na Z', () => {
  assert.equal(telaDeEntrada({}), 'z')
  assert.equal(telaDeEntrada({ transfers: mapa('completed', 'failed', 'paused', 'canceled'), backup: { fila: [], pedidos: [], job: null } }), 'z')
})

test('transferência andando (baixando, na fila, conferindo, esperando): entra em Transferências', () => {
  for (const s of ['running', 'queued', 'verifying', 'waiting']) assert.equal(telaDeEntrada({ transfers: mapa('completed', s) }), 'transferencias', s)
  assert.equal(transferenciaEmAndamento([{ status: 'running' }]), true)
})

test('cartão copiando, na fila ou esperando o dono: entra em Cartões (antes das transferências)', () => {
  assert.equal(telaDeEntrada({ transfers: mapa('running'), backup: { job: { nome: 'A001' }, fila: [], pedidos: [] } }), 'cartoes')
  assert.equal(cartaoEmAndamento({ fila: [{ nome: 'B' }] }), true)
  assert.equal(cartaoEmAndamento({ pedidos: [{ id: 'p' }] }), true)
  assert.equal(cartaoEmAndamento(null), false)
})

test('a Z continua a primeira aba e o app só escolhe a entrada sem rota no endereço', async () => {
  const router = await fs.readFile(new URL('../public/lib/router.js', import.meta.url), 'utf8')
  assert.match(router, /ROUTES = \['z',/)
  assert.match(router, /const padrao = !ROUTES\.includes\(parts\[0\]\)/)
  const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  assert.match(app, /rotaLida\.padrao && !entrada\.current\) entrada\.current = telaDeEntrada/)
})
