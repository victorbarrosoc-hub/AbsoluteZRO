/**
 * "Entrar com Absolute ZRO" do TPeasy contra uma Absolute ZRO falsa (OIDC local, chave ES256 P-256 gerada aqui).
 * Roda com `node --test tests/` dentro de products/tpeasy. Sem rede e sem dependências.
 * Perfil único: a falsa tem refresh token que roda, /oauth/userinfo, /oauth/revoke e foto (picture/updated_at); o
 * teste muda a conta em `zro.contas` e confere que o /eu do app relê na abertura seguinte.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import http from 'node:http'
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test'

const CLIENTE = { clientId: 'tpeasy-web', clientSecret: 'zk_segredo_so_de_teste' }
const ESCOPOS = 'openid email profile org offline_access zro.ia'
const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['tpeasy', 'sobedesce'] }

// ───────────── Absolute ZRO falsa ─────────────
function iniciarZroFalsa() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'chave-teste', alg: 'ES256', use: 'sig' }
  const codigos = new Map()
  const acessos = new Map() // access token → { sub, exp }
  const refreshes = new Map() // refresh token → { sub, familia, usado }
  const familiasMortas = new Set()
  const zro = {
    url: '',
    proximo: { pessoa: LIA, negar: false, adulterar: null },
    trocas: 0,
    prompts: [],
    server: null,
    contas: new Map(), // sub → a conta na Absolute ZRO (o teste muda nome, e-mail e foto aqui)
    atTtl: 600,
    semIa: false,
    iaPedidos: [],
    iaPausa: null,
    fora: false,
    renovacoes: 0,
    userinfos: 0,
    revogados: 0,
    removerAcesso(sub) {
      for (const r of refreshes.values()) if (r.sub === sub) familiasMortas.add(r.familia)
      for (const [k, a] of acessos) if (a.sub === sub) acessos.delete(k)
    },
  }
  const perfil = (p) => ({
    name: p.nome,
    ...(p.foto ? { picture: `${zro.url}/api/v1/foto/${p.foto}` } : {}),
    updated_at: 1_790_000_000,
    zro_conta: `${zro.url}/perfil`,
  })
  const emitir = (sub, familia = randomBytes(8).toString('hex')) => {
    const at = `at_${randomBytes(16).toString('hex')}`
    const rt = `zt_${randomBytes(24).toString('base64url')}`
    acessos.set(at, { sub, exp: Date.now() + zro.atTtl * 1000 })
    refreshes.set(rt, { sub, familia, usado: false })
    return { access_token: at, refresh_token: rt, token_type: 'Bearer', expires_in: zro.atTtl, scope: ESCOPOS }
  }
  const lerForm = async (req) => {
    let corpo = ''
    for await (const c of req) corpo += c
    return new URLSearchParams(corpo)
  }
  const clienteOk = (req) => Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString() === `${CLIENTE.clientId}:${CLIENTE.clientSecret}`

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
    if (zro.fora && url.pathname !== '/.well-known/openid-configuration' && url.pathname !== '/oauth/jwks') return responder(res, 503, { error: 'fora' })
    if (url.pathname === '/.well-known/openid-configuration') {
      return responder(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        userinfo_endpoint: `${base}/oauth/userinfo`,
        revocation_endpoint: `${base}/oauth/revoke`,
        jwks_uri: `${base}/oauth/jwks`,
      })
    }
    if (url.pathname === '/oauth/jwks') return responder(res, 200, { keys: [jwk] })
    if (url.pathname === '/oauth/authorize') {
      const q = url.searchParams
      zro.prompts.push(q.get('prompt'))
      const volta = new URL(q.get('redirect_uri'))
      volta.searchParams.set('state', q.get('state'))
      if (q.get('client_id') !== CLIENTE.clientId || q.get('code_challenge_method') !== 'S256' || !q.get('nonce') || q.get('scope') !== ESCOPOS) {
        volta.searchParams.set('error', 'invalid_request')
      } else if (zro.proximo.negar) {
        volta.searchParams.set('error', 'access_denied')
      } else {
        const code = `zc_${randomBytes(16).toString('hex')}`
        zro.contas.set(zro.proximo.pessoa.sub, { ...zro.proximo.pessoa })
        codigos.set(code, { desafio: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), nonce: q.get('nonce'), sub: zro.proximo.pessoa.sub, usado: false })
        volta.searchParams.set('code', code)
        volta.searchParams.set('iss', base)
      }
      res.writeHead(302, { location: volta.toString() })
      return res.end()
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      const f = await lerForm(req)
      if (!clienteOk(req)) return responder(res, 401, { error: 'invalid_client' })
      if (f.get('grant_type') === 'refresh_token') {
        const r = refreshes.get(f.get('refresh_token') ?? '')
        if (!r || familiasMortas.has(r.familia)) return responder(res, 400, { error: 'invalid_grant' })
        if (r.usado) {
          familiasMortas.add(r.familia) // reuso: a família inteira morre, como no HUB
          return responder(res, 400, { error: 'invalid_grant' })
        }
        r.usado = true
        zro.renovacoes++
        return responder(res, 200, emitir(r.sub, r.familia))
      }
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
      const p = zro.contas.get(c.sub)
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
          ...perfil(p),
          zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null,
          zro_products: p.produtos,
          auth_time: agora,
        },
        ad === 'assinatura',
      )
      return responder(res, 200, { ...emitir(p.sub), id_token: id })
    }
    if (url.pathname === '/oauth/userinfo') {
      const a = acessos.get((req.headers.authorization ?? '').replace(/^Bearer /, ''))
      if (!a || a.exp < Date.now()) return responder(res, 401, { error: 'invalid_token' })
      zro.userinfos++
      const p = zro.contas.get(a.sub)
      return responder(res, 200, { sub: p.sub, email: p.email, email_verified: true, ...perfil(p), zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null, zro_products: p.produtos })
    }
    if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
      const f = await lerForm(req)
      if (!clienteOk(req)) return responder(res, 401, { error: 'invalid_client' })
      const r = refreshes.get(f.get('token') ?? '')
      if (r) {
        familiasMortas.add(r.familia)
        zro.revogados++
      }
      return responder(res, 200, {})
    }
    // A Z (/api/v1/ia/*): só com Bearer válido. `semIa`: token sem zro.ia (login de antes da Z) → 401, como o HUB.
    // /mensagens responde NDJSON em dois pedaços; `iaPausa` segura o segundo.
    if (url.pathname.startsWith('/api/v1/ia/')) {
      const auth = String(req.headers.authorization ?? '')
      let corpo = ''
      for await (const c of req) corpo += c
      const caminho = url.pathname.slice('/api/v1/ia/'.length)
      zro.iaPedidos.push({ metodo: req.method, caminho, auth, corpo, cookie: req.headers.cookie ?? null })
      const a = acessos.get(auth.replace(/^Bearer /, ''))
      if (!a || a.exp < Date.now() || zro.semIa) return responder(res, 401, { error: 'unauthorized' })
      if (caminho === 'estado') return responder(res, 200, { ligada: true, nome: 'Lia', produto: 'tpeasy', creditos: { usados: 0, limite: 100, renova_em: '2026-11-01T00:00:00.000Z' } })
      if (caminho === 'conversas') return responder(res, 200, { conversas: [] })
      if (caminho === 'mensagens' && req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
        res.write(`${JSON.stringify({ tipo: 'conversa', id: 'c-1' })}\n${JSON.stringify({ tipo: 'texto', t: 'Olá, ' })}\n`)
        if (zro.iaPausa) await zro.iaPausa
        return res.end(`${JSON.stringify({ tipo: 'texto', t: 'tudo certo.' })}\n${JSON.stringify({ tipo: 'fim', creditos: 1 })}\n`)
      }
      return responder(res, 404, { error: 'not_found' })
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
  for (const nome of ['entrar', 'callback', 'eu', 'sair', 'ia']) rotas[`/api/zro/${nome}`] = (await import(`../api/zro/${nome}.mjs`)).default
  const server = http.createServer(async (req, res) => {
    const caminho = new URL(req.url, 'http://x').pathname
    const rota = rotas[caminho] || (caminho.startsWith('/api/zro/ia/') ? rotas['/api/zro/ia'] : null)
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
  return { ida, destino, res, local: res.headers.get('location'), sessao: valorCookie(res, 'tp_zro'), hub: valorCookie(res, 'tp_zro_hub') }
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
    assert.equal(u.searchParams.get('scope'), ESCOPOS)
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
    assert.doesNotMatch(conteudo, /at_|zt_|eyJ/, 'nenhum token do HUB no cookie da sessão')
    assert.deepEqual(Object.keys(JSON.parse(conteudo)).sort(), ['conta', 'email', 'exp', 'foto', 'lido', 'nome', 'organizacao', 'produtos', 'sub'])

    const eu = await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(r.sessao)}` })
    assert.equal(eu.status, 200)
    assert.equal(eu.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await eu.json(), {
      entrou: true,
      sub: 'zro-111',
      nome: 'Lia Produtora',
      email: 'lia@produtora.com',
      foto: null,
      conta: `${zro.url}/perfil`,
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

describe('perfil único (nome, e-mail e foto da conta Absolute ZRO)', () => {
  const FOTO = '3f1c2a9e-0000-4000-8000-000000000001'
  const FOTO_NOVA = '3f1c2a9e-0000-4000-8000-000000000002'
  const cookies = (r) => [`tp_zro=${encodeURIComponent(r.sessao)}`, r.hub ? `tp_zro_hub=${encodeURIComponent(r.hub)}` : null].filter(Boolean).join('; ')
  const abrirApp = (r) => ir('/api/zro/eu', { cookie: cookies(r) })
  /** O navegador guarda o que o /eu devolveu (a sessão e o cofre rodam a cada leitura). */
  const guardar = (r, res) => {
    const s = valorCookie(res, 'tp_zro')
    const h = valorCookie(res, 'tp_zro_hub')
    if (s !== undefined) r.sessao = s
    if (h !== undefined) r.hub = h
    return res
  }
  const passar = (s) => mock.timers.tick(s * 1000)

  beforeEach(() => {
    Object.assign(zro, { atTtl: 600, fora: false, renovacoes: 0, userinfos: 0, revogados: 0 })
    mock.timers.enable({ apis: ['Date'], now: Date.now() })
  })
  afterEach(() => mock.timers.reset())

  test('o login traz a foto e onde editar; os tokens vão cifrados, só para /api/zro', async () => {
    zro.proximo.pessoa = { ...LIA, foto: FOTO }
    const r = await fluxo()
    const linha = setCookies(r.res).find((c) => c.startsWith('tp_zro_hub='))
    assert.match(linha, /HttpOnly/)
    assert.match(linha, /SameSite=Lax/)
    assert.match(linha, /Path=\/api\/zro;/)
    assert.doesNotMatch(Buffer.from(r.hub, 'base64url').toString('latin1'), /at_|zt_|refresh|access/, 'token cifrado, não só assinado')
    const j = await (await abrirApp(r)).json()
    assert.equal(j.foto, `${zro.url}/api/v1/foto/${FOTO}`)
    assert.equal(j.conta, `${zro.url}/perfil`)
  })

  test('mudou na conta Absolute ZRO: muda no TPeasy na próxima abertura, sem fazer nada', async () => {
    zro.proximo.pessoa = { ...LIA, foto: FOTO }
    const r = await fluxo()
    Object.assign(zro.contas.get(LIA.sub), { nome: 'Lia Nova', email: 'lia@nova.com', foto: FOTO_NOVA, produtos: ['tpeasy'] })
    let j = await (await abrirApp(r)).json()
    assert.equal(j.nome, 'Lia Produtora', 'recarregar logo em seguida não pergunta de novo')
    assert.equal(zro.userinfos, 0)
    passar(61)
    j = await guardar(r, await abrirApp(r)).json()
    assert.equal(zro.userinfos, 1, 'releu em /oauth/userinfo')
    assert.equal(zro.renovacoes, 0, 'o access token ainda valia: sem refresh')
    assert.equal(j.nome, 'Lia Nova')
    assert.equal(j.email, 'lia@nova.com')
    assert.equal(j.foto, `${zro.url}/api/v1/foto/${FOTO_NOVA}`)
    assert.deepEqual(j.produtos, ['tpeasy'])
    zro.fora = true
    assert.equal((await (await abrirApp(r)).json()).nome, 'Lia Nova', 'a cópia nova ficou na sessão')
    zro.fora = false
    zro.contas.get(LIA.sub).foto = null
    passar(61)
    assert.equal((await guardar(r, await abrirApp(r)).json()).foto, null, 'tirou a foto: volta à inicial')
  })

  test('access token vencido: troca o refresh token (que roda) e relê', async () => {
    zro.atTtl = 10
    const r = await fluxo()
    const antes = r.hub
    zro.contas.get(LIA.sub).nome = 'Lia Renovada'
    passar(61)
    assert.equal((await guardar(r, await abrirApp(r)).json()).nome, 'Lia Renovada')
    assert.equal(zro.renovacoes, 1)
    assert.notEqual(r.hub, antes, 'o cofre guarda o refresh token novo')
    passar(61)
    assert.equal((await guardar(r, await abrirApp(r))).status, 200)
    assert.equal(zro.renovacoes, 2, 'o token novo serve para a próxima troca')
  })

  test('HUB fora do ar: vale a última cópia e nada muda', async () => {
    zro.proximo.pessoa = { ...LIA, foto: FOTO }
    const r = await fluxo()
    zro.fora = true
    passar(61)
    const res = await abrirApp(r)
    assert.equal(res.status, 200)
    assert.deepEqual(setCookies(res), [])
    assert.equal((await res.json()).foto, `${zro.url}/api/v1/foto/${FOTO}`)
  })

  test('acesso do app removido na Absolute ZRO: a sessão acaba', async () => {
    zro.atTtl = 10
    const r = await fluxo()
    zro.removerAcesso(LIA.sub)
    passar(61)
    const res = await abrirApp(r)
    assert.equal(res.status, 401)
    assert.equal(valorCookie(res, 'tp_zro'), '')
    assert.equal(valorCookie(res, 'tp_zro_hub'), '')
  })

  test('sessão antiga (sem cofre) ou cofre de outra pessoa: vale a cópia, sem perguntar ao HUB', async () => {
    const a = await fluxo()
    zro.proximo.pessoa = { ...LIA, sub: 'zro-999', nome: 'Outra' }
    const b = await fluxo()
    passar(61)
    assert.equal((await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(a.sessao)}` })).status, 200)
    const j = await (await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(a.sessao)}; tp_zro_hub=${encodeURIComponent(b.hub)}` })).json()
    assert.equal(j.nome, 'Lia Produtora')
    assert.equal((await ir('/api/zro/eu', { cookie: `tp_zro=${encodeURIComponent(a.sessao)}; tp_zro_hub=lixo` })).status, 200)
    assert.equal(zro.userinfos, 0)
  })

  test('foto ou conta fora da Absolute ZRO não passam', () => {
    const p = lib.perfilDeClaims({ sub: 's', email: 'a@b.c', picture: 'https://mal.exemplo/x.png', zro_conta: 'javascript:alert(1)' })
    assert.equal(p.foto, null)
    assert.equal(p.conta, `${zro.url}/perfil`)
    assert.equal(lib.perfilDeClaims({ sub: 's', email: 'a@b.c', picture: `${zro.url}/api/v1/foto/x" onerror="y` }).foto, null)
  })

  test('sair revoga o refresh token no HUB e apaga o cofre', async () => {
    const r = await fluxo()
    const res = await ir('/api/zro/sair', { cookie: cookies(r), method: 'POST', headers: { origin: APP } })
    assert.equal(res.status, 200)
    assert.equal(zro.revogados, 1)
    assert.equal(valorCookie(res, 'tp_zro_hub'), '')
  })
})

