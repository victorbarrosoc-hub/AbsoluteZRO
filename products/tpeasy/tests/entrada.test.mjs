// Aba de entrada (decisão do titular, 28/10/2026; app/js/entrada.js): link com # abre a aba dele, tarefa em curso ganha
// da Z, e sem nada disso o app abre na Z, que segue a primeira aba.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abaDeEntrada } from '../app/js/entrada.js'

const ABAS = ['z', 'roteiros', 'tp', 'ajustes']

test('sem link e sem tarefa: a Z', () => {
  assert.equal(abaDeEntrada('', ABAS), 'z')
  assert.equal(abaDeEntrada('#qualquer', ABAS), 'z')
})

test('link com # abre a aba dele, mesmo com tarefa em curso', () => {
  for (const a of ['roteiros', 'tp', 'ajustes']) assert.equal(abaDeEntrada(`#${a}`, ABAS, { emCurso: 'tp' }), a)
})

test('tarefa em curso ganha da Z; aba desconhecida não', () => {
  assert.equal(abaDeEntrada('', ABAS, { emCurso: 'tp' }), 'tp')
  assert.equal(abaDeEntrada('', ABAS, { emCurso: 'outra' }), 'z')
})
