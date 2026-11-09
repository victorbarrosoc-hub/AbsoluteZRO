// /api/zro/* numa função só (api/conta.js): o plano grátis da Vercel (Hobby, team ZROFREE) aceita no máximo 12 funções
// por deploy. Confere a conta de funções, a tabela de rotas (estáticas, com [id] e desconhecidas) e que o handler recebe
// o endereço original, como quando era uma função própria.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import conta, { rota, enderecoOriginal, ROTAS } from '../api/conta.js'
import eu from '../api/_zro_rotas/eu.js'
import set from '../api/_zro_rotas/set.js'
import iaConversa from '../api/_zro_rotas/ia/conversas/[id].js'
import sonsZroId from '../api/_zro_rotas/sons/zro/[id].js'
import higgsfield from '../api/_zro_rotas/higgsfield/index.js'
import higgsfieldGerar from '../api/_zro_rotas/higgsfield/gerar.js'

const API = fileURLToPath(new URL('../api/', import.meta.url))

/** As funções que a Vercel cria: todo .js em api/ fora de arquivo ou pasta que começa com "_". */
function funcoes(dir = API) {
  const r = []
  for (const n of readdirSync(dir)) {
    if (n.startsWith('_')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) r.push(...funcoes(p))
    else if (n.endsWith('.js')) r.push(relative(API, p))
  }
  return r.sort()
}

test('no máximo 12 funções (limite do plano grátis da Vercel); hoje 4', () => {
  const f = funcoes()
  assert.ok(f.length <= 12, `${f.length} funções: ${f.join(', ')}`)
  assert.deepEqual(f, ['app.js', 'baixar.js', 'conta.js', 'previa.js'])
})

test('tabela de rotas: estáticas, com [id] e desconhecidas', () => {
  assert.equal(rota('eu').handler, eu)
  assert.equal(rota('eu/').handler, eu)
  assert.equal(rota('higgsfield').handler, higgsfield)
  assert.equal(rota('higgsfield/gerar').handler, higgsfieldGerar)
  const c = rota('ia/conversas/abc-123')
  assert.equal(c.handler, iaConversa)
  assert.deepEqual(c.params, { id: 'abc-123' })
  assert.equal(rota('sons/zro/9').handler, sonsZroId)
  assert.equal(rota('set').handler, set)
  assert.equal(rota('set/conversas/x/mensagens').handler, set)
  for (const nada of ['', 'nada', 'eu/mais', 'higgsfield/outra', 'ia/conversas/a/b', 'sons/openverse', '../_zro', 'ia//estado']) assert.equal(rota(nada), null, nada)
  // todo handler de api/_zro_rotas tem rota
  assert.equal(new Set(ROTAS.map(([, h]) => h)).size, 17)
})

test('o handler recebe o endereço original (/api/zro/<caminho>?<consulta sem o c>)', () => {
  assert.deepEqual(enderecoOriginal('/api/conta?c=ia/conversas/abc&x=1'), { caminho: 'ia/conversas/abc', url: '/api/zro/ia/conversas/abc?x=1' })
  assert.deepEqual(enderecoOriginal('/api/conta?c=set/conversas/a%20b'), { caminho: 'set/conversas/a b', url: '/api/zro/set/conversas/a%20b' })
  assert.deepEqual(enderecoOriginal('/api/conta?c=eu'), { caminho: 'eu', url: '/api/zro/eu' })
  // chamada direta (servidor de testes, sem rewrite)
  assert.deepEqual(enderecoOriginal('/api/zro/higgsfield/gerar?id=1'), { caminho: 'higgsfield/gerar', url: '/api/zro/higgsfield/gerar?id=1' })
})

function resposta() {
  const r = { statusCode: 200, cabecalhos: {}, corpo: '' }
  r.setHeader = (k, v) => (r.cabecalhos[k.toLowerCase()] = v)
  r.getHeader = (k) => r.cabecalhos[k.toLowerCase()]
  r.end = (c = '') => {
    r.corpo += c
    r.fim = true
  }
  r.writeHead = (s, h = {}) => {
    r.statusCode = s
    for (const [k, v] of Object.entries(h)) r.setHeader(k, v)
    return r
  }
  return r
}

test('pela função: rota que existe chega ao handler com o endereço original; desconhecida é o 404 neutro', async () => {
  const antes = { id: process.env.ZRO_CLIENT_ID, segredo: process.env.ZRO_CLIENT_SECRET }
  delete process.env.ZRO_CLIENT_ID
  delete process.env.ZRO_CLIENT_SECRET
  try {
    // /api/zro/eu sem o login configurado: 503 configurado:false, como a função própria respondia
    const req = { method: 'GET', url: '/api/conta?c=eu', headers: { host: 'localhost' } }
    const res = resposta()
    await conta(req, res)
    assert.equal(res.statusCode, 503)
    assert.deepEqual(JSON.parse(res.corpo), { ok: false, configurado: false })
    assert.equal(req.url, '/api/zro/eu')
    assert.deepEqual(req.query, {})
    // com [id]: req.query.id, como a Vercel fazia com o nome do arquivo
    const r2 = { method: 'GET', url: '/api/conta?c=ia/conversas/xyz&p=2', headers: { host: 'localhost' } }
    await conta(r2, resposta())
    assert.equal(r2.url, '/api/zro/ia/conversas/xyz?p=2')
    assert.deepEqual(r2.query, { p: '2', id: 'xyz' })
    // desconhecida: 404 com a página neutra
    const r3 = resposta()
    await conta({ method: 'GET', url: '/api/conta?c=nada/aqui', headers: {} }, r3)
    assert.equal(r3.statusCode, 404)
    assert.match(r3.corpo, /indisponível/)
    assert.doesNotMatch(r3.corpo, /AEON/)
  } finally {
    if (antes.id !== undefined) process.env.ZRO_CLIENT_ID = antes.id
    if (antes.segredo !== undefined) process.env.ZRO_CLIENT_SECRET = antes.segredo
  }
})
