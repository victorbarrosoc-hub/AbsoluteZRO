// O que é do RADION no computador (desktop/radio.cjs): o estado que a página conta, a barra de menus, o selo do Dock,
// os atalhos de falar e o tamanho do modo compacto.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const radio = require('../desktop/radio.cjs')

test('o estado da página é conferido campo a campo', () => {
  assert.deepEqual(radio.limparEstado(null), { diaria: null, canal: null, modo: 'mudo', calado: false, maos: 0, ligado: false })
  const e = radio.limparEstado({ diaria: '  Teste‮ Casa ', canal: 'Câmera', modo: 'ptt', calado: true, maos: 3, ligado: true, extra: 'x' })
  assert.deepEqual(e, { diaria: 'Teste Casa', canal: 'Câmera', modo: 'ptt', calado: true, maos: 3, ligado: true })
  assert.equal(radio.limparEstado({ modo: 'gritando' }).modo, 'mudo')
  assert.equal(radio.limparEstado({ maos: 2.5 }).maos, 0)
  assert.equal(radio.limparEstado({ maos: 500 }).maos, 99)
  assert.equal(radio.limparEstado({ calado: 'sim', ligado: 1 }).calado, false)
  assert.equal(radio.limparEstado({ diaria: 'x'.repeat(200) }).diaria.length, 60)
})

test('barra de menus, dica e selo dizem o que importa', () => {
  const desligado = radio.limparEstado({ diaria: 'Teste' })
  assert.equal(radio.tituloDaBarra(desligado), '')
  assert.equal(radio.dicaDaBandeja(desligado), 'RADION · Teste')
  assert.equal(radio.seloDoDock(desligado), '')
  const ouvindo = radio.limparEstado({ diaria: 'Teste', canal: 'Câmera', ligado: true })
  assert.equal(radio.tituloDaBarra(ouvindo), 'Câmera')
  assert.equal(radio.dicaDaBandeja(ouvindo), 'Teste · falar para Câmera')
  const falando = radio.limparEstado({ diaria: 'Teste', canal: 'Câmera', ligado: true, modo: 'aberto' })
  assert.equal(radio.tituloDaBarra(falando), '● Câmera')
  assert.equal(radio.dicaDaBandeja(falando), 'Teste · falando para Câmera')
  const calado = radio.limparEstado({ diaria: 'Teste', canal: 'Câmera', ligado: true, calado: true, maos: 2 })
  assert.equal(radio.tituloDaBarra(calado), 'Silenciado')
  assert.equal(radio.dicaDaBandeja(calado), 'Teste · silenciado · 2 pediram a palavra')
  assert.equal(radio.seloDoDock(calado), '2')
  assert.equal(radio.seloDoDock(radio.limparEstado({ ligado: true, calado: true })), '•')
})

test('atalhos de falar: em ordem, legíveis no Mac e no Windows', () => {
  assert.equal(radio.ATALHOS[0], 'CommandOrControl+Shift+Space')
  assert.ok(radio.ATALHOS.length >= 2)
  assert.equal(radio.rotuloDoAtalho('CommandOrControl+Shift+Space', true), '⌘⇧Espaço')
  assert.equal(radio.rotuloDoAtalho('CommandOrControl+Shift+Space', false), 'Ctrl+Shift+Espaço')
  assert.equal(radio.rotuloDoAtalho('Alt+Shift+Space', true), '⌥⇧Espaço')
  assert.equal(radio.rotuloDoAtalho(null, true), null)
})

test('modo compacto: pequeno, mas cabe o canal e o botão de falar', () => {
  assert.ok(radio.COMPACTO.width >= radio.COMPACTO.minWidth && radio.COMPACTO.height >= radio.COMPACTO.minHeight)
  assert.ok(radio.COMPACTO.height <= 200 && radio.COMPACTO.width <= 480)
})
