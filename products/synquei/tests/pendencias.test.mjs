// Balões da barra lateral (app/js/pendencias.js): só conta o que espera uma ação da pessoa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pendencias, numeroBalao, rotuloBalao } from '../app/js/pendencias.js'

const clipe = (id, extra = {}) => ({ id, status: 'ready', ...extra })
const base = (project, extra = {}) => ({ project, probe: { active: false }, sync: { running: false, error: null }, temMidia: (c) => !!c.ligado, ...extra })

test('sem projeto e sem desktop: nenhum balão', () => {
  assert.deepEqual(pendencias(base(null)), {})
})

test('projeto novo: mídia a religar e falta sincronizar', () => {
  const p = { clips: [clipe('a', { ligado: true }), clipe('b'), clipe('c'), { id: 'd', status: 'error' }], result: null }
  const r = pendencias(base(p))
  assert.equal(r.midia.n, 2)
  assert.match(r.midia.t, /2 clipes sem mídia/)
  assert.deepEqual(r.sincronizar, { n: 1, t: 'Falta sincronizar' })
  assert.equal(r.linha, undefined)
})

test('sem nenhum arquivo ligado não pede sincronizar (não daria), só religar', () => {
  const r = pendencias(base({ clips: [clipe('a')], result: null }))
  assert.equal(r.midia.n, 1)
  assert.equal(r.sincronizar, undefined)
})

test('lendo ou sincronizando: nada (o app está trabalhando, não a pessoa)', () => {
  const p = { clips: [clipe('a', { ligado: true }), clipe('b')], result: null }
  assert.deepEqual(pendencias(base(p, { probe: { active: true } })), {})
  assert.deepEqual(pendencias(base(p, { sync: { running: true, error: null } })), {})
})

test('sincronia que falhou pede nova tentativa', () => {
  const p = { clips: [clipe('a', { ligado: true })], result: null }
  assert.match(pendencias(base(p, { sync: { running: false, error: 'boom' } })).sincronizar.t, /falhou/)
})

test('sincronizado: só os clipes em laranja ainda não ajustados à mão', () => {
  const p = {
    clips: [
      clipe('a', { sync: { conf: 0.9, method: 'audio' } }),
      clipe('b', { sync: { conf: 0.3, method: 'audio' } }),
      clipe('c', { sync: { conf: 0.2, method: 'manual:audio' } }),
      clipe('d', { sync: { conf: 0.1, method: 'date' } }),
      clipe('e'),
    ],
    result: { stats: {} },
  }
  const r = pendencias(base(p))
  assert.equal(r.midia, undefined, 'sincronizado, a exportação funciona sem a mídia')
  assert.equal(r.sincronizar, undefined)
  assert.equal(r.linha.n, 2)
})

test('projeto de exemplo não ganha balão', () => {
  assert.deepEqual(pendencias(base({ demo: true, clips: [clipe('a')], result: null })), {})
})

test('Organizar: cartões esperando a pessoa fechar o projeto e DaVinci esperando projeto', () => {
  const org = { esperando: true, fila: [{}, {}, {}], davinci: { esperando: 'Show' } }
  const r = pendencias(base(null, { org }))
  assert.equal(r.organizar.n, 4)
  assert.match(r.organizar.t, /^3 cartões esperando/)
  assert.match(r.organizar.t, /DaVinci espera o projeto Show/)
  assert.equal(pendencias(base(null, { org: { esperando: false, fila: [{}], davinci: null } })).organizar, undefined, 'fila andando sozinha não é pendência')
})

test('Ajustes: atualização disponível (pela Absolute ZRO)', () => {
  const r = pendencias(base(null, { atualizacao: { nova: true } }))
  assert.equal(r.ajustes.n, 1)
  assert.equal(r.ajustes.t, 'Atualização disponível')
  assert.equal(pendencias(base(null, { atualizacao: { nova: false } })).ajustes, undefined)
})

test('número e rótulo do balão', () => {
  assert.equal(numeroBalao(7), '7')
  assert.equal(numeroBalao(99), '99')
  assert.equal(numeroBalao(100), '99+')
  assert.equal(rotuloBalao(1), '1 pendência')
  assert.equal(rotuloBalao(3), '3 pendências')
})
