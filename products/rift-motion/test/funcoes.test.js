// O Rift cabe no plano grátis da Vercel (no máximo 12 funções por deploy): /api/zro/* e /api/rift/* são uma função
// cada (api/_roteador.js), e o roteador entrega a cada handler o mesmo pedido de quando ele era uma função só dele.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const API = join(RAIZ, 'api')

/** As funções que a Vercel cria: todo .js em api/ que não começa com "_" e não está numa pasta com "_". */
function funcoes(dir = API) {
  const r = []
  for (const n of readdirSync(dir)) {
    if (n.startsWith('_')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) r.push(...funcoes(p))
    else if (n.endsWith('.js')) r.push(relative(RAIZ, p).split('\\').join('/'))
  }
  return r.sort()
}

const resposta = () => {
  const r = { statusCode: 0, headers: {}, corpo: '' }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c == null ? '' : String(c))
  return r
}

test('no máximo 10 funções (o plano grátis aceita 12) e todo padrão de `functions` do vercel.json acha a sua', () => {
  const f = funcoes()
  assert.deepEqual(f, ['api/conta.js', 'api/dados.js', 'api/pagina.js', 'api/previa.js', 'api/recurso.js'])
  assert.ok(f.length <= 10)
  const v = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
  // a Vercel recusa o deploy se um padrão de `functions` não casa com nenhuma função
  for (const padrao of Object.keys(v.functions)) {
    const re = new RegExp(`^${padrao.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`)
    assert.ok(f.some((x) => re.test(x)), `padrão sem função: ${padrao}`)
  }
  const r = Object.fromEntries(v.rewrites.map((x) => [x.source, x.destination]))
  assert.equal(r['/api/zro/:c*'], '/api/conta?c=:c*')
  assert.equal(r['/api/rift/:c*'], '/api/dados?c=:c*')
})

test('roteador: pelo ?c= da Vercel ou pelo caminho, o handler vê o endereço público com a consulta original', async () => {
  const { roteador, caminhoDe, consultaSemC } = await import('../api/_roteador.js')
  const vistos = []
  const rotear = roteador('/api/zro', { eu: (req) => vistos.push(['eu', req.url]), 'higgsfield/gerar': (req) => vistos.push(['gerar', req.url]) })
  await rotear({ url: '/api/conta?c=eu' }, resposta())
  await rotear({ url: '/api/conta?c=higgsfield%2Fgerar&id=abc123def456' }, resposta())
  await rotear({ url: '/api/conta?c=higgsfield/gerar&id=x' }, resposta())
  await rotear({ url: '/api/zro/higgsfield/gerar?duracao=longo&proporcao=9:16' }, resposta())
  await rotear({ url: '/api/zro/eu/' }, resposta())
  assert.deepEqual(vistos, [
    ['eu', '/api/zro/eu'],
    ['gerar', '/api/zro/higgsfield/gerar?id=abc123def456'],
    ['gerar', '/api/zro/higgsfield/gerar?id=x'],
    ['gerar', '/api/zro/higgsfield/gerar?duracao=longo&proporcao=9:16'],
    ['eu', '/api/zro/eu'],
  ])
  assert.equal(caminhoDe('/api/dados?c=projetos&id=p1', '/api/rift'), 'projetos')
  assert.equal(consultaSemC('/api/dados?c=projetos&id=p1&volta=%2F'), '?id=p1&volta=%2F')
  assert.equal(consultaSemC('/api/dados?c=projetos'), '')
})

test('roteador: caminho que não existe dá a página neutra com 404 (sem dizer que a rota existiria)', async () => {
  const conta = (await import('../api/conta.js')).default
  const dados = (await import('../api/dados.js')).default
  for (const [f, url] of [
    [conta, '/api/conta?c=nada'],
    [conta, '/api/zro/higgsfield/outra'],
    [conta, '/api/zro'],
    [dados, '/api/dados?c=../_banco'],
    [dados, '/api/rift/projetos/extra'],
    [dados, '/api/dados'],
  ]) {
    const r = resposta()
    await f({ url, method: 'GET', headers: {} }, r)
    assert.equal(r.statusCode, 404, url)
    assert.match(r.corpo, /Página <\/span><b>indisponível/, url)
    assert.doesNotMatch(r.corpo, /rift/i, url)
  }
})

test('roteador: as rotas de sempre, sem banco nem login, respondem como antes', async () => {
  for (const k of ['ZRO_CHAVE_PREVIA', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'RIFT_DATABASE_URL']) delete process.env[k]
  const conta = (await import('../api/conta.js')).default
  const dados = (await import('../api/dados.js')).default
  const pedido = (url) => ({ url, method: 'GET', headers: { host: 'rift.absolutezro.com', 'x-forwarded-proto': 'https' } })
  let r = resposta()
  await conta(pedido('/api/conta?c=eu'), r)
  assert.deepEqual(JSON.parse(r.corpo), { ok: false, configurado: false })
  r = resposta()
  await conta(pedido('/api/conta?c=entrar&volta=%2F%23projetos'), r)
  assert.equal(r.statusCode, 303)
  assert.equal(r.headers.location, '/?zro=config#projetos')
  r = resposta()
  await dados(pedido('/api/dados?c=saude'), r)
  assert.deepEqual(JSON.parse(r.corpo), { ok: false, nuvem: false })
})
