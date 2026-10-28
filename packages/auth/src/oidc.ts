/**
 * Login único da Absolute ZRO (OpenID Connect, ADR 0012). O HUB é o provedor; cada app da família é um cliente.
 *
 * - Fluxo: authorization code + PKCE S256 obrigatório para todo cliente (OAuth 2.1). Sem implicit, sem senha.
 * - Código: 60 s, uso único; reapresentado = revoga o que ele emitiu.
 * - Access token: JWT ES256 de 10 min (typ at+jwt), aud = client_id. Os apps conferem pelo JWKS.
 * - Refresh token: opaco, 30 dias, com rotação; reapresentar um já trocado revoga a família (RFC 9700 §4.14).
 * - Organização e produtos contratados vêm do banco no momento da emissão (loader injetado), nunca do cliente.
 * - Gate de lançamento (ADR 0023): cliente de produto fechado só recebe código, refresh, userinfo ou Bearer se a pessoa
 *   está em zro.product_release_access (zro.release_allows, canal sso/api). Fora disso, nada é emitido e o token antigo
 *   deixa de valer; o app mostra "Em desenvolvimento".
 * Chave: ZRO_OIDC_SIGNING_KEY (PEM, EC P-256) ou, sem ela, a guardada em zro.oidc_keys (gerada no primeiro uso).
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto'
import type { Database, Queryable } from '@zro/db'
import type { Authenticated } from './sessions'
import { hashToken, newToken } from './tokens'

export const OIDC_SCOPES = ['openid', 'email', 'profile', 'org', 'offline_access'] as const
/**
 * Escopos de API de um produto: o app chama a API do HUB em nome da pessoa (Bearer). Só entram no cadastro do
 * cliente daquele produto, e a rota exige o escopo; organização e papel continuam vindo do banco (authorize).
 */
export const PRODUCT_SCOPES: Record<string, string[]> = { 'carro-do-freela': ['carro-do-freela.jobs'], maestro: ['maestro.projects'] }
/** Escopos de todo app da família (cliente com produto): a IA do ecossistema (0016). */
export const FAMILY_SCOPES = ['zro.ia'] as const
export const CODE_TTL_MS = 60_000
export const ACCESS_TTL_S = 600
export const ID_TTL_S = 600
export const REFRESH_TTL_MS = 30 * 24 * 3_600_000
export const FAMILY_MAX_MS = 90 * 24 * 3_600_000
/** Texto único para "produto fechado" em todas as respostas do login único (o app pode mostrar como está). */
export const RELEASE_CLOSED_DESCRIPTION = 'Este app ainda está em desenvolvimento.'

export class OAuthError extends Error {
  constructor(
    readonly error:
      | 'invalid_request'
      | 'invalid_client'
      | 'invalid_grant'
      | 'unauthorized_client'
      | 'unsupported_grant_type'
      | 'unsupported_response_type'
      | 'invalid_scope'
      | 'invalid_token'
      | 'access_denied'
      | 'login_required'
      | 'consent_required'
      | 'temporarily_unavailable',
    readonly description: string,
    readonly status = error === 'invalid_client' || error === 'invalid_token' ? 401 : error === 'temporarily_unavailable' ? 503 : 400,
  ) {
    super(description)
  }
}

// ───────────── chave e JWT ─────────────

const b64url = (b: Buffer) => b.toString('base64url')
const b64json = (o: unknown) => b64url(Buffer.from(JSON.stringify(o)))

type Key = { kid: string; privateKey: KeyObject; publicKey: KeyObject; jwk: JsonWebKey }
export type Signer = { active: Key; all: Key[] }
let signer: Signer | null = null

function toKey(pem: string): Key {
  const privateKey = createPrivateKey(pem)
  const publicKey = createPublicKey(privateKey)
  const pub = publicKey.export({ format: 'jwk' })
  if (pub.kty !== 'EC' || pub.crv !== 'P-256') throw new Error('A chave do login único precisa ser EC P-256 (PEM).')
  const kid = b64url(
    createHash('sha256')
      .update(JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y }))
      .digest(),
  )
  return { kid, privateKey, publicKey, jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, kid, use: 'sig', alg: 'ES256' } }
}

/**
 * Chave de assinatura: ZRO_OIDC_SIGNING_KEY se existir; senão a guardada no banco (gerada no primeiro uso, sob
 * trava). Chaves aposentadas continuam no JWKS para os tokens já emitidos.
 */
