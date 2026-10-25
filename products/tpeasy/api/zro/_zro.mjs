/**
 * "Entrar com Absolute ZRO" no TPeasy (OpenID Connect, código + PKCE S256, cliente confidencial `tpeasy-web`).
 * Só módulos do Node, sem dependências. O arquivo começa com "_" para a Vercel não publicá-lo como função.
 *
 * - Ida (/api/zro/entrar): state, nonce e verificador PKCE num cookie assinado (HMAC) de 10 minutos, só em /api/zro.
 * - Volta (/api/zro/callback): confere o state, troca o código (client_secret_basic), confere o id_token ES256 pela
 *   JWKS (iss, aud, exp, nonce) e grava a sessão do app num cookie assinado de 30 dias. Nenhum token do HUB vai para
 *   o navegador: o cookie guarda só quem é a pessoa.
 * - As chaves dos cookies saem de ZRO_CLIENT_SECRET por HKDF, uma por finalidade.
 */
import { createHash, createHmac, createPublicKey, hkdfSync, randomBytes, timingSafeEqual, verify } from 'node:crypto'

export const EMISSOR_PADRAO = 'https://absolutezro.vercel.app'
export const ESCOPOS = 'openid email profile org'
export const SITE_OFICIAL = 'https://tpeasy.vercel.app'
export const VOLTA_PADRAO = '/app/'
/** Id do TPeasy na lista `zro_products` do HUB. Fora da lista: entra, mas a conta fica sem acesso ao app. */
export const PRODUTO = 'tpeasy'

export const COOKIE_IDA = 'tp_zro_ida'
export const DURACAO_IDA_S = 600
export const COOKIE_SESSAO = 'tp_zro'
export const DURACAO_SESSAO_S = 30 * 24 * 3600

// ───────────── configuração ─────────────

export function config() {
  return {
    clientId: process.env.ZRO_CLIENT_ID?.trim() || '',
    clientSecret: process.env.ZRO_CLIENT_SECRET?.trim() || '',
    emissor: (process.env.ZRO_ISSUER?.trim() || EMISSOR_PADRAO).replace(/\/$/, ''),
  }
}

export function configurado() {
  const c = config()
  return Boolean(c.clientId && c.clientSecret)
}

/**
 * Endereço do app que fez o pedido, só se for um dos permitidos: o site oficial ou a máquina local (desenvolvimento).
 * Qualquer outro (prévia da Vercel, domínio estranho) devolve null e o pedido é mandado para o site oficial.
 */
export function origemDoPedido(req) {
  const bruto = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const host = bruto.split(',')[0].trim().toLowerCase()
  if (host === 'tpeasy.vercel.app') return SITE_OFICIAL
  if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return `http://${host}`
  return null
}

export const retornoDe = (origem) => `${origem}/api/zro/callback`

/** Só caminhos deste site (nada de //outro.site, \, esquema ou /api). Qualquer dúvida vira /app/. */
export function voltaSegura(v) {
  if (typeof v !== 'string' || v.length > 512 || !v.startsWith('/') || v.startsWith('//')) return VOLTA_PADRAO
  if (/[\\\u0000-\u001f\u007f]/.test(v)) return VOLTA_PADRAO
  try {
    const base = 'https://tpeasy.invalid'
    const u = new URL(v, base)
    if (u.origin !== base || u.pathname.startsWith('/api/')) return VOLTA_PADRAO
    return u.pathname + u.search + u.hash
  } catch {
    return VOLTA_PADRAO
  }
}

/** Acrescenta ?zro=<código> à volta, mantendo o #aba. */
export function comAviso(volta, codigo) {
  const u = new URL(volta, 'https://tpeasy.invalid')
  u.searchParams.set('zro', codigo)
  return u.pathname + u.search + u.hash
}

// ───────────── cookies assinados ─────────────

function chave(finalidade) {
  const { clientSecret } = config()
  if (!clientSecret) throw new Error('Falta ZRO_CLIENT_SECRET.')
  return Buffer.from(hkdfSync('sha256', clientSecret, 'tpeasy-zro-v1', `cookie:${finalidade}`, 32))
}

