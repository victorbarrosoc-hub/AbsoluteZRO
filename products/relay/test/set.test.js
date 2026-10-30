// O Set no Relay (ADR 0032 da Absolute ZRO): o login com a Absolute ZRO (porta do Synquei, só para o que toca a conta),
// o /eu que responde 200 sempre (o Relay é aberto: nada de erro no console de quem só converte), o repasse
// /api/zro/set contra a Absolute ZRO falsa (Bearer da sessão, só os caminhos do Set, ETag e 304, 401 sem apagar a
// sessão) e a entrada "Set" no topo, que leva a entrar sem sessão e abre a folha com ela.

import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { ESCOPOS_ESPERADOS, ESCOPOS_SEM_SET, iniciarZroFalsa } from './zro-falso.js'

const CLIENTE = { clientId: 'relay-web', clientSecret: 'segredo-de-teste-do-relay' }
const LIA = { sub: 'zro-511', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['relay'] }
const ID = '3f2b8c1e-7d4a-4b9e-9c21-5a6f7e8d9c0b'
let zro, app, SITE
const rotas = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback', 'eu', 'sair', 'set']) rotas[r] = (await import(`../api/zro/${r}.js`)).default
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

beforeEach(() => Object.assign(zro.estado, { semSet: false, recusarSet: false, setPedidos: [], atTtl: 600 }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const comCookies = (c) =>
  Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
const pedir = (caminho, { cookies = {}, ...init } = {}) => fetch(new URL(caminho, SITE), { redirect: 'manual', ...init, headers: { cookie: comCookies(cookies), ...(init.headers || {}) } })

async function entrar(inicio = '/api/zro/entrar?volta=%2Fconverter') {
  zro.estado.pessoa = LIA
  let ida = await pedir(inicio)
  for (let i = 0; i < 3; i++) {
    const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
    const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { rl_zro: cookiesDe(ida).get('rl_zro') } })
    const c = cookiesDe(volta)
    if (c.get('rl_conta')) return { volta, cookies: { rl_conta: c.get('rl_conta'), rl_hub: c.get('rl_hub') } }
    assert.match(volta.headers.get('location'), /^\/api\/zro\/entrar\?.*sem_set=1/)
    ida = await pedir(volta.headers.get('location'))
  }
  throw new Error('não entrou')
}