export async function loadSigner(db: Database): Promise<Signer> {
  if (signer) return signer
  const pem = process.env.ZRO_OIDC_SIGNING_KEY?.replace(/\\n/g, '\n').trim()
  if (pem) {
    const k = toKey(pem)
    return (signer = { active: k, all: [k] })
  }
  const rows = await db.asSystem('oidc: chave de assinatura', async (tx) => {
    const read = () =>
      tx`select kid, private_pem, status from zro.oidc_keys where status = 'active' or created_at > now() - interval '30 days' order by created_at desc`
    let r = await read()
    if (!r.some((x) => x.status === 'active')) {
      await tx`select pg_advisory_xact_lock(hashtext('zro-oidc-key'))`
      r = await read()
      if (!r.some((x) => x.status === 'active')) {
        const pemNew = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'pem', type: 'pkcs8' }) as string
        await tx`insert into zro.oidc_keys (kid, private_pem) values (${toKey(pemNew).kid}, ${pemNew})`
        r = await read()
      }
    }
    return r
  })
  const all = rows.map((r) => toKey(r.private_pem as string))
  const active = all[rows.findIndex((r) => r.status === 'active')]
  if (!active) throw new OAuthError('temporarily_unavailable', 'Login único sem chave de assinatura.')
  return (signer = { active, all })
}

/** Só para testes: esquece a chave em memória. */
export function resetOidcSignerForTests() {
  signer = null
}

export async function jwks(db: Database) {
  const s = await loadSigner(db)
  return { keys: s.all.map((k) => k.jwk) }
}

export function signJwt(s: Signer, payload: Record<string, unknown>, typ = 'JWT'): string {
  const data = `${b64json({ alg: 'ES256', typ, kid: s.active.kid })}.${b64json(payload)}`
  return `${data}.${b64url(sign('sha256', Buffer.from(data), { key: s.active.privateKey, dsaEncoding: 'ieee-p1363' }))}`
}

export function verifyJwt(s: Signer, token: string, expect: { typ: string; issuer: string; now?: number }): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as Record<string, unknown>
    const key = s.all.find((k) => k.kid === header.kid)
    if (header.alg !== 'ES256' || !key || header.typ !== expect.typ) return null
    const ok = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2]!, 'base64url'))
    if (!ok) return null
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
    const now = Math.floor((expect.now ?? Date.now()) / 1000)
    if (payload.iss !== expect.issuer || typeof payload.exp !== 'number' || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Pedido servidor-a-servidor do HUB a um app da família, em nome de uma pessoa (a Z buscando no Drive pelo SOBEDESCE).
 * Sem segredo compartilhado: JWT ES256 com a chave do login único (o app confere pelo /oauth/jwks), typ próprio (um
 * id_token ou access token nunca passa por pedido), `aud` = client_id do app, `sub` = a pessoa, vida de 60 s, `jti`
 * de uso único e `zro_pedido` = a ação (o app recusa pedido de outra ação).
 */
export const PEDIDO_TYP = 'zro-pedido+jwt'
export const PEDIDO_TTL_S = 60

export async function assinarPedidoDeApp(db: Database, p: { sub: string; aud: string; acao: string }, agora = Date.now()): Promise<string> {
  if (!p.sub || !p.aud || !p.acao) throw new Error('Pedido de app sem sub, aud ou ação.')
  const s = await loadSigner(db)
  const iat = Math.floor(agora / 1000)
  return signJwt(s, { iss: issuerFromEnv(), sub: p.sub, aud: p.aud, iat, exp: iat + PEDIDO_TTL_S, jti: randomUUID(), zro_pedido: p.acao }, PEDIDO_TYP)
}

export function discovery(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    jwks_uri: `${issuer}/oauth/jwks`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['ES256'],
    scopes_supported: [...OIDC_SCOPES],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: [
      'sub',
      'email',
      'email_verified',
      'name',
      'picture',
      'updated_at',
      'zro_conta',
      'zro_org',
      'zro_products',
      'zro_release',
      'auth_time',
      'nonce',
    ],
    prompt_values_supported: ['none', 'consent', 'create'],
  }
}

// ───────────── clientes ─────────────

export type OAuthClient = {
  id: string
  name: string
  productId: string | null
  kind: 'confidential' | 'public'
  redirectUris: string[]
  allowLoopback: boolean
  /** App da família: o HUB registra o consentimento sozinho (migration 0005). */
  trusted: boolean
  scopes: string[]
  secretHash: string | null
}

const LOOPBACK = new Set(['127.0.0.1', '[::1]'])

/** Endereço de retorno aceito no cadastro: https, http só em loopback, ou esquema próprio do app (com.exemplo.app:/cb). */
export function validRedirectUri(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.hash || u.username || u.password) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname)
  return /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(u.protocol)
}