describe('a Z (repasse /api/zro/ia)', () => {
  beforeEach(() => Object.assign(zro, { atTtl: 600, fora: false, semIa: false, iaPedidos: [], iaPausa: null }))
  const sessao = async () => {
    const f = await fluxo()
    return `tp_zro=${encodeURIComponent(f.sessao)}; tp_zro_hub=${encodeURIComponent(f.hub)}`
  }

  test('o login pede a Z (zro.ia)', async () => {
    const ida = await ir('/api/zro/entrar')
    assert.ok(new URL(ida.headers.get('location')).searchParams.get('scope').split(' ').includes('zro.ia'))
  })

  test('sem sessão: 401 com reconectar, e nada chega ao HUB', async () => {
    const r = await ir('/api/zro/ia/estado')
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
    assert.equal(zro.iaPedidos.length, 0)
  })

  test('encaminha com o Bearer da sessão, sem cookie do app, e o token não volta para a página', async () => {
    const cookie = await sessao()
    const r = await ir('/api/zro/ia/estado', { cookie })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    const texto = await r.text()
    assert.equal(JSON.parse(texto).produto, 'tpeasy')
    const p = zro.iaPedidos.at(-1)
    assert.match(p.auth, /^Bearer at_[0-9a-f]{32}$/)
    assert.equal(p.cookie, null)
    assert.ok(!texto.includes(p.auth.slice(7)))
    assert.equal((await ir('/api/zro/ia?c=conversas', { cookie })).status, 200, 'a reescrita da Vercel (?c=) também serve')
  })

  test('/mensagens: o NDJSON chega em pedaços, sem esperar o fim', async () => {
    const cookie = await sessao()
    let soltar
    zro.iaPausa = new Promise((ok) => (soltar = ok))
    const r = await fetch(`${APP}/api/zro/ia/mensagens`, { method: 'POST', headers: { cookie, origin: APP, 'content-type': 'application/json' }, body: JSON.stringify({ conversa: null, texto: 'Oi, Z' }) })
    assert.equal(r.status, 200)
    const leitor = r.body.getReader()
    const dec = new TextDecoder()
    let primeiro = ''
    while (!primeiro.includes('Olá')) {
      const { value, done } = await leitor.read()
      assert.ok(!done)
      primeiro += dec.decode(value, { stream: true })
    }
    assert.ok(!primeiro.includes('"fim"'))
    soltar()
    let resto = ''
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      resto += dec.decode(value, { stream: true })
    }
    assert.match(resto, /"fim"/)
    assert.equal(JSON.parse(zro.iaPedidos.at(-1).corpo).texto, 'Oi, Z')
  })

  test('outra origem e outros caminhos não passam', async () => {
    const cookie = await sessao()
    const r = await fetch(`${APP}/api/zro/ia/mensagens`, { method: 'POST', headers: { cookie, origin: 'https://malicioso.exemplo' }, body: '{}' })
    assert.equal(r.status, 403)
    for (const c of ['admin', 'conversas/a%2Fb', '']) assert.equal((await ir(`/api/zro/ia/${c}`, { cookie })).status, 404, c)
    assert.equal((await ir('/api/zro/ia/estado', { cookie, method: 'DELETE' })).status, 405)
    assert.equal(zro.iaPedidos.length, 0)
  })

  test('token vencido: renova e grava o cofre novo (HttpOnly)', async () => {
    zro.atTtl = 10
    const cookie = await sessao()
    const antes = zro.renovacoes
    const r = await ir('/api/zro/ia/estado', { cookie })
    assert.equal(r.status, 200)
    assert.equal(zro.renovacoes, antes + 1)
    assert.match(setCookies(r).find((c) => c.startsWith('tp_zro_hub=')), /HttpOnly/)
  })

  test('login de antes da Z (sem zro.ia): 401 com reconectar', async () => {
    const cookie = await sessao()
    zro.semIa = true
    const r = await ir('/api/zro/ia/estado', { cookie })
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
  })

  test('o painel usa o script oficial e o repasse do app; o service worker não guarda a Z', async () => {
    const { readFileSync } = await import('node:fs')
    const z = readFileSync(new URL('../app/js/z.js', import.meta.url), 'utf8')
    assert.match(z, /https:\/\/absolutezro\.com\/ia\/v1\/zro-ia\.js/)
    assert.match(z, /setAttribute\("api", "\/api\/zro\/ia"\)/)
    assert.ok(!/\.token\s*=/.test(z))
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
    assert.match(sw, /tpeasy-v18/)
    assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/)
    const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    assert.ok(v.rewrites.some((r) => r.source === '/api/zro/ia/:caminho*' && r.destination === '/api/zro/ia?c=:caminho*'))
  })

  test('a Z tem aba própria: a primeira, e a tela de entrada; Roteiros volta a ser como era', async () => {
    const { readFileSync } = await import('node:fs')
    const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
    const ui = readFileSync(new URL('../app/js/ui.js', import.meta.url), 'utf8')
    const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8')
    const abas = /<nav class="tabbar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1]
    assert.match(abas.trim(), /^<button class="tab" data-go="z">/)
    assert.match(ui, /TABS = \["z", "roteiros", "tp", "ajustes"\]/)
    assert.match(main, /fromHash\) \? fromHash : "z"/)
    const roteiros = /data-tab="roteiros"[\s\S]*?<\/section>\s*<!--/.exec(html)[0]
    assert.ok(!/zPainel/.test(roteiros), 'a Z não fica empilhada em Roteiros')
    assert.match(/data-tab="z"[\s\S]*?<\/section>/.exec(html)[0], /id="zPainel"/)
  })
})
