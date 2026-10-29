// A Z (IA da Absolute ZRO) no app de computador: o painel fala com /api/ia/* do motor, e o motor repassa ao site
// (/api/zro/ia/*) com o Bearer deste computador. Confere: sem conta = 401 sem_conta (nada sai daqui), com conta o
// Bearer vai ao site e nunca volta à interface, o NDJSON passa em streaming, DELETE de conversa sem corpo passa,
// origem de fora é recusada, e a CSP da interface libera só o script da Absolute ZRO.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import { startApp } from '../src/index.js'
import { closeHttp } from '../src/net/http.js'
import { makeTmpDir, waitFor } from './helpers.js'
import { startMockCloud } from './mock-cloud.js'

let site, home, app

before(async () => {
  home = await makeTmpDir()
  site = await startMockCloud()
  app = await startApp({
    home,
    port: 0,
    open: false,
    quiet: true,
    cloudOptions: { pollMs: 20, retryBaseMs: 5, refreshEveryMs: 0, deviceName: 'Mac de Teste', platform: 'darwin', baseUrl: site.url },
    serverOptions: { log: () => {} },
  })
})

after(async () => {
  await app?.shutdown()
  await site?.close().catch(() => {})
  await fs.rm(home, { recursive: true, force: true, maxRetries: 3 })
  await closeHttp()
})

/** Pedido ao motor; `aoPrimeiro` recebe o primeiro pedaço do corpo (para conferir o streaming). */
function call(method, p, { body, headers = {}, aoPrimeiro } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const h = { host: `127.0.0.1:${app.port}`, ...headers }
    if (data != null) {
      h['content-type'] = 'application/json'
      h['content-length'] = Buffer.byteLength(data)
    }
    const req = http.request({ host: '127.0.0.1', port: app.port, method, path: p, headers: h, agent: false }, res => {
      const chunks = []
      res.on('data', c => {
        if (!chunks.length) aoPrimeiro?.(c.toString('utf8'))
        chunks.push(c)
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (data != null) req.write(data)
    req.end()
  })
}

test('a CSP da interface libera o script da Absolute ZRO e só ele', async () => {
  const r = await call('GET', '/')
  const csp = r.headers['content-security-policy']
  assert.match(csp, /script-src 'self' https:\/\/absolutezro\.com(;|$)/)
  assert.match(csp, /connect-src 'self'(;|$)/)
})

test('sem conta neste computador: 401 sem_conta e nada vai ao site', async () => {
  const r = await call('GET', '/api/ia/estado')
  assert.equal(r.status, 401)
  assert.equal(JSON.parse(r.text).erro, 'sem_conta')
  assert.equal(site.ia.length, 0)
})

test('com conta: o motor repassa com o Bearer do computador, que não volta à interface', async () => {
  let r = await call('POST', '/api/cloud/login', { body: {} })
  assert.equal(r.status, 200)
  site.approve(JSON.parse(r.text).cloud.login.codigo)
  await waitFor(async () => JSON.parse((await call('GET', '/api/cloud')).text).cloud.conectado, { message: 'entrou na conta' })

  r = await call('GET', '/api/ia/estado')
  assert.equal(r.status, 200)
  assert.equal(JSON.parse(r.text).nome, 'Ana')
  assert.doesNotMatch(r.text, /sdd_/)
  assert.match(site.ia.at(-1).autorizacao, /^Bearer sdd_/)
  assert.equal(site.ia.at(-1).caminho, 'estado')
})

test('mensagens: NDJSON em streaming (o primeiro pedaço chega antes do fim)', async () => {
  let primeiro = ''
  const r = await call('POST', '/api/ia/mensagens', { body: { texto: 'oi' }, aoPrimeiro: t => (primeiro = t) })
  assert.equal(r.status, 200)
  assert.match(r.headers['content-type'], /ndjson/)
  assert.match(primeiro, /"tipo":"conversa"/)
  assert.doesNotMatch(primeiro, /"tipo":"fim"/)
  assert.match(r.text, /"tipo":"fim"/)
  assert.equal(site.ia.at(-1).corpo, JSON.stringify({ texto: 'oi' }))
})

test('apagar conversa: DELETE sem corpo passa; de outra origem, não', async () => {
  let r = await call('DELETE', '/api/ia/conversas/c1', { headers: { origin: `http://127.0.0.1:${app.port}` } })
  assert.equal(r.status, 204)
  r = await call('DELETE', '/api/ia/conversas/c1', { headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
  r = await call('POST', '/api/ia/mensagens', { body: { texto: 'oi' }, headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
  r = await call('GET', '/api/ia/conversas/..%2Fx')
  assert.equal(r.status, 404)
})

test('conta sem o token da Z: o 401 do site chega ao painel (que pede para reconectar)', async () => {
  site.iaSemToken = true
  const r = await call('GET', '/api/ia/conversas')
  site.iaSemToken = false
  assert.equal(r.status, 401)
  assert.equal(JSON.parse(r.text).erro, 'reconectar_zro')
  // e o computador continua na conta (não é a sessão dele que caiu)
  assert.equal(JSON.parse((await call('GET', '/api/cloud')).text).cloud.conectado, true)
})