/** Confere o redirect_uri pedido contra o cadastro. Loopback: qualquer porta, mesmo caminho (RFC 8252 §7.3). */
export function redirectAllowed(client: Pick<OAuthClient, 'redirectUris' | 'allowLoopback'>, requested: string): boolean {
  if (client.redirectUris.includes(requested)) return true
  if (!client.allowLoopback) return false
  let r: URL
  try {
    r = new URL(requested)
  } catch {
    return false
  }
  if (r.protocol !== 'http:' || !LOOPBACK.has(r.hostname) || r.hash) return false
  return client.redirectUris.some((reg) => {
    try {
      const u = new URL(reg)
      return u.protocol === 'http:' && u.hostname === r.hostname && u.pathname === r.pathname && u.search === r.search
    } catch {
      return false
    }
  })
}

function rowToClient(r: Record<string, unknown>): OAuthClient {
  return {
    id: r.id as string,
    name: r.name as string,
    productId: (r.product_id as string) ?? null,
    kind: r.kind as OAuthClient['kind'],
    redirectUris: r.redirect_uris as string[],
    allowLoopback: !!r.allow_loopback,
    trusted: !!r.trusted,
    scopes: r.scopes as string[],
    secretHash: (r.secret_hash as string) ?? null,
  }
}

export async function findActiveClient(tx: Queryable, clientId: string): Promise<OAuthClient | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(clientId)) return null
  const [r] = await tx`select * from zro.oauth_clients where id = ${clientId} and status = 'active'`
  return r ? rowToClient(r) : null
}

/**
 * Gate de lançamento do cliente (ADR 0023): true quando o app é de um produto fechado para esta pessoa no canal.
 * Lê a regra do banco a cada pedido (zro.release_allows, migration 0018): revogação vale na hora, sem cache. Cliente
 * sem produto (um app genérico) não tem gate. Cliente de desktop segue a mesma regra, pelo product_id.
 */
export async function productClosedFor(
  tx: Queryable,
  client: Pick<OAuthClient, 'productId'>,
  userId: string,
  channel: 'sso' | 'api' = 'sso',
): Promise<boolean> {
  if (!client.productId) return false
  const [r] = await tx`select zro.release_allows(${client.productId}, ${userId}::uuid, ${channel}) as ok`
  return !r?.ok
}

/** Cadastro pelo console. O segredo aparece uma vez; o banco guarda só o sha256. */
export async function registerClient(
  tx: Queryable,
  input: {
    id: string
    name: string
    productId: string | null
    kind: 'confidential' | 'public'
    redirectUris: string[]
    allowLoopback: boolean
    trusted?: boolean
    createdBy: string
  },
): Promise<{ clientId: string; clientSecret: string | null }> {
  const uris = [...new Set(input.redirectUris.map((u) => u.trim()).filter(Boolean))]
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(input.id)) throw new OAuthError('invalid_request', 'Identificador: letras minúsculas, números e hífen (3 a 63).')
  if (!uris.length || uris.length > 20) throw new OAuthError('invalid_request', 'Informe de 1 a 20 endereços de retorno.')
  const bad = uris.find((u) => !validRedirectUri(u))
  if (bad) throw new OAuthError('invalid_request', `Endereço de retorno inválido: ${bad}. Use https, http://127.0.0.1 ou o esquema do app.`)
  if (input.allowLoopback && !uris.some((u) => u.startsWith('http://127.0.0.1') || u.startsWith('http://[::1]'))) {
    throw new OAuthError('invalid_request', 'Para app de desktop, cadastre um retorno em http://127.0.0.1/caminho.')
  }
  const secret = input.kind === 'confidential' ? newToken('zk') : null
  const scopes = [...OIDC_SCOPES, ...(input.productId ? [...FAMILY_SCOPES, ...(PRODUCT_SCOPES[input.productId] ?? [])] : [])]
  await tx`
    insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, allow_loopback, trusted, scopes, created_by)
    values (${input.id}, ${input.name.trim()}, ${input.productId}, ${input.kind}, ${secret ? hashToken(secret) : null}, ${uris}, ${input.allowLoopback},
            ${!!input.trusted}, ${scopes}, ${input.createdBy})`
  return { clientId: input.id, clientSecret: secret }
}

/**
 * Cadastro (ou recadastro) de um app confidencial da família com um segredo que a operação gerou fora do HUB
 * (scripts/oauth-client.ts): o segredo chega por variável de ambiente e o banco guarda só o sha256, como no console.
 * Mesmos escopos do console (base + zro.ia + os do produto). Idempotente: rodar de novo troca segredo e endereços.
 */
