// O AEON de computador só abre com a conta Absolute ZRO (decisão do titular, 26/10/2026). App nativo, então o login é
// o de app público do OpenID Connect (RFC 8252): o navegador da pessoa abre a Absolute ZRO, ela entra (ou já está
// logada) e a Absolute ZRO volta para http://127.0.0.1:<porta>/callback, onde este processo está ouvindo só durante o
// login. Código + PKCE S256, state e nonce; o id_token é conferido pela chave pública (JWKS) da Absolute ZRO.
// Cliente "aeon-desktop" (público: sem segredo no app, que é aberto). Fica guardado só quem é a pessoa, por 30 dias, na
// pasta de dados do app: nenhum token da Absolute ZRO.
//
// A página é a mesma do site (entrar.html + app/editor.js), e as rotas também: o protocolo do app responde
// /api/zro/eu, /api/zro/entrar e /api/zro/sair daqui (desktop/main.cjs).

const { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } = require('node:crypto')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const EMISSOR = (process.env.ZRO_ISSUER || 'https://absolutezro.com').replace(/\/+$/, '')
const CLIENTE = 'aeon-desktop'
const PRODUTO = 'ai-edit'
const ESCOPOS = 'openid email profile org'
const CONTA_S = 30 * 24 * 3600
const ESPERA_MS = 10 * 60 * 1000

const valor = () => randomBytes(32).toString('base64url')
const desafio = (v) => createHash('sha256').update(v).digest('base64url')
const igual = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

async function buscarJson(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  return { status: r.status, corpo: await r.json().catch(() => null) }
}

async function descobrir() {
  const { status, corpo } = await buscarJson(`${EMISSOR}/.well-known/openid-configuration`)
  if (status !== 200 || !corpo || corpo.issuer !== EMISSOR || !corpo.authorization_endpoint || !corpo.token_endpoint || !corpo.jwks_uri) throw new Error('descoberta')
  return corpo
}

