/**
 * Ambiente dos testes: um banco Postgres descartável por arquivo (maestro_test_<nome>, recriado e migrado), a
 * Absolute ZRO falsa e as variáveis de teste. Nada toca num banco de verdade nem na Absolute ZRO de verdade.
 * Use `prepararAmbiente()` ANTES de importar qualquer módulo de src/ que fale com o banco (ele lê o ambiente na
 * primeira chamada). Base: TEST_DATABASE_URL (padrão postgres://postgres:postgres@localhost:5432/postgres).
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { iniciarZroFalsa } from "./zro-falso.mts";

export const SITE = "http://localhost:3000";
export const CLIENTE = { clientId: "maestro-web", clientSecret: "segredo-de-teste-do-maestro" };
const BASE = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres";

/** Recria `maestro_test_<nome>` do zero e aplica drizzle/*.sql. Devolve o endereço. */
export async function bancoDeTeste(nome: string): Promise<string> {
  if (!/^[a-z0-9_]{1,30}$/.test(nome)) throw new Error(`nome de banco de teste inválido: ${nome}`);
  // TEST_DB_SUFIXO separa os bancos quando duas cópias do repositório rodam os testes ao mesmo tempo.
  const sufixo = (process.env.TEST_DB_SUFIXO ?? "").replace(/[^a-z0-9_]/g, "").slice(0, 12);
  const db = `maestro_test_${nome}${sufixo ? `_${sufixo}` : ""}`;
  const u = new URL(BASE);
  u.pathname = "/postgres";
  const admin = postgres(u.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${db} with (force)`);
    await admin.unsafe(`create database ${db}`);
  } finally {
    await admin.end();
  }
  u.pathname = `/${db}`;
  const url = u.toString();
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const { migrarNoSchema } = await import("../src/lib/db/migrador");
    await migrarNoSchema(sql, "./drizzle");
  } finally {
    await sql.end();
  }
  return url;
}

export async function prepararAmbiente(nome: string) {
  const url = await bancoDeTeste(nome);
  const zro = await iniciarZroFalsa(CLIENTE);
  for (const k of ["DATABASE_URL", "POSTGRES_URL", "VERCEL"]) delete process.env[k];
  Object.assign(process.env, {
    MAESTRO_DATABASE_URL: url,
    NEXT_PUBLIC_SITE_URL: SITE,
    MAESTRO_KEY: randomBytes(32).toString("base64"),
    ZRO_ISSUER: zro.url,
    ZRO_CLIENT_ID: CLIENTE.clientId,
    ZRO_CLIENT_SECRET: CLIENTE.clientSecret,
  });
  const banco = await import("../src/lib/db/client");
  return {
    url,
    zro,
    banco,
    async fechar() {
      await zro.fechar();
      await banco.fecharBanco();
    },
  };
}

/** Cookies de uma resposta (Set-Cookie) como mapa nome → valor (vazio = apagado). */
export function cookiesDe(res: Response): Map<string, string> {
  const m = new Map<string, string>();
  for (const linha of res.headers.getSetCookie()) {
    const [par] = linha.split(";");
    const i = par.indexOf("=");
    m.set(par.slice(0, i).trim(), decodeURIComponent(par.slice(i + 1).trim()));
  }
  return m;
}

export type Pedido = {
  method?: string;
  corpo?: unknown;
  cookies?: Record<string, string | undefined>;
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
};

/** Request para chamar uma rota direto (sem servidor). Origin do próprio site por padrão nos POST. */
export function pedido(caminho: string, p: Pedido = {}): Request {
  const method = p.method ?? (p.corpo !== undefined ? "POST" : "GET");
  const headers = new Headers({ host: "localhost:3000", ...(p.headers ?? {}) });
  const cookies = Object.entries(p.cookies ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  const origin = p.origin === undefined ? (method === "GET" ? null : SITE) : p.origin;
  if (origin) headers.set("origin", origin);
  if (p.ip) headers.set("x-real-ip", p.ip);
  let body: string | undefined;
  if (p.corpo !== undefined) {
    headers.set("content-type", "application/json");
    body = typeof p.corpo === "string" ? p.corpo : JSON.stringify(p.corpo);
  }
  return new Request(new URL(caminho, SITE), { method, headers, body });
}

export const UUID = () => {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
