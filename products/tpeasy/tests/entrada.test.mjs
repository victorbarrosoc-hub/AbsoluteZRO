// Aba de entrada (decisão do titular, 29/10/2026; app/js/entrada.js): link com # abre a aba dele, tarefa em curso a
// seguir, e sem nada disso o app abre em Roteiros, a tarefa do TPeasy. A Z nunca é a entrada nem aba da barra.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { abaDeEntrada, INICIO } from '../app/js/entrada.js'

const ABAS = ['roteiros', 'tp', 'ajustes', 'z']

test('sem link e sem tarefa: Roteiros, nunca a Z', () => {
  assert.equal(INICIO, 'roteiros')
  assert.equal(abaDeEntrada('', ABAS), 'roteiros')
  assert.equal(abaDeEntrada('#qualquer', ABAS), 'roteiros')
})

test('link com # abre a aba dele, mesmo com tarefa em curso (inclusive #z, o link direto da Z)', () => {
  for (const a of ['roteiros', 'tp', 'ajustes', 'z']) assert.equal(abaDeEntrada(`#${a}`, ABAS, { emCurso: 'tp' }), a)
})

test('tarefa em curso ganha de Roteiros; aba desconhecida não', () => {
  assert.equal(abaDeEntrada('', ABAS, { emCurso: 'tp' }), 'tp')
  assert.equal(abaDeEntrada('', ABAS, { emCurso: 'outra' }), 'roteiros')
})

test('a barra de baixo não tem a Z; o anel discreto no topo de Roteiros leva a ela', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../app/js/ui.js', import.meta.url), 'utf8')
  const barra = /<nav class="tabbar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1]
  assert.match(barra.trim(), /^<button class="tab" data-go="roteiros">/)
  assert.doesNotMatch(barra, /data-go="z"/)
  const roteiros = /data-tab="roteiros"[\s\S]*?<\/header>/.exec(html)[0]
  assert.match(roteiros, /class="icon-btn z-atalho" data-go="z"/)
  assert.match(ui, /TABS = \["roteiros", "tp", "ajustes", "z"\]/)
  assert.match(ui, /if \(!TABS\.includes\(tab\)\) tab = "roteiros"/)
})
