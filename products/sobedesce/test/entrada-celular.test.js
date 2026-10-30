// Entrada do app do celular (decisão do titular, 29/10/2026; Plano de Integração §7–8: a tarefa principal vem primeiro).
// Sem link, o app abre no Início (enviar, a fila e o cartão do computador transferindo). A Z não é aba da barra de baixo
// nem abre sozinha: fica no anel discreto do topo (ZBotao) e em /app/#z. Os links com # continuam abrindo a aba deles.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (p) => fs.readFileSync(new URL(`../web/public/app/${p}`, import.meta.url), 'utf8')

test('a aba inicial é o Início; a Z só por #z', () => {
  const state = ler('lib/state.js')
  assert.match(state, /\n {2}tab: 'send',/)
  const saved = /export function savedTab\(\) \{([\s\S]*?)\n\}/.exec(state)[1]
  assert.match(saved, /location\.hash === '#z'\) return 'z'/)
  assert.match(saved.trim(), /return 'send'$/)
  const app = ler('app.js')
  assert.match(app, /setState\(\{ tab: savedTab\(\)/)
  assert.match(app, /location\.hash === '#z'\) setState\(\{ tab: 'z' \}\)/)
  assert.doesNotMatch(app, /vigiarEntrada/, 'nada leva à Z sozinho')
})

test('a barra de baixo não tem a Z; o Início é o primeiro', () => {
  const tabs = ler('components/tabs.js')
  const barra = /function TabBar[\s\S]*?<\/nav>`/.exec(tabs)[0]
  assert.doesNotMatch(barra, /setTab\('z'\)/)
  assert.ok(barra.indexOf("setTab('send')") < barra.indexOf("setTab('drive')"))
  // a tela da Z só monta quando a pessoa toca no anel ou chega por #z (nada dela carrega ao abrir)
  assert.match(tabs, /\$\{seen\.current\.z \? html`<div class="tab-pane" hidden=\$\{tab !== 'z'\}><\$\{ZScreen\}/)
  assert.doesNotMatch(tabs, /\n\s*<div class="tab-pane" hidden=\$\{tab !== 'z'\}><\$\{ZScreen\}/)
})

test('a Z fica no anel discreto do topo, ao lado da conta', () => {
  const main = ler('components/main.js')
  assert.match(main, /export function ZBotao\(\)[\s\S]*?onClick=\$\{\(\) => setTab\('z'\)\}/)
  assert.match(main, /function TopoAcoes[\s\S]*?<\$\{ZBotao\} \/>/)
  assert.equal((main.match(/<\$\{TopoAcoes\} user=\$\{user\} \/>/g) || []).length, 2, 'Início e as abas sem barra própria')
})
