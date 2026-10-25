// "Entrar com Absolute ZRO": o Synquei é cliente do login único da Absolute ZRO (OpenID Connect, código + PKCE S256,
// cliente confidencial com client_secret_basic). Só Node (crypto e fetch), sem dependências.
// A Vercel não transforma em função os arquivos de api/ que começam com "_": este é só o código comum de api/zro/*.
//
// Cookies (HttpOnly, Secure, SameSite=Lax), assinados com HMAC-SHA256. A chave sai de ZRO_CLIENT_SECRET por HKDF,
// uma por cookie (contexto "cookie:<nome>"): trocar o segredo derruba as sessões.
//   sq_zro    ida para a Absolute ZRO: state, nonce, verificador PKCE e volta. Só em /api/zro, 10 minutos.
//   sq_conta  sessão do app: quem é (sub, nome, e-mail, organização, produtos). 30 dias. Nenhum token da Absolute ZRO.
//
// Conta única: o Synquei não cria conta própria. "Criar conta" é o mesmo fluxo com prompt=create (o HUB abre o
// cadastro e volta já logado). O direito de uso vem de zro_products (gravado na sessão a cada login): sem "synquei"
// lá, a pessoa entra, mas a parte de conta mostra o aviso e o caminho para a Absolute ZRO.

import { createHash, createHmac, createPublicKey, hkdfSync, randomBytes, timingSafeEqual, verify } from 'node:crypto'

export const EMISSOR_PADRAO = 'https://absolutezro.vercel.app'
export const ESCOPOS = 'openid email profile org'
export const SITE = 'https://synquei.vercel.app'
export const COOKIE_IDA = 'sq_zro'
export const COOKIE_CONTA = 'sq_conta'
export const IDA_S = 600
export const CONTA_S = 30 * 24 * 3600
export const VOLTA_PADRAO = '/app/'
export const PRODUTO = 'synquei'
export const FERRAMENTAS = 'https://absolutezro.vercel.app/ferramentas'
const CACHE_MS = 10 * 60_000

export const emissor = () => (process.env.ZRO_ISSUER || '').trim().replace(/\/+$/, '') || EMISSOR_PADRAO
export const clientId = () => (process.env.ZRO_CLIENT_ID || '').trim()
const segredo = () => (process.env.ZRO_CLIENT_SECRET || '').trim()
export const configurado = () => Boolean(clientId() && segredo())

/** A organização ativa tem o Synquei liberado pelo admin da Absolute ZRO? */
export const temAcesso = (produtos) => Array.isArray(produtos) && produtos.includes(PRODUTO)

// ───────── origem do site ─────────

/** Só estes endereços recebem a volta da Absolute ZRO (cadastrados no console). Qualquer outro usa o site oficial. */
export function origemPermitida(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (host === 'synquei.vercel.app') return SITE
  if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return `http://${host}`
  return SITE
}

/** Origem de quem pediu (para saber se precisa trocar de endereço antes de começar). */
export function origemDoPedido(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
  return `${proto === 'http' || /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https'}://${host}`
}

export const retorno = (origem) => `${origem}/api/zro/callback`

/** Caminho relativo seguro dentro do site (`/app/#/ajustes`). Endereço externo, `//`, `\` ou lixo viram /app/. */
export function voltaSegura(v) {
  if (typeof v !== 'string' || !v || v.length > 512) return VOLTA_PADRAO
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || /[\u0000-\u001f\u007f]/.test(v)) return VOLTA_PADRAO
  try {
    const u = new URL(v, 'https://synquei.invalid')
    if (u.origin !== 'https://synquei.invalid') return VOLTA_PADRAO
    return u.pathname + u.search + u.hash
  } catch {
    return VOLTA_PADRAO
  }
}

/** Põe ?zro=<codigo> antes do # (o app usa rotas no hash). */
export function comAviso(volta, codigo) {
  const u = new URL(volta, 'https://synquei.invalid')
  u.searchParams.set('zro', codigo)
  return u.pathname + u.search + u.hash
}

// ───────── cookies assinados ─────────

const chave = (nome) => Buffer.from(hkdfSync('sha256', Buffer.from(segredo(), 'utf8'), Buffer.from('synquei-zro', 'utf8'), Buffer.from(`cookie:${nome}`, 'utf8'), 32))
const assinatura = (nome, corpo) => createHmac('sha256', chave(nome)).update(`${nome}.${corpo}`).digest('base64url')

export function selar(nome, dados, duracaoS) {
  const corpo = Buffer.from(JSON.stringify({ ...dados, exp: Math.floor(Date.now() / 1000) + duracaoS })).toString('base64url')
  return `${corpo}.${assinatura(nome, corpo)}`
}

export function abrir(nome, valor) {
  if (!configurado() || typeof valor !== 'string' || valor.length > 4096) return null
  const [corpo, ass, ...resto] = valor.split('.')
  if (!corpo || !ass || resto.length) return null
  const a = Buffer.from(ass, 'base64url')
  const b = Buffer.from(assinatura(nome, corpo), 'base64url')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (!d || typeof d !== 'object' || typeof d.exp !== 'number' || d.exp < Math.floor(Date.now() / 1000)) return null
    return d
  } catch {
    return null
  }
}

export function lerCookie(req, nome) {
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim())
  }
  return undefined
}

export const cookie = (nome, valor, { maxAge, path }) => `${nome}=${valor}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`

