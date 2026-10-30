/**
 * Cliente OpenID Connect da Absolute ZRO. Confere o id_token pela chave pública (JWKS, ES256): emissor, público
 * (o client_id da SOBEDESCE), validade e nonce. Nada da Absolute ZRO é aceito sem essa conferência.
 */
import { createPublicKey, randomBytes, verify, type JsonWebKey } from "node:crypto";
import { credenciaisZro, emissor, ESCOPO_IA, ESCOPOS_ZRO, ESCOPOS_ZRO_IA, ESCOPOS_ZRO_IA_SET, retornoZro } from "./config";

export class ZroError extends Error {
  constructor(readonly codigo: "rede" | "recusado" | "token_invalido", detalhe: string) {
    super(detalhe);
  }
}

type Descoberta = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
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
 * `semSet`: sem o escopo do Set (a Absolute ZRO recusou `zro.set` com invalid_scope); `basico`: sem os da Z também.
 */
export async function urlDeLogin(o: { state: string; desafio: string; nonce: string; origem?: string | null; criar?: boolean; basico?: boolean; semSet?: boolean }): Promise<string> {
  const d = await descobrir();
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", credenciaisZro().clientId);
  u.searchParams.set("redirect_uri", retornoZro(o.origem));
  u.searchParams.set("scope", o.basico ? ESCOPOS_ZRO : o.semSet ? ESCOPOS_ZRO_IA : ESCOPOS_ZRO_IA_SET);
  u.searchParams.set("state", o.state);
  u.searchParams.set("nonce", o.nonce);
  u.searchParams.set("code_challenge", o.desafio);
  u.searchParams.set("code_challenge_method", "S256");
  if (o.criar) u.searchParams.set("prompt", "create");
  return u.toString();
}

export type PerfilZro = {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nome: string | null;
  organizacao: string | null;
  produtos: string[];
};

/** Chave pública da Absolute ZRO pelo `kid` (JWKS com cache de 10 min; chave desconhecida busca de novo). */
export async function chavePublica(kid: string): Promise<JsonWebKey | null> {
  const procurar = () => chaves?.valor.find((k) => k.kid === kid) ?? null;
  if (chaves && chaves.expira > Date.now() && procurar()) return procurar();
  // Chave desconhecida: busca de novo (a Absolute ZRO pode ter trocado a chave).
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
  if (typeof dados.sub !== "string" || !dados.sub || typeof dados.email !== "string") throw new ZroError("token_invalido", "sem sub ou e-mail");
  const org = dados.zro_org as { name?: unknown } | null | undefined;
  const produtos = Array.isArray(dados.zro_products) ? dados.zro_products.filter((p): p is string => typeof p === "string") : [];
  return {
    sub: dados.sub,
    email: dados.email.trim().toLowerCase(),
    emailVerificado: dados.email_verified === true,
    nome: typeof dados.name === "string" && dados.name.trim() ? dados.name.trim() : null,
    organizacao: org && typeof org.name === "string" ? org.name : null,
    produtos,
  };
}

/**
 * Tokens da Z (escopo zro.ia): o access token de 10 minutos e o refresh token, que roda a cada troca. `escopo`: o que a
 * Absolute ZRO deu (com `zro.set`, os mesmos tokens servem ao Set); tokens de antes do Set não têm o campo.
 */
export type TokensIa = { at: string; atExp: number; rt: string; escopo?: string };

/** Só quando a Absolute ZRO deu `zro.ia` E o refresh token; senão a Z fica sem token (a tela pede para reconectar). */
export function tokensIaDe(corpo: Record<string, unknown> | null, agora = Date.now()): TokensIa | null {
  if (!corpo || typeof corpo.access_token !== "string" || typeof corpo.refresh_token !== "string") return null;
  if (!String(corpo.scope ?? "").split(" ").includes(ESCOPO_IA)) return null;
  const vida = Math.min(Math.max(Number(corpo.expires_in) || 0, 0), 3600);
  return { at: corpo.access_token, rt: corpo.refresh_token, atExp: Math.floor(agora / 1000) + vida, escopo: String(corpo.scope) };
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

/** Troca o código (client_secret_basic + PKCE) e confere o id_token. `ia`: os tokens da Z, quando vieram. */
export async function trocarCodigoZro(code: string, verificador: string, nonce: string, origem?: string | null): Promise<{ perfil: PerfilZro; ia: TokensIa | null }> {
  const { status, corpo } = await pedirToken({ grant_type: "authorization_code", code, code_verifier: verificador, redirect_uri: retornoZro(origem) });
  if (status !== 200 || typeof corpo?.id_token !== "string") throw new ZroError("recusado", String(corpo?.error ?? status));
  return { perfil: await conferirIdToken(corpo.id_token, nonce), ia: tokensIaDe(corpo) };
}

/**
 * Troca o refresh token da Z por tokens novos (o velho deixa de valer: reapresentado, derruba a família na Absolute
 * ZRO). `recusado`: a Absolute ZRO não aceita mais (400/401), a pessoa precisa entrar de novo.
 */
export async function renovarTokensIa(rt: string): Promise<{ ia: TokensIa | null; recusado: boolean }> {
  const { status, corpo } = await pedirToken({ grant_type: "refresh_token", refresh_token: rt });
  if (status !== 200) return { ia: null, recusado: status === 400 || status === 401 };
  const ia = tokensIaDe(corpo);
  return { ia, recusado: !ia };
}

/** Só para testes: esquece descoberta e chaves guardadas. */
export function esquecerCacheZro() {
  descoberta = null;
  chaves = null;
}