export async function upsertConfidentialClient(
  tx: Queryable,
  input: { id: string; name: string; productId: string; redirectUris: string[]; secret: string; trusted: boolean; reason: string },
): Promise<{ clientId: string; created: boolean; scopes: string[] }> {
  const uris = [...new Set(input.redirectUris.map((u) => u.trim()).filter(Boolean))]
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(input.id)) throw new OAuthError('invalid_request', 'Identificador: letras minúsculas, números e hífen (3 a 63).')
  if (!uris.length || uris.length > 20) throw new OAuthError('invalid_request', 'Informe de 1 a 20 endereços de retorno.')
  const bad = uris.find((u) => !validRedirectUri(u) || !u.startsWith('https://'))
  if (bad) throw new OAuthError('invalid_request', `Endereço de retorno inválido: ${bad}. App confidencial usa https.`)
  if (input.secret.length < 32) throw new OAuthError('invalid_request', 'Segredo curto: use pelo menos 32 caracteres (openssl rand -base64 48).')
  const [product] = await tx`select id from zro.products where id = ${input.productId}`
  if (!product) throw new OAuthError('invalid_request', `Produto desconhecido: ${input.productId}.`)
  const scopes = [...OIDC_SCOPES, ...FAMILY_SCOPES, ...(PRODUCT_SCOPES[input.productId] ?? [])]
  const [r] = await tx`
    insert into zro.oauth_clients (id, name, product_id, kind, secret_hash, redirect_uris, allow_loopback, trusted, scopes, status)
    values (${input.id}, ${input.name.trim()}, ${input.productId}, 'confidential', ${hashToken(input.secret)}, ${uris}, false, ${input.trusted}, ${scopes}, 'active')
    on conflict (id) do update set name = excluded.name, product_id = excluded.product_id, kind = 'confidential',
      secret_hash = excluded.secret_hash, redirect_uris = excluded.redirect_uris, allow_loopback = false,
      trusted = excluded.trusted, scopes = excluded.scopes, status = 'active'
    returning (xmax = 0) as created`
  const created = !!r?.created
  await tx`insert into zro.audit_logs (actor_kind, action, target_type, target_id, metadata)
           values ('system', ${created ? 'oauth_client.created' : 'oauth_client.updated'}, 'oauth_client', ${input.id},
                   ${tx.json({ reason: input.reason, product_id: input.productId, redirect_uris: uris, trusted: input.trusted })})`
  return { clientId: input.id, created, scopes }
}

