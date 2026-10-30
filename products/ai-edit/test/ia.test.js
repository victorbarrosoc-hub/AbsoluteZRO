// Repasse da Z (api/zro/ia/*) contra uma Absolute ZRO falsa: leva o access token da sessão no Authorization, passa a
// resposta NDJSON aos poucos, renova o token vencido, recusa sem sessão, de outra origem, caminho fora do contrato e
// token sem o escopo zro.ia, e nunca devolve o token à página. Fechado ao público: sessão que o HUB não liberou
// recebe 403 antes de qualquer pedido. As funções rodam num servidor http de verdade.

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { iniciarZroFalsa } from './zro-falso.js'
import { selar } from '../api/_zro.js'

const PREFIXO = 'ae'
const PRODUTO = 'ai-edit'
const CLIENTE = { clientId: 'aeon-web', clientSecret: 'segredo-de-teste-do-aeon-ia' }
const LIA = { sub: 'zro-311', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: [PRODUTO], release: { [PRODUTO]: 'allowed' } }
const ROTAS = { estado: 'ia/estado.js', conversas: 'ia/conversas/index.js', conversa: 'ia/conversas/[id].js', mensagens: 'ia/mensagens.js' }
let zro, app, SITE
const f = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback']) f[r] = (await import(`../api/zro/${r}.js`)).default
  for (const [k, arq] of Object.entries(ROTAS)) f[k] = (await import(`../api/zro/${arq}`)).default
  // como a Vercel: cada arquivo de api/ responde o próprio caminho
  app = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    const h =
      p === '/api/zro/entrar' ? f.entrar
      : p === '/api/zro/callback' ? f.callback
      : p === '/api/zro/ia/estado' ? f.estado
      : p === '/api/zro/ia/conversas' ? f.conversas
      : p.startsWith('/api/zro/ia/conversas/') ? f.conversa
      : p === '/api/zro/ia/mensagens' ? f.mensagens
      : null
    if (h) return h(req, res)
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

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const pedir = (caminho, { cookies = {}, ...init } = {}) =>
  fetch(new URL(caminho, SITE), {
    redirect: 'manual',
    ...init,
    headers: {
      cookie: Object.entries(cookies)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      ...(init.headers || {}),
    },
  })

/** Entra pelo fluxo de verdade e devolve os cookies da sessão. */
async function entrar() {
  zro.estado.pessoa = LIA
  const ida = await pedir('/api/zro/entrar')
  const u = new URL(ida.headers.get('location'))
  assert.ok(u.searchParams.get('scope').split(' ').includes('zro.ia'), 'o login pede o escopo da Z')
  const z = await fetch(u, { redirect: 'manual' })
  const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(ida).get(`${PREFIXO}_zro`) } })
  const c = cookiesDe(volta)
  return { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) }
}

