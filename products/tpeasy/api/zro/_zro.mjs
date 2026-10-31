/**
 * "Entrar com Absolute ZRO" no TPeasy (OpenID Connect, código + PKCE S256, cliente confidencial `tpeasy-web`).
 * Só módulos do Node, sem dependências. O arquivo começa com "_" para a Vercel não publicá-lo como função.
 *
 * - Ida (/api/zro/entrar): state, nonce e verificador PKCE num cookie assinado (HMAC) de 10 minutos, só em /api/zro.
 * - Volta (/api/zro/callback): confere o state, troca o código (client_secret_basic), confere o id_token ES256 pela
 *   JWKS (iss, aud, exp, nonce) e grava a sessão do app num cookie assinado de 30 dias (só quem é a pessoa). O access
 *   token e o refresh token (offline_access) vão CIFRADOS (AES-256-GCM) noutro cookie, só em /api/zro.
 * - Perfil único (docs/integration-contracts/perfil-unico.md): o /eu relê nome, e-mail e foto em /oauth/userinfo a
 *   cada abertura do app. Mudou na conta Absolute ZRO, muda aqui. O TPeasy não edita nenhum dos três.
 * - As chaves dos cookies saem de ZRO_CLIENT_SECRET por HKDF, uma por finalidade.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, createPublicKey, hkdfSync, randomBytes, timingSafeEqual, verify } from 'node:crypto'

export const EMISSOR_PADRAO = 'https://absolutezro.com'
// offline_access: o refresh token deixa o app reler o perfil (nome, e-mail, foto) a cada abertura
// zro.ia: a Z (a IA do ecossistema) conversa com a pessoa no painel inicial, pelo repasse /api/zro/ia
// tpeasy.roteiros: a caixa de entrada do TPeasy no HUB (os roteiros que o Maestro manda, migração 0040), pelo repasse
// /api/zro/entregas. A Absolute ZRO de antes da 0040 recusa o escopo (invalid_scope): o callback refaz o pedido com
// ESCOPOS_SEM_ROTEIROS e o login segue, sem a caixa.
export const ESCOPOS = 'openid email profile org offline_access zro.ia zro.set tpeasy.roteiros'
export const ESCOPOS_SEM_ROTEIROS = 'openid email profile org offline_access zro.ia zro.set'
// zro.set: o Set (quem da equipe está online e as conversas), pelo repasse /api/zro/set. A Absolute ZRO de antes do Set
// recusa o escopo (invalid_scope): o callback refaz o pedido com ESCOPOS_SEM_SET e o login segue, sem o Set.
export const ESCOPOS_SEM_SET = 'openid email profile org offline_access zro.ia'
/** O escopo da caixa de entrada (o repasse /api/zro/entregas confere antes de pedir ao HUB). */
export const ESCOPO_ROTEIROS = 'tpeasy.roteiros'
// Endereço principal: o subdomínio da Absolute ZRO (titular, 31/10/2026; migração 0045 do HUB). O tpeasy.vercel.app
// continua valendo como endereço próprio, sem redirecionar: os roteiros ficam no aparelho, presos ao endereço em que
// foram escritos (e o app instalado na Tela de Início abre sempre o endereço em que foi instalado).
export const SITE_OFICIAL = 'https://tpeasy.absolutezro.com'
export const SITE_ANTIGO = 'https://tpeasy.vercel.app'
/** Os endereços públicos que recebem a volta do login (os dois cadastrados no cliente `tpeasy-web`). */
const SITES = new Map([
  ['tpeasy.absolutezro.com', SITE_OFICIAL],
  ['tpeasy.vercel.app', SITE_ANTIGO],
])
export const VOLTA_PADRAO = '/app/'
/** Id do TPeasy na lista `zro_products` do HUB. Fora da lista: entra, mas a conta fica sem acesso ao app. */
export const PRODUTO = 'tpeasy'

