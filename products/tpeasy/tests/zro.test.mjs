/**
 * "Entrar com Absolute ZRO" do TPeasy contra uma Absolute ZRO falsa (OIDC local, chave ES256 P-256 gerada aqui).
 * Roda com `node --test tests/` dentro de products/tpeasy. Sem rede e sem dependências.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import http from 'node:http'
import { after, before, beforeEach, describe, test } from 'node:test'

const CLIENTE = { clientId: 'tpeasy-web', clientSecret: 'zk_segredo_so_de_teste' }
const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['tpeasy', 'sobedesce'] }

// ───────────── Absolute ZRO falsa ─────────────
function iniciarZroFalsa() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'chave-teste', alg: 'ES256', use: 'sig' }
  const codigos = new Map()
  const zro = { url: '', proximo: { pessoa: LIA, negar: false, adulterar: null }, trocas: 0, prompts: [], server: null }

  const jwt = (dados, assinarErrado) => {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const cab = `${b({ alg: 'ES256', typ: 'JWT', kid: jwk.kid })}.${b(dados)}`
    const chave = assinarErrado ? generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : privateKey
    return `${cab}.${sign('sha256', Buffer.from(cab), { key: chave, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
  }
  const responder = (res, status, corpo) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo))
  }

  zro.server = http.createServer(async (req, res) => {
    const base = zro.url
    const url = new URL(req.url, base)
    if (url.pathname === '/.well-known/openid-configuration') {
      return responder(res, 200, { issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`, jwks_uri: `${base}/oauth/jwks` })
    }
    if (url.pathname === '/oauth/jwks') return responder(res, 200, { keys: [jwk] })
    if (url.pathname === '/oauth/authorize') {
      const q = url.searchParams
      zro.prompts.push(q.get('prompt'))
      const volta = new URL(q.get('redirect_uri'))
      volta.searchParams.set('state', q.get('state'))
      if (q.get('client_id') !== CLIENTE.clientId || q.get('code_challenge_method') !== 'S256' || !q.get('nonce') || q.get('scope') !== 'openid email profile org') {
        volta.searchParams.set('error', 'invalid_request')
      } else if (zro.proximo.negar) {
        volta.searchParams.set('error', 'access_denied')
      } else {
        const code = `zc_${randomBytes(16).toString('hex')}`
        codigos.set(code, { desafio: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), nonce: q.get('nonce'), usado: false })
        volta.searchParams.set('code', code)
        volta.searchParams.set('iss', base)
      }
      res.writeHead(302, { location: volta.toString() })
      return res.end()
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      let corpo = ''
      for await (const c of req) corpo += c
      const f = new URLSearchParams(corpo)
      const basic = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString()
      if (basic !== `${CLIENTE.clientId}:${CLIENTE.clientSecret}`) return responder(res, 401, { error: 'invalid_client' })
      const c = codigos.get(f.get('code') ?? '')
      if (!c || c.usado) return responder(res, 400, { error: 'invalid_grant' })
      c.usado = true
      const desafio = createHash('sha256')
        .update(f.get('code_verifier') ?? '')
        .digest('base64url')
      if (desafio !== c.desafio || f.get('redirect_uri') !== c.redirectUri) return responder(res, 400, { error: 'invalid_grant' })
      zro.trocas++
      const agora = Math.floor(Date.now() / 1000)
      const ad = zro.proximo.adulterar
      const p = zro.proximo.pessoa
      const id = jwt(
        {
          iss: ad === 'emissor' ? 'https://outro.exemplo' : base,
          sub: p.sub,
          aud: ad === 'aud' ? 'outro-app' : CLIENTE.clientId,
          iat: agora,
          exp: ad === 'expirado' ? agora - 3600 : agora + 600,
          nonce: ad === 'nonce' ? 'nonce-errado' : c.nonce,
          email: p.email,
          email_verified: true,
          name: p.nome,
          zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null,
          zro_products: p.produtos,
          auth_time: agora,
        },
        ad === 'assinatura',
      )
      return responder(res, 200, { access_token: 'at_secreto_do_hub', refresh_token: 'rt_secreto_do_hub', token_type: 'Bearer', expires_in: 600, id_token: id })
    }
    responder(res, 404, { error: 'not_found' })
  })
  return new Promise((ok) =>
    zro.server.listen(0, '127.0.0.1', () => {
      zro.url = `http://127.0.0.1:${zro.server.address().port}`
      ok(zro)
    }),
  )
}

// ───────────── o app (as funções de /api/zro num servidor local) ─────────────
let zro
let app
let APP
let lib

async function iniciarApp() {
  const rotas = {}
  for (const nome of ['entrar', 'callback', 'eu', 'sair']) rotas[`/api/zro/${nome}`] = (await import(`../api/zro/${nome}.mjs`)).default
  const server = http.createServer(async (req, res) => {
    const rota = rotas[new URL(req.url, 'http://x').pathname]
    if (!rota) {
      res.statusCode = 404
      return res.end()
    }
    try {
      await rota(req, res)
    } catch (e) {
      res.statusCode = 500
      res.end(String(e))
    }
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

before(async () => {
  zro = await iniciarZroFalsa()
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  lib = await import('../api/zro/_zro.mjs')
  app = await iniciarApp()
  APP = app.url
})
after(async () => {
  await new Promise((ok) => app.server.close(ok))
  await new Promise((ok) => zro.server.close(ok))
})
beforeEach(() => {
  zro.proximo = { pessoa: LIA, negar: false, adulterar: null }
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
})

const setCookies = (res) => res.headers.getSetCookie()
const valorCookie = (res, nome) => {
  const linha = setCookies(res).find((c) => c.startsWith(`${nome}=`))
  return linha === undefined ? undefined : decodeURIComponent(linha.slice(nome.length + 1).split(';')[0])
}
const ir = (caminho, { cookie, headers = {}, method = 'GET' } = {}) =>
  fetch(caminho.startsWith('http') ? caminho : APP + caminho, { method, redirect: 'manual', headers: { ...headers, ...(cookie ? { cookie } : {}) } })

/** Navegador: entrar → Absolute ZRO falsa → callback. */
async function fluxo({ volta, trocarState = false, cookieIda, criar = false } = {}) {
  const q = new URLSearchParams()
  if (volta !== undefined) q.set('volta', volta)
  if (criar) q.set('criar', '1')
  const ida = await ir(`/api/zro/entrar${q.size ? `?${q}` : ''}`)
  assert.equal(ida.status, 302)
  const destino = new URL(ida.headers.get('location'))
  const ida_ = valorCookie(ida, 'tp_zro_ida')
  assert.ok(ida_)
  const z = await fetch(destino, { redirect: 'manual' })
  let retorno = z.headers.get('location')
  if (trocarState) retorno = retorno.replace(/state=[^&]+/, 'state=outro')
  const res = await ir(retorno, { cookie: `tp_zro_ida=${encodeURIComponent(cookieIda ?? ida_)}` })
  assert.equal(res.status, 303)
  assert.equal(valorCookie(res, 'tp_zro_ida'), '', 'o cookie da ida é apagado na volta')
  return { ida, destino, res, local: res.headers.get('location'), sessao: valorCookie(res, 'tp_zro') }
}

