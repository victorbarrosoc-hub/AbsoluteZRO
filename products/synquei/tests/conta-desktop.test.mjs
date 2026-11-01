// A conta no app de desktop (desktop/conta.cjs) contra uma Absolute ZRO falsa, como no AEON: o navegador da pessoa vai
// à Absolute ZRO, volta para 127.0.0.1 e o app guarda só quem é; o refresh token só cifrado pelo cofre do sistema; cada
// leitura relê o perfil (nome, foto, zro_products) no /oauth/userinfo; sair revoga. E a mesma tela de conta do site
// (app/js/conta.js) liga no desktop quando a ponte tem a conta.

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { iniciarZroFalsa } from './zro-falso.mjs'

const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['synquei'] }
const FOTO = 'b8a4a3c2-0f4e-4d55-9a51-1f3f0c6a2b10'
let zro
let pasta
let criarConta
let CLIENTE

before(async () => {
  zro = await iniciarZroFalsa({ clientId: 'synquei-desktop', publico: true })
  process.env.ZRO_ISSUER = zro.url
  ;({ criarConta, CLIENTE } = createRequire(import.meta.url)('../desktop/conta.cjs'))
  pasta = mkdtempSync(join(tmpdir(), 'synquei-conta-'))
})
after(async () => {
  await zro?.fechar()
  rmSync(pasta, { recursive: true, force: true })
})

/** o "navegador": segue o authorize da Absolute ZRO falsa até o 127.0.0.1 do app; trocar = mexe no state */
const navegador = (trocar) => async (url) => {
  const ida = new URL(url)
  assert.equal(ida.searchParams.get('client_id'), 'synquei-desktop')
  assert.match(ida.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/callback$/)
  const r = await fetch(url, { redirect: 'manual' })
  const volta = new URL(r.headers.get('location'))
  assert.equal(volta.hostname, '127.0.0.1')
  assert.equal(volta.pathname, '/callback')
  if (trocar) volta.searchParams.set('state', 'outro')
  const pagina = await (await fetch(volta)).text()
  assert.match(pagina, /Synquei/)
}

// cofre de teste no lugar do safeStorage do sistema: o que vai para o disco não é o token em claro
const COFRE = { cifrar: (t) => `cofre:${Buffer.from(t).toString('base64').split('').reverse().join('')}`, decifrar: (c) => Buffer.from(c.slice(6).split('').reverse().join(''), 'base64').toString() }
const arquivo = () => readFileSync(join(pasta, 'conta.json'), 'utf8')
const mudarConta = (dados) => Object.assign(zro.contas.get(LIA.sub), dados)

test('cliente público synquei-desktop, sem segredo', () => {
  assert.equal(CLIENTE, 'synquei-desktop')
  assert.ok(!/client_secret|SEGREDO/.test(readFileSync(new URL('../desktop/conta.cjs', import.meta.url), 'utf8')))
})

test('entra pelo navegador, responde como o /api/zro/eu do site e sai', async () => {
  zro.estado.pessoa = { ...LIA, foto: FOTO }
  let voltou = 0
  const c = criarConta({ pasta, abrirNavegador: navegador(false), aoVoltar: () => voltou++ })
  assert.equal(c.eu(), null)
  assert.equal(await c.entrar(), 'ok')
  assert.equal(voltou, 1, 'a janela do app volta para frente')
  const eu = c.eu()
  assert.equal(eu.ok, true)
  assert.equal(eu.acesso, true)
  assert.equal(eu.pessoa.email, 'lia@produtora.com')
  assert.equal(eu.pessoa.nome, 'Lia Produtora')
  assert.equal(eu.pessoa.foto, `${zro.url}/api/v1/foto/${FOTO}`)
  assert.equal(eu.pessoa.conta, `${zro.url}/perfil`, 'onde editar: a conta Absolute ZRO')
  assert.deepEqual(eu.pessoa.organizacao, { nome: 'Produtora Lia', papel: 'owner' })
  assert.deepEqual(eu.pessoa.produtos, ['synquei'])
  assert.ok(!/id_token|access_token|at_|zt_/.test(arquivo()), 'nenhum token em claro (sem cofre, nem o refresh)')
  c.sair()
  assert.equal(c.eu(), null)
})