export const COOKIE_IDA = 'tp_zro_ida'
export const DURACAO_IDA_S = 600
export const COOKIE_SESSAO = 'tp_zro'
export const DURACAO_SESSAO_S = 30 * 24 * 3600
/** Cofre: tokens do HUB, cifrados, só em /api/zro. */
export const COOKIE_HUB = 'tp_zro_hub'
/** O /eu pergunta ao HUB no máximo uma vez por minuto. */
export const REVER_S = 60

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
 * Endereço do app que fez o pedido, só se for um dos permitidos: o site oficial, o endereço antigo (tpeasy.vercel.app)
 * ou a máquina local (desenvolvimento). Qualquer outro (prévia da Vercel, domínio estranho) devolve null e o pedido é
 * mandado para o site oficial.
 */
export function origemDoPedido(req) {
  const bruto = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const host = bruto.split(',')[0].trim().toLowerCase()
  if (SITES.has(host)) return SITES.get(host)
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

// ───────────── cofre: tokens cifrados ─────────────
// Assinar não basta para token: o corpo do cookie seria legível. AES-256-GCM com chave própria.

const chaveCofre = () => {
  const { clientSecret } = config()
  if (!clientSecret) throw new Error('Falta ZRO_CLIENT_SECRET.')
  return Buffer.from(hkdfSync('sha256', clientSecret, 'tpeasy-zro-v1', 'cofre:hub', 32))
}

export function cifrar(dados) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chaveCofre(), iv)
  const corpo = Buffer.concat([c.update(JSON.stringify(dados), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64url')
}

export function decifrar(valor) {
  if (typeof valor !== 'string' || !valor || valor.length > 4096) return null
  try {
    const b = Buffer.from(valor, 'base64url')
    if (b.length < 29) return null
    const d = createDecipheriv('aes-256-gcm', chaveCofre(), b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    const dados = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'))
    return dados && typeof dados === 'object' ? dados : null
  } catch {
    return null
  }
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
export async function urlDeLogin({ state, nonce, desafio, origem, criar = false, semSet = false, semRoteiros = false }) {
  const d = await descobrir()
  const u = new URL(d.authorization_endpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', config().clientId)
  u.searchParams.set('redirect_uri', retornoDe(origem))
  u.searchParams.set('scope', semSet ? ESCOPOS_SEM_SET : semRoteiros ? ESCOPOS_SEM_ROTEIROS : ESCOPOS)
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
  return perfilDeClaims(dados)
}

/** Endereço que só vale se for da Absolute ZRO configurada (a foto vai num <img>, a conta num link). */
function daConta(v, caminho) {
  if (typeof v !== 'string' || v.length > 300 || /[\s"'<>\\]/.test(v)) return null
  return v.startsWith(`${config().emissor}${caminho}`) ? v : null
}

/**
 * Perfil único: claims do id_token ou do /oauth/userinfo → a cópia que o TPeasy guarda. Nome, e-mail e foto são da
 * conta Absolute ZRO; `conta` é onde editar. Sem `picture`, sem foto (o app mostra a inicial).
 */
export function perfilDeClaims(dados) {
  const org = dados.zro_org && typeof dados.zro_org === 'object' && typeof dados.zro_org.name === 'string' ? dados.zro_org : null
  return {
    sub: String(dados.sub),
    email: typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : null,
    nome: typeof dados.name === 'string' && dados.name.trim() ? dados.name.trim().slice(0, 120) : null,
    foto: daConta(dados.picture, '/api/v1/foto/'),
    conta: daConta(dados.zro_conta, '/') || `${config().emissor}/perfil`,
    organizacao: org ? { id: String(org.id ?? ''), nome: org.name.slice(0, 120), papel: typeof org.role === 'string' ? org.role : null } : null,
    produtos: Array.isArray(dados.zro_products) ? dados.zro_products.filter((p) => typeof p === 'string').slice(0, 50) : [],
  }
}

/** O que a sessão (tp_zro) guarda: só a cópia dos claims, com a hora da última leitura (`lido`). */
export const sessaoDe = (p, agora = Date.now()) => ({ ...p, lido: Math.floor(agora / 1000) })

/** Tokens que vão para o cofre: access token (10 min) e refresh token (roda a cada troca). */
function tokensDe(corpo, agora = Date.now()) {
  if (!corpo || typeof corpo.access_token !== 'string') return null
  const atExp = Math.floor(agora / 1000) + Math.min(Math.max(Number(corpo.expires_in) || 0, 0), 3600)
  return { at: corpo.access_token, atExp, rt: typeof corpo.refresh_token === 'string' ? corpo.refresh_token : null }
}

function basicAuth() {
  const { clientId, clientSecret } = config()
  return `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`
}

/** Troca o código (client_secret_basic + PKCE), confere o id_token e devolve a pessoa e os tokens (para o cofre). */
export async function trocarCodigo({ code, verificador, nonce, origem }) {
  const d = await descobrir()
  const { status, corpo } = await buscarJson(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: basicAuth() },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verificador, redirect_uri: retornoDe(origem) }).toString(),
  })
  if (status !== 200 || typeof corpo?.id_token !== 'string') throw new ZroError('recusado', String(corpo?.error ?? status))
  return { pessoa: await conferirIdToken(corpo.id_token, nonce), tokens: tokensDe(corpo) }
}

async function renovar(rt) {
  if (typeof rt !== 'string' || !rt) throw new ZroError('revogado', 'sem refresh token')
  const d = await descobrir()
  const { status, corpo } = await buscarJson(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: basicAuth() },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }).toString(),
  })
  if (status === 400 && corpo?.error === 'invalid_grant') throw new ZroError('revogado', 'refresh recusado')
  const t = status === 200 ? tokensDe(corpo) : null
  if (!t) throw new ZroError('rede', 'refresh')
  return { ...t, rt: t.rt || rt }
}

