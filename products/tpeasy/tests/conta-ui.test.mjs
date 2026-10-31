/**
 * Perfil único na tela de Ajustes (app/js/zro.js): foto da conta Absolute ZRO no avatar (sem foto, a inicial) e o
 * "Editar na conta Absolute ZRO" apontando para zro_conta. Só gera HTML: roda no Node, sem navegador.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

globalThis.location = { protocol: 'https:', hostname: 'tpeasy.absolutezro.com', pathname: '/app/', search: '', hash: '#ajustes' }
globalThis.addEventListener = () => {}
const Zro = await import('../app/js/zro.js')

const LIA = { nome: 'Lia Produtora', email: 'lia@produtora.com' }
const FOTO = 'https://absolutezro.com/api/v1/foto/3f1c2a9e-0000-4000-8000-000000000001'

test('com foto: a foto da conta por cima da inicial', () => {
  const html = Zro.avatarHtml({ ...LIA, foto: FOTO })
  assert.ok(html.includes(`<img src="${FOTO}"`))
  assert.match(html, /class="avatar is-on com-foto">L</)
})

test('sem foto (ou foto que não é https): só a inicial', () => {
  assert.equal(Zro.avatarHtml(LIA), '<span class="avatar is-on">L</span>')
  assert.ok(!Zro.avatarHtml({ ...LIA, foto: 'javascript:alert(1)' }).includes('<img'))
  assert.ok(!Zro.avatarHtml({ ...LIA, foto: 'https://x" onerror="y' }).includes('<img'))
})

test('editar vai para zro_conta; sem ele (sessão antiga) ou estranho, para o Perfil da Absolute ZRO', () => {
  assert.equal(Zro.linkConta({ conta: 'https://absolutezro.com/perfil' }), 'https://absolutezro.com/perfil')
  assert.equal(Zro.linkConta({}), 'https://absolutezro.com/perfil')
  assert.equal(Zro.linkConta({ conta: 'javascript:alert(1)' }), 'https://absolutezro.com/perfil')
})

test('Ajustes: "Editar na conta Absolute ZRO" abre fora do app e some o nome próprio do TPeasy', async () => {
  const views = await readFile(new URL('../app/js/views.js', import.meta.url), 'utf8')
  assert.match(views, /href="\$\{esc\(Zro\.linkConta\(p\)\)\}" target="_blank" rel="noopener">Editar na conta Absolute ZRO<\/a>/)
  assert.match(views, /Zro\.avatarHtml\(p\)/)
  assert.match(views, /\$\("#setName"\)\.hidden = Zro\.zro\.estado === "dentro"/)
})

// O celular não achava a conta (só existia em Ajustes): agora ela fica ao lado do título de Roteiros.
test('topo de Roteiros: "Entrar" para quem está fora, a foto de quem entrou (abre Ajustes) e nada sem saber da conta', () => {
  assert.equal(Zro.atalhoContaHtml({ estado: '?', pessoa: null }), '', 'sem as funções ou sem configuração: nenhum botão que não funciona')
  const fora = Zro.atalhoContaHtml({ estado: 'fora', pessoa: null })
  assert.ok(fora.includes('href="/api/zro/entrar?volta=%2Fapp%2F"'), 'volta para Roteiros já logado')
  assert.match(fora, /Entrar<\/a>$/)
  const dentro = Zro.atalhoContaHtml({ estado: 'dentro', pessoa: { ...LIA, foto: FOTO } })
  assert.match(dentro, /data-go="ajustes"/)
  assert.match(dentro, /aria-label="Conta: Lia Produtora"/)
  assert.ok(dentro.includes(`<img src="${FOTO}"`))
  assert.ok(!Zro.atalhoContaHtml({ estado: 'dentro', pessoa: { nome: '<b>x</b>', email: 'a@b.c' } }).includes('<b>x'), 'nome escapado')
})

test('Roteiros tem o lugar da conta e ele redesenha junto com Ajustes', async () => {
  const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
  assert.match(html, /<div class="conta-topo" id="contaTopo"/)
  const views = await readFile(new URL('../app/js/views.js', import.meta.url), 'utf8')
  assert.match(views, /renderContaTopo\(\);\n  renderBaloes\(\);/)
})
