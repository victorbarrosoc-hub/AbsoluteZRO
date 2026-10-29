// Aviso de atualização na barra lateral (app/js/atualizacao.js): enquanto baixa, o progresso chega a cada 250 ms.
// O cartão tem de ser o mesmo do começo ao fim (antes ele era recriado a cada evento, a entrada recomeçava e o aviso
// piscava); só o texto e a largura da barra mudam. Roda no Node com um cartão de mentira, sem navegador.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCartao } from '../app/js/atualizacao.js'

/** Caixa falsa: conta as trocas de HTML e devolve sempre os mesmos nós para a barra e o texto. */
function caixa() {
  const span = { style: { width: '' } }
  const attrs = {}
  const barra = { querySelector: () => span, setAttribute: (k, v) => (attrs[k] = v) }
  const texto = { textContent: '' }
  let html = ''
  const box = {
    dataset: {},
    trocas: 0,
    span,
    attrs,
    texto,
    get innerHTML() {
      return html
    },
    set innerHTML(v) {
      html = v
      box.trocas++
      span.style.width = (/style="width:([^"]+)"/.exec(v) || [])[1] || ''
      texto.textContent = (/<div class="atu-prog"[^>]*>.*?<\/div><p>([^<]*)<\/p>/.exec(v) || [])[1] || ''
    },
    querySelector: (s) => (!html.includes('atu-prog') ? null : s === '.atu-barra' ? barra : s === '.atu-prog p' ? texto : null),
  }
  return box
}

const base = { atual: { build: 10 }, ultima: { build: 11 }, nova: 11, podeAtualizar: true, plataforma: 'mac', aplicar: false, fase: 'baixando', total: 200e6, recebido: 0 }

test('baixando: o cartão é criado uma vez e só a barra e o texto mudam', () => {
  const box = caixa()
  assert.equal(aplicarCartao(box, base), 'novo')
  for (let i = 1; i <= 40; i++) assert.equal(aplicarCartao(box, { ...base, recebido: i * 5e6 }), 'progresso')
  assert.equal(box.trocas, 1, 'o HTML do cartão não é trocado a cada evento de progresso')
  assert.equal(box.span.style.width, '100.0%')
  assert.equal(box.attrs['aria-valuenow'], '100')
  assert.match(box.texto.textContent, /^Baixando… 100%/)
})

test('conferindo e preparando seguem no mesmo cartão; pronto troca para o botão', () => {
  const box = caixa()
  aplicarCartao(box, { ...base, recebido: 100e6 })
  assert.equal(aplicarCartao(box, { ...base, recebido: 200e6, fase: 'conferindo' }), 'progresso')
  assert.equal(aplicarCartao(box, { ...base, recebido: 200e6, fase: 'preparando' }), 'progresso')
  assert.equal(box.texto.textContent, 'Preparando a troca…')
  assert.equal(box.trocas, 1)
  assert.equal(aplicarCartao(box, { ...base, fase: 'pronto' }), 'novo')
  assert.match(box.innerHTML, /data-act="atu-agora">Atualizar agora/)
  assert.equal(box.trocas, 2)
})

test('sem tamanho conhecido: barra indeterminada, também sem recriar o cartão', () => {
  const box = caixa()
  const semTotal = { ...base, total: 0 }
  aplicarCartao(box, semTotal)
  for (let i = 1; i <= 10; i++) aplicarCartao(box, { ...semTotal, recebido: i * 1e6 })
  assert.equal(box.trocas, 1)
  assert.match(box.innerHTML, /is-indef/)
  assert.equal(box.texto.textContent, 'Baixando a versão nova… 10,0 MB')
})
