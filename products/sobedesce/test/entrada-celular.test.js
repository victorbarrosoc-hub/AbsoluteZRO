// Aba de entrada do app do celular (decisão do titular, 28/10/2026; web/public/app/lib/entrada.js): abre na Z, mas se
// logo ao abrir um computador estiver transferindo, vai para Início (o cartão do andamento). Uma vez, nos primeiros
// segundos e só se a pessoa ainda não mexeu; link com # é respeitado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { computadorTransferindo, vigiarEntrada, JANELA_MS } from '../web/public/app/lib/entrada.js'

/** Estado de mentira no mesmo molde de lib/state.js. */
function loja(inicial) {
  let s = { tab: 'z', sheet: null, pc: { status: 'idle', computadores: [] }, ...inicial }
  const ouvintes = new Set()
  return {
    getState: () => s,
    setState: (p) => {
      s = { ...s, ...p }
      for (const fn of [...ouvintes]) fn(s)
    },
    subscribe: (fn) => {
      ouvintes.add(fn)
      return () => ouvintes.delete(fn)
    },
    ouvintes,
  }
}
const andando = { status: 'ok', computadores: [{ online: true, snapshot: { estado: 'baixando' } }] }
const parado = { status: 'ok', computadores: [{ online: true, snapshot: { estado: 'concluido' } }, { online: false, snapshot: { estado: 'enviando' } }] }

test('computador ligado enviando ou baixando conta; desligado ou concluído não', () => {
  assert.equal(computadorTransferindo(andando), true)
  assert.equal(computadorTransferindo(parado), false)
  assert.equal(computadorTransferindo(null), false)
})

test('abre na Z e vai para Início quando o retrato chega com transferência andando', () => {
  const l = loja()
  vigiarEntrada(l)
  assert.equal(l.getState().tab, 'z')
  l.setState({ pc: andando })
  assert.equal(l.getState().tab, 'send')
  assert.equal(l.ouvintes.size, 0, 'para de vigiar')
})

test('sem tarefa em curso fica na Z', () => {
  const l = loja()
  vigiarEntrada(l)
  l.setState({ pc: parado })
  assert.equal(l.getState().tab, 'z')
  // Depois, mesmo que algo comece a andar, a tela não pula sozinha.
  l.setState({ pc: andando })
  assert.equal(l.getState().tab, 'z')
})

test('a pessoa mexeu, abriu uma folha ou o retrato chegou tarde: não troca', () => {
  const mexeu = loja()
  vigiarEntrada(mexeu)
  mexeu.setState({ tab: 'drive' })
  mexeu.setState({ pc: andando })
  assert.equal(mexeu.getState().tab, 'drive')

  const folha = loja()
  vigiarEntrada(folha)
  folha.setState({ sheet: { name: 'refSave' } })
  folha.setState({ pc: andando })
  assert.equal(folha.getState().tab, 'z')

  let t = 0
  const tarde = loja()
  vigiarEntrada({ ...tarde, agora: () => t })
  t = JANELA_MS + 1
  tarde.setState({ pc: andando })
  assert.equal(tarde.getState().tab, 'z')
})

test('link com # (outra aba já escolhida) é respeitado', () => {
  const l = loja({ tab: 'refs' })
  vigiarEntrada(l)
  l.setState({ pc: andando })
  assert.equal(l.getState().tab, 'refs')
  assert.equal(l.ouvintes.size, 0)
})

test('o app liga a vigia logo depois de escolher a aba inicial; a Z segue a primeira aba', () => {
  const app = fs.readFileSync(new URL('../web/public/app/app.js', import.meta.url), 'utf8')
  assert.match(app, /setState\(\{ tab: savedTab\(\)[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*vigiarEntrada\(\{ getState, setState, subscribe \}\)/)
  const tabs = fs.readFileSync(new URL('../web/public/app/components/tabs.js', import.meta.url), 'utf8')
  assert.ok(tabs.indexOf("setTab('z')") < tabs.indexOf("setTab('send')") || !tabs.includes("setTab('send')"))
})
