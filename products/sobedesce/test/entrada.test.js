// Tela de entrada (decisão do titular, 29/10/2026; Plano de Integração §7–8): a tarefa principal vem primeiro. Sem rota
// no endereço o app abre na tarefa em curso, senão no Início; a Z nunca é a entrada nem a primeira da barra: fica
// discreta no pé da barra lateral (public/lib/entrada.js, public/components/sidebar.js). Rota explícita é respeitada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { telaDeEntrada, cartaoEmAndamento, transferenciaEmAndamento, INICIO } from '../public/lib/entrada.js'

const mapa = (...status) => new Map(status.map((s, i) => [`t${i}`, { status: s }]))

test('sem nada em andamento: entra no Início, nunca na Z', () => {
  assert.equal(INICIO, 'painel')
  assert.equal(telaDeEntrada({}), 'painel')
  assert.equal(telaDeEntrada({ transfers: mapa('completed', 'failed', 'paused', 'canceled'), backup: { fila: [], pedidos: [], job: null } }), 'painel')
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

test('endereço sem rota cai no Início; #/z continua abrindo a Z (link direto)', async () => {
  const router = await fs.readFile(new URL('../public/lib/router.js', import.meta.url), 'utf8')
  assert.match(router, /ROUTES = \['painel',/)
  assert.match(router, /'z', 'inicio'\]/, '#/z segue sendo rota')
  assert.match(router, /const name = padrao \? 'painel' : parts\[0\]/)
  const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  assert.match(app, /rotaLida\.padrao && !entrada\.current\) entrada\.current = telaDeEntrada/)
})

test('a Z não é a primeira da barra: fica no pé, depois dos Ajustes', async () => {
  const lado = await fs.readFile(new URL('../public/components/sidebar.js', import.meta.url), 'utf8')
  const nav = /const NAV = \[([\s\S]*?)\n\]/.exec(lado)[1]
  const baixo = /const NAV_BAIXO = \[([\s\S]*?)\n\]/.exec(lado)[1]
  assert.match(nav.trim(), /^\{ id: 'painel'/)
  assert.doesNotMatch(nav, /id: 'z'/)
  assert.match(baixo, /id: 'ajustes'[\s\S]*id: 'z'/)
})
