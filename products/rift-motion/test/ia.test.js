// IA no Rift: criar com IA pela Higgsfield das Conexões da Absolute ZRO (repasse /api/zro/higgsfield) e a Z, num
// Postgres de verdade e com a Absolute ZRO simulada (fetch falso): nenhum teste gasta crédito nem sai para a internet.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const pular = semPostgres
let pg, urlRift, z, banco, rotas
const fetchDeVerdade = globalThis.fetch
let simulado = null
globalThis.fetch = (url, opcoes = {}) => (simulado ? simulado(String(url), opcoes) : fetchDeVerdade(url, opcoes))
const resp = (status, corpo, headers = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })

const pedido = (metodo, url, cookie, corpo) =>
  Object.assign([Buffer.from(corpo ? JSON.stringify(corpo) : '')][Symbol.iterator](), {
    method: metodo,
    url,
    body: corpo ?? undefined,
    headers: { host: 'rift.absolutezro.com', 'x-forwarded-proto': 'https', origin: 'https://rift.absolutezro.com', cookie: !cookie ? '' : cookie.includes('=') ? cookie : `rf_conta=${cookie}`, 'content-type': 'application/json' },
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
  rotas = { painel: (await import('../api/zro/higgsfield/index.js')).default, gerar: (await import('../api/zro/higgsfield/gerar.js')).default, z: (await import('../api/rift/z.js')).default }
})
after(async () => {
  await banco?.fecharBanco()
  await pg?.fechar()
})
const sessao = (sub) => z.selar('rf_conta', { sub, nome: sub, email: `${sub}@x.com`, org: null, produtos: [], lido: 0 }, 3600)


const agoraS = () => Math.floor(Date.now() / 1000)
/** rf_conta + rf_hub (tokens da Absolute ZRO cifrados), como o callback grava. */
const comTokens = (sub, t = { at: 'at-valido', atExp: agoraS() + 600, rt: 'rt-1' }) => `rf_conta=${sessao(sub)}; rf_hub=${z.cifrar('rf_hub', { sub, ...t })}`

test('Higgsfield pela Absolute ZRO: repassa só o que pode, com o token da pessoa, e devolve a resposta do HUB', { skip: pular }, async () => {
  const vistos = []
  simulado = (url, o) => {
    vistos.push({ url, metodo: o.method, auth: o.headers.authorization, corpo: o.body })
    if (url.includes('/gerar')) return resp(200, { id: 'abcdefabcdef', estado: 'na_fila', creditos: 6 })
    return resp(200, { conectada: true, conta: 'ana@x.com', saldo: 100, opcoes: [] })
  }
  const p = await chamar('painel', 'GET', '/api/zro/higgsfield?duracao=longo&proporcao=9:16&lixo=1', comTokens('ana'))
  assert.equal(p.statusCode, 200)
  assert.equal(p.corpo.conta, 'ana@x.com')
  assert.equal(vistos[0].url, 'https://absolutezro.com/api/v1/higgsfield?duracao=longo&proporcao=9%3A16')
  assert.equal(vistos[0].auth, 'Bearer at-valido')
  const g = await chamar('gerar', 'POST', '/api/zro/higgsfield/gerar', comTokens('ana'), { acao: 'animar', ref: 'x', prompt: 'slow push-in', opcao: 'rapido' })
  assert.equal(g.statusCode, 200)
  assert.equal(g.corpo.id, 'abcdefabcdef')
  assert.equal(vistos[1].url, 'https://absolutezro.com/api/v1/higgsfield/gerar')
  assert.equal(JSON.parse(vistos[1].corpo).acao, 'animar')
  await chamar('gerar', 'GET', '/api/zro/higgsfield/gerar?id=../../etc', comTokens('ana'))
  assert.equal(vistos[2].url, 'https://absolutezro.com/api/v1/higgsfield/gerar?id=x', 'id fora do formato não segue')
  // erro do HUB passa como veio (sem conexão: o link para as Conexões)
  simulado = () => resp(409, { error: 'sem_conexao', message: 'Conecte a Higgsfield na sua conta Absolute ZRO.', details: { conectar: 'https://absolutezro.com/conexoes' } })
  const s = await chamar('painel', 'GET', '/api/zro/higgsfield', comTokens('ana'))
  assert.equal(s.statusCode, 409)
  assert.equal(s.corpo.details.conectar, 'https://absolutezro.com/conexoes')
  simulado = null
})