function secretMatches(client: OAuthClient, secret: string | null): boolean {
  if (!client.secretHash || !secret) return false
  const a = Buffer.from(hashToken(secret), 'hex')
  const b = Buffer.from(client.secretHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// ───────────── pedido de autorização ─────────────

export type AuthorizeRequest = {
  client: OAuthClient
  redirectUri: string
  scopes: string[]
  state: string
  codeChallenge: string
  nonce: string | null
  /** create = a pessoa ainda não tem conta: o HUB abre direto a tela de criar conta. */
  prompt: 'none' | 'consent' | 'create' | null
}

/**
 * Valida o pedido. Erro de cliente ou de redirect_uri não pode voltar para o app (seria redirecionamento aberto):
 * vem com `redirect: false`. Os demais voltam ao app com error e state.
 */
export async function parseAuthorizeRequest(
  tx: Queryable,
  q: URLSearchParams,
): Promise<{ ok: true; req: AuthorizeRequest } | { ok: false; redirect: false; message: string } | { ok: false; redirect: true; to: string }> {
  const clientId = q.get('client_id') ?? ''
  const client = await findActiveClient(tx, clientId)
  if (!client) return { ok: false, redirect: false, message: 'App desconhecido ou desativado.' }
  const redirectUri = q.get('redirect_uri') ?? ''
  if (!redirectAllowed(client, redirectUri)) return { ok: false, redirect: false, message: 'Endereço de retorno não cadastrado para este app.' }
  const state = q.get('state') ?? ''
  const back = (error: string, description: string) => {
    const u = new URL(redirectUri)
    u.searchParams.set('error', error)
    u.searchParams.set('error_description', description)
    if (state) u.searchParams.set('state', state)
    return { ok: false as const, redirect: true as const, to: u.toString() }
  }
  if (q.get('response_type') !== 'code') return back('unsupported_response_type', 'Só response_type=code.')
  if (!state || state.length > 512) return back('invalid_request', 'state é obrigatório.')
  const scopes = [...new Set((q.get('scope') ?? '').split(/\s+/).filter(Boolean))]
  if (!scopes.includes('openid')) return back('invalid_scope', 'O escopo openid é obrigatório.')
  if (scopes.some((s) => !client.scopes.includes(s))) return back('invalid_scope', 'Escopo não permitido para este app.')
  const codeChallenge = q.get('code_challenge') ?? ''
  if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return back('invalid_request', 'PKCE S256 é obrigatório.')
  const nonce = q.get('nonce')
  if (nonce && nonce.length > 512) return back('invalid_request', 'nonce longo demais.')
  const p = q.get('prompt')
  const prompt = p === 'none' || p === 'consent' || p === 'create' ? p : null
  return { ok: true, req: { client, redirectUri, scopes, state, codeChallenge, nonce, prompt } }
}

export async function hasConsent(tx: Queryable, userId: string, clientId: string, scopes: string[]): Promise<boolean> {
  const [c] = await tx`select scopes from zro.oauth_consents where user_id = ${userId} and client_id = ${clientId} and revoked_at is null`
  return !!c && scopes.every((s) => (c.scopes as string[]).includes(s))
}

export async function grantConsent(tx: Queryable, userId: string, clientId: string, scopes: string[]): Promise<void> {
  await tx`
    insert into zro.oauth_consents (user_id, client_id, scopes) values (${userId}, ${clientId}, ${scopes})
    on conflict (user_id, client_id) do update set scopes = excluded.scopes, granted_at = now(), revoked_at = null`
}

/** Emite o código e devolve a URL de retorno ao app. Produto fechado para a pessoa: nada é emitido (access_denied). */
export async function issueCode(tx: Queryable, req: AuthorizeRequest, who: { userId: string; orgId: string | null; authTime: Date }): Promise<string> {
  if (await productClosedFor(tx, req.client, who.userId, 'sso')) throw new OAuthError('access_denied', RELEASE_CLOSED_DESCRIPTION, 403)
  const code = newToken('zc')
  // A conta da pessoa neste app (0006): nasce no primeiro acesso e marca o último.
  await tx`
    insert into zro.app_accounts (user_id, client_id, product_id) values (${who.userId}, ${req.client.id}, ${req.client.productId})
    on conflict (user_id, client_id) do update set last_login_at = now(), logins = zro.app_accounts.logins + 1`
  await tx`
    insert into zro.oauth_codes (code_hash, client_id, user_id, org_id, redirect_uri, scopes, code_challenge, nonce, auth_time, expires_at)
    values (${hashToken(code)}, ${req.client.id}, ${who.userId}, ${who.orgId}, ${req.redirectUri}, ${req.scopes}, ${req.codeChallenge},
            ${req.nonce}, ${who.authTime}, ${new Date(Date.now() + CODE_TTL_MS)})`
  const u = new URL(req.redirectUri)
  u.searchParams.set('code', code)
  u.searchParams.set('state', req.state)
  u.searchParams.set('iss', issuerFromEnv())
  return u.toString()
}

export function denyUrl(req: AuthorizeRequest, description = 'A pessoa não autorizou.'): string {
  const u = new URL(req.redirectUri)
  u.searchParams.set('error', 'access_denied')
  u.searchParams.set('error_description', description)
  u.searchParams.set('state', req.state)
  return u.toString()
}

let issuerOverride: string | null = null
/** Emissor (origem pública do HUB). A app web define no início; testes podem trocar. */
export function setIssuer(issuer: string) {
  issuerOverride = issuer.replace(/\/$/, '')
}
export function issuerFromEnv(): string {
  return issuerOverride ?? (process.env.ZRO_APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '')
}

// ───────────── token ─────────────

/** released = aberto ao público; allowed = fechado, mas esta conta está na lista; closed = fechado e sem acesso. */
export type ReleaseClaimValue = 'released' | 'allowed' | 'closed'
export type OrgClaims = {
  org: { id: string; name: string; role: string } | null
  /** Produtos contratados e abertos para a pessoa (gate aplicado). */
  products: string[]
  /** Claim zro_release: um valor por produto do catálogo. */
  release: Record<string, ReleaseClaimValue>
}
export type ClaimsLoader = (tx: Queryable, userId: string, orgId: string | null) => Promise<OrgClaims>

type TokenRequest = {
  grantType: string | null
  code: string | null
  redirectUri: string | null
  codeVerifier: string | null
  refreshToken: string | null
  clientId: string | null
  clientSecret: string | null
}

export function parseTokenRequest(form: URLSearchParams, authorization: string | null): TokenRequest {
  let clientId = form.get('client_id')
  let clientSecret = form.get('client_secret')
  if (authorization?.startsWith('Basic ')) {
    const raw = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
    const i = raw.indexOf(':')
    if (i > 0) {
      clientId = decodeURIComponent(raw.slice(0, i))
      clientSecret = decodeURIComponent(raw.slice(i + 1))
    }
  }
  return {
    grantType: form.get('grant_type'),
    code: form.get('code'),
    redirectUri: form.get('redirect_uri'),
    codeVerifier: form.get('code_verifier'),
    refreshToken: form.get('refresh_token'),
    clientId,
    clientSecret,
  }
}

async function authenticateClient(tx: Queryable, t: TokenRequest): Promise<OAuthClient> {
  const client = t.clientId ? await findActiveClient(tx, t.clientId) : null
  if (!client) throw new OAuthError('invalid_client', 'App desconhecido.')
  if (client.kind === 'confidential' && !secretMatches(client, t.clientSecret)) throw new OAuthError('invalid_client', 'Segredo do app não confere.')
  return client
}

const s256 = (verifier: string) => createHash('sha256').update(verifier, 'ascii').digest('base64url')

export type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  id_token: string
  scope: string
  refresh_token?: string
}

async function userClaims(tx: Queryable, userId: string) {
  // perfil único: a foto (endereço público que muda a cada foto nova) e a data da última mudança do perfil
  const [u] = await tx`
    select u.id, u.email, u.display_name, u.email_verified_at, a.public_id as foto,
           greatest(u.updated_at, coalesce(a.updated_at, u.updated_at)) as perfil_em
    from zro.users u left join zro.user_avatars a on a.user_id = u.id
    where u.id = ${userId} and u.status = 'active'`
  return u
}

/**
 * Claims do escopo profile (perfil único, 0015): nome, foto (sem foto, sem claim: o app mostra as iniciais),
 * updated_at (o app compara e atualiza a cópia dele) e zro_conta, onde a pessoa edita nome, foto e e-mail.
 */
export function profileClaims(iss: string, u: Record<string, unknown>) {
  return {
    name: u.display_name,
    ...(u.foto ? { picture: `${iss}/api/v1/foto/${u.foto as string}` } : {}),
    updated_at: Math.floor(new Date(u.perfil_em as string | Date).getTime() / 1000),
    zro_conta: `${iss}/perfil`,
  }
}

async function buildTokens(
  s: Signer,
  tx: Queryable,
  client: OAuthClient,
  g: { userId: string; orgId: string | null; scopes: string[]; authTime: Date; nonce: string | null },
  loadClaims: ClaimsLoader,
  refresh: { familyId: string; familyStartedAt: Date } | null,
): Promise<TokenResponse> {
  const u = await userClaims(tx, g.userId)
  if (!u) throw new OAuthError('invalid_grant', 'Conta inativa.')
  const iss = issuerFromEnv()
  const now = Math.floor(Date.now() / 1000)
  // zro_release vai sempre (é da pessoa, não da organização); zro_org e zro_products só com o escopo org.
  const comOrg = g.scopes.includes('org')
  const claims = await loadClaims(tx, g.userId, comOrg ? g.orgId : null)
  const access_token = signJwt(
    s,
    {
      iss,
      sub: g.userId,
      aud: client.id,
      client_id: client.id,
      scope: g.scopes.join(' '),
      iat: now,
      exp: now + ACCESS_TTL_S,
      jti: randomUUID(),
      ...(comOrg ? { zro_org: claims.org?.id ?? null, zro_products: claims.products } : {}),
      zro_release: claims.release,
    },
    'at+jwt',
  )
  const id_token = signJwt(s, {
    iss,
    sub: g.userId,
    aud: client.id,
    iat: now,
    exp: now + ID_TTL_S,
    auth_time: Math.floor(g.authTime.getTime() / 1000),
    ...(g.nonce ? { nonce: g.nonce } : {}),
    ...(g.scopes.includes('email') ? { email: u.email, email_verified: !!u.email_verified_at } : {}),
    ...(g.scopes.includes('profile') ? profileClaims(iss, u) : {}),
    ...(comOrg ? { zro_org: claims.org, zro_products: claims.products } : {}),
    zro_release: claims.release,
  })
  const out: TokenResponse = { access_token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, id_token, scope: g.scopes.join(' ') }
  if (g.scopes.includes('offline_access')) {
    const rt = newToken('zt')
    const familyId = refresh?.familyId ?? randomUUID()
    const familyStartedAt = refresh?.familyStartedAt ?? new Date()
    const expiresAt = new Date(Math.min(Date.now() + REFRESH_TTL_MS, familyStartedAt.getTime() + FAMILY_MAX_MS))
    await tx`
      insert into zro.oauth_refresh_tokens (token_hash, family_id, client_id, user_id, org_id, scopes, auth_time, family_started_at, expires_at)
      values (${hashToken(rt)}, ${familyId}, ${client.id}, ${g.userId}, ${g.orgId}, ${g.scopes}, ${g.authTime}, ${familyStartedAt}, ${expiresAt})`
    out.refresh_token = rt
  }
  return out
}

/**
 * Troca o código (ou o refresh token) por tokens, numa transação de sistema. Reuso detectado revoga e precisa ficar
 * gravado: por isso o erro volta como valor e só é lançado depois do commit.
 */
export async function exchangeToken(db: Database, t: TokenRequest, loadClaims: ClaimsLoader): Promise<TokenResponse> {
  if (t.grantType !== 'authorization_code' && t.grantType !== 'refresh_token')
    throw new OAuthError('unsupported_grant_type', 'Use authorization_code ou refresh_token.')
  const s = await loadSigner(db)
  const out = await db.asSystem(`oidc: token ${t.grantType}`, async (tx): Promise<TokenResponse | OAuthError> => {
    const client = await authenticateClient(tx, t)
    if (t.grantType === 'authorization_code') {
      if (!t.code || !t.codeVerifier || !t.redirectUri) return new OAuthError('invalid_request', 'Faltam code, code_verifier ou redirect_uri.')
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(t.codeVerifier)) return new OAuthError('invalid_request', 'code_verifier inválido.')
      const [c] = await tx`select * from zro.oauth_codes where code_hash = ${hashToken(t.code)} for update`
      if (!c || c.client_id !== client.id) return new OAuthError('invalid_grant', 'Código inválido.')
      if (c.used_at) {
        // Reuso de código: revoga o que ele já gerou (RFC 6749 §4.1.2).
        await tx`update zro.oauth_refresh_tokens set revoked_at = now()
                 where client_id = ${client.id} and user_id = ${c.user_id as string} and created_at >= ${c.created_at as Date} and revoked_at is null`
        return new OAuthError('invalid_grant', 'Código já usado.')
      }
      // Gasto já na primeira apresentação, mesmo que algo abaixo falhe: código não aceita segunda tentativa.
      await tx`update zro.oauth_codes set used_at = now() where code_hash = ${c.code_hash as string}`
      if ((c.expires_at as Date).getTime() < Date.now()) return new OAuthError('invalid_grant', 'Código expirado.')
      if (c.redirect_uri !== t.redirectUri) return new OAuthError('invalid_grant', 'redirect_uri diferente do pedido.')
      if (s256(t.codeVerifier) !== c.code_challenge) return new OAuthError('invalid_grant', 'PKCE não confere.')
      // Gate de lançamento conferido de novo na troca (o acesso pode ter sido revogado entre o código e a troca).
      if (await productClosedFor(tx, client, c.user_id as string, 'sso')) return new OAuthError('invalid_grant', RELEASE_CLOSED_DESCRIPTION)
      return buildTokens(
        s,
        tx,
        client,
        {
          userId: c.user_id as string,
          orgId: (c.org_id as string) ?? null,
          scopes: c.scopes as string[],
          authTime: c.auth_time as Date,
          nonce: (c.nonce as string) ?? null,
        },
        loadClaims,
        null,
      )
    }
    if (!t.refreshToken) return new OAuthError('invalid_request', 'Falta refresh_token.')
    const [r] = await tx`select * from zro.oauth_refresh_tokens where token_hash = ${hashToken(t.refreshToken)} for update`
    if (!r || r.client_id !== client.id) return new OAuthError('invalid_grant', 'Refresh token inválido.')
    if (r.used_at || r.revoked_at) {
      await tx`update zro.oauth_refresh_tokens set revoked_at = now() where family_id = ${r.family_id as string} and revoked_at is null`
      return new OAuthError('invalid_grant', 'Refresh token já usado ou revogado.')
    }
    if ((r.expires_at as Date).getTime() < Date.now()) return new OAuthError('invalid_grant', 'Refresh token expirado.')
    const [consent] = await tx`select 1 from zro.oauth_consents where user_id = ${r.user_id as string} and client_id = ${client.id} and revoked_at is null`
    if (!consent) return new OAuthError('invalid_grant', 'Acesso do app foi removido.')
    // Produto fechado para a pessoa: não renova (sessão antiga de antes do gate morre aqui). O token não é gasto:
    // se a conta entrar na lista depois, o app volta sem novo login.
    if (await productClosedFor(tx, client, r.user_id as string, 'sso')) return new OAuthError('invalid_grant', RELEASE_CLOSED_DESCRIPTION)
    await tx`update zro.oauth_refresh_tokens set used_at = now() where id = ${r.id as string}`
    // A organização é conferida de novo: se a pessoa saiu dela, o token segue sem organização.
    const [m] = r.org_id
      ? await tx`select 1 from zro.memberships m join zro.organizations o on o.id = m.org_id
                 where m.org_id = ${r.org_id as string} and m.user_id = ${r.user_id as string} and m.status = 'active' and o.status = 'active'`
      : []
    return buildTokens(
      s,
      tx,
      client,
      { userId: r.user_id as string, orgId: m ? (r.org_id as string) : null, scopes: r.scopes as string[], authTime: r.auth_time as Date, nonce: null },
      loadClaims,
      { familyId: r.family_id as string, familyStartedAt: r.family_started_at as Date },
    )
  })
  if (out instanceof OAuthError) throw out
  return out
}