describe('repasse da Z', () => {
  test('leva o Bearer da sessão, sem cookie do site, e devolve a resposta sem o token', async () => {
    const cookies = await entrar()
    const r = await pedir('/api/zro/ia/estado', { cookies })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    const j = await r.json()
    assert.equal(j.ligada, true)
    const ult = zro.estado.ia.at(-1)
    assert.equal(ult.caminho, '/estado')
    assert.match(ult.autorizacao, /^Bearer at_[0-9a-f]{32}$/)
    assert.equal(ult.cookie, null, 'os cookies do site não vão para a Absolute ZRO')
    const token = ult.autorizacao.slice(7)
    assert.ok(!JSON.stringify(j).includes(token))
    for (const [k, v] of r.headers) assert.ok(!v.includes(token), `token no cabeçalho ${k}`)
    const lista = await pedir('/api/zro/ia/conversas', { cookies })
    assert.deepEqual(await lista.json(), { conversas: [] })
  })

  test('mensagem: passa o JSON e a resposta NDJSON chega aos poucos', async () => {
    const cookies = await entrar()
    const r = await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies, headers: { 'content-type': 'application/json', origin: SITE }, body: JSON.stringify({ conversa: null, texto: 'Oi, Z' }) })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /ndjson/)
    assert.deepEqual(JSON.parse(zro.estado.ia.at(-1).corpo), { conversa: null, texto: 'Oi, Z' })
    const leitor = r.body.getReader()
    const pedacos = []
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      pedacos.push(Buffer.from(value).toString())
    }
    assert.ok(pedacos.length >= 2, `chegou em ${pedacos.length} pedaço(s): sem juntar na memória`)
    const eventos = pedacos.join('').trim().split('\n').map((l) => JSON.parse(l))
    assert.deepEqual(eventos.map((e) => e.tipo), ['conversa', 'texto', 'texto', 'fim'])
  })

  test('token recusado antes da validade (acesso removido): o 401 da Absolute ZRO chega à página', async () => {
    const cookies = await entrar()
    const antes = zro.estado.renovacoes
    zro.vencer()
    const r1 = await pedir('/api/zro/ia/estado', { cookies })
    assert.equal(r1.status, 401)
    assert.equal(zro.estado.renovacoes, antes)
  })

  test('sem sessão, sem tokens ou com tokens adulterados: 401 sem falar com a Absolute ZRO', async () => {
    const n = zro.estado.ia.length
    assert.equal((await pedir('/api/zro/ia/estado')).status, 401)
    const cookies = await entrar()
    assert.equal((await pedir('/api/zro/ia/estado', { cookies: { [`${PREFIXO}_conta`]: cookies[`${PREFIXO}_conta`] } })).status, 401)
    assert.equal((await pedir('/api/zro/ia/estado', { cookies: { [`${PREFIXO}_tokens`]: cookies[`${PREFIXO}_tokens`] } })).status, 401)
    const [iv, corpo, tag] = cookies[`${PREFIXO}_tokens`].split('.')
    const mexido = `${iv}.${corpo.slice(0, -2)}${corpo.endsWith('AA') ? 'BB' : 'AA'}.${tag}`
    assert.equal((await pedir('/api/zro/ia/estado', { cookies: { ...cookies, [`${PREFIXO}_tokens`]: mexido } })).status, 401)
    assert.equal(zro.estado.ia.length, n)
  })

  test('fechado ao público: sessão que o HUB não liberou (closed ou de antes do gate) recebe 403 sem falar com a Absolute ZRO', async () => {
    const cookies = await entrar()
    const n = zro.estado.ia.length
    const sessao = (extra) => selar(`${PREFIXO}_conta`, { sub: LIA.sub, nome: LIA.nome, email: LIA.email, produtos: [PRODUTO], ...extra }, 3600)
    for (const extra of [{}, { release: 'closed' }, { release: 'released' }]) {
      const c = { ...cookies, [`${PREFIXO}_conta`]: sessao(extra) }
      const r = await pedir('/api/zro/ia/estado', { cookies: c })
      assert.equal(r.status, 403, JSON.stringify(extra))
      assert.equal((await r.json()).message, 'Em desenvolvimento.')
      assert.equal((await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies: c, headers: { 'content-type': 'application/json', origin: SITE }, body: '{"texto":"x"}' })).status, 403)
    }
    assert.equal(zro.estado.ia.length, n, 'nada saiu para a Absolute ZRO')
    assert.equal((await pedir('/api/zro/ia/estado', { cookies: { ...cookies, [`${PREFIXO}_conta`]: sessao({ release: 'allowed' }) } })).status, 200)
  })

  test('login antigo sem zro.ia: a Absolute ZRO diz 401 e o repasse passa adiante', async () => {
    zro.estado.semEscopoIa = true
    try {
      const cookies = await entrar()
      const r = await pedir('/api/zro/ia/estado', { cookies })
      assert.equal(r.status, 401)
    } finally {
      zro.estado.semEscopoIa = false
    }
  })

  test('outra origem, caminho ou método fora do contrato: recusado antes de sair daqui', async () => {
    const cookies = await entrar()
    const n = zro.estado.ia.length
    const json = { 'content-type': 'application/json' }
    assert.equal((await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies, headers: { ...json, origin: 'https://mal.exemplo' }, body: '{"texto":"x"}' })).status, 403)
    assert.equal((await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies, headers: { 'content-type': 'text/plain' }, body: '{"texto":"x"}' })).status, 415)
    assert.equal((await pedir('/api/zro/ia/estado', { method: 'DELETE', cookies })).status, 405)
    assert.equal((await pedir('/api/zro/ia/conversas/..%2F..%2Foauth', { cookies })).status, 404)
    assert.equal((await pedir('/api/zro/ia/conversas/a/b', { cookies })).status, 404)
    assert.equal((await pedir('/api/zro/ia/mensagens', { method: 'POST', cookies, headers: json, body: 'x'.repeat(70_000) })).status, 413)
    assert.equal(zro.estado.ia.length, n)
    const apagar = await pedir('/api/zro/ia/conversas/c-1', { method: 'DELETE', cookies, headers: { origin: SITE } })
    assert.equal(apagar.status, 200)
    assert.equal(zro.estado.ia.at(-1).metodo, 'DELETE')
  })
})