describe('entrar', () => {
  test('manda para o HUB com PKCE S256, nonce, escopos e cookie da ida protegido', async () => {
    const ida = await ir('/api/zro/entrar')
    assert.equal(ida.status, 302)
    const u = new URL(ida.headers.get('location'))
    assert.equal(u.origin, zro.url)
    assert.equal(u.pathname, '/oauth/authorize')
    assert.equal(u.searchParams.get('client_id'), 'tpeasy-web')
    assert.equal(u.searchParams.get('response_type'), 'code')
    assert.equal(u.searchParams.get('scope'), 'openid email profile org')
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(u.searchParams.get('redirect_uri'), `${APP}/api/zro/callback`)
    assert.ok(u.searchParams.get('state') && u.searchParams.get('nonce') && u.searchParams.get('code_challenge'))
    const linha = setCookies(ida).find((c) => c.startsWith('tp_zro_ida='))
    assert.match(linha, /HttpOnly/)
    assert.match(linha, /SameSite=Lax/)
    assert.match(linha, /Path=\/api\/zro/)
    assert.match(linha, /Max-Age=600/)
    assert.doesNotMatch(linha, /Secure/, 'em http://127.0.0.1 o cookie não pode ser Secure')
  })

  test('no site oficial o cookie é Secure e o retorno é https://tpeasy.vercel.app', async () => {
    const ida = await ir('/api/zro/entrar', { headers: { 'x-forwarded-host': 'tpeasy.vercel.app' } })
    assert.equal(new URL(ida.headers.get('location')).searchParams.get('redirect_uri'), 'https://tpeasy.vercel.app/api/zro/callback')
    assert.match(setCookies(ida)[0], /; Secure/)
  })

  test('outro endereço (prévia, domínio estranho) vai para o site oficial antes de tudo', async () => {
    const ida = await ir('/api/zro/entrar?volta=%2Fapp%2F', { headers: { 'x-forwarded-host': 'tpeasy-git-teste.vercel.app' } })
    assert.equal(ida.status, 307)
    assert.equal(ida.headers.get('location'), 'https://tpeasy.vercel.app/api/zro/entrar?volta=%2Fapp%2F')
    assert.equal(setCookies(ida).length, 0)
  })

  test('sem ZRO_CLIENT_ID/SECRET volta ao app com aviso e sem cookie', async () => {
    delete process.env.ZRO_CLIENT_SECRET
    const ida = await ir('/api/zro/entrar')
    assert.equal(ida.status, 302)
    assert.equal(ida.headers.get('location'), '/app/?zro=config')
    const eu = await ir('/api/zro/eu')
    assert.equal(eu.status, 503)
  })
})