/** /oauth/userinfo: a partir do access token. */
export async function userInfo(db: Database, bearer: string | null, loadClaims: ClaimsLoader) {
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null
  const p = token ? verifyJwt(await loadSigner(db), token, { typ: 'at+jwt', issuer: issuerFromEnv() }) : null
  if (!p) throw new OAuthError('invalid_token', 'Token inválido ou expirado.')
  const scopes = String(p.scope ?? '').split(' ')
  return db.asSystem('oidc: userinfo', async (tx) => {
    const client = typeof p.client_id === 'string' ? await findActiveClient(tx, p.client_id) : null
    if (!client) throw new OAuthError('invalid_token', 'App desconhecido ou desativado.')
    // Produto fechado para a pessoa: 401, mesmo com token assinado e dentro da validade.
    if (await productClosedFor(tx, client, p.sub as string, 'sso')) throw new OAuthError('invalid_token', RELEASE_CLOSED_DESCRIPTION)
    const u = await userClaims(tx, p.sub as string)
    if (!u) throw new OAuthError('invalid_token', 'Conta inativa.')
    const out: Record<string, unknown> = { sub: u.id }
    if (scopes.includes('email')) Object.assign(out, { email: u.email, email_verified: !!u.email_verified_at })
    if (scopes.includes('profile')) Object.assign(out, profileClaims(issuerFromEnv(), u))
    const comOrg = scopes.includes('org')
    const c = await loadClaims(tx, u.id as string, comOrg ? ((p.zro_org as string) ?? null) : null)
    if (comOrg) Object.assign(out, { zro_org: c.org, zro_products: c.products })
    out.zro_release = c.release
    return out
  })
}

