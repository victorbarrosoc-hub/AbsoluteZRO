// Absolute ZRO falsa para os testes do "Entrar com Absolute ZRO": descoberta OIDC, /oauth/authorize (devolve o
// código na hora, como app da família), /oauth/token (confere client_secret_basic, PKCE S256, redirect_uri e uso
// único) e JWKS. Assina o id_token com uma chave EC P-256 gerada aqui. `adulterar` gera tokens ruins de propósito.

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import http from 'node:http'

export async function iniciarZroFalsa(cliente) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'chave-teste', alg: 'ES256', use: 'sig' }
  const codigos = new Map()
  const estado = { pessoa: null, negar: false, adulterar: null, trocas: 0, prompt: null }
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

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    if (url.pathname === '/.well-known/openid-configuration') {
      return responder(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
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
      if (
        q.get('client_id') !== cliente.clientId ||
        q.get('code_challenge_method') !== 'S256' ||
        !q.get('code_challenge') ||
        !q.get('nonce') ||
        q.get('scope') !== 'openid email profile org'
      ) {
        volta.searchParams.set('error', 'invalid_request')
      } else if (estado.negar || !estado.pessoa) {
        volta.searchParams.set('error', 'access_denied')
      } else {
        const code = `zc_${randomBytes(16).toString('hex')}`
        codigos.set(code, { desafio: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), pessoa: estado.pessoa, nonce: q.get('nonce'), usado: false })
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
      const basic = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString()
      if (basic !== `${cliente.clientId}:${cliente.clientSecret}`) return responder(res, 401, { error: 'invalid_client' })
      const c = codigos.get(f.get('code') || '')
      if (!c || c.usado) return responder(res, 400, { error: 'invalid_grant' })
      c.usado = true
      const desafio = createHash('sha256')
        .update(f.get('code_verifier') || '')
        .digest('base64url')
      if (desafio !== c.desafio || f.get('redirect_uri') !== c.redirectUri) return responder(res, 400, { error: 'invalid_grant' })
      estado.trocas++
      const agora = Math.floor(Date.now() / 1000)
      const ad = estado.adulterar
      const id = jwt(
        {
          iss: ad === 'emissor' ? 'https://outro.exemplo' : base,
          sub: c.pessoa.sub,
          aud: ad === 'aud' ? 'outro-app' : cliente.clientId,
          iat: agora,
          exp: ad === 'expirado' ? agora - 3600 : agora + 600,
          auth_time: agora,
          nonce: ad === 'nonce' ? 'nonce-errado' : c.nonce,
          email: c.pessoa.email,
          email_verified: true,
          name: c.pessoa.nome,
          zro_org: c.pessoa.org ? { id: 'org-1', name: c.pessoa.org, role: 'owner' } : null,
          zro_products: c.pessoa.produtos || [],
        },
        ad === 'assinatura',
      )
      return responder(res, 200, { access_token: 'at', token_type: 'Bearer', expires_in: 600, id_token: id, scope: 'openid email profile org' })
    }
    responder(res, 404, { error: 'not_found' })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${server.address().port}`
  return { url: base, estado, fechar: () => new Promise((ok) => server.close(() => ok())) }
}
