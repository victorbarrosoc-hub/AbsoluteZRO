// Os sons da Sonoplasta: o repasse /api/zro/sons/* (api/_sons.js) contra a Absolute ZRO falsa. Só os dois caminhos e só
// GET; o token da sessão vai no Authorization e nunca o cookie; o arquivo passa com o tipo e os X-Zro-Som-*; sem sessão
// é 401; produto fechado é 403 antes de qualquer pedido; e o login que pede zro.sons volta sem ele quando a Absolute ZRO
// ainda não o conhece (com a Z e o Set).

import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { iniciarZroFalsa } from './zro-falso.js'
import { selar } from '../api/_zro.js'

const PREFIXO = 'ae'
const PRODUTO = 'ai-edit'
const CLIENTE = { clientId: 'aeon-web', clientSecret: 'segredo-de-teste-do-aeon-sons' }
const LIA = { sub: 'zro-411', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: [PRODUTO], release: { [PRODUTO]: 'allowed' } }
const ID = 'eab8a6e2-0ac8-4615-9e0d-ebde30523783'
let zro, app, SITE
const f = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback']) f[r] = (await import(`../api/zro/${r}.js`)).default
  f.buscar = (await import('../api/zro/sons/buscar.js')).default
  f.arquivo = (await import('../api/zro/sons/openverse/[id].js')).default
  app = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    if (p === '/api/zro/entrar') return f.entrar(req, res)
    if (p === '/api/zro/callback') return f.callback(req, res)
    if (p === '/api/zro/sons/buscar') return f.buscar(req, res)
    if (p.startsWith('/api/zro/sons/')) return f.arquivo(req, res)
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
beforeEach(() => Object.assign(zro.estado, { pessoa: LIA, sons: [], recusarEscopoSons: false, recusarEscopoSet: false, recusarEscopoIa: false, gate: null }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const pedir = (caminho, { cookies = {}, ...init } = {}) =>
  fetch(new URL(caminho, SITE), {
    redirect: 'manual',
    ...init,
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      ...(init.headers || {}),
    },
  })
async function idaEVolta(entrar) {
  const ida = await pedir(entrar)
  const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
  return pedir(z.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(ida).get(`${PREFIXO}_zro`) } })
}
async function entrar() {
  const c = cookiesDe(await idaEVolta('/api/zro/entrar'))
  return { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) }
}

