// IA no Rift: conexão com a Higgsfield (chave e conta), gerar com IA e a Z, num Postgres de verdade e com a
// Higgsfield simulada (fetch falso): nenhum teste gasta crédito nem sai para a internet.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const pular = semPostgres
let pg, urlRift, z, banco, rotas, conexao
const fetchDeVerdade = globalThis.fetch
let simulado = null
globalThis.fetch = (url, opcoes = {}) => (simulado ? simulado(String(url), opcoes) : fetchDeVerdade(url, opcoes))
const resp = (status, corpo, headers = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })

const pedido = (metodo, url, cookie, corpo) =>
  Object.assign([Buffer.from(corpo ? JSON.stringify(corpo) : '')][Symbol.iterator](), {
    method: metodo,
    url,
    body: corpo ?? undefined,
    headers: { host: 'rift.absolutezro.com', 'x-forwarded-proto': 'https', origin: 'https://rift.absolutezro.com', cookie: cookie ? `rf_conta=${cookie}` : '', 'content-type': 'application/json' },
  })
const chamar = async (rota, metodo, url, cookie, corpo) => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c ? JSON.parse(c) : null)
  await rotas[rota](pedido(metodo, url, cookie, corpo), r)
  return r
}

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role rift login password 'teste'; create role rift_app nologin; grant rift_app to rift with admin option; create schema rift authorization rift;`)
  await admin.end()
  urlRift = pg.url.replace('postgres://postgres@', 'postgres://rift:teste@')
  Object.assign(process.env, { ZRO_CLIENT_ID: 'rift-web', ZRO_CLIENT_SECRET: 'segredo-de-teste-que-so-existe-aqui', RIFT_DATABASE_URL: urlRift })
  await (await import('../scripts/migrar.mjs')).migrar(urlRift)
  z = await import('../api/_zro.js')
  banco = await import('../api/_banco.js')
  conexao = await import('../api/_conexao.js')
  rotas = { higgsfield: (await import('../api/rift/higgsfield.js')).default, gerar: (await import('../api/rift/gerar.js')).default, z: (await import('../api/rift/z.js')).default }
})
after(async () => {
  await banco?.fecharBanco()
  await pg?.fechar()
})
const sessao = (sub) => z.selar('rf_conta', { sub, nome: sub, email: `${sub}@x.com`, org: null, produtos: [], lido: 0 }, 3600)

test('chave da API: confere sem gastar, guarda cifrada, só a dona vê; chave errada é recusada', { skip: pular }, async () => {
  const ana = sessao('ana')
  const beto = sessao('beto')
  simulado = (url, o) => (o.headers.authorization === 'Key boa123:segredo456' ? resp(404, { detail: 'not found' }) : resp(401, { detail: 'no' }))
  assert.equal((await chamar('higgsfield', 'POST', '/api/rift/higgsfield', ana, { chave: 'ruim99:errada99' })).statusCode, 400)
  assert.equal((await chamar('higgsfield', 'POST', '/api/rift/higgsfield', ana, { chave: 'sem-dois-pontos' })).statusCode, 400)
  const r = await chamar('higgsfield', 'POST', '/api/rift/higgsfield', ana, { chave: 'Key boa123:segredo456' })
  assert.equal(r.statusCode, 200)
  assert.equal(r.corpo.tipo, 'chave')
  assert.ok(!JSON.stringify(r.corpo).includes('segredo456'), 'a resposta nunca devolve a chave')
  assert.equal((await chamar('higgsfield', 'GET', '/api/rift/higgsfield', beto)).corpo.conectado, false, 'Beto não vê a conexão da Ana')
  const adm = postgres(pg.url, { max: 1, onnotice: () => {} })
  const [linha] = await adm`select segredo from rift.conexoes where user_sub = 'ana'`
  await adm.end()
  const dono = postgres(urlRift, { max: 1, onnotice: () => {} })
  assert.ok(!linha.segredo.includes('segredo456') && !linha.segredo.includes('boa123'), 'no banco só fica cifrado')
  // rift_app não lê o registro do app na Higgsfield
  await assert.rejects(dono.begin(async (tx) => { await tx.unsafe('set local role rift_app'); await tx`select * from rift.apps_oauth` }), /permission denied/)
  await dono.end()
})

test('gerar com a chave: prepara o envio, inicia com idempotência, acompanha até pronto; outra pessoa não vê', { skip: pular }, async () => {
  const ana = sessao('ana')
  const vistos = []
  let estado = 'queued'
  simulado = (url, o) => {
    vistos.push([o.method || 'GET', url, o.headers?.['idempotency-key']])
    if (url.endsWith('/files/generate-upload-url')) return resp(200, { upload_url: 'https://upload.exemplo/x', public_url: 'https://cdn.exemplo/in.jpg', upload_headers: { 'Content-Type': 'image/jpeg' } })
    if (url.includes('/kling-video/')) return resp(200, { status: 'queued', request_id: '11111111-2222-4333-8444-555555555555' })
    if (url.includes('/requests/11111111')) return resp(200, estado === 'completed' ? { status: 'completed', request_id: 'x', video: { url: 'https://cdn.exemplo/out.mp4' } } : { status: estado, request_id: 'x' })
    return resp(404, {})
  }
  const p = await chamar('gerar', 'POST', '/api/rift/gerar', ana, { acao: 'preparar', conteudo: 'image/jpeg' })
  assert.equal(p.corpo.ref, 'https://cdn.exemplo/in.jpg')
  assert.equal((await chamar('gerar', 'POST', '/api/rift/gerar', ana, { acao: 'iniciar', ref: p.corpo.ref, prompt: '', modelo: 'kling-2.5-turbo', duracao: 5 })).statusCode, 400, 'sem pedido não gera')
  const i = await chamar('gerar', 'POST', '/api/rift/gerar', ana, { acao: 'iniciar', ref: p.corpo.ref, prompt: 'slow push in', modelo: 'kling-2.5-turbo', duracao: 7 })
  assert.equal(i.statusCode, 200)
  assert.ok(vistos.find((v) => v[1].includes('/kling-video/'))[2], 'manda chave de idempotência')
  estado = 'in_progress'
  assert.equal((await chamar('gerar', 'GET', `/api/rift/gerar?id=${i.corpo.id}`, ana)).corpo.estado, 'gerando')
  estado = 'completed'
  const fim = await chamar('gerar', 'GET', `/api/rift/gerar?id=${i.corpo.id}`, ana)
  assert.deepEqual([fim.corpo.estado, fim.corpo.url], ['pronto', 'https://cdn.exemplo/out.mp4'])
  const n = vistos.length
  assert.equal((await chamar('gerar', 'GET', `/api/rift/gerar?id=${i.corpo.id}`, ana)).corpo.estado, 'pronto')
  assert.equal(vistos.length, n, 'pronto não pergunta de novo à Higgsfield')
  assert.equal((await chamar('gerar', 'GET', `/api/rift/gerar?id=${i.corpo.id}`, sessao('beto'))).statusCode, 404, 'a geração da Ana não existe para o Beto')
})

test('gerar com a conta (MCP): sessão MCP, envio, confirmação, job e resultado, com resposta em SSE', { skip: pular }, async () => {
  const caio = { sub: 'caio' }
  await conexao.guardarConexao(caio, { tipo: 'conta', rotulo: 'Conta caio@x.com', segredo: { access: 'tok-caio', refresh: 'ref', expira: Math.floor(Date.now() / 1000) + 3600, clientId: 'cli' } })
  const chamadas = []
  let pronto = false
  simulado = (url, o) => {
    if (!url.startsWith('https://mcp.higgsfield.ai/')) return resp(404, {})
    assert.equal(o.headers.authorization, 'Bearer tok-caio')
    const m = JSON.parse(o.body)
    if (m.method === 'initialize') return resp(200, { jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }, { 'mcp-session-id': 'sess-1' })
    assert.equal(o.headers['mcp-session-id'], 'sess-1')
    if (m.method === 'notifications/initialized') return new Response(null, { status: 202 })
    const { name, arguments: args } = m.params
    chamadas.push([name, args])
    const resultado = {
      media_upload: { uploads: [{ upload_url: 'https://upload.higgsfield.ai/u', media_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', content_type: 'image/png' }] },
      media_confirm: { ok: true },
      generate_video: { jobs: [{ index: 0, job_id: 'cccccccc-dddd-4eee-8fff-000000000000', status: 'queued' }] },
      jobs_wait: pronto ? { all_terminal: true, jobs: [{ index: 0, status: 'completed', results: { rawUrl: 'https://d8j0ntlcm91z4.cloudfront.net/u/v.mp4' } }] } : { all_terminal: false, jobs: [{ index: 0, status: 'in_progress' }] },
    }[name]
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(resultado) }] } })}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const s = sessao('caio')
  const p = await chamar('gerar', 'POST', '/api/rift/gerar', s, { acao: 'preparar', conteudo: 'image/png' })
  assert.equal(p.corpo.ref, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  const i = await chamar('gerar', 'POST', '/api/rift/gerar', s, { acao: 'iniciar', ref: p.corpo.ref, prompt: 'the logo spins', modelo: 'kling2_6', duracao: 10 })
  assert.equal(i.statusCode, 200, JSON.stringify(i.corpo))
  const gen = chamadas.find((c) => c[0] === 'generate_video')[1]
  assert.equal(gen.params.use_unlim, false, 'nunca deixa a Higgsfield decidir o saldo sozinha')
  assert.equal(gen.params.sound, false)
  assert.deepEqual(gen.params.medias, [{ role: 'start_image', value: p.corpo.ref }])
  assert.ok(chamadas.findIndex((c) => c[0] === 'media_confirm') < chamadas.findIndex((c) => c[0] === 'generate_video'))
  assert.equal((await chamar('gerar', 'GET', `/api/rift/gerar?id=${i.corpo.id}`, s)).corpo.estado, 'gerando')
  pronto = true
  const fim = await chamar('gerar', 'GET', `/api/rift/gerar?id=${i.corpo.id}`, s)
  assert.deepEqual([fim.corpo.estado, fim.corpo.url], ['pronto', 'https://d8j0ntlcm91z4.cloudfront.net/u/v.mp4'])
})

test('conta vencida: renova o acesso; Higgsfield recusou a renovação: desconecta e pede para conectar de novo', { skip: pular }, async () => {
  const duda = { sub: 'duda' }
  await conexao.guardarConexao(duda, { tipo: 'conta', rotulo: 'x', segredo: { access: 'velho', refresh: 'r1', expira: 10, clientId: 'cli' } })
  simulado = (url, o) => (url.endsWith('/oauth/token') && String(o.body).includes('refresh_token=r1') ? resp(200, { access_token: 'novo', expires_in: 3600 }) : resp(400, { error: 'invalid_grant' }))
  assert.deepEqual(await conexao.credencial(duda), { tipo: 'conta', access: 'novo' })
  const c = await conexao.lerConexao(duda)
  assert.equal(c.segredo.refresh, 'r1', 'mantém o refresh quando a Higgsfield não manda outro')
  await conexao.guardarConexao(duda, { tipo: 'conta', rotulo: 'x', segredo: { ...c.segredo, refresh: 'r2', expira: 10 } })
  await assert.rejects(conexao.credencial(duda), (e) => e.status === 401)
  assert.equal(await conexao.lerConexao(duda), null)
})

test('Z: só para quem está liberado; sem chave ou sem teto fica desligada (nunca finge responder)', { skip: pular }, async () => {
  delete process.env.RIFT_Z_LIBERADOS
  assert.equal((await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'anima o título' })).statusCode, 403)
  process.env.RIFT_Z_LIBERADOS = 'outra, ana'
  const r = await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'anima o título' })
  assert.equal(r.statusCode, 503)
  assert.match(r.corpo.erro, /ainda não foi ligada/)
  assert.equal((await chamar('z', 'POST', '/api/rift/z', sessao('beto'), { pedido: 'oi' })).statusCode, 403)
})