test('perfil único: cada leitura relê nome, foto e zro_products (userinfo + refresh); o refresh token só cifrado', async () => {
  zro.estado.pessoa = { ...LIA, foto: FOTO }
  const c = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(await c.entrar(), 'ok')
  assert.ok(!/zt_|at_/.test(arquivo()), 'refresh token só cifrado; access token nunca no disco')
  assert.match(arquivo(), /"rt":"cofre:/)
  const exp = JSON.parse(arquivo()).exp

  // mudou na conta: a mesma abertura relê pelo access token ainda válido
  mudarConta({ nome: 'Lia Martins', foto: 'c0ffee00-1111-4222-8333-444455556666' })
  assert.equal(await c.atualizar(), 'ok')
  assert.equal(c.eu().pessoa.nome, 'Lia Martins')
  assert.equal(c.eu().pessoa.foto, `${zro.url}/api/v1/foto/c0ffee00-1111-4222-8333-444455556666`)

  // app fechado e aberto de novo (sem tokens na memória), access token vencido: renova e relê; o Synquei saiu da conta
  zro.vencer()
  mudarConta({ nome: 'Lia M.', foto: null, produtos: ['sobedesce'] })
  const renovacoes = zro.estado.renovacoes
  const depois = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(depois.eu().pessoa.nome, 'Lia Martins', 'antes de reler, a cópia')
  assert.equal(await depois.atualizar(), 'ok')
  assert.equal(zro.estado.renovacoes, renovacoes + 1)
  assert.equal(depois.eu().pessoa.nome, 'Lia M.')
  assert.equal(depois.eu().pessoa.foto, null, 'sem foto: iniciais')
  assert.equal(depois.eu().acesso, false, 'zro_products relido: sem o Synquei, sem acesso (nada inventado)')
  assert.equal(JSON.parse(arquivo()).exp, exp, 'reler não estica a sessão')

  // acesso ao app removido no Perfil: esquece o token e fica com a cópia
  zro.removerAcesso(LIA.sub)
  const outra = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(await outra.atualizar(), 'recusado')
  assert.equal(outra.eu().pessoa.nome, 'Lia M.')
  assert.ok(!/"rt"/.test(arquivo()))
  assert.equal(await outra.atualizar(), 'sem-token')
  outra.sair()
  assert.equal(outra.eu(), null)
})

test('Absolute ZRO fora do ar: vale a cópia', async () => {
  zro.estado.pessoa = LIA
  const c = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(await c.entrar(), 'ok')
  zro.estado.fora = true
  assert.equal(await c.atualizar(), 'erro')
  zro.estado.fora = false
  assert.equal(c.eu().pessoa.nome, 'Lia Produtora')
  c.sair()
})

test('sem cofre do sistema: o refresh token fica só na memória; sair revoga', async () => {
  zro.estado.pessoa = LIA
  const c = criarConta({ pasta, abrirNavegador: navegador(false) })
  assert.equal(await c.entrar(), 'ok')
  assert.ok(!/"rt"/.test(arquivo()))
  zro.vencer()
  mudarConta({ nome: 'Lia Nova' })
  assert.equal(await c.atualizar(), 'ok', 'na mesma abertura, renova pela memória')
  assert.equal(c.eu().pessoa.nome, 'Lia Nova')
  assert.equal(await criarConta({ pasta, abrirNavegador: navegador(false) }).atualizar(), 'sem-token', 'outra abertura: fica a cópia')
  const n = zro.estado.revogados
  c.sair()
  for (let i = 0; i < 50 && zro.estado.revogados === n; i++) await new Promise((r) => setTimeout(r, 10))
  assert.equal(zro.estado.revogados, n + 1)
})

test('recusas: state trocado, pessoa negou, nonce adulterado; criar conta pede prompt=create', async () => {
  zro.estado.pessoa = LIA
  const c = criarConta({ pasta, abrirNavegador: navegador(true) })
  assert.equal(await c.entrar(), 'expirou')
  zro.estado.negar = true
  assert.equal(await criarConta({ pasta, abrirNavegador: navegador(false) }).entrar(), 'recusado')
  zro.estado.negar = false
  zro.estado.adulterar = 'nonce'
  assert.equal(await criarConta({ pasta, abrirNavegador: navegador(false) }).entrar(), 'erro')
  zro.estado.adulterar = null
  assert.equal(c.eu(), null, 'nada foi guardado')
  const novo = criarConta({ pasta, abrirNavegador: navegador(false) })
  assert.equal(await novo.entrar({ criar: true }), 'ok')
  assert.equal(zro.estado.prompt, 'create')
  novo.sair()
})

test('a Z no desktop: repasse com o token desta sessão, NDJSON em pedaços, novo login sem zro.ia, e sem sessão nada sai', async () => {
  Object.assign(zro.estado, { pessoa: LIA, semIa: false, iaPedidos: [], iaPausa: null })
  const dir = mkdtempSync(join(tmpdir(), 'synquei-z-'))
  const c = criarConta({ pasta: dir, abrirNavegador: navegador(false), cofre: COFRE })
  const pedido = (metodo = 'GET', corpo) => new Request('http://app.invalid/api/zro/ia/x', { method: metodo, ...(corpo ? { body: corpo, headers: { 'content-type': 'application/json' } } : {}) })
  try {
    // sem sessão: 401 com reconectar e nada chega à Absolute ZRO
    let r = await c.repassarIa(pedido(), 'estado')
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
    assert.equal(zro.estado.iaPedidos.length, 0)

    assert.equal(await c.entrar(), 'ok')
    r = await c.repassarIa(pedido(), 'estado')
    assert.equal(r.status, 200)
    const texto = await r.text()
    const at = zro.estado.iaPedidos.at(-1).auth.slice(7)
    assert.match(at, /^at_/)
    assert.ok(!texto.includes(at))
    assert.ok(!readFileSync(join(dir, 'conta.json'), 'utf8').includes(at), 'o access token não vai para o disco')

    // caminho ou método fora da Z
    assert.equal((await c.repassarIa(pedido(), '../oauth/token')).status, 404)
    assert.equal((await c.repassarIa(pedido('DELETE'), 'estado')).status, 405)

    // NDJSON em pedaços: o primeiro chega antes do fim
    let soltar
    zro.estado.iaPausa = new Promise((ok) => (soltar = ok))
    r = await c.repassarIa(pedido('POST', '{"texto":"Oi, Z"}'), 'mensagens')
    const leitor = r.body.getReader()
    const { value } = await leitor.read()
    assert.match(new TextDecoder().decode(value), /"conversa"/)
    soltar()
    let resto = ''
    for (;;) {
      const p = await leitor.read()
      if (p.done) break
      resto += new TextDecoder().decode(p.value)
    }
    assert.match(resto, /"fim"/)
    zro.estado.iaPausa = null

    // token vencido: renova e segue
    zro.vencer()
    assert.equal((await c.repassarIa(pedido(), 'conversas')).status, 200)

    // login de antes da Z (sem zro.ia): 401 com reconectar
    zro.estado.semIa = true
    r = await c.repassarIa(pedido(), 'estado')
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
  } finally {
    zro.estado.semIa = false
    c.sair()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('perfil e Z ao mesmo tempo não gastam o mesmo refresh token duas vezes', async () => {
  Object.assign(zro.estado, { pessoa: LIA, semIa: false, iaPausa: null })
  const dir = mkdtempSync(join(tmpdir(), 'synquei-z-'))
  const c = criarConta({ pasta: dir, abrirNavegador: navegador(false), cofre: COFRE })
  try {
    assert.equal(await c.entrar(), 'ok')
    zro.vencer()
    const [perfil, z] = await Promise.all([c.atualizar(), c.repassarIa(new Request('http://app.invalid/api/zro/ia/estado'), 'estado')])
    assert.equal(perfil, 'ok')
    assert.equal(z.status, 200)
    // a família de tokens continua viva: a próxima renovação funciona
    zro.vencer()
    assert.equal(await c.atualizar(), 'ok')
  } finally {
    c.sair()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a tela de conta do site liga no desktop quando a ponte tem a conta', async () => {
  const ouvintes = {}
  const eventos = []
  globalThis.location = { pathname: '/app/index.html', hash: '#/ajustes', search: '', protocol: 'synquei:' }
  globalThis.window = { synqueiDesktop: { isDesktop: true, conta: true } }
  globalThis.addEventListener = () => {}
  globalThis.history = { replaceState() {}, state: null }
  globalThis.document = {
    getElementById: () => null,
    addEventListener: (tipo, fn) => (ouvintes[tipo] = fn),
    dispatchEvent: (e) => eventos.push(e.type),
  }
  // só os pedidos da página (relativos): a revogação do teste anterior ainda pode estar a caminho
  const pedidos = []
  const fetchReal = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('/')) return fetchReal(url, init)
    pedidos.push(String(url))
    return new Response(JSON.stringify({ ok: true, acesso: true, pessoa: { nome: 'Lia Produtora', email: 'lia@produtora.com', foto: `https://absolutezro.com/api/v1/foto/${FOTO}`, conta: 'https://absolutezro.com/perfil', organizacao: { nome: 'Produtora Lia', papel: 'owner' }, produtos: ['synquei'] } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const { C, iniciarConta, linhaConta, cartaoConta } = await import('../app/js/conta.js')
  await iniciarConta()
  assert.deepEqual(pedidos, ['/api/zro/eu?visitante=1'])
  assert.equal(C.estado, 'logado')
  assert.ok(eventos.includes('synquei:conta-mudou'))
  assert.match(linhaConta(), /Lia Produtora/)
  assert.ok(linhaConta().includes(`<img src="https://absolutezro.com/api/v1/foto/${FOTO}"`), 'foto na barra lateral')
  const card = cartaoConta()
  assert.match(card, /Editar na conta Absolute ZRO/)
  assert.ok(card.includes('href="https://absolutezro.com/perfil" target="_blank"'), 'abre fora do app (no navegador)')
  assert.match(card, /data-act="conta-sair"/)

  // "Entrar com Absolute ZRO" no desktop: a página não sai do lugar; espera a volta do login e relê a conta
  let parou = false
  const a = { dataset: { entrar: '' }, href: '', getAttribute: () => a.href }
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('/')) return fetchReal(url, init)
    pedidos.push(String(url))
    if (String(url).startsWith('/api/zro/entrar')) return { url: 'synquei://app/app/index.html?zro=ok#/ajustes' }
    return new Response(JSON.stringify({ ok: false, configurado: true }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  ouvintes.click({ target: { closest: () => a }, preventDefault: () => (parou = true) })
  assert.equal(parou, true)
  assert.equal(a.href, '/api/zro/entrar?volta=%2Fapp%2Findex.html%23%2Fajustes')
  for (let i = 0; i < 50 && pedidos.length < 3; i++) await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(pedidos.slice(1), [a.href, '/api/zro/eu?visitante=1'])

  // desktop antigo (sem a conta na ponte): nada de conta, como antes
  globalThis.window = { synqueiDesktop: { isDesktop: true } }
  const { iniciarConta: deNovo } = await import('../app/js/conta.js?antigo')
  pedidos.length = 0
  await deNovo()
  assert.deepEqual(pedidos, [])
})
