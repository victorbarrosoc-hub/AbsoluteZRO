import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { semana, novas, pendentes, aviso, pedidoDoDia, Pulso } = createRequire(import.meta.url)('../desktop/pulso.cjs')

const HOJE = new Date(2026, 10, 2) // 02/11/2026, segunda

test('a semana: sete dias a partir de hoje, livre quando não há declaração, meia diária marcada', () => {
  const s = semana({ '2026-11-02': { e: 'fechado', p: 'dia' }, '2026-11-04': { e: 'negociando', p: 'manha' }, '2026-11-05': { e: 'outro' } }, HOJE)
  assert.equal(s.length, 7)
  assert.deepEqual(s.map((d) => d.estado), ['fechado', 'livre', 'negociando', 'livre', 'livre', 'livre', 'livre'])
  assert.equal(s[0].rotulo, 'Hoje')
  assert.equal(s[1].rotulo, 'Amanhã')
  assert.equal(s[2].rotulo, 'qua 04/11')
  assert.equal(s[2].meia, true)
})

test('propostas: só as pendentes e ainda não vistas avisam; o número conta as pendentes', () => {
  const r = [{ id: 'a', estado: 'pendente' }, { id: 'b', estado: 'aceita' }, { id: 'c', estado: 'pendente' }]
  assert.deepEqual(novas(r, new Set(['a'])).map((p) => p.id), ['c'])
  assert.equal(pendentes(r), 2)
  const t = aviso({ de_nome: 'Ana Produtora', funcao: 'Op. de câmera', dia: '2026-11-07', ini: '08:00', fim: '18:00', local: 'Natal' })
  assert.equal(t.titulo, 'Proposta nova no Carro')
  assert.equal(t.corpo, 'Ana Produtora — Op. de câmera · 07/11 · 08:00–18:00 · Natal')
})

test('marcar o dia usa as rotas do site: PUT para negociando e fechado, DELETE para livre', () => {
  assert.deepEqual(pedidoDoDia('2026-11-07', 'livre'), { metodo: 'DELETE', caminho: '/api/zro/agenda?dia=2026-11-07' })
  assert.deepEqual(pedidoDoDia('2026-11-07', 'fechado').corpo, { dia: '2026-11-07', estado: 'fechado', parte: 'dia', hora: null })
  assert.throws(() => pedidoDoDia('07/11', 'fechado'))
  assert.throws(() => pedidoDoDia('2026-11-07', 'talvez'))
})

test('o pulso: a primeira leitura só aprende; a seguinte avisa a proposta nova; sem login, nada', async () => {
  let recebidas = [{ id: 'a', estado: 'pendente', de_nome: 'X' }]
  let logado = true
  const avisos = []
  const estados = []
  const p = new Pulso({
    agora: () => HOJE,
    buscar: async (m, c) => (!logado ? { status: 401 } : c.startsWith('/api/zro/propostas') ? { status: 200, dados: { recebidas } } : { status: 200, dados: { agenda: { '2026-11-02': { e: 'fechado', p: 'dia' } } } }),
    notificar: (t) => avisos.push(t.corpo),
    aoMudar: (e) => estados.push(e),
  })
  await p.ler()
  assert.deepEqual(avisos, [])
  assert.equal(p.estado.pendentes, 1)
  assert.equal(p.estado.semana[0].estado, 'fechado')
  recebidas = [...recebidas, { id: 'b', estado: 'pendente', de_nome: 'Bia', funcao: 'Editor' }]
  await p.ler()
  assert.deepEqual(avisos, ['Bia — Editor'])
  await p.ler()
  assert.equal(avisos.length, 1, 'não repete')
  logado = false
  await p.ler()
  assert.equal(p.estado.entrou, false)
  assert.equal(p.estado.pendentes, 0)
})
