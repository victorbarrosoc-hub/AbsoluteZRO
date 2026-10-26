// Parte de conta do app (app/js/conta.js): sem login aparecem "Entrar com Absolute ZRO" e "Criar conta" (prompt=create);
// conta sem o Synquei em zro_products mostra o aviso e "Ver na Absolute ZRO"; conta liberada mostra a organização.
// No desktop/offline (sem função) nada aparece. Só gera HTML: roda no Node, sem navegador.

import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.location = { pathname: '/app/', hash: '#/ajustes', search: '', protocol: 'https:' }
const { C, cartaoConta, lerEu, linhaConta } = await import('../app/js/conta.js')

const LIA = { nome: 'Lia Produtora', email: 'lia@produtora.com', organizacao: { nome: 'Produtora Lia', papel: 'owner' }, produtos: ['synquei'] }

beforeEach(() => lerEu(0, null))

test('sem login neste lugar (desktop, offline): nada de conta', () => {
  assert.equal(C.estado, 'sem')
  assert.equal(linhaConta(), '')
  assert.equal(cartaoConta(), '')
})

test('sem sessão: Entrar com Absolute ZRO e Criar conta (prompt=create)', () => {
  lerEu(401, { ok: false, configurado: true })
  for (const html of [linhaConta(), cartaoConta()]) {
    assert.match(html, /Entrar com Absolute ZRO/)
    assert.match(html, /Criar conta/)
    assert.ok(html.includes('href="/api/zro/entrar?volta=%2Fapp%2F%23%2Fajustes"'))
    assert.ok(html.includes('href="/api/zro/entrar?volta=%2Fapp%2F%23%2Fajustes&amp;criar=1"'))
    assert.ok(!/senha|Google/i.test(html), 'sem cadastro próprio')
  }
})

test('Synquei fora de zro_products: aviso curto e Ver na Absolute ZRO', () => {
  lerEu(200, { ok: true, acesso: false, pessoa: { ...LIA, produtos: ['sobedesce'] } })
  assert.equal(C.acesso, false)
  const card = cartaoConta()
  assert.match(card, /Sua conta Absolute ZRO ainda não tem acesso ao Synquei\./)
  assert.ok(card.includes('href="https://absolutezro.com/ferramentas"'))
  assert.match(card, />Ver na Absolute ZRO</)
  assert.match(card, /data-act="conta-sair"/, 'dá para sair e trocar de conta')
  assert.ok(!card.includes('Produtora Lia'), 'a parte de conta fica bloqueada')
  assert.match(linhaConta(), /Sem acesso ao Synquei/)
})

test('acesso ausente na resposta conta como bloqueado', () => {
  lerEu(200, { ok: true, pessoa: LIA })
  assert.equal(C.acesso, false)
})

test('Synquei liberado: mostra a pessoa e a organização', () => {
  lerEu(200, { ok: true, acesso: true, pessoa: LIA })
  const card = cartaoConta()
  assert.ok(!card.includes('ainda não tem acesso'))
  assert.match(card, /Produtora Lia/)
  assert.match(linhaConta(), /Produtora Lia/)
  assert.ok(!linhaConta().includes('Sem acesso'))
})
