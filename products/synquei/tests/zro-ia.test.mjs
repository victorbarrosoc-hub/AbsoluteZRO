// A Z no Synquei: o repasse /api/zro/ia (api/zro/ia.js) contra a Absolute ZRO falsa. Encaminha com o Bearer da sessão
// (e nada mais: nem cookie do site), recusa sem sessão, não deixa o token chegar à página, passa o NDJSON em pedaços,
// renova o token vencido, pede novo login quando o token não tem zro.ia e só aceita os caminhos da Z.
// O painel do app (app/js/z.js) usa as sugestões daqui e o script oficial da Absolute ZRO.

import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { iniciarZroFalsa } from './zro-falso.mjs'

const CLIENTE = { clientId: 'synquei-web', clientSecret: 'segredo-de-teste-do-synquei' }
const LIA = { sub: 'zro-111', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['synquei'] }
let zro, app, SITE
const rotas = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback', 'ia']) rotas[r] = (await import(`../api/zro/${r}.js`)).default
  app = http.createServer((req, res) => {
    const r = /^\/api\/zro\/(\w+)/.exec(req.url)
    if (r && rotas[r[1]]) return rotas[r[1]](req, res)
    res.statusCode = 404
    res.end()
  })
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok))
  SITE = `http://127.0.0.1:${app.address().port}`
})

after(async () => {
  await zro?.fechar()
  await new Promise((ok) => app?.close(() => ok()))
})

beforeEach(() => Object.assign(zro.estado, { semIa: false, iaPedidos: [], iaPausa: null, fora: false }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const comCookies = (c) =>
  Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
const pedir = (caminho, { cookies = {}, ...init } = {}) => fetch(new URL(caminho, SITE), { redirect: 'manual', ...init, headers: { cookie: comCookies(cookies), ...(init.headers || {}) } })

/** Entra com a Absolute ZRO falsa e devolve os cookies da sessão (sq_conta e sq_hub). */
async function entrar() {
  zro.estado.pessoa = LIA
  const ida = await pedir('/api/zro/entrar')
  const u = new URL(ida.headers.get('location'))
  assert.ok(u.searchParams.get('scope').split(' ').includes('zro.ia'), 'o login pede a Z')
  const sqZro = cookiesDe(ida).get('sq_zro')
  const z = await fetch(u, { redirect: 'manual' })
  const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { sq_zro: sqZro } })
  const c = cookiesDe(volta)
  assert.ok(c.get('sq_conta') && c.get('sq_hub'))
  return { sq_conta: c.get('sq_conta'), sq_hub: c.get('sq_hub') }
}