/** Confere o id_token (ES256 pela JWKS, iss, aud, exp, nonce) e devolve a pessoa. */
async function conferir(idToken, nonce, jwksUri) {
  const partes = String(idToken).split('.')
  if (partes.length !== 3) throw new Error('formato')
  const cab = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
  const d = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  if (cab.alg !== 'ES256' || typeof cab.kid !== 'string') throw new Error('algoritmo')
  const { status, corpo } = await buscarJson(jwksUri)
  const jwk = status === 200 && Array.isArray(corpo?.keys) ? corpo.keys.find((k) => k.kid === cab.kid) : null
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error('chave desconhecida')
  const ok = verify('sha256', Buffer.from(`${partes[0]}.${partes[1]}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(partes[2], 'base64url'))
  if (!ok) throw new Error('assinatura')
  const s = Math.floor(Date.now() / 1000)
  const aud = Array.isArray(d.aud) ? d.aud : [d.aud]
  if (d.iss !== EMISSOR) throw new Error('emissor')
  if (!aud.includes(CLIENTE) || (aud.length > 1 && d.azp !== CLIENTE)) throw new Error('público')
  if (typeof d.exp !== 'number' || d.exp < s - 60) throw new Error('expirado')
  if (!igual(d.nonce, nonce)) throw new Error('nonce')
  if (typeof d.sub !== 'string' || !d.sub || typeof d.email !== 'string') throw new Error('sem sub ou e-mail')
  const org = d.zro_org && typeof d.zro_org === 'object' && typeof d.zro_org.name === 'string' ? d.zro_org : null
  return {
    sub: d.sub.slice(0, 200),
    nome: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 120) : null,
    email: d.email.trim().toLowerCase().slice(0, 254),
    organizacao: org ? { id: String(org.id || '').slice(0, 100), nome: org.name.slice(0, 120) } : null,
    produtos: Array.isArray(d.zro_products) ? d.zro_products.filter((p) => typeof p === 'string').slice(0, 30) : [],
  }
}

const PAGINA = (titulo, texto) =>
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>AEON</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;background:#000;color:#f5f5f7;font:17px -apple-system,system-ui,sans-serif"><h1 style="font-weight:700;letter-spacing:-.02em;margin:0 0 10px">${titulo}</h1><p style="color:#a1a1a6;margin:0">${texto}</p></body></html>`

/**
 * pasta: onde guardar conta.json (pasta de dados do app). abrirNavegador(url): abre o navegador da pessoa.
 * aoVoltar(): traz a janela do app para frente quando o login termina.
 */
function criarConta({ pasta, abrirNavegador, aoVoltar = () => {} }) {
  const arquivo = path.join(pasta, 'conta.json')
  let emAndamento = null

  function ler() {
    try {
      const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
      if (!c || typeof c.exp !== 'number' || c.exp < Math.floor(Date.now() / 1000) || !c.pessoa?.sub) return null
      return c.pessoa
    } catch {
      return null
    }
  }

  function gravar(pessoa) {
    fs.mkdirSync(pasta, { recursive: true })
    const tmp = `${arquivo}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ pessoa, exp: Math.floor(Date.now() / 1000) + CONTA_S }), { mode: 0o600 })
    fs.renameSync(tmp, arquivo)
  }

  function sair() {
    fs.rmSync(arquivo, { force: true })
  }

  /** O mesmo formato do /api/zro/eu do site: 200 com a pessoa e se a conta tem o AEON; null = sem sessão (401). */
  function eu() {
    const p = ler()
    return p ? { ok: true, pessoa: p, acesso: p.produtos.includes(PRODUTO), ferramentas: `${EMISSOR}/ferramentas` } : null
  }

  /** Login completo. Devolve 'ok', 'recusado', 'expirou' ou 'erro' (os mesmos avisos do site). */
  function entrar({ criar = false } = {}) {
    if (emAndamento) return emAndamento
    emAndamento = (async () => {
      const d = await descobrir()
      const state = valor()
      const nonce = valor()
      const verificador = valor()
      const servidor = http.createServer()
      await new Promise((ok, falha) => servidor.listen(0, '127.0.0.1', ok).on('error', falha))
      const retorno = `http://127.0.0.1:${servidor.address().port}/callback`
      try {
        const volta = new Promise((ok) => {
          const prazo = setTimeout(() => ok({ erro: 'expirou' }), ESPERA_MS)
          servidor.on('request', (req, res) => {
            const u = new URL(req.url, retorno)
            if (u.pathname !== '/callback') return res.writeHead(404).end()
            clearTimeout(prazo)
            const q = u.searchParams
            const fim = (resultado, titulo, texto) => {
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PAGINA(titulo, texto))
              ok(resultado)
            }
            if (!igual(q.get('state'), state)) return fim({ erro: 'expirou' }, 'A entrada expirou.', 'Volte ao AEON e tente de novo.')
            if (q.get('error')) return fim({ erro: q.get('error') === 'access_denied' ? 'recusado' : 'erro' }, 'Não entrou.', 'Volte ao AEON quando quiser.')
            if (q.has('iss') && q.get('iss') !== EMISSOR) return fim({ erro: 'erro' }, 'Não entrou.', 'Volte ao AEON e tente de novo.')
            fim({ code: q.get('code') }, 'Pronto.', 'Pode voltar ao AEON.')
          })
        })
        const a = new URL(d.authorization_endpoint)
        a.search = new URLSearchParams({ response_type: 'code', client_id: CLIENTE, redirect_uri: retorno, scope: ESCOPOS, state, nonce, code_challenge: desafio(verificador), code_challenge_method: 'S256', ...(criar ? { prompt: 'create' } : {}) }).toString()
        await abrirNavegador(a.toString())
        const r = await volta
        if (r.erro || !r.code) return r.erro || 'erro'
        const { status, corpo } = await buscarJson(d.token_endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: r.code, code_verifier: verificador, redirect_uri: retorno, client_id: CLIENTE }).toString(),
        })
        if (status !== 200 || typeof corpo?.id_token !== 'string') return 'erro'
        gravar(await conferir(corpo.id_token, nonce, d.jwks_uri))
        return 'ok'
      } finally {
        servidor.close()
        aoVoltar()
      }
    })()
      .catch(() => 'erro')
      .finally(() => (emAndamento = null))
    return emAndamento
  }

  return { eu, entrar, sair, ler, gravar }
}

module.exports = { criarConta, CLIENTE, EMISSOR }
