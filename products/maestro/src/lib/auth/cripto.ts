/**
 * Segredos no banco e cookies selados: AES-256-GCM com MAESTRO_KEY (32 bytes em base64).
 * Formato "v1.<iv>.<cifra>.<tag>" (base64url). O AAD é o contexto ("sessions.zro:<id>"): a cifra de uma linha
 * não abre em outra. Chave derivada (HKDF) por uso: o cookie do login não abre um token e vice-versa.
 * Sem a chave em produção, só `selar`/`abrir` lançam (nada lança no import).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export class ChaveErrada extends Error {
  constructor() {
    super("Não deu para abrir o segredo (chave trocada ou dado adulterado).");
    this.name = "ChaveErrada";
  }
}

const CHAVE_DEV = "maestro-chave-so-para-desenvolvimento";

export function chaveConfigurada(): boolean {
  const v = process.env.MAESTRO_KEY;
  if (!v) return process.env.NODE_ENV !== "production";
  return Buffer.from(v, "base64").length === 32;
}

function chave(): Buffer {
  const v = process.env.MAESTRO_KEY;
  if (!v) {
    if (process.env.NODE_ENV === "production") throw new Error("Defina MAESTRO_KEY (openssl rand -base64 32) nas variáveis da Vercel.");
    return createHash("sha256").update(CHAVE_DEV).digest();
  }
  const k = Buffer.from(v, "base64");
  if (k.length !== 32) throw new Error("MAESTRO_KEY precisa ter 32 bytes em base64 (openssl rand -base64 32).");
  return k;
}

function chavePara(uso: string): Buffer {
  return Buffer.from(hkdfSync("sha256", chave(), Buffer.alloc(0), Buffer.from(`maestro:${uso}`, "utf8"), 32));
}

function cifrar(k: Buffer, texto: string, contexto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(Buffer.from(contexto, "utf8"));
  const cifra = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), cifra.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

function decifrar(k: Buffer, selado: string, contexto: string): string {
  const partes = String(selado ?? "").split(".");
  if (partes.length !== 4 || partes[0] !== "v1") throw new ChaveErrada();
  try {
    const [, iv, cifra, tag] = partes;
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAAD(Buffer.from(contexto, "utf8"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(cifra, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new ChaveErrada();
  }
}

/** Segredo guardado no banco (tokens da Absolute ZRO). */
export function selar(texto: string, contexto: string): string {
  return cifrar(chavePara("banco"), texto, contexto);
}

export function abrir(selado: string, contexto: string): string {
  return decifrar(chavePara("banco"), selado, contexto);
}

/** Cookie da ida ao login (state + PKCE + nonce). */
export function selarCookie(texto: string, contexto: string): string {
  return cifrar(chavePara("cookie"), texto, contexto);
}

export function abrirCookie(selado: string, contexto: string): string {
  return decifrar(chavePara("cookie"), selado, contexto);
}

/** Assinatura curta (HMAC-SHA256, 128 bits) para valores que só precisam provar que saíram daqui. */
export function assinar(texto: string, uso: string): string {
  return createHmac("sha256", chavePara(uso)).update(texto, "utf8").digest().subarray(0, 16).toString("base64url");
}

export function assinaturaConfere(texto: string, assinatura: string, uso: string): boolean {
  const esperada = Buffer.from(assinar(texto, uso));
  const veio = Buffer.from(String(assinatura ?? ""));
  return veio.length === esperada.length && timingSafeEqual(veio, esperada);
}

/** HMAC-SHA256 inteiro em hexadecimal (ex.: o IP da lista de espera, que nunca é guardado em claro). */
export function hashComChave(texto: string, uso: string): string {
  return createHmac("sha256", chavePara(uso)).update(texto, "utf8").digest("hex");
}

/** sha256 em hexadecimal (tokens de sessão e de link no banco). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Token aleatório, 256 bits em base64url. */
export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Compara dois textos em tempo constante. */
export function igualSeguro(a: string | null | undefined, b: string): boolean {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