describe('volta do HUB', () => {
  test('cria a sessão do app (30 dias, assinada) sem token do HUB e /eu mostra a pessoa', async () => {
    const r = await fluxo()
    assert.equal(r.local, '/app/')
    assert.ok(r.sessao)
    const linha = setCookies(r.res).find((c) => c.startsWith('tp_zro='))
    assert.match(linha, /HttpOnly/)
    assert.match(linha, /SameSite=Lax/)
    assert.match(linha, /Path=\//)
    assert.match(linha, new RegExp(`Max-Age=${30 * 24 * 3600}`))
    const conteudo = Buffer.from(r.sessao.split('.')[0], 'base64url').toString()
    assert.doesNotMatch(conteudo, /secreto_do_hub|eyJ/, 'nenhum token do HUB no cookie')
    assert.deepEqual(Object.keys(JSON.parse(conteudo)).sort(), ['email', 'exp', 'nome', 'organizacao', 'produtos', 'sub'])

    const eu = await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(r.sessao)}` })
    assert.equal(eu.status, 200)
    assert.equal(eu.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await eu.json(), {
      entrou: true,
      sub: 'zro-111',
      nome: 'Lia Produtora',
      email: 'lia@produtora.com',
      organizacao: { id: 'org-1', nome: 'Produtora Lia', papel: 'owner' },
      produtos: ['tpeasy', 'sobedesce'],
      acesso: true,
    })
  })

  test('volta relativa é respeitada (com a aba)', async () => {
    const r = await fluxo({ volta: '/app/#ajustes' })
    assert.equal(r.local, '/app/#ajustes')
    assert.ok(r.sessao)
  })

  test('volta externa é recusada e vira /app/', async () => {
    for (const v of ['https://mal.exemplo/x', '//mal.exemplo', '/\\mal.exemplo', 'javascript:alert(1)', '/api/zro/sair', 'app', '/\t/mal.exemplo']) {
      const r = await fluxo({ volta: v })
      assert.equal(r.local, '/app/', `volta ${JSON.stringify(v)}`)
    }
    assert.equal(lib.voltaSegura('/app/?a=1#tp'), '/app/?a=1#tp')
  })

  test('state errado: não troca o código e não cria sessão', async () => {
    const antes = zro.trocas
    const r = await fluxo({ trocarState: true })
    assert.equal(r.local, '/app/?zro=expirou')
    assert.equal(r.sessao, undefined)
    assert.equal(zro.trocas, antes)
  })

  test('sem o cookie da ida (ou adulterado) não entra', async () => {
    const r = await fluxo({ cookieIda: 'nada.disso' })
    assert.equal(r.local, '/app/?zro=expirou')
    assert.equal(r.sessao, undefined)
    // Muda o state dentro do cookie mantendo a assinatura antiga.
    const ida = await ir('/api/zro/entrar')
    const valor = valorCookie(ida, 'tp_zro_ida')
    const [corpo, mac] = valor.split('.')
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    const falso = `${Buffer.from(JSON.stringify({ ...dados, volta: '/outra' })).toString('base64url')}.${mac}`
    const z = await fetch(ida.headers.get('location'), { redirect: 'manual' })
    const res = await ir(z.headers.get('location'), { cookie: `tp_zro_ida=${encodeURIComponent(falso)}` })
    assert.equal(res.headers.get('location'), '/app/?zro=expirou')
    assert.equal(valorCookie(res, 'tp_zro'), undefined)
  })

  for (const [adulterar, porque] of [
    ['nonce', 'nonce errado'],
    ['aud', 'público (aud) de outro app'],
    ['emissor', 'emissor (iss) errado'],
    ['assinatura', 'assinatura inválida'],
    ['expirado', 'id_token vencido'],
  ]) {
    test(`recusa id_token com ${porque}`, async () => {
      zro.proximo.adulterar = adulterar
      const r = await fluxo({ volta: '/app/#ajustes' })
      assert.equal(r.local, '/app/?zro=erro#ajustes')
      assert.equal(r.sessao, undefined)
    })
  }

  test('pessoa recusou no HUB', async () => {
    zro.proximo.negar = true
    const r = await fluxo()
    assert.equal(r.local, '/app/?zro=recusado')
    assert.equal(r.sessao, undefined)
  })

  test('segredo errado: o HUB recusa a troca e não entra', async () => {
    const ida = await ir('/api/zro/entrar')
    const cookieIda = valorCookie(ida, 'tp_zro_ida')
    const z = await fetch(ida.headers.get('location'), { redirect: 'manual' })
    process.env.ZRO_CLIENT_SECRET = 'outro_segredo'
    const res = await ir(z.headers.get('location'), { cookie: `tp_zro_ida=${encodeURIComponent(cookieIda)}` })
    // Com outro segredo nem o cookie da ida abre (chave derivada dele).
    assert.equal(res.headers.get('location'), '/app/?zro=expirou')
    assert.equal(valorCookie(res, 'tp_zro'), undefined)
  })
})

describe('sessão', () => {
  test('cookie de sessão adulterado, vencido ou ausente dá 401', async () => {
    const r = await fluxo()
    const [corpo, mac] = r.sessao.split('.')
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    const falso = `${Buffer.from(JSON.stringify({ ...dados, email: 'outra@pessoa.com' })).toString('base64url')}.${mac}`
    for (const cookie of [undefined, `tp_zro=${encodeURIComponent(falso)}`, `tp_zro=${corpo}`, 'tp_zro=lixo']) {
      const eu = await ir('/api/zro/eu', { cookie })
      assert.equal(eu.status, 401)
      assert.equal(eu.headers.get('cache-control'), 'no-store')
    }
    const vencido = lib.selar({ sub: 'zro-111', email: 'lia@produtora.com' }, 'sessao', 30, Date.now() - 60_000)
    assert.equal((await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(vencido)}` })).status, 401)
    // O cookie da ida não serve como sessão (chaves diferentes por finalidade).
    const ida = lib.selar({ sub: 'zro-111', email: 'lia@produtora.com' }, 'ida', 600)
    assert.equal((await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(ida)}` })).status, 401)
  })

  test('sair apaga a sessão; só por POST e do próprio app', async () => {
    const r = await fluxo()
    const cookie = `tp_zro=${encodeURIComponent(r.sessao)}`
    assert.equal((await ir('/api/zro/sair', { cookie })).status, 405)
    assert.equal((await ir('/api/zro/sair', { cookie, method: 'POST', headers: { origin: 'https://mal.exemplo' } })).status, 403)
    const sair = await ir('/api/zro/sair', { cookie, method: 'POST', headers: { origin: APP } })
    assert.equal(sair.status, 200)
    const linha = setCookies(sair).find((c) => c.startsWith('tp_zro='))
    assert.match(linha, /^tp_zro=;/)
    assert.match(linha, /Max-Age=0/)
  })
})

describe('conta única da Absolute ZRO', () => {
  test('"Entrar" não pede cadastro; "Criar conta" (?criar=1) manda prompt=create ao HUB', async () => {
    const entrar = new URL((await ir('/api/zro/entrar')).headers.get('location'))
    assert.equal(entrar.searchParams.get('prompt'), null)
    const criar = new URL((await ir('/api/zro/entrar?volta=%2Fapp%2F%23ajustes&criar=1')).headers.get('location'))
    assert.equal(criar.pathname, '/oauth/authorize')
    assert.equal(criar.searchParams.get('prompt'), 'create')
    assert.equal(criar.searchParams.get('code_challenge_method'), 'S256')
    // Fora do site oficial, o pedido de cadastro segue junto para o site oficial.
    const previa = await ir('/api/zro/entrar?criar=1', { headers: { 'x-forwarded-host': 'tpeasy-git-teste.vercel.app' } })
    assert.equal(previa.headers.get('location'), 'https://tpeasy.vercel.app/api/zro/entrar?criar=1')
  })

  test('criar conta volta ao app já logado', async () => {
    zro.prompts = []
    const r = await fluxo({ volta: '/app/#ajustes', criar: true })
    assert.deepEqual(zro.prompts, ['create'])
    assert.equal(r.local, '/app/#ajustes')
    const eu = await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(r.sessao)}` })
    assert.equal(eu.status, 200)
    assert.equal((await eu.json()).acesso, true)
  })

  test('produto liberado (tpeasy em zro_products): acesso', async () => {
    const r = await fluxo()
    const corpo = await (await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(r.sessao)}` })).json()
    assert.equal(corpo.acesso, true)
    assert.ok(lib.temAcesso(['nossom', 'tpeasy']))
  })

  test('tpeasy fora de zro_products: entra, mas sem acesso', async () => {
    zro.proximo.pessoa = { ...LIA, produtos: ['sobedesce', 'nossom'] }
    const r = await fluxo()
    assert.ok(r.sessao, 'a pessoa entra')
    const eu = await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(r.sessao)}` })
    assert.equal(eu.status, 200)
    const corpo = await eu.json()
    assert.equal(corpo.entrou, true)
    assert.equal(corpo.acesso, false)
    for (const p of [undefined, null, [], ['tp-easy'], 'tpeasy']) assert.equal(lib.temAcesso(p), false, JSON.stringify(p))
  })

  test('nova entrada reavalia zro_products', async () => {
    zro.proximo.pessoa = { ...LIA, produtos: [] }
    const antes = await fluxo()
    assert.equal((await (await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(antes.sessao)}` })).json()).acesso, false)
    zro.proximo.pessoa = LIA
    const depois = await fluxo()
    assert.equal((await (await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(depois.sessao)}` })).json()).acesso, true)
  })
})