const assinatura = (finalidade, corpo) => createHmac('sha256', chave(finalidade)).update(corpo).digest()

export function selar(dados, finalidade, duracaoS, agora = Date.now()) {
  const corpo = Buffer.from(JSON.stringify({ ...dados, exp: Math.floor(agora / 1000) + duracaoS })).toString('base64url')
  return `${corpo}.${assinatura(finalidade, corpo).toString('base64url')}`
}

export function abrir(valor, finalidade, agora = Date.now()) {
  if (typeof valor !== 'string' || valor.length > 4096) return null
  const [corpo, mac, ...resto] = valor.split('.')
  if (!corpo || !mac || resto.length) return null
  try {
    const esperado = assinatura(finalidade, corpo)
    const recebido = Buffer.from(mac, 'base64url')
    if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (!dados || typeof dados.exp !== 'number' || dados.exp <= Math.floor(agora / 1000)) return null
    return dados
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

export function serializarCookie(nome, valor, { maxAge, path, secure }) {
  const partes = [`${nome}=${encodeURIComponent(valor)}`, `Path=${path}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax']
  if (secure) partes.push('Secure')
  return partes.join('; ')
}

/** Cookie Secure sempre, menos em http://localhost (desenvolvimento). */
export const seguro = (req) => origemDoPedido(req) !== null && !origemDoPedido(req).startsWith('http://')

// ───────────── respostas ─────────────

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
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end(JSON.stringify(corpo))
}

export const urlDoPedido = (req) => new URL(req.url || '/', 'http://local.invalid')

// ───────────── OpenID Connect ─────────────

export class ZroError extends Error {
  constructor(codigo, detalhe) {
    super(detalhe)
    this.codigo = codigo
  }
}

const CACHE_MS = 10 * 60_000
let descoberta = null
let chaves = null

/** Só para testes: esquece descoberta e chaves guardadas. */
export function esquecerCache() {
  descoberta = null
  chaves = null
}

async function buscarJson(url, init) {
  let res
  try {
    res = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new ZroError('rede', url)
  }
  return { status: res.status, corpo: await res.json().catch(() => null) }
}

export async function descobrir() {
  const { emissor } = config()
  if (descoberta && descoberta.emissor === emissor && descoberta.expira > Date.now()) return descoberta.valor
  const { status, corpo } = await buscarJson(`${emissor}/.well-known/openid-configuration`)
  // O documento tem que ser do mesmo emissor configurado.
  if (status !== 200 || !corpo || corpo.issuer !== emissor || !corpo.authorization_endpoint || !corpo.token_endpoint || !corpo.jwks_uri) {
    throw new ZroError('rede', 'descoberta')
  }
  descoberta = { emissor, valor: corpo, expira: Date.now() + CACHE_MS }
  return corpo
}

export const novoValor = () => randomBytes(32).toString('base64url')
export const desafioDe = (verificador) => createHash('sha256').update(verificador).digest('base64url')

/** A organização ativa da pessoa liberou o TPeasy? Vem do admin da Absolute ZRO (`zro_products`). */
export const temAcesso = (produtos) => Array.isArray(produtos) && produtos.includes(PRODUTO)

/** `criar`: "Criar conta" — o HUB abre o cadastro (prompt=create) e volta para cá já logado. */
export async function urlDeLogin({ state, nonce, desafio, origem, criar = false }) {
  const d = await descobrir()
  const u = new URL(d.authorization_endpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', config().clientId)
  u.searchParams.set('redirect_uri', retornoDe(origem))
  u.searchParams.set('scope', ESCOPOS)
  u.searchParams.set('state', state)
  u.searchParams.set('nonce', nonce)
  u.searchParams.set('code_challenge', desafio)
  u.searchParams.set('code_challenge_method', 'S256')
  if (criar) u.searchParams.set('prompt', 'create')
  return u.toString()
}

async function chavePublica(kid) {
  const procurar = () => chaves?.valor.find((k) => k.kid === kid) ?? null
  if (chaves && chaves.expira > Date.now() && procurar()) return procurar()
  // Chave desconhecida: busca de novo (o HUB pode ter trocado a chave).
  const d = await descobrir()
  const { status, corpo } = await buscarJson(d.jwks_uri)
  if (status !== 200 || !Array.isArray(corpo?.keys)) throw new ZroError('rede', 'jwks')
  chaves = { valor: corpo.keys, expira: Date.now() + CACHE_MS }
  return procurar()
}

/** Confere assinatura, emissor, público, validade e nonce do id_token e devolve só o perfil. */
export async function conferirIdToken(idToken, nonce, agora = Date.now()) {
  const partes = String(idToken).split('.')
  if (partes.length !== 3) throw new ZroError('token_invalido', 'formato')
  let cabecalho
  let dados
  try {
    cabecalho = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
    dados = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  } catch {
    throw new ZroError('token_invalido', 'json')
  }
  if (cabecalho?.alg !== 'ES256' || typeof cabecalho.kid !== 'string') throw new ZroError('token_invalido', 'algoritmo')
  const jwk = await chavePublica(cabecalho.kid)
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new ZroError('token_invalido', 'chave desconhecida')
  let ok = false
  try {
    ok = verify(
      'sha256',
      Buffer.from(`${partes[0]}.${partes[1]}`),
      { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(partes[2], 'base64url'),
    )
  } catch {
    ok = false
  }
  if (!ok) throw new ZroError('token_invalido', 'assinatura')
  const { emissor, clientId } = config()
  const s = Math.floor(agora / 1000)
  if (dados.iss !== emissor) throw new ZroError('token_invalido', 'emissor')
  const aud = Array.isArray(dados.aud) ? dados.aud : [dados.aud]
  if (!aud.includes(clientId) || (aud.length > 1 && dados.azp !== clientId)) throw new ZroError('token_invalido', 'público')
  if (typeof dados.exp !== 'number' || dados.exp < s - 60) throw new ZroError('token_invalido', 'expirado')
  if (typeof dados.iat === 'number' && dados.iat > s + 300) throw new ZroError('token_invalido', 'data futura')
  if (typeof dados.nonce !== 'string' || dados.nonce !== nonce) throw new ZroError('token_invalido', 'nonce')
  if (typeof dados.sub !== 'string' || !dados.sub || typeof dados.email !== 'string') throw new ZroError('token_invalido', 'sem sub ou e-mail')
  const org = dados.zro_org && typeof dados.zro_org === 'object' && typeof dados.zro_org.name === 'string' ? dados.zro_org : null
  return {
    sub: dados.sub,
    email: dados.email.trim().toLowerCase(),
    nome: typeof dados.name === 'string' && dados.name.trim() ? dados.name.trim().slice(0, 120) : null,
    organizacao: org ? { id: String(org.id ?? ''), nome: org.name.slice(0, 120), papel: typeof org.role === 'string' ? org.role : null } : null,
    produtos: Array.isArray(dados.zro_products) ? dados.zro_products.filter((p) => typeof p === 'string').slice(0, 50) : [],
  }
}

/** Troca o código (client_secret_basic + PKCE) e confere o id_token. Os tokens do HUB morrem aqui. */
export async function trocarCodigo({ code, verificador, nonce, origem }) {
  const d = await descobrir()
  const { clientId, clientSecret } = config()
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')
  const { status, corpo } = await buscarJson(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verificador, redirect_uri: retornoDe(origem) }).toString(),
  })
  if (status !== 200 || typeof corpo?.id_token !== 'string') throw new ZroError('recusado', String(corpo?.error ?? status))
  return conferirIdToken(corpo.id_token, nonce)
}

/** Compara dois textos sem vazar tempo. */
export function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = createHash('sha256').update(a).digest()
  const y = createHash('sha256').update(b).digest()
  return timingSafeEqual(x, y) && a === b
}
