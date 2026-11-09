// A porta de prévia por chave (api/_previa.js, ZRO_CHAVE_PREVIA): sem a variável nada muda; com ela, só quem abriu
// /previa com a chave vê o site e usa a API, e o resto vê a página neutra. Sem banco nem login, a interface aguenta.
import { test, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const CHAVE = 'chave-de-previa-do-titular-para-teste-123'

const pedido = (url, cookie, metodo = 'GET') => ({ url, method: metodo, headers: { host: 'rift-zrofree.vercel.app', 'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}) } })
const resposta = () => {
  const r = { statusCode: 0, headers: {}, corpo: '' }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c == null ? '' : Buffer.isBuffer(c) ? c.toString('utf8') : String(c))
  return r
}
const chamar = async (rota, url, cookie, metodo) => {
  const f = (await import(`../api/${rota}.js`)).default
  const r = resposta()
  await f(pedido(url, cookie, metodo), r)
  return r
}
const neutra = (r) => /Página <\/span><b>indisponível/.test(r.corpo) && !/rift/i.test(r.corpo)
const ambiente = (env) => {
  for (const k of ['ZRO_CHAVE_PREVIA', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'RIFT_DATABASE_URL']) delete process.env[k]
  Object.assign(process.env, env)
}
afterEach(() => ambiente({}))
after(() => execFileSync(process.execPath, ['publicar.mjs'], { cwd: RAIZ, env: { ...process.env, ZRO_CHAVE_PREVIA: '' }, stdio: 'pipe' }))

/** Abre a porta com a chave certa e devolve o cookie ("rf_previa=…"). */
async function entrarNaPrevia() {
  const r = await chamar('previa', `/previa?chave=${encodeURIComponent(CHAVE)}`)
  return r.headers['set-cookie'][0].split(';')[0]
}

test('a página neutra não diz nada do app', () => {
  const html = readFileSync(new URL('../neutra.html', import.meta.url), 'utf8')
  assert.match(html, /Página <\/span><b>indisponível/)
  assert.doesNotMatch(html, /rift|motion/i)
})

test('sem a variável: nada muda (o site sai inteiro; /previa é a página neutra; a API responde como sempre)', async () => {
  ambiente({})
  const p = await chamar('pagina', '/api/pagina')
  assert.equal(p.statusCode, 200)
  assert.match(p.corpo, /<title>Rift Motion/)
  assert.equal((await chamar('recurso', '/api/recurso?f=app.js')).statusCode, 200)
  const pv = await chamar('previa', `/previa?chave=${encodeURIComponent(CHAVE)}`)
  assert.equal(pv.statusCode, 404)
  assert.ok(neutra(pv))
  const eu = await chamar('zro/eu', '/api/zro/eu')
  assert.deepEqual(JSON.parse(eu.corpo), { ok: false, configurado: false })
})

test('chave curta (menos de 24): a porta não existe', async () => {
  ambiente({ ZRO_CHAVE_PREVIA: 'curta-demais' })
  const r = await chamar('previa', '/previa?chave=curta-demais')
  assert.equal(r.statusCode, 404)
  assert.ok(neutra(r))
  assert.equal(r.headers['set-cookie'], undefined)
  assert.match((await chamar('pagina', '/api/pagina')).corpo, /<title>Rift Motion/) // como sem a variável
})

test('chave errada: a página neutra, sem cookie e sem pista', async () => {
  ambiente({ ZRO_CHAVE_PREVIA: CHAVE })
  for (const url of ['/previa?chave=errada', '/previa', `/previa?chave=${encodeURIComponent(CHAVE)}x`]) {
    const r = await chamar('previa', url)
    assert.equal(r.statusCode, 404, url)
    assert.ok(neutra(r), url)
    assert.equal(r.headers['set-cookie'], undefined, url)
  }
})

test('chave certa: 303 para o site e o cookie com o HMAC, nunca a chave', async () => {
  ambiente({ ZRO_CHAVE_PREVIA: CHAVE })
  const r = await chamar('previa', `/previa?chave=${encodeURIComponent(CHAVE)}`)
  assert.equal(r.statusCode, 303)
  assert.equal(r.headers.location, '/')
  const [cookie] = r.headers['set-cookie']
  assert.match(cookie, /^rf_previa=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/)
  assert.ok(!cookie.includes(CHAVE))
})

test('com o cookie: o site, os arquivos e a API (sem banco nem login, a interface aguenta)', async () => {
  ambiente({ ZRO_CHAVE_PREVIA: CHAVE })
  const c = await entrarNaPrevia()
  const p = await chamar('pagina', '/api/pagina', c)
  assert.equal(p.statusCode, 200)
  assert.match(p.corpo, /<title>Rift Motion/)
  assert.equal(p.headers['x-robots-tag'], 'noindex, nofollow')
  for (const f of ['app.js', 'tema.js', 'vendor/three-r128.min.js', 'favicon.svg', 'og.png', 'marca/favicon.svg']) assert.equal((await chamar('recurso', `/api/recurso?f=${f}`, c)).statusCode, 200, f)
  for (const f of ['../api/_previa.js', 'prototipo.html', 'marca/vetorizar.py', 'neutra.html']) assert.equal((await chamar('recurso', `/api/recurso?f=${encodeURIComponent(f)}`, c)).statusCode, 404, f)
  // sem login: o painel abre em demonstração; sem banco: os dados seguem no aparelho (503 que a tela entende)
  assert.deepEqual(JSON.parse((await chamar('zro/eu', '/api/zro/eu', c)).corpo), { ok: false, configurado: false })
  const proj = await chamar('rift/projetos', '/api/rift/projetos', c)
  assert.equal(proj.statusCode, 503)
  assert.equal(JSON.parse(proj.corpo).ok, false)
  assert.deepEqual(JSON.parse((await chamar('rift/saude', '/api/rift/saude', c)).corpo), { ok: false, nuvem: false })
})

test('sem cookie ou com cookie forjado: a página neutra no site, nos arquivos e em toda a API', async () => {
  ambiente({ ZRO_CHAVE_PREVIA: CHAVE })
  for (const cookie of [undefined, 'rf_previa=forjado', 'rf_previa=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']) {
    const p = await chamar('pagina', '/api/pagina', cookie)
    assert.equal(p.statusCode, 200)
    assert.ok(neutra(p))
    assert.equal((await chamar('recurso', '/api/recurso?f=app.js', cookie)).statusCode, 404)
    for (const rota of ['zro/eu', 'zro/entrar', 'rift/saude', 'rift/projetos', 'rift/biblioteca', 'rift/z', 'zro/higgsfield/index']) {
      const r = await chamar(rota, `/api/${rota}`, cookie)
      assert.equal(r.statusCode, 404, `${rota} ${cookie}`)
      assert.ok(neutra(r), rota)
    }
  }
})

test('build: com a porta, o estático fica só com fontes e robots; sem ela, o site inteiro', () => {
  execFileSync(process.execPath, ['publicar.mjs'], { cwd: RAIZ, env: { ...process.env, ZRO_CHAVE_PREVIA: CHAVE }, stdio: 'pipe' })
  for (const f of ['index.html', 'app.js', 'tema.js', 'og.png', 'favicon.svg', 'marca', 'vendor']) assert.ok(!existsSync(`${RAIZ}/publico/${f}`), f)
  assert.ok(existsSync(`${RAIZ}/publico/fontes/figtree-latin-wght-normal.woff2`))
  assert.match(readFileSync(`${RAIZ}/publico/robots.txt`, 'utf8'), /Disallow: \//)
  execFileSync(process.execPath, ['publicar.mjs'], { cwd: RAIZ, env: { ...process.env, ZRO_CHAVE_PREVIA: '' }, stdio: 'pipe' })
  for (const f of ['index.html', 'app.js', 'tema.js', 'og.png', 'vendor/three-r128.min.js']) assert.ok(existsSync(`${RAIZ}/publico/${f}`), f)
})

test('vercel.json: /previa, / e os arquivos caem nas funções quando o estático não tem (porta ligada)', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const r = Object.fromEntries(v.rewrites.map((x) => [x.source, x.destination]))
  assert.equal(r['/previa'], '/api/previa')
  assert.equal(r['/'], '/api/pagina')
  assert.equal(r['/vendor/:f*'], '/api/recurso?f=vendor/:f*')
  assert.match(v.functions['api/recurso.js'].includeFiles, /prototipo\.html/)
  assert.match(v.functions['api/previa.js'].includeFiles, /neutra\.html/)
})