describe('token vencido pelo relógio', () => {
  test('passou da validade: renova antes de repassar e grava o cookie novo', async () => {
    zro.estado.expiraEm = 1 // o token já nasce vencendo (30 s de folga)
    try {
      const c2 = await entrar()
      const antes = zro.estado.renovacoes
      const r = await pedir('/api/zro/ia/estado', { cookies: c2 })
      assert.equal(r.status, 200)
      assert.equal(zro.estado.renovacoes, antes + 1)
      const novo = cookiesDe(r).get(`${PREFIXO}_tokens`)
      assert.ok(novo && novo !== c2[`${PREFIXO}_tokens`])
      assert.ok(r.headers.getSetCookie()[0].includes('Path=/api/zro'))
    } finally {
      zro.estado.expiraEm = 600
    }
  })

  test('refresh recusado: 401 e apaga os tokens', async () => {
    zro.estado.expiraEm = 1
    zro.estado.recusarRenovacao = true
    try {
      const c = await entrar()
      const r = await pedir('/api/zro/ia/estado', { cookies: c })
      assert.equal(r.status, 401)
      assert.equal(cookiesDe(r).get(`${PREFIXO}_tokens`), '')
    } finally {
      zro.estado.expiraEm = 600
      zro.estado.recusarRenovacao = false
    }
  })
})

describe('cliente ainda sem o escopo da Z', () => {
  test('a Absolute ZRO recusa zro.ia (invalid_scope): o login segue sem ele e a Z responde 401', async () => {
    zro.estado.pessoa = LIA
    zro.estado.recusarEscopoIa = true
    try {
      const ida = await pedir('/api/zro/entrar?volta=/x')
      const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
      assert.match(z.headers.get('location'), /error=invalid_scope/)
      const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(ida).get(`${PREFIXO}_zro`) } })
      assert.equal(volta.status, 303)
      // primeiro sem o Set (Absolute ZRO de antes dele); recusou de novo, sem a Z também
      assert.equal(volta.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_set=1')
      const idaSemSet = await pedir(volta.headers.get('location'))
      const zSemSet = await fetch(new URL(idaSemSet.headers.get('location')), { redirect: 'manual' })
      const volta2 = await pedir(zSemSet.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(idaSemSet).get(`${PREFIXO}_zro`) } })
      assert.equal(volta2.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_ia=1')
      const ida2 = await pedir(volta2.headers.get('location'))
      const u2 = new URL(ida2.headers.get('location'))
      assert.equal(u2.searchParams.get('scope'), 'openid email profile org offline_access')
      const z2 = await fetch(u2, { redirect: 'manual' })
      const fim = await pedir(z2.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(ida2).get(`${PREFIXO}_zro`) } })
      assert.equal(fim.headers.get('location'), '/x?zro=ok')
      const c = cookiesDe(fim)
      const r = await pedir('/api/zro/ia/estado', { cookies: { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) } })
      assert.equal(r.status, 401)
    } finally {
      zro.estado.recusarEscopoIa = false
    }
  })
})
