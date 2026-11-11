// O Set no RADION (ADR 0032 da Absolute ZRO): o login pede zro.set (e refaz sem ele na Absolute ZRO de antes do Set) e
// o repasse /api/zro/set leva o Bearer da sessão à Absolute ZRO falsa, só nos caminhos do Set, com ETag e 304; sem
// sessão, 401 e nada sai daqui. Mesmo desenho do Relay (products/relay/test/set.test.js).

import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { ESCOPOS_ESPERADOS, ESCOPOS_SEM_SET, iniciarZroFalsa } from './zro-falso.js'

const CLIENTE = { clientId: 'radio-web', clientSecret: 'segredo-de-teste-do-radio' }
const LIA = { sub: 'zro-511', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['radio'] }
let zro, app, SITE
const rotas = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback', 'set']) rotas[r] = (await import(`../api/zro/${r}.js`)).default
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

async function entrar() {
  zro.estado.pessoa = LIA
  let ida = await pedir('/api/zro/entrar?volta=%2F')
  for (let i = 0; i < 3; i++) {
    const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
    const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { rd_zro: cookiesDe(ida).get('rd_zro') } })
    const c = cookiesDe(volta)
    if (c.get('rd_conta')) return { volta, cookies: { rd_conta: c.get('rd_conta'), rd_hub: c.get('rd_hub') } }
    assert.match(volta.headers.get('location'), /^\/api\/zro\/entrar\?.*sem_set=1/)
    ida = await pedir(volta.headers.get('location'))
  }
  throw new Error('não entrou')
}

test('o login pede zro.set; a Absolute ZRO de antes do Set (invalid_scope) entra sem ele', async () => {
  const ida = await pedir('/api/zro/entrar?volta=%2F')
  assert.equal(new URL(ida.headers.get('location')).searchParams.get('scope'), ESCOPOS_ESPERADOS)
  assert.ok((await entrar()).cookies.rd_conta)
  zro.estado.recusarSet = true
  assert.ok((await entrar()).cookies.rd_conta)
  assert.equal(zro.estado.escopos, ESCOPOS_SEM_SET)
})

test('repasse do Set: sem sessão 401; com sessão, o Bearer (nunca o cookie), ETag e 304; caminho fora do Set, 404', async () => {
  assert.equal((await pedir('/api/zro/set')).status, 401)
  assert.equal(zro.estado.setPedidos.length, 0)
  const { cookies } = await entrar()
  const r = await pedir('/api/zro/set', { cookies })
  assert.equal(r.status, 200)
  const p = zro.estado.setPedidos.at(-1)
  assert.match(p.auth, /^Bearer /)
  assert.equal(p.cookie, null)
  const etag = r.headers.get('etag')
  assert.match(etag, /^W\//)
  assert.equal((await pedir('/api/zro/set', { cookies, headers: { 'if-none-match': etag } })).status, 304)
  assert.equal((await pedir('/api/zro/set/../../oauth/token', { cookies })).status, 404)
  // de outra origem, nada muda
  assert.equal((await pedir('/api/zro/set', { cookies, method: 'POST', headers: { origin: 'https://outro.site', 'content-type': 'application/json' }, body: '{}' })).status, 403)
})