/**
 * Perfil único: relê nome, e-mail, foto, organização e produtos em /oauth/userinfo. Usa o access token guardado
 * enquanto vale; vencido (ou recusado), troca o refresh token, que RODA (o novo substitui o velho no cofre).
 * Erro 'revogado': o HUB não aceita mais esta sessão (acesso removido no Perfil). Erro 'rede': vale a última cópia.
 */
export async function lerPerfil(sub, tokens, agora = Date.now()) {
  const d = await descobrir()
  const userinfo = d.userinfo_endpoint || `${config().emissor}/oauth/userinfo`
  let t = tokens && typeof tokens === 'object' ? tokens : {}
  let renovou = false
  if (typeof t.at !== 'string' || !(t.atExp > Math.floor(agora / 1000) + 30)) {
    t = await renovar(t.rt)
    renovou = true
  }
  const perguntar = (at) => buscarJson(userinfo, { headers: { Accept: 'application/json', Authorization: `Bearer ${at}` } })
  let r = await perguntar(t.at)
  if (r.status === 401 && !renovou) {
    t = await renovar(t.rt)
    r = await perguntar(t.at)
  }
  if (r.status === 401) throw new ZroError('revogado', 'userinfo recusou')
  if (r.status !== 200 || typeof r.corpo?.sub !== 'string') throw new ZroError('rede', 'userinfo')
  if (r.corpo.sub !== sub) throw new ZroError('revogado', 'outra pessoa')
  return { pessoa: perfilDeClaims(r.corpo), tokens: t }
}

/**
 * Access token para a Z (/api/zro/ia): o guardado enquanto vale; vencido (ou `forcar`, depois de um 401), troca o
 * refresh token, que RODA. Devolve { tokens, renovou }. Erro 'revogado': o HUB não aceita mais esta sessão.
 */
export async function tokenValido(tokens, { forcar = false, agora = Date.now() } = {}) {
  const t = tokens && typeof tokens === 'object' ? tokens : {}
  if (!forcar && typeof t.at === 'string' && t.atExp > Math.floor(agora / 1000) + 30) return { tokens: t, renovou: false }
  return { tokens: await renovar(t.rt), renovou: true }
}

/** Sair: o refresh token morre também no HUB (sem esperar resposta boa). */
export async function revogar(rt) {
  if (typeof rt !== 'string' || !rt) return
  try {
    const d = await descobrir()
    if (!d.revocation_endpoint) return
    await buscarJson(d.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
      body: new URLSearchParams({ token: rt, token_type_hint: 'refresh_token' }).toString(),
    })
  } catch {
    // a sessão daqui sai de qualquer jeito
  }
}

/** Compara dois textos sem vazar tempo. */
export function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = createHash('sha256').update(a).digest()
  const y = createHash('sha256').update(b).digest()
  return timingSafeEqual(x, y) && a === b
}
