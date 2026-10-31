// Absolute ZRO falsa para os testes do "Entrar com Absolute ZRO": descoberta OIDC, /oauth/authorize (devolve o
// código na hora, como app da família), /oauth/token (código: confere client_secret_basic, ou só o client_id no
// cliente público do desktop; PKCE S256, redirect_uri e uso único; refresh: roda o token e derruba a família no reuso),
// /oauth/userinfo, /oauth/revoke e JWKS. Assina o id_token com uma chave EC P-256 gerada aqui. `adulterar` gera tokens ruins de propósito.
//
// Perfil único: `contas` (por sub) é a conta na Absolute ZRO. O teste muda nome, e-mail ou foto ali e o /userinfo
// devolve o novo, como o HUB de verdade (picture = <emissor>/api/v1/foto/<uuid>, ausente sem foto).

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import http from 'node:http'

export const ESCOPOS_ESPERADOS = 'openid email profile org offline_access zro.ia zro.set'
/** Absolute ZRO de antes do Set (`recusarSet`): recusa zro.set e aceita o pedido sem ele. */
export const ESCOPOS_SEM_SET = 'openid email profile org offline_access zro.ia'

export async function iniciarZroFalsa(cliente) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'chave-teste', alg: 'ES256', use: 'sig' }
  const codigos = new Map()
  const acessos = new Map() // access token → { sub, exp }
  const refreshes = new Map() // refresh token → { sub, familia, usado }
  const familiasMortas = new Set()
  const contas = new Map() // sub → pessoa (a conta na Absolute ZRO)
  const estado = { semIa: false, iaPedidos: [], iaPausa: null, semSet: false, recusarSet: false, setPedidos: [], setVersao: 1, pessoa: null, negar: false, adulterar: null, trocas: 0, renovacoes: 0, userinfos: 0, revogados: 0, prompt: null, atTtl: 600, fora: false }
  let base = ''

  const jwt = (dados, assinarErrado = false) => {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const cab = `${b({ alg: 'ES256', typ: 'JWT', kid: jwk.kid })}.${b(dados)}`
    const chave = assinarErrado ? generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : privateKey
    return `${cab}.${sign('sha256', Buffer.from(cab), { key: chave, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
  }
  const responder = (res, status, corpo) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo))
  }
  const perfil = (p) => ({
    name: p.nome,
    ...(p.foto ? { picture: `${base}/api/v1/foto/${p.foto}` } : {}),
    updated_at: p.atualizado || 1_790_000_000,
    zro_conta: `${base}/perfil`,
  })
  const emitir = (sub, familia = randomBytes(8).toString('hex')) => {
    const at = `at_${randomBytes(16).toString('hex')}`
    const rt = `zt_${randomBytes(24).toString('base64url')}`
    acessos.set(at, { sub, exp: Date.now() + estado.atTtl * 1000 })
    refreshes.set(rt, { sub, familia, usado: false })
    return { access_token: at, refresh_token: rt, token_type: 'Bearer', expires_in: estado.atTtl, scope: ESCOPOS_ESPERADOS }
  }
  const lerForm = async (req) => {
    let corpo = ''
    for await (const c of req) corpo += c
    return new URLSearchParams(corpo)
  }
  // cliente público (app de desktop, `publico: true`): sem segredo, só o client_id no formulário (RFC 8252)
  const clienteOk = (req, f) =>
    cliente.publico ? !req.headers.authorization && f.get('client_id') === cliente.clientId : clienteSecreto(req)
  const clienteSecreto = (req) => Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString() === `${cliente.clientId}:${cliente.clientSecret}`

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    if (estado.fora && url.pathname !== '/.well-known/openid-configuration' && url.pathname !== '/oauth/jwks') return responder(res, 503, { error: 'fora' })
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
      // prompt=create: o HUB de verdade abre /criar-conta antes de voltar; aqui só registra o pedido
      estado.prompt = q.get('prompt')
      const volta = new URL(q.get('redirect_uri'))
      volta.searchParams.set('state', q.get('state'))
      estado.escopos = q.get('scope')
      if (estado.recusarSet && q.get('scope') === ESCOPOS_ESPERADOS) {
        volta.searchParams.set('error', 'invalid_scope')
      } else if (q.get('client_id') !== cliente.clientId || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('nonce') || q.get('scope') !== (estado.recusarSet ? ESCOPOS_SEM_SET : ESCOPOS_ESPERADOS)) {
        volta.searchParams.set('error', 'invalid_request')
      } else if (estado.negar || !estado.pessoa) {
        volta.searchParams.set('error', 'access_denied')
      } else {
        contas.set(estado.pessoa.sub, { ...estado.pessoa })
        const code = `zc_${randomBytes(16).toString('hex')}`
        codigos.set(code, { desafio: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), sub: estado.pessoa.sub, nonce: q.get('nonce'), usado: false })
        volta.searchParams.set('code', code)
        volta.searchParams.set('iss', base)
      }
      res.writeHead(302, { location: volta.toString() })
      return res.end()
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      const f = await lerForm(req)
      if (!clienteOk(req, f)) return responder(res, 401, { error: 'invalid_client' })
      if (f.get('grant_type') === 'refresh_token') {
        const r = refreshes.get(f.get('refresh_token') || '')
        if (!r || familiasMortas.has(r.familia)) return responder(res, 400, { error: 'invalid_grant' })
        if (r.usado) {
          // reuso: a família inteira morre, como no HUB
          familiasMortas.add(r.familia)
          return responder(res, 400, { error: 'invalid_grant' })
        }
        r.usado = true
        estado.renovacoes++
        return responder(res, 200, { ...emitir(r.sub, r.familia), id_token: jwt({ iss: base, sub: r.sub, aud: cliente.clientId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 }) })
      }
      const c = codigos.get(f.get('code') || '')
      if (!c || c.usado) return responder(res, 400, { error: 'invalid_grant' })
      c.usado = true
      const desafio = createHash('sha256')
        .update(f.get('code_verifier') || '')
        .digest('base64url')
      if (desafio !== c.desafio || f.get('redirect_uri') !== c.redirectUri) return responder(res, 400, { error: 'invalid_grant' })
      estado.trocas++
      const p = contas.get(c.sub)
      const agora = Math.floor(Date.now() / 1000)
      const ad = estado.adulterar
      const id = jwt(
        {
          iss: ad === 'emissor' ? 'https://outro.exemplo' : base,
          sub: p.sub,
          aud: ad === 'aud' ? 'outro-app' : cliente.clientId,
          iat: agora,
          exp: ad === 'expirado' ? agora - 3600 : agora + 600,
          auth_time: agora,
          nonce: ad === 'nonce' ? 'nonce-errado' : c.nonce,
          email: p.email,
          email_verified: true,
          ...perfil(p),
          zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null,
          zro_products: p.produtos || [],
        },
        ad === 'assinatura',
      )
      return responder(res, 200, { ...emitir(p.sub), id_token: id })
    }
    if (url.pathname === '/oauth/userinfo') {
      const at = String(req.headers.authorization || '').replace(/^Bearer /, '')
      const a = acessos.get(at)
      if (!a || a.exp < Date.now()) return responder(res, 401, { error: 'invalid_token' })
      estado.userinfos++
      const p = contas.get(a.sub)
      return responder(res, 200, { sub: p.sub, email: p.email, email_verified: true, ...perfil(p), zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null, zro_products: p.produtos || [] })
    }
    if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
      const f = await lerForm(req)
      if (!clienteOk(req, f)) return responder(res, 401, { error: 'invalid_client' })
      const r = refreshes.get(f.get('token') || '')
      if (r) {
        familiasMortas.add(r.familia)
        estado.revogados++
      }
      return responder(res, 200, {})
    }
    // A Z (/api/v1/ia/*): só com Bearer de um access token válido. `semIa`: o token não tem zro.ia (login de antes da
    // Z), e a Absolute ZRO responde 401 como a de verdade. /mensagens responde NDJSON em dois pedaços; `iaPausa` (uma
    // promessa) segura o segundo, para o teste ver que o primeiro chegou antes.
    if (url.pathname.startsWith('/api/v1/ia/')) {
      const auth = String(req.headers.authorization || '')
      let corpo = ''
      for await (const c of req) corpo += c
      estado.iaPedidos.push({ metodo: req.method, caminho: url.pathname.slice('/api/v1/ia/'.length), auth, corpo, cookie: req.headers.cookie || null })
      const a = acessos.get(auth.replace(/^Bearer /, ''))
      if (!a || a.exp < Date.now() || estado.semIa) return responder(res, 401, { error: 'unauthorized', message: 'Entre de novo.' })
      const caminho = url.pathname.slice('/api/v1/ia/'.length)
      if (caminho === 'estado') return responder(res, 200, { ligada: true, nome: contas.get(a.sub)?.nome?.split(' ')[0] || null, produto: 'synquei', creditos: { usados: 2, limite: 100, renova_em: '2026-11-01T00:00:00.000Z' } })
      if (caminho === 'conversas') return responder(res, 200, { conversas: [] })
      if (caminho === 'mensagens' && req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
        res.write(JSON.stringify({ tipo: 'conversa', id: 'c-1' }) + '\n' + JSON.stringify({ tipo: 'texto', t: 'Olá, ' }) + '\n')
        if (estado.iaPausa) await estado.iaPausa
        res.end(JSON.stringify({ tipo: 'texto', t: 'tudo certo.' }) + '\n' + JSON.stringify({ tipo: 'fim', creditos: 1 }) + '\n')
        return
      }
      if (/^conversas\/[\w-]+$/.test(caminho)) return responder(res, 200, req.method === 'DELETE' ? { ok: true } : { mensagens: [] })
      return responder(res, 404, { error: 'not_found' })
    }
    // O Set (/api/v1/set/*): só com Bearer válido; `semSet` = token sem zro.set (401, como a de verdade). Toda leitura
    // devolve a ETag fraca da versão (`setVersao`); com If-None-Match igual, 304 sem corpo.
    if (url.pathname === '/api/v1/set' || url.pathname.startsWith('/api/v1/set/')) {
      const auth = String(req.headers.authorization || '')
      let corpo = ''
      for await (const c of req) corpo += c
      const caminho = url.pathname.slice('/api/v1/set'.length).replace(/^\//, '')
      estado.setPedidos.push({ metodo: req.method, caminho, busca: url.search, auth, corpo, cookie: req.headers.cookie || null, inm: req.headers['if-none-match'] || null })
      const a = acessos.get(auth.replace(/^Bearer /, ''))
      if (!a || a.exp < Date.now() || estado.semSet) return responder(res, 401, { error: 'unauthorized', message: 'Entre de novo.' })
      const etag = `W/"v${estado.setVersao}"`
      if (req.method === 'GET' && req.headers['if-none-match'] === etag) {
        res.writeHead(304, { etag })
        return res.end()
      }
      const eu = { id: '00000000-0000-4000-8000-000000000001', arroba: 'lia', nome: contas.get(a.sub)?.nome || 'Lia', foto: null, preferencias: { invisivel: false, quemVe: 'equipe_contatos', mostrarVisto: true } }
      const dados = caminho === '' ? { eu, pessoas: [{ id: '00000000-0000-4000-8000-000000000002', arroba: 'rui', nome: 'Rui Som', foto: null, estado: 'online', app: { id: 'hub', nome: 'Absolute ZRO' } }], naoLidas: 2, pedidos: 0, porConversa: {}, ultima: 0 } : caminho === 'conversas' ? { conversas: [], projetos: [] } : { ok: true }
      res.writeHead(200, { 'content-type': 'application/json', ...(req.method === 'GET' ? { etag } : {}) })
      return res.end(JSON.stringify(dados))
    }
    responder(res, 404, { error: 'not_found' })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${server.address().port}`
  /** "Perfil › Apps com acesso › Remover": todos os refresh tokens desta pessoa morrem. */
  const removerAcesso = (sub) => {
    for (const r of refreshes.values()) if (r.sub === sub) familiasMortas.add(r.familia)
    for (const [k, a] of acessos) if (a.sub === sub) acessos.delete(k)
  }
  /** Os access tokens emitidos até aqui vencem (o próximo /userinfo pede renovação pelo refresh token). */
  const vencer = () => {
    for (const a of acessos.values()) a.exp = 0
  }
  return { url: base, estado, contas, removerAcesso, vencer, fechar: () => new Promise((ok) => server.close(() => ok())) }
}
