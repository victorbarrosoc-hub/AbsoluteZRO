// As portas do CAMZRO (api/_sessao.js): não lançado, ninguém vê nada sem passar por uma delas. Conta Absolute ZRO com
// `camzro` na claim zro_release, prévia do titular (chave) ou modo local. Fora disso, a página neutra e 404.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

const PORTA = 8191
let srv
const url = (c) => `http://localhost:${PORTA}${c}`
/** GET com outro Host (o fetch do Node não deixa trocar o Host). */
const comHost = (caminho, host) =>
  new Promise((ok, erro) => {
    const r = http.get({ host: '127.0.0.1', port: PORTA, path: caminho, headers: { host } }, (res) => {
      let t = ''
      res.on('data', (c) => (t += c))
      res.on('end', () => ok(t))
    })
    r.on('error', erro)
  })
const ambiente = (env) => {
  for (const k of ['CAMZRO_LOCAL', 'CAMZRO_CHAVE_PREVIA', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET']) delete process.env[k]
  Object.assign(process.env, env)
}

before(async () => {
  const { servir } = await import('../scripts/servir.mjs')
  srv = await servir({ porta: PORTA })
})
after(() => srv.close())

test('sem porta nenhuma: página neutra, app e API fechados', async () => {
  ambiente({})
  const r = await fetch(url('/'))
  const html = await r.text()
  assert.equal(r.status, 200)
  assert.match(html, /Página <\/span><b>indisponível/)
  assert.doesNotMatch(html, /CAMZRO|camzro/i)
  assert.equal((await fetch(url('/app/app.js'))).status, 404)
  assert.equal((await fetch(url('/sw.js'))).status, 404)
  assert.equal((await fetch(url('/api/camzro/hora'))).status, 401)
  const robots = await (await fetch(url('/robots.txt'))).text()
  assert.match(robots, /Disallow: \//)
})

test('modo local (só localhost, sem login configurado): o app abre', async () => {
  ambiente({ CAMZRO_LOCAL: '1' })
  const r = await fetch(url('/'))
  assert.equal(r.headers.get('x-camzro'), 'app')
  const html = await r.text()
  assert.match(html, /<title>CAMZRO<\/title>/)
  assert.match(html, /name="camzro-modo" content="local"/)
  assert.doesNotMatch(html, /%[A-Z_]+%/) // todos os marcadores trocados
  for (const f of ['app.js', 'app.css', 'motor/gravador.js', 'motor/escritor.worker.js', 'vendor/mediabunny.min.mjs', 'vendor/xxhash-wasm.js', 'nucleo/timecode.js', 'manifest.webmanifest', 'marca/simbolo-branco.svg']) {
    const a = await fetch(url(`/app/${f}`))
    assert.equal(a.status, 200, f)
  }
  // nada fora da lista: páginas, a API e caminhos com ..
  for (const f of ['app.html', 'indisponivel.html', '../api/_zro.js', '..%2Fapi%2F_zro.js', 'nada.js']) assert.equal((await fetch(url(`/app/${f}`))).status, 404, f)
  const sw = await fetch(url('/sw.js'))
  assert.equal(sw.status, 200)
  assert.equal(sw.headers.get('service-worker-allowed'), '/')
  const h = await (await fetch(url('/api/camzro/hora'))).json()
  assert.ok(Math.abs(h.agora - Date.now()) < 5000)
  // o modo local não liga num host que não é localhost
  assert.match(await comHost('/', 'camzro.absolutezro.com'), /indisponível/)
})

test('prévia do titular: só com a chave certa, e o cookie leva o HMAC, nunca a chave', async () => {
  const chave = 'k'.repeat(16) + '-previa-de-teste-123'
  ambiente({ CAMZRO_CHAVE_PREVIA: chave })
  const errada = await fetch(url('/previa?chave=errada'), { redirect: 'manual' })
  assert.equal(errada.status, 404)
  assert.match(await errada.text(), /indisponível/)
  const certa = await fetch(url(`/previa?chave=${encodeURIComponent(chave)}`), { redirect: 'manual' })
  assert.equal(certa.status, 303)
  const cookie = certa.headers.get('set-cookie')
  assert.match(cookie, /^cz_previa=[A-Za-z0-9_-]+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax/)
  assert.ok(!cookie.includes(chave))
  const valor = cookie.split(';')[0]
  const r = await fetch(url('/'), { headers: { cookie: valor } })
  assert.match(await r.text(), /name="camzro-modo" content="previa"/)
  assert.equal((await fetch(url('/app/app.js'), { headers: { cookie: valor } })).status, 200)
  // cookie forjado não passa
  assert.match(await (await fetch(url('/'), { headers: { cookie: 'cz_previa=abc' } })).text(), /indisponível/)
  // chave curta demais: a porta não existe
  ambiente({ CAMZRO_CHAVE_PREVIA: 'curta' })
  assert.equal((await fetch(url('/previa?chave=curta'), { redirect: 'manual' })).status, 404)
  assert.match(await (await fetch(url('/'), { headers: { cookie: valor } })).text(), /indisponível/)
})

test('conta Absolute ZRO: entra só com `camzro` na claim zro_release (gate de lançamento)', async () => {
  ambiente({ ZRO_CLIENT_ID: 'camzro-web', ZRO_CLIENT_SECRET: 's'.repeat(40), CAMZRO_LOCAL: '1' })
  const { selar, COOKIE_CONTA } = await import('../api/_zro.js')
  const com = `${COOKIE_CONTA}=${selar(COOKIE_CONTA, { sub: 'p1', nome: 'Ana', apps: ['camzro', 'relay'] }, 3600)}`
  const sem = `${COOKIE_CONTA}=${selar(COOKIE_CONTA, { sub: 'p2', nome: 'Bia', apps: ['relay'] }, 3600)}`
  const html = await (await fetch(url('/'), { headers: { cookie: com } })).text()
  assert.match(html, /name="camzro-modo" content="conta"/)
  assert.match(html, /name="camzro-set" content="https:\/\/absolutezro.com\/set\/v1\/zro-set.js"/)
  assert.match(await (await fetch(url('/'), { headers: { cookie: sem } })).text(), /indisponível/)
  // com o login configurado, o modo local desliga mesmo em localhost
  assert.match(await (await fetch(url('/'))).text(), /indisponível/)
})

test('vercel.json: câmera e microfone só no próprio site, CSP fechada, tudo pelo gate', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const h = Object.fromEntries(v.headers.find((x) => x.source === '/(.*)').headers.map((x) => [x.key, x.value]))
  assert.match(h['Permissions-Policy'], /camera=\(self\)/)
  assert.match(h['Permissions-Policy'], /microphone=\(self\)/)
  assert.match(h['Content-Security-Policy'], /script-src 'self' 'wasm-unsafe-eval'/)
  assert.match(h['Content-Security-Policy'], /connect-src 'self';/)
  assert.match(h['X-Robots-Tag'], /noindex/)
  const r = Object.fromEntries(v.rewrites.map((x) => [x.source, x.destination]))
  assert.equal(r['/'], '/api/pagina')
  assert.equal(r['/app/:f*'], '/api/recurso?f=:f*')
  assert.equal(r['/sw.js'], '/api/recurso?f=sw.js')
  assert.equal(v.outputDirectory, 'publico')
})

test('as cópias em app/vendor batem com os pacotes (ninguém edita a biblioteca à mão)', () => {
  const nm = (p) => readFileSync(new URL(`../node_modules/${p}`, import.meta.url))
  const vd = (p) => readFileSync(new URL(`../app/vendor/${p}`, import.meta.url))
  assert.ok(vd('mediabunny.min.mjs').equals(nm('mediabunny/dist/bundles/mediabunny.min.mjs')))
  assert.ok(vd('xxhash-wasm.js').equals(nm('xxhash-wasm/esm/xxhash-wasm.js')))
})