describe('repasse da Z', () => {
  test('sem sessão: 401 com reconectar, e nada chega à Absolute ZRO', async () => {
    const r = await pedir('/api/zro/ia/estado')
    assert.equal(r.status, 401)
    const j = await r.json()
    assert.equal(j.reconectar, true)
    assert.match(j.message, /Absolute ZRO/)
    assert.equal(zro.estado.iaPedidos.length, 0)
  })

  test('cookie da conta sem o cofre (ou adulterado) também é 401', async () => {
    const s = await entrar()
    assert.equal((await pedir('/api/zro/ia/estado', { cookies: { sq_conta: s.sq_conta } })).status, 401)
    assert.equal((await pedir('/api/zro/ia/estado', { cookies: { sq_conta: s.sq_conta, sq_hub: s.sq_hub.slice(0, -4) + 'AAAA' } })).status, 401)
    assert.equal(zro.estado.iaPedidos.length, 0)
  })

  test('encaminha com o Bearer da sessão, sem cookie do site, e o token não volta para a página', async () => {
    const s = await entrar()
    const r = await pedir('/api/zro/ia/estado', { cookies: s })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    const texto = await r.text()
    assert.equal(JSON.parse(texto).ligada, true)
    const p = zro.estado.iaPedidos.at(-1)
    assert.equal(p.caminho, 'estado')
    assert.match(p.auth, /^Bearer at_[0-9a-f]{32}$/)
    assert.equal(p.cookie, null, 'os cookies do Synquei não vão para a Absolute ZRO')
    const at = p.auth.slice(7)
    assert.ok(!texto.includes(at), 'o token não aparece na resposta')
    for (const c of r.headers.getSetCookie()) assert.ok(!c.includes(at), 'nem em cookie legível')
  })

  test('a Vercel reescreve para ?c=: o mesmo caminho funciona', async () => {
    const s = await entrar()
    const r = await pedir('/api/zro/ia?c=conversas', { cookies: s })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { conversas: [] })
  })

  test('/mensagens: o NDJSON chega em pedaços, sem esperar o fim', async () => {
    const s = await entrar()
    let soltar
    zro.estado.iaPausa = new Promise((ok) => (soltar = ok))
    const r = await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies: s, headers: { 'content-type': 'application/json', origin: SITE }, body: JSON.stringify({ conversa: null, texto: 'Oi, Z' }) })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /ndjson/)
    const leitor = r.body.getReader()
    const dec = new TextDecoder()
    let primeiro = ''
    while (!primeiro.includes('Olá')) {
      const { value, done } = await leitor.read()
      assert.ok(!done, 'o primeiro pedaço chegou antes do fim')
      primeiro += dec.decode(value, { stream: true })
    }
    assert.ok(!primeiro.includes('"fim"'), 'o fim ainda não tinha saído')
    soltar()
    let resto = ''
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      resto += dec.decode(value, { stream: true })
    }
    assert.match(resto, /"fim"/)
    assert.equal(JSON.parse(zro.estado.iaPedidos.at(-1).corpo).texto, 'Oi, Z')
  })

  test('outra origem não conversa com a sessão de ninguém', async () => {
    const s = await entrar()
    const r = await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies: s, headers: { 'content-type': 'application/json', origin: 'https://malicioso.exemplo' }, body: '{"texto":"oi"}' })
    assert.equal(r.status, 403)
    assert.equal(zro.estado.iaPedidos.length, 0)
  })

  test('só os caminhos e métodos da Z passam', async () => {
    const s = await entrar()
    for (const c of ['../oauth/token', 'conversas/../../x', 'admin', '', 'conversas/a%2Fb']) assert.equal((await pedir(`/api/zro/ia/${c}`, { cookies: s })).status, 404, c)
    assert.equal((await pedir('/api/zro/ia/estado', { method: 'DELETE', cookies: s })).status, 405)
    assert.equal((await pedir('/api/zro/ia/mensagens', { cookies: s })).status, 405)
    assert.equal(zro.estado.iaPedidos.length, 0)
  })

  test('token vencido: renova pelo refresh token e grava o cofre novo', async () => {
    const s = await entrar()
    zro.vencer()
    const antes = zro.estado.renovacoes
    const r = await pedir('/api/zro/ia/estado', { cookies: s })
    assert.equal(r.status, 200)
    assert.equal(zro.estado.renovacoes, antes + 1)
    const novo = cookiesDe(r).get('sq_hub')
    assert.ok(novo && novo !== s.sq_hub)
    assert.ok(r.headers.getSetCookie().find((c) => c.startsWith('sq_hub=')).includes('HttpOnly'))
  })

  test('login de antes da Z (token sem zro.ia): 401 com reconectar, depois de tentar renovar uma vez', async () => {
    const s = await entrar()
    zro.estado.semIa = true
    const r = await pedir('/api/zro/ia/estado', { cookies: s })
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
    assert.equal(zro.estado.iaPedidos.length, 2, 'tenta com o token renovado antes de pedir novo login')
  })

  test('Absolute ZRO fora do ar: o status dela passa, sem vazar nada', async () => {
    const s = await entrar()
    zro.estado.fora = true
    const r = await pedir('/api/zro/ia/estado', { cookies: s })
    assert.equal(r.status, 503)
    zro.estado.fora = false
  })
})

describe('painel do app', () => {
  const z = readFileSync(new URL('../app/js/z.js', import.meta.url), 'utf8')
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  test('usa o script oficial da Z e o repasse do próprio app (sem token na página)', () => {
    assert.match(z, /https:\/\/absolutezro\.com\/ia\/v1\/zro-ia\.js/)
    assert.match(z, /setAttribute\('api', '\/api\/zro\/ia'\)/)
    assert.ok(!/\.token\s*=/.test(z), 'a página não recebe token')
    assert.match(html, /id="zPainel"/)
  })
  test('a Z tem aba própria: a primeira, e a tela de entrada', () => {
    const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8')
    const abas = /<nav class="tabbar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1]
    assert.match(abas.trim(), /^<a href="#\/z" data-r="z">/)
    assert.match(html, /aria-label="Principal">\s*<a class="nav-item" href="#\/z" data-r="z"/)
    assert.match(main, /const ORDER = \['z', 'inicio'/)
    assert.match(main, /return VIEWS\[r\] \? r : 'z'/)
    assert.match(main, /z\.hidden = route !== 'z'/)
    // o Início volta a ser como era: sem a Z em cima e com o "Bom dia"
    assert.ok(!/tem-z/.test(css + main + z))
  })
  test('três ou quatro sugestões, sobre o Synquei', async () => {
    const { SUGESTOES } = await import('../app/js/z.js').catch(() => ({ SUGESTOES: JSON.parse(/SUGESTOES = (\[.*\])/.exec(z)[1].replace(/'/g, '"')) }))
    assert.ok(SUGESTOES.length >= 3 && SUGESTOES.length <= 4)
  })
  test('o service worker não guarda a Z', () => {
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
    assert.match(sw, /synquei-v23/)
    assert.match(sw, /startsWith\('\/api\/'\)/)
    assert.match(sw, /u\.origin !== location\.origin/)
  })
  test('a família só lista plataformas abertas (NOSSOM, AEON, Revela, Carro do Freela e Maestro estão fechados)', () => {
    const fam = /<nav class="nav nav-familia"[\s\S]*?<\/nav>/.exec(html)[0]
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
    assert.doesNotMatch(fam + sw, /nossom|aeon|revela|carrodofreela|carro-do-freela|maestro/i)
    for (const nome of ['Absolute ZRO', 'Sobedesce', 'TPEasy']) assert.ok(fam.includes(`<span>${nome}</span>`), nome)
  })
})