describe('repasse dos sons', () => {
  test('sem sessão: 401, e nada chega à Absolute ZRO', async () => {
    const r = await pedir('/api/zro/sons/buscar?q=whoosh')
    assert.equal(r.status, 401)
    assert.equal(zro.estado.sons.length, 0)
  })

  test('busca: só q e pagina seguem, com o token no Authorization e sem o cookie', async () => {
    const c = await entrar()
    const r = await pedir('/api/zro/sons/buscar?q=whoosh&pagina=2&extra=x', { cookies: c })
    assert.equal(r.status, 200)
    const j = await r.json()
    assert.equal(j.sons[0].licenca, 'CC0 1.0')
    const p = zro.estado.sons.at(-1)
    assert.equal(p.caminho, '/buscar')
    assert.equal(p.consulta, '?q=whoosh&pagina=2')
    assert.match(p.autorizacao, /^Bearer /)
    assert.equal(p.cookie, null)
  })

  test('arquivo: passa o áudio com o tipo e os X-Zro-Som-*; caminho fora do contrato é 404; só GET', async () => {
    const c = await entrar()
    const r = await pedir(`/api/zro/sons/openverse/${ID}`, { cookies: c })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'audio/mpeg')
    assert.equal(r.headers.get('x-zro-som-id'), ID)
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3, 4])
    assert.equal((await pedir('/api/zro/sons/openverse/../../ia/estado', { cookies: c })).status, 404)
    assert.equal((await pedir('/api/zro/sons/openverse/nao-e-id', { cookies: c })).status, 404)
    assert.equal((await pedir(`/api/zro/sons/openverse/${ID}`, { cookies: c, method: 'POST' })).status, 405)
  })

  test('banco no Drive: a pasta e o arquivo seguem só com os parâmetros conferidos', async () => {
    const c = await entrar()
    f.banco = f.banco || (await import('../api/zro/sons/banco/index.js')).default
    f.somBanco = f.somBanco || (await import('../api/zro/sons/banco/[id].js')).default
    const lista = await pedir('/api/zro/sons/banco?pasta=1AbCdEfGhIjKlMnOp&q=whoosh&conta=c1&token=roubar', { cookies: c })
    assert.equal(lista.status, 200)
    assert.equal((await lista.json()).sons[0].origem, 'banco')
    assert.equal(zro.estado.sons.at(-1).caminho, '/banco')
    assert.equal(zro.estado.sons.at(-1).consulta, '?pasta=1AbCdEfGhIjKlMnOp&q=whoosh&conta=c1')
    // pasta que não é id do Drive vira "x" (a Absolute ZRO responde 422 com a frase), nunca segue como veio
    const ruim = await pedir('/api/zro/sons/banco?pasta=https%3A%2F%2Fevil', { cookies: c })
    assert.equal(ruim.status, 422)
    assert.equal(zro.estado.sons.at(-1).consulta, '?pasta=x')
    // Drive não conectado: a frase da Absolute ZRO chega à tela
    const semDrive = await pedir('/api/zro/sons/banco?pasta=1SemDriveConectado', { cookies: c })
    assert.equal(semDrive.status, 409)
    assert.match((await semDrive.json()).message, /SOBEDESCE/)
    const som = await pedir('/api/zro/sons/banco/1WhooshDoBancoXyz?conta=c1&x=1', { cookies: c })
    assert.equal(som.status, 200)
    assert.equal(som.headers.get('x-zro-som-id'), '1WhooshDoBancoXyz')
    assert.equal(som.headers.get('cache-control'), 'no-store')
    assert.deepEqual([...new Uint8Array(await som.arrayBuffer())], [1, 2, 3, 4])
    assert.equal(zro.estado.sons.at(-1).consulta, '?conta=c1')
    assert.equal((await pedir('/api/zro/sons/banco/curto', { cookies: c })).status, 404)
  })

  test('sons da Absolute ZRO: o catálogo e o arquivo de uma versão seguem sem parâmetro nenhum', async () => {
    const c = await entrar()
    f.zro = f.zro || (await import('../api/zro/sons/zro/index.js')).default
    f.somZro = f.somZro || (await import('../api/zro/sons/zro/[id].js')).default
    const lista = await pedir('/api/zro/sons/zro?x=1', { cookies: c })
    assert.equal(lista.status, 200)
    assert.equal(lista.headers.get('cache-control'), 'no-store')
    assert.equal((await lista.json()).sons[0].versoes[0].id, 'boom-grave-v2')
    assert.equal(zro.estado.sons.at(-1).caminho, '/zro')
    assert.equal(zro.estado.sons.at(-1).consulta, '')
    const som = await pedir('/api/zro/sons/zro/boom-grave-v1?y=2', { cookies: c })
    assert.equal(som.status, 200)
    assert.equal(som.headers.get('x-zro-som-id'), 'boom-grave-v1')
    assert.equal(som.headers.get('cache-control'), 'private, max-age=86400')
    assert.equal(zro.estado.sons.at(-1).consulta, '')
    for (const ruim of ['/api/zro/sons/zro/Boom', '/api/zro/sons/zro/a', '/api/zro/sons/zro/a--b', '/api/zro/sons/zro/x-'])
      assert.equal((await pedir(ruim, { cookies: c })).status, 404, ruim)
  })

  test('fechado ao público: sessão que o HUB não liberou recebe 403 sem falar com a Absolute ZRO', async () => {
    const cookies = await entrar()
    zro.estado.sons = []
    const fechada = selar(`${PREFIXO}_conta`, { sub: LIA.sub, nome: LIA.nome, email: LIA.email, produtos: [PRODUTO], release: 'closed' }, 3600)
    const r = await pedir('/api/zro/sons/buscar?q=whoosh', { cookies: { ...cookies, [`${PREFIXO}_conta`]: fechada } })
    assert.equal(r.status, 403)
    assert.equal(zro.estado.sons.length, 0)
  })
})

describe('login com zro.sons', () => {
  test('pede zro.sons junto com a Z e o Set', async () => {
    const ida = await pedir('/api/zro/entrar')
    assert.equal(new URL(ida.headers.get('location')).searchParams.get('scope'), 'openid email profile org offline_access zro.ia zro.set zro.sons zro.higgsfield')
  })

  test('Absolute ZRO de antes da Sonoplasta (invalid_scope): entra de novo sem zro.sons, com a Z e o Set', async () => {
    zro.estado.recusarEscopoSons = true
    const volta0 = await idaEVolta('/api/zro/entrar?volta=/x')
    assert.equal(volta0.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_hf=1')
    const volta = await idaEVolta(volta0.headers.get('location'))
    assert.equal(volta.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_sons=1')
    const fim = await idaEVolta(volta.headers.get('location'))
    assert.equal(zro.estado.escopo, 'openid email profile org offline_access zro.ia zro.set')
    assert.equal(fim.headers.get('location'), '/x?zro=ok')
    // sem o escopo, a busca volta 401 da Absolute ZRO (o painel diz para entrar de novo)
    const c = cookiesDe(fim)
    const r = await pedir('/api/zro/sons/buscar?q=whoosh', { cookies: { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) } })
    assert.equal(r.status, 401)
  })
})