test('Higgsfield pela Absolute ZRO: sem sessão, outra origem, método ou caminho errado não chegam ao HUB', { skip: pular }, async () => {
  let chamou = false
  simulado = () => ((chamou = true), resp(200, {}))
  assert.equal((await chamar('painel', 'GET', '/api/zro/higgsfield', null)).statusCode, 401)
  assert.equal((await chamar('painel', 'GET', '/api/zro/higgsfield', sessao('ana'))).statusCode, 401, 'sem os tokens')
  const outra = `rf_conta=${sessao('ana')}; rf_hub=${z.cifrar('rf_hub', { sub: 'beto', at: 'a', atExp: agoraS() + 600 })}`
  assert.equal((await chamar('painel', 'GET', '/api/zro/higgsfield', outra)).statusCode, 401, 'tokens de outra pessoa')
  assert.equal((await chamar('painel', 'POST', '/api/zro/higgsfield', comTokens('ana'), {})).statusCode, 405)
  assert.equal((await chamar('gerar', 'DELETE', '/api/zro/higgsfield/gerar', comTokens('ana'))).statusCode, 405)
  assert.equal((await chamar('gerar', 'GET', '/api/zro/higgsfield/outra', comTokens('ana'))).statusCode, 404)
  const req = pedido('POST', '/api/zro/higgsfield/gerar', comTokens('ana'), { acao: 'telas' })
  req.headers.origin = 'https://mal.example'
  const r = { statusCode: 0, headers: {}, setHeader() {}, end(c) { this.corpo = JSON.parse(c) } }
  await rotas.gerar(req, r)
  assert.equal(r.statusCode, 403)
  assert.equal(chamou, false)
  simulado = null
})

test('Higgsfield pela Absolute ZRO: token vencido renova e regrava o cookie; refresh recusado pede para entrar de novo', { skip: pular }, async () => {
  const vistos = []
  simulado = (url, o) => {
    vistos.push(url)
    if (url.endsWith('/.well-known/openid-configuration')) return resp(200, { issuer: 'https://absolutezro.com', authorization_endpoint: 'https://absolutezro.com/oauth/authorize', token_endpoint: 'https://absolutezro.com/oauth/token', jwks_uri: 'https://absolutezro.com/oauth/jwks' })
    if (url.endsWith('/oauth/token')) return o.body.includes('rt-bom') ? resp(200, { access_token: 'at-novo', expires_in: 600, refresh_token: 'rt-2' }) : resp(400, { error: 'invalid_grant' })
    return resp(200, { conectada: true, auth: o.headers.authorization })
  }
  const r = await chamar('painel', 'GET', '/api/zro/higgsfield', comTokens('ana', { at: 'velho', atExp: agoraS() - 10, rt: 'rt-bom' }))
  assert.equal(r.statusCode, 200)
  assert.equal(r.corpo.auth, 'Bearer at-novo')
  assert.match(String(r.headers['set-cookie']), /rf_hub=.+; Path=\/api\/zro/)
  const n = await chamar('painel', 'GET', '/api/zro/higgsfield', comTokens('ana', { at: 'velho', atExp: agoraS() - 10, rt: 'rt-ruim' }))
  assert.equal(n.statusCode, 401)
  assert.match(String(n.headers['set-cookie']), /rf_hub=; Path=\/api\/zro; Max-Age=0/)
  simulado = null
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

test('Z do HUB: o Rift repassa com a credencial do app, filtra as ações e conta o uso; sem chave do Claude aqui', { skip: pular }, async () => {
  process.env.RIFT_Z_LIBERADOS = 'ana'
  process.env.RIFT_Z_LIMITE_DIA = '2'
  const vistos = []
  let resposta = () => resp(200, { resposta: 'Pronto, quicando.', acoes: [{ tipo: 'aplicar_movimento', camada: 'c1', movimento: 'quicar' }, { tipo: 'rodar_comando' }] })
  simulado = (url, o) => {
    vistos.push({ url, auth: o.headers.authorization, corpo: JSON.parse(o.body) })
    return resposta()
  }
  const r = await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'faz o título quicar', cena: { v: 2, camadas: [{ id: 'c1' }] } })
  assert.equal(r.statusCode, 200)
  assert.deepEqual({ resposta: r.corpo.resposta, acoes: r.corpo.acoes }, { resposta: 'Pronto, quicando.', acoes: [{ tipo: 'aplicar_movimento', camada: 'c1', movimento: 'quicar' }] })
  assert.equal(vistos[0].url, 'https://absolutezro.com/api/v1/ia/rift')
  assert.equal(vistos[0].auth, `Basic ${Buffer.from('rift-web:segredo-de-teste-que-so-existe-aqui').toString('base64')}`)
  assert.deepEqual(vistos[0].corpo, { sub: 'ana', pedido: 'faz o título quicar', cena: { v: 2, camadas: [{ id: 'c1' }] } })
  resposta = () => resp(403, { error: 'quota_not_configured', message: 'x' })
  assert.equal((await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'oi' })).statusCode, 503, 'HUB sem teto: desligada')
  resposta = () => resp(403, { error: 'action_not_allowed', message: 'x' })
  assert.equal((await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'oi' })).statusCode, 403, 'o HUB também confere a lista')
  resposta = () => resp(200, { resposta: '', acoes: [] })
  assert.equal((await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'oi' })).corpo.resposta, 'Não entendi. Pode dizer de outro jeito?')
  assert.equal((await chamar('z', 'POST', '/api/rift/z', sessao('ana'), { pedido: 'oi' })).statusCode, 429, 'limite do dia do Rift (2 respostas)')
  simulado = null
  delete process.env.RIFT_Z_LIMITE_DIA
})