/**
 * Rota da API chamada por um app da família com o access token da pessoa (Authorization: Bearer). Confere assinatura,
 * emissor, validade e o escopo pedido; o app precisa seguir ativo e o acesso dele não pode ter sido removido no
 * Perfil (o token de 10 min morre junto com o consentimento). Devolve a pessoa como numa sessão: a organização é a
 * do token e o papel sai do banco no authorize(). Papel de plataforma nunca vem por token de app.
 */
export async function authenticateAccessToken(db: Database, authorization: string | null, requiredScope: string): Promise<Authenticated | null> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null
  const p = token ? verifyJwt(await loadSigner(db), token, { typ: 'at+jwt', issuer: issuerFromEnv() }) : null
  if (!p || typeof p.sub !== 'string' || typeof p.client_id !== 'string') return null
  if (
    !String(p.scope ?? '')
      .split(' ')
      .includes(requiredScope)
  )
    return null
  return db.asSystem('oidc: token de app', async (tx) => {
    const client = await findActiveClient(tx, p.client_id as string)
    if (!client || !client.scopes.includes(requiredScope)) return null
    if (!(await hasConsent(tx, p.sub as string, client.id, [requiredScope]))) return null
    // Produto fechado para a pessoa (canal api): o token não vale, mesmo assinado e dentro da validade.
    if (await productClosedFor(tx, client, p.sub as string, 'api')) return null
    const u = await userClaims(tx, p.sub as string)
    if (!u) return null
    return {
      user: { id: u.id as string, email: u.email as string, displayName: u.display_name as string, emailVerified: !!u.email_verified_at, platformRole: null },
      session: {
        id: `oauth:${String(p.jti ?? '')}`,
        activeOrgId: typeof p.zro_org === 'string' ? p.zro_org : null,
        expiresAt: new Date((p.exp as number) * 1000),
        createdAt: new Date(((p.iat as number) ?? 0) * 1000),
        app: { clientId: client.id, productId: client.productId },
      },
    }
  })
}

/** /oauth/revoke (RFC 7009): sempre 200, mesmo para token desconhecido. */
export async function revokeToken(db: Database, t: TokenRequest & { token: string | null }): Promise<void> {
  await db.asSystem('oidc: revoke', async (tx) => {
    const client = await authenticateClient(tx, t)
    if (!t.token) return
    await tx`update zro.oauth_refresh_tokens set revoked_at = now()
             where family_id in (select family_id from zro.oauth_refresh_tokens where token_hash = ${hashToken(t.token)} and client_id = ${client.id})
               and revoked_at is null`
  })
}

/** Perfil › Apps com acesso: a pessoa remove o acesso de um app (consentimento e refresh tokens). */
export async function revokeAppAccess(db: Database, userId: string, clientId: string): Promise<void> {
  await db.asSystem('oidc: remover acesso do app', async (tx) => {
    await tx`update zro.oauth_consents set revoked_at = now() where user_id = ${userId} and client_id = ${clientId} and revoked_at is null`
    await tx`update zro.oauth_refresh_tokens set revoked_at = now() where user_id = ${userId} and client_id = ${clientId} and revoked_at is null`
  })
}
