/**
 * Cliente OpenID Connect da Absolute ZRO. O id_token é conferido pela chave pública (JWKS, ES256):
 * assinatura, emissor, público (o client_id da NOSSOM), validade e nonce. Nada da Absolute ZRO é
 * aceito sem essa conferência.
 */
import { createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto';
import { zroCredentials, zroIssuer, ZRO_SCOPES } from './config';

export class ZroError extends Error {
  constructor(
    readonly code: 'network' | 'rejected' | 'invalid_token',
    detail: string,
  ) {
    super(detail);
  }
}

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};
let discovery: { value: Discovery; expires: number } | null = null;
let keys: { value: JsonWebKey[]; expires: number } | null = null;
const CACHE_MS = 10 * 60_000;

async function getJson(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ZroError('network', url);
  }
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

export async function discover(): Promise<Discovery> {
  if (discovery && discovery.expires > Date.now()) return discovery.value;
  const issuer = zroIssuer();
  const { status, body } = await getJson(issuer + '/.well-known/openid-configuration');
  const d = body as Discovery | null;
  // O documento precisa ser do mesmo emissor configurado.
  if (
    status !== 200 ||
    !d ||
    d.issuer !== issuer ||
    !d.authorization_endpoint ||
    !d.token_endpoint ||
    !d.jwks_uri
  )
    throw new ZroError('network', 'discovery');
  discovery = { value: d, expires: Date.now() + CACHE_MS };
  return d;
}

export const randomValue = () => randomBytes(32).toString('base64url');

export async function authorizationUrl(o: {
  state: string;
  challenge: string;
  nonce: string;
  redirectUri: string;
}) {
  const d = await discover();
  const url = new URL(d.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', zroCredentials().clientId);
  url.searchParams.set('redirect_uri', o.redirectUri);
  url.searchParams.set('scope', ZRO_SCOPES);
  url.searchParams.set('state', o.state);
  url.searchParams.set('nonce', o.nonce);
  url.searchParams.set('code_challenge', o.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export type ZroProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  organization: string | null;
  products: string[];
};

async function publicKey(kid: string): Promise<JsonWebKey | null> {
  const find = () => keys?.value.find((k) => k.kid === kid) ?? null;
  if (keys && keys.expires > Date.now() && find()) return find();
  // Chave desconhecida: busca de novo (a Absolute ZRO pode ter trocado a chave).
  const d = await discover();
  const { status, body } = await getJson(d.jwks_uri);
  const list = body?.keys as JsonWebKey[] | undefined;
  if (status !== 200 || !Array.isArray(list)) throw new ZroError('network', 'jwks');
  keys = { value: list, expires: Date.now() + CACHE_MS };
  return find();
}

/** Confere e lê o id_token. Exportada para os testes. */
export async function verifyIdToken(
  idToken: string,
  nonce: string,
  now = Date.now(),
): Promise<ZroProfile> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new ZroError('invalid_token', 'format');
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new ZroError('invalid_token', 'json');
  }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string')
    throw new ZroError('invalid_token', 'algorithm');
  const jwk = await publicKey(header.kid);
  if (!jwk || jwk.kty !== 'EC') throw new ZroError('invalid_token', 'unknown key');
  let valid = false;
  try {
    valid = verify(
      'sha256',
      Buffer.from(parts[0] + '.' + parts[1]),
      { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(parts[2], 'base64url'),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ZroError('invalid_token', 'signature');
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== zroIssuer()) throw new ZroError('invalid_token', 'issuer');
  if (claims.aud !== zroCredentials().clientId) throw new ZroError('invalid_token', 'audience');
  if (typeof claims.exp !== 'number' || claims.exp < seconds - 60)
    throw new ZroError('invalid_token', 'expired');
  if (typeof claims.iat === 'number' && claims.iat > seconds + 300)
    throw new ZroError('invalid_token', 'future');
  if (typeof claims.nonce !== 'string' || claims.nonce !== nonce)
    throw new ZroError('invalid_token', 'nonce');
  if (
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    claims.sub.length > 255 ||
    typeof claims.email !== 'string' ||
    claims.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email.trim())
  )
    throw new ZroError('invalid_token', 'subject or email');
  const org = claims.zro_org as { name?: unknown } | null | undefined;
  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    emailVerified: claims.email_verified === true,
    name:
      typeof claims.name === 'string' && claims.name.trim()
        ? claims.name.trim().slice(0, 60)
        : null,
    organization: org && typeof org.name === 'string' ? org.name.slice(0, 200) : null,
    products: Array.isArray(claims.zro_products)
      ? claims.zro_products.filter((p): p is string => typeof p === 'string').slice(0, 50)
      : [],
  };
}

/** Troca o código (client_secret_basic + PKCE) e confere o id_token. */
export async function exchangeCode(
  code: string,
  verifier: string,
  nonce: string,
  redirectUri: string,
) {
  const d = await discover();
  const { clientId, clientSecret } = zroCredentials();
  const basic = Buffer.from(
    encodeURIComponent(clientId) + ':' + encodeURIComponent(clientSecret),
  ).toString('base64');
  const { status, body } = await getJson(d.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + basic,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (status !== 200 || typeof body?.id_token !== 'string')
    throw new ZroError('rejected', String(body?.error ?? status));
  return verifyIdToken(body.id_token, nonce);
}

/** Só para testes: esquece descoberta e chaves guardadas. */
export function forgetZroCache() {
  discovery = null;
  keys = null;
}
