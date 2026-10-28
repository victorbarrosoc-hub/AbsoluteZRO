// Tela de entrada (decisão do titular, 28/10/2026; app/js/entrada.js): a Z continua a primeira aba, mas aberto sem rota
// com cartão na fila do Organizar (ou sincronia rodando) o app vai direto para a tarefa. Rota no endereço e o "Abrir no
// Synquei" do SOBEDESCE são respeitados; depois da janela inicial, nada pula sozinho.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decidirEntrada, semRota, telaDaTarefa, JANELA_MS } from '../app/js/entrada.js'

const ROTAS = ['z', 'inicio', 'midia', 'sincronizar', 'organizar', 'ajustes']
const fila = { atual: null, fila: [{ id: 'c1' }] }
const base = (o = {}) => {
  const idas = []
  const tela = decidirEntrada({ hashInicial: '', hashAgora: '', rotas: ROTAS, estado: {}, inicio: 0, agora: 100, ir: (t) => idas.push(t), ...o })
  return { tela, idas }
}

test('sem rota: endereço vazio ou desconhecido', () => {
  assert.equal(semRota('', ROTAS), true)
  assert.equal(semRota('#/', ROTAS), true)
  assert.equal(semRota('#/qualquer', ROTAS), true)
  assert.equal(semRota('#/midia', ROTAS), false)
})

test('nada em curso: fica na Z', () => {
  assert.deepEqual(base(), { tela: null, idas: [] })
  assert.equal(telaDaTarefa({ sync: { running: false }, org: { atual: null, fila: [] } }), null)
})

test('cartão na fila ou sendo organizado: abre em Organizar; sincronia rodando: em Sincronizar', () => {
  assert.deepEqual(base({ estado: { org: fila } }).idas, ['organizar'])
  assert.deepEqual(base({ estado: { org: { atual: { id: 'c0' }, fila: [] } } }).idas, ['organizar'])
  assert.deepEqual(base({ estado: { sync: { running: true }, org: fila } }).idas, ['sincronizar'])
})

test('rota no endereço, a pessoa já navegou ou passou a janela: não mexe', () => {
  assert.deepEqual(base({ hashInicial: '#/midia', estado: { org: fila } }).idas, [])
  assert.deepEqual(base({ hashAgora: '#/ajustes', estado: { org: fila } }).idas, [])
  assert.deepEqual(base({ agora: JANELA_MS + 1, estado: { org: fila } }).idas, [])
})

test('o app decide depois que o Organizar contou o pendente; a Z segue a primeira aba', () => {
  const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8')
  assert.match(main, /iniciarOrganizar\(\)[\s\S]{0,200}\.then\(\(\) =>\s*decidirEntrada\(/)
  assert.match(main, /const ORDER = \['z', 'inicio'/)
  assert.match(main, /onAbrir\?\.\(\(\) => go\('organizar', true\)\)/)
})
