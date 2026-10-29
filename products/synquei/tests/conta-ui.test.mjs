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

test('perfil único: foto da conta Absolute ZRO no avatar; sem foto, as iniciais', () => {
  const FOTO = 'https://absolutezro.com/api/v1/foto/3f1c2a9e-0000-4000-8000-000000000001'
  lerEu(200, { ok: true, acesso: true, pessoa: { ...LIA, foto: FOTO } })
  for (const html of [linhaConta(), cartaoConta()]) {
    assert.ok(html.includes(`<img src="${FOTO}"`), 'a foto da conta')
    assert.match(html, /class="conta-av com-foto"[^>]*>LP</, 'iniciais por baixo, se a foto falhar')
  }
  lerEu(200, { ok: true, acesso: true, pessoa: LIA })
  assert.ok(!linhaConta().includes('<img'))
  assert.match(linhaConta(), /class="conta-av"[^>]*>LP</)
  // foto que não é https não vira <img>
  lerEu(200, { ok: true, acesso: true, pessoa: { ...LIA, foto: 'javascript:alert(1)' } })
  assert.ok(!cartaoConta().includes('<img'))
})

test('perfil único: nome, e-mail e foto se editam na conta Absolute ZRO, fora do app', () => {
  lerEu(200, { ok: true, acesso: true, pessoa: { ...LIA, conta: 'https://absolutezro.com/perfil' } })
  const card = cartaoConta()
  assert.match(card, /<a class="btn btn-secondary btn-sm" href="https:\/\/absolutezro\.com\/perfil" target="_blank" rel="noopener">.*Editar na conta Absolute ZRO<\/a>/)
  assert.ok(!/<input/.test(card), 'nenhum campo de nome, e-mail ou foto no Synquei')
  // sem zro_conta (sessão antiga) ou endereço estranho: o Perfil da Absolute ZRO
  lerEu(200, { ok: true, acesso: false, pessoa: { ...LIA, conta: 'javascript:alert(1)' } })
  assert.ok(cartaoConta().includes('href="https://absolutezro.com/perfil" target="_blank"'))
})
