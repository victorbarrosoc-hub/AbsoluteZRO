/**
 * Cliente OpenID Connect da Absolute ZRO (molde: products/sobedesce/web/src/lib/zro/oidc.ts). Confere o id_token pela
 * chave pública (JWKS, ES256): emissor, público (o client_id do Maestro), validade e nonce. Nada da Absolute ZRO é
 * aceito sem essa conferência. Os tokens (access de 10 min + refresh que roda) ficam cifrados na sessão (lib/auth/sessao.ts).
 */
import { createPublicKey, randomBytes, verify, type JsonWebKey } from "node:crypto";
import { credenciaisZro, emissor, ESCOPOS_BASICOS, ESCOPOS_COMPLETOS, retornoZro } from "./config";

export class ZroError extends Error {
  constructor(
    readonly codigo: "rede" | "recusado" | "token_invalido",
    detalhe: string,
  ) {
    super(detalhe);
    this.name = "ZroError";
  }
}

type Descoberta = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
};
let descoberta: { valor: Descoberta; expira: number } | null = null;
let chaves: { valor: JsonWebKey[]; expira: number } | null = null;
const CACHE_MS = 10 * 60_000;

async function buscarJson(url: string, init?: RequestInit): Promise<{ status: number; corpo: Record<string, unknown> | null }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ZroError("rede", url);
  }
  return { status: res.status, corpo: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export async function descobrir(): Promise<Descoberta> {
  if (descoberta && descoberta.expira > Date.now()) return descoberta.valor;
  const iss = emissor();
  const { status, corpo } = await buscarJson(`${iss}/.well-known/openid-configuration`);
  const d = corpo as Descoberta | null;
  // O documento tem que ser do mesmo emissor configurado (sem trocar de servidor no meio do caminho).
  if (status !== 200 || !d || d.issuer !== iss || !d.token_endpoint || !d.authorization_endpoint || !d.jwks_uri) throw new ZroError("rede", "descoberta");
  descoberta = { valor: d, expira: Date.now() + CACHE_MS };
  return d;
}

export function novoValor(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * `criar`: a pessoa veio de "Criar conta"; `prompt=create` pede à Absolute ZRO para abrir direto a tela de criar conta.
 * `basico`: sem os escopos da Z e de projetos (a Absolute ZRO recusou com invalid_scope).
 */
export async function urlDeLogin(o: {
  state: string;
  desafio: string;
  nonce: string;
  origem?: string | null;
  criar?: boolean;
  basico?: boolean;
}): Promise<string> {
  const d = await descobrir();
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", credenciaisZro().clientId);
  u.searchParams.set("redirect_uri", retornoZro(o.origem));
  u.searchParams.set("scope", o.basico ? ESCOPOS_BASICOS : ESCOPOS_COMPLETOS);
  u.searchParams.set("state", o.state);
  u.searchParams.set("nonce", o.nonce);
  u.searchParams.set("code_challenge", o.desafio);
  u.searchParams.set("code_challenge_method", "S256");
  if (o.criar) u.searchParams.set("prompt", "create");
  return u.toString();
}

export type OrgZro = { id: string; name: string; role: string };

export type PerfilZro = {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nome: string | null;
  foto: string | null;
  /** Organização ativa na Absolute ZRO (claim zro_org). null = a pessoa ainda não tem organização. */
  org: OrgZro | null;
  /** Produtos contratados/concedidos para a organização (claim zro_products). */
  produtos: string[];
  /** Gate de lançamento (claim zro_release, quando existir): { "<product_id>": "released|closed|allowed" }. */
  release: Record<string, string> | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só os claims que o Maestro usa, já conferidos no formato. */
export function perfilDeClaims(dados: Record<string, unknown>): PerfilZro {
  if (typeof dados.sub !== "string" || !UUID.test(dados.sub)) throw new ZroError("token_invalido", "sub");
  if (typeof dados.email !== "string" || !dados.email.includes("@")) throw new ZroError("token_invalido", "e-mail");
  const o = dados.zro_org as { id?: unknown; name?: unknown; role?: unknown } | null | undefined;
  const org =
    o && typeof o.id === "string" && UUID.test(o.id) && typeof o.name === "string"
      ? { id: o.id, name: o.name, role: typeof o.role === "string" ? o.role : "" }
      : null;
  const produtos = Array.isArray(dados.zro_products) ? dados.zro_products.filter((p): p is string => typeof p === "string" && /^[a-z0-9-]{1,40}$/.test(p)) : [];
  const r = dados.zro_release;
  const release =
    r && typeof r === "object" && !Array.isArray(r)
      ? Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][])
      : null;
  const foto = typeof dados.picture === "string" && /^https:\/\//.test(dados.picture) ? dados.picture : null;
  return {
    sub: dados.sub,
    email: dados.email.trim().toLowerCase(),
    emailVerificado: dados.email_verified === true,
    nome: typeof dados.name === "string" && dados.name.trim() ? dados.name.trim().slice(0, 120) : null,
    foto,
    org,
    produtos,
    release,
  };
}

/** Chave pública da Absolute ZRO pelo `kid` (JWKS com cache de 10 min; chave desconhecida busca de novo). */
export async function chavePublica(kid: string): Promise<JsonWebKey | null> {
  const procurar = () => chaves?.valor.find((k) => k.kid === kid) ?? null;
  if (chaves && chaves.expira > Date.now() && procurar()) return procurar();
  const d = await descobrir();
  const { status, corpo } = await buscarJson(d.jwks_uri);
  const lista = (corpo?.keys as JsonWebKey[] | undefined) ?? [];
  if (status !== 200 || !Array.isArray(lista)) throw new ZroError("rede", "jwks");
  chaves = { valor: lista, expira: Date.now() + CACHE_MS };
  return procurar();
}

/** Confere e lê o id_token. Exportada para os testes. */
export async function conferirIdToken(idToken: string, nonce: string, agora = Date.now()): Promise<PerfilZro> {
  const partes = idToken.split(".");
  if (partes.length !== 3) throw new ZroError("token_invalido", "formato");
  let cabecalho: Record<string, unknown>;
  let dados: Record<string, unknown>;
  try {
    cabecalho = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
    dados = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  } catch {
    throw new ZroError("token_invalido", "json");
  }
  if (cabecalho.alg !== "ES256" || typeof cabecalho.kid !== "string") throw new ZroError("token_invalido", "algoritmo");
  const jwk = await chavePublica(cabecalho.kid);
  if (!jwk) throw new ZroError("token_invalido", "chave desconhecida");
  const ok = verify(
    "sha256",
    Buffer.from(`${partes[0]}.${partes[1]}`),
    { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
    Buffer.from(partes[2], "base64url"),
  );
  if (!ok) throw new ZroError("token_invalido", "assinatura");
  const s = Math.floor(agora / 1000);
  if (dados.iss !== emissor()) throw new ZroError("token_invalido", "emissor");
  if (dados.aud !== credenciaisZro().clientId) throw new ZroError("token_invalido", "público");
  if (typeof dados.exp !== "number" || dados.exp < s - 60) throw new ZroError("token_invalido", "expirado");
  if (typeof dados.iat === "number" && dados.iat > s + 300) throw new ZroError("token_invalido", "data futura");
  if (dados.nonce !== nonce) throw new ZroError("token_invalido", "nonce");
  return perfilDeClaims(dados);
}

/** Tokens da Absolute ZRO: o access token de 10 minutos e o refresh token, que roda a cada troca. */
export type TokensZro = { at: string; atExp: number; rt: string; escopo: string };

/** Só quando a Absolute ZRO deu o refresh token; senão a sessão fica sem tokens (sem Z e sem releitura do perfil). */
export function tokensDe(corpo: Record<string, unknown> | null, agora = Date.now()): TokensZro | null {
  if (!corpo || typeof corpo.access_token !== "string" || typeof corpo.refresh_token !== "string") return null;
  const vida = Math.min(Math.max(Number(corpo.expires_in) || 0, 0), 3600);
  return {
    at: corpo.access_token,
    rt: corpo.refresh_token,
    atExp: Math.floor(agora / 1000) + vida,
    escopo: typeof corpo.scope === "string" ? corpo.scope : "",
  };
}

async function pedirToken(form: Record<string, string>) {
  const d = await descobrir();
  const { clientId, clientSecret } = credenciaisZro();
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64");
  return buscarJson(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams(form).toString(),
  });
}

/** Troca o código (client_secret_basic + PKCE) e confere o id_token. */
export async function trocarCodigoZro(
  code: string,
  verificador: string,
  nonce: string,
  origem?: string | null,
): Promise<{ perfil: PerfilZro; tokens: TokensZro | null }> {
  const { status, corpo } = await pedirToken({ grant_type: "authorization_code", code, code_verifier: verificador, redirect_uri: retornoZro(origem) });
  if (status !== 200 || typeof corpo?.id_token !== "string") throw new ZroError("recusado", String(corpo?.error ?? status));
  return { perfil: await conferirIdToken(corpo.id_token, nonce), tokens: tokensDe(corpo) };
}

/**
 * Troca o refresh token por tokens novos (o velho deixa de valer: reapresentado, derruba a família na Absolute ZRO).
 * `recusado`: a Absolute ZRO não aceita mais (400/401), a pessoa precisa entrar de novo.
 */
export async function renovarTokens(rt: string): Promise<{ tokens: TokensZro | null; recusado: boolean }> {
  const { status, corpo } = await pedirToken({ grant_type: "refresh_token", refresh_token: rt });
  if (status !== 200) return { tokens: null, recusado: status === 400 || status === 401 };
  const tokens = tokensDe(corpo);
  return { tokens, recusado: !tokens };
}

/** /oauth/userinfo com o access token: os claims atuais (perfil único e zro_products). `recusado`: 401. */
export async function lerUserinfo(at: string): Promise<{ perfil: PerfilZro | null; recusado: boolean }> {
  const d = await descobrir();
  const { status, corpo } = await buscarJson(d.userinfo_endpoint || `${emissor()}/oauth/userinfo`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${at}` },
  });
  if (status === 401) return { perfil: null, recusado: true };
  if (status !== 200 || !corpo) throw new ZroError("rede", "userinfo");
  return { perfil: perfilDeClaims(corpo), recusado: false };
}

/** RFC 7009: avisa a Absolute ZRO que o refresh token morreu (ao sair). Falha de rede não impede o sair. */
export async function revogarToken(rt: string): Promise<void> {
  const d = await descobrir();
  const alvo = d.revocation_endpoint || `${emissor()}/oauth/revoke`;
  const { clientId, clientSecret } = credenciaisZro();
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64");
  await buscarJson(alvo, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ token: rt, token_type_hint: "refresh_token" }).toString(),
  }).catch(() => undefined);
}

/** Só para testes: esquece descoberta e chaves guardadas. */
export function esquecerCacheZro() {
  descoberta = null;
  chaves = null;
}