// ───────── respostas ─────────

export function redirecionar(res, status, destino, cookies = []) {
  res.statusCode = status
  res.setHeader('Location', destino)
  res.setHeader('Cache-Control', 'no-store')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end()
}

export function json(res, status, corpo, cookies = []) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end(JSON.stringify(corpo))
}

export const consulta = (req) => new URL(req.url || '/', 'https://synquei.invalid').searchParams

// ───────── OpenID Connect ─────────

export class ZroErro extends Error {}

let descoberta = null
let chaves = null

async function buscarJson(url, init) {
  let r
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new ZroErro('rede')
  }
  return { status: r.status, corpo: await r.json().catch(() => null) }
}

export async function descobrir() {
  const iss = emissor()
  if (descoberta && descoberta.iss === iss && descoberta.expira > Date.now()) return descoberta.valor
  const { status, corpo } = await buscarJson(`${iss}/.well-known/openid-configuration`)
  // O documento tem que ser do mesmo emissor configurado: sem trocar de servidor no meio do caminho.
  if (status !== 200 || !corpo || corpo.issuer !== iss || !corpo.authorization_endpoint || !corpo.token_endpoint || !corpo.jwks_uri) throw new ZroErro('descoberta')
  descoberta = { iss, valor: corpo, expira: Date.now() + CACHE_MS }
  return corpo
}

export const novoValor = () => randomBytes(32).toString('base64url')
export const desafioPkce = (verificador) => createHash('sha256').update(verificador).digest('base64url')

async function chavePublica(kid) {
  const procurar = () => (chaves ? chaves.lista.find((k) => k.kid === kid) : null) || null
  if (chaves && chaves.iss === emissor() && chaves.expira > Date.now() && procurar()) return procurar()
  // Chave desconhecida: busca de novo (a Absolute ZRO pode ter trocado a chave).
  const d = await descobrir()
  const { status, corpo } = await buscarJson(d.jwks_uri)
  if (status !== 200 || !corpo || !Array.isArray(corpo.keys)) throw new ZroErro('jwks')
  chaves = { iss: emissor(), lista: corpo.keys, expira: Date.now() + CACHE_MS }
  return procurar()
}

/** Confere o id_token (ES256 pela JWKS, iss, aud, exp, nonce) e devolve a pessoa. */
export async function conferirIdToken(idToken, nonce, agora = Date.now()) {
  const partes = String(idToken).split('.')
  if (partes.length !== 3) throw new ZroErro('formato')
  let cab, dados
  try {
    cab = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
    dados = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  } catch {
    throw new ZroErro('json')
  }
  if (!cab || cab.alg !== 'ES256' || typeof cab.kid !== 'string') throw new ZroErro('algoritmo')
  const jwk = await chavePublica(cab.kid)
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new ZroErro('chave desconhecida')
  let ok = false
  try {
    ok = verify('sha256', Buffer.from(`${partes[0]}.${partes[1]}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(partes[2], 'base64url'))
  } catch {
    ok = false
  }
  if (!ok) throw new ZroErro('assinatura')
  const s = Math.floor(agora / 1000)
  const id = clientId()
  if (dados.iss !== emissor()) throw new ZroErro('emissor')
  const aud = Array.isArray(dados.aud) ? dados.aud : [dados.aud]
  if (!aud.includes(id) || (aud.length > 1 && dados.azp !== id)) throw new ZroErro('público')
  if (typeof dados.exp !== 'number' || dados.exp < s - 60) throw new ZroErro('expirado')
  if (typeof dados.iat === 'number' && dados.iat > s + 300) throw new ZroErro('data futura')
  if (typeof nonce !== 'string' || !nonce || dados.nonce !== nonce) throw new ZroErro('nonce')
  if (typeof dados.sub !== 'string' || !dados.sub || typeof dados.email !== 'string') throw new ZroErro('sem sub ou e-mail')
  const org = dados.zro_org && typeof dados.zro_org === 'object' && typeof dados.zro_org.name === 'string' ? dados.zro_org : null
  return {
    sub: dados.sub.slice(0, 200),
    nome: typeof dados.name === 'string' && dados.name.trim() ? dados.name.trim().slice(0, 120) : null,
    email: dados.email.trim().toLowerCase().slice(0, 254),
    emailVerificado: dados.email_verified === true,
    organizacao: org ? { id: String(org.id || '').slice(0, 100), nome: org.name.slice(0, 120), papel: typeof org.role === 'string' ? org.role.slice(0, 40) : null } : null,
    produtos: Array.isArray(dados.zro_products) ? dados.zro_products.filter((p) => typeof p === 'string').slice(0, 30).map((p) => p.slice(0, 60)) : [],
  }
}

/** Troca o código (client_secret_basic + PKCE) e confere o id_token. */
export async function trocarCodigo(code, verificador, nonce, redirectUri) {
  const d = await descobrir()
  const basic = Buffer.from(`${encodeURIComponent(clientId())}:${encodeURIComponent(segredo())}`).toString('base64')
  const { status, corpo } = await buscarJson(d.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verificador, redirect_uri: redirectUri }).toString(),
  })
  if (status !== 200 || !corpo || typeof corpo.id_token !== 'string') throw new ZroErro('troca recusada')
  return conferirIdToken(corpo.id_token, nonce)
}

/** Só para testes: esquece descoberta e chaves guardadas. */
export function esquecerCache() {
  descoberta = null
  chaves = null
}