describe('conta (só para o Set; converter segue sem conta)', () => {
  test('o login pede zro.set (e não a Z) e volta para a página de onde veio', async () => {
    const ida = await pedir('/api/zro/entrar?volta=%2Fconverter')
    assert.equal(new URL(ida.headers.get('location')).searchParams.get('scope'), ESCOPOS_ESPERADOS)
    const { volta } = await entrar()
    assert.equal(volta.headers.get('location'), '/converter?zro=ok')
  })

  test('Absolute ZRO de antes do Set (invalid_scope): entra sem zro.set', async () => {
    zro.estado.recusarSet = true
    const { cookies } = await entrar()
    assert.ok(cookies.rl_conta)
    assert.equal(zro.estado.escopos, ESCOPOS_SEM_SET)
  })

  test('/eu responde 200 sempre: sem sessão, com sessão e sem o login ligado', async () => {
    let r = await pedir('/api/zro/eu')
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: false, configurado: true, entrar: '/api/zro/entrar', criar: '/api/zro/entrar?criar=1' })
    const { cookies } = await entrar()
    r = await pedir('/api/zro/eu', { cookies })
    const j = await r.json()
    assert.equal(j.ok, true)
    assert.equal(j.pessoa.nome, LIA.nome)
    const id = process.env.ZRO_CLIENT_ID
    delete process.env.ZRO_CLIENT_ID
    try {
      r = await pedir('/api/zro/eu')
      assert.equal(r.status, 200)
      assert.deepEqual(await r.json(), { ok: false, configurado: false })
    } finally {
      process.env.ZRO_CLIENT_ID = id
    }
  })

  test('site fechado na produção (sem RELEASE=released): o login fica desligado; prévia e site aberto, ligado', async () => {
    const antes = { VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV, RELEASE: process.env.RELEASE }
    const eu = async () => (await (await pedir('/api/zro/eu')).json()).configurado
    try {
      Object.assign(process.env, { VERCEL: '1', VERCEL_ENV: 'production' })
      delete process.env.RELEASE
      assert.equal(await eu(), false)
      assert.equal((await pedir('/api/zro/set')).status, 401)
      process.env.VERCEL_ENV = 'preview'
      assert.equal(await eu(), true)
      Object.assign(process.env, { VERCEL_ENV: 'production', RELEASE: 'released' })
      assert.equal(await eu(), true)
    } finally {
      for (const [k, v] of Object.entries(antes)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})

describe('repasse do Set', () => {
  test('sem sessão: 401, e nada chega à Absolute ZRO', async () => {
    assert.equal((await pedir('/api/zro/set')).status, 401)
    assert.equal(zro.estado.setPedidos.length, 0)
  })

  test('Bearer da sessão (sem cookie do site), ETag e 304; só os caminhos e métodos do Set', async () => {
    const { cookies } = await entrar()
    const r = await pedir('/api/zro/set', { cookies })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('etag'), 'W/"v1"')
    const texto = await r.text()
    const p = zro.estado.setPedidos.at(-1)
    assert.match(p.auth, /^Bearer at_/)
    assert.equal(p.cookie, null)
    assert.ok(!texto.includes(p.auth.slice(7)))
    assert.equal((await pedir('/api/zro/set', { cookies, headers: { 'if-none-match': 'W/"v1"' } })).status, 304)
    await pedir(`/api/zro/set?c=conversas/${ID}&depois=3&x=1`, { cookies })
    assert.equal(zro.estado.setPedidos.at(-1).busca, '?depois=3')
    const n = zro.estado.setPedidos.length
    for (const c of ['admin', 'conversas/x', '../oauth/token']) assert.equal((await pedir(`/api/zro/set/${c}`, { cookies })).status, 404, c)
    assert.equal((await pedir('/api/zro/set', { cookies, method: 'POST', headers: { origin: 'https://malicioso.exemplo', 'content-type': 'application/json' }, body: '{"estado":"ativo"}' })).status, 403)
    assert.equal(zro.estado.setPedidos.length, n)
  })

  test('token sem zro.set: 401 sem apagar a sessão', async () => {
    const { cookies } = await entrar()
    zro.estado.semSet = true
    const r = await pedir('/api/zro/set', { cookies })
    assert.equal(r.status, 401)
    assert.ok(!r.headers.getSetCookie().some((c) => /Max-Age=0/.test(c)))
  })
})

describe('a aba em comum no topo', () => {
  const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

  test('o topo das páginas monta "Set"; a folha é o <zro-set modo="folha"> da Absolute ZRO, pelo repasse', () => {
    for (const p of ['../app/home.js', '../app/converter.js']) assert.match(ler(p), /montarSet\(\)/, p)
    const js = ler('../app/set.js')
    assert.match(js, /https:\/\/absolutezro\.com\/set\/v1\/zro-set\.js/)
    assert.match(js, /setAttribute\('modo', 'folha'\)/)
    assert.match(js, /setAttribute\('api', '\/api\/zro\/set'\)/)
    assert.ok(!/\.token\s*=/.test(js))
    const css = ler('../app/relay.css')
    for (const v of ['tinta', 'superficie', 'fundo', 'acento', 'online', 'raio', 'fonte']) assert.match(css, new RegExp(`--zro-set-${v}: `), v)
  })

  test('CSP do site: o widget vem só de absolutezro.com; o repasse tem a reescrita e sem cache', () => {
    const v = JSON.parse(ler('../vercel.json'))
    const csp = v.headers.find((h) => h.source === '/(.*)').headers.find((h) => h.key === 'Content-Security-Policy').value
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' https:\/\/absolutezro\.com;/)
    assert.match(csp, /connect-src 'self' blob: data:;/, 'a página só fala com o próprio site')
    assert.deepEqual(v.rewrites, [{ source: '/api/zro/set/:caminho*', destination: '/api/zro/set?c=:caminho*' }])
  })

  test('sem sessão o link leva a entrar; com o Set respondendo vira o botão da folha, com o balão', async () => {
    const { ligarSet } = await import('../app/set.js')
    const el = new EventTarget()
    el.abrirSet = () => {
      el.aberto = true
      el.dispatchEvent(new Event('zro-set:aberto'))
    }
    const attrs = {}
    const a = Object.assign(new EventTarget(), { balao: { hidden: true, textContent: '' }, setAttribute: (k, v) => (attrs[k] = v) })
    a.querySelector = () => a.balao
    ligarSet(el, a)
    let evitou = false
    a.dispatchEvent(Object.assign(new Event('click'), { preventDefault: () => (evitou = true) }))
    assert.equal(evitou, false, 'sem o Set, o clique segue o link de entrar')
    el.dispatchEvent(Object.assign(new Event('zro-set:estado'), { detail: { online: 1, naoLidas: 0, pedidos: 2 } }))
    assert.equal(a.balao.textContent, '2')
    const clique = new Event('click')
    clique.preventDefault = () => (evitou = true)
    a.dispatchEvent(clique)
    assert.equal(evitou, true)
    assert.equal(el.aberto, true)
    assert.equal(attrs['aria-expanded'], 'true')
  })
})
