/**
 * Onde está o banco do Maestro.
 * - Produção: Supabase da Absolute ZRO, schema `maestro`, pela MAESTRO_DATABASE_URL (pooler de transação, 6543),
 *   com o papel dono do schema (`maestro`). Sem ela, valem DATABASE_URL e POSTGRES_URL.
 * - Computador e testes: Postgres local (service postgresql start), por exemplo
 *   postgres://postgres:postgres@localhost:5432/maestro. Os testes usam bancos próprios `maestro_test_*`.
 * Sem "server-only" para os scripts e os testes poderem usar.
 */

/** O schema é fixo: um schema e um papel por app (ADR 0013). As funções de RLS vivem nele. */
export const SCHEMA = "maestro";

/** Papel sem login que o servidor assume em toda operação de usuário (RLS vale sempre). */
export const PAPEL_APP = "maestro_app";

export type Ambiente = Record<string, string | undefined>;

export const DATABASE_URL_KEYS = ["MAESTRO_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"] as const;

const ehUrlPostgres = (v: string | undefined) => !!v && /^postgres(ql)?:\/\//.test(v);

export function databaseUrl(env: Ambiente = process.env): string | null {
  return DATABASE_URL_KEYS.map((k) => env[k]).find(ehUrlPostgres) ?? null;
}

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/**
 * Integrações (Supabase/Neon pela Vercel) entregam URLs com parâmetros extras (`supa=`, `pgbouncer=`,
 * `channel_binding=`). O driver repassaria cada um ao servidor como parâmetro de sessão, e o pooler recusa.
 * Fica só `sslmode`; banco remoto sem `sslmode` passa a exigir TLS.
 */
export function normalizarUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const sslmode = url.searchParams.get("sslmode");
  for (const k of [...url.searchParams.keys()]) url.searchParams.delete(k);
  if (sslmode) url.searchParams.set("sslmode", sslmode);
  else if (!HOSTS_LOCAIS.has(url.hostname)) url.searchParams.set("sslmode", "require");
  return url.toString();
}

/**
 * Endereço para o app em execução. O pooler do Supabase na porta 5432 é o modo sessão: cada função da Vercel prende
 * conexões até o limite do pool (15) e o resto recebe EMAXCONNSESSION. O app usa o modo transação (6543, mesmo
 * usuário e senha); as migrações continuam com o endereço como veio.
 */
export function urlDeExecucao(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".pooler.supabase.com") && (u.port === "5432" || u.port === "")) {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    // endereço inválido: o driver avisa
  }
  return raw;
}

/** Nome curto e seguro do banco, para mostrar na tela e no log (sem senha). */
export function databaseLabel(url: string): string {
  try {
    const u = new URL(url);
    const ref = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ?? decodeURIComponent(u.username).match(/^[a-z_][a-z0-9_]*\.([a-z0-9]+)$/)?.[1];
    if (ref) return `${ref} (Supabase)`;
    return `${u.hostname}${u.pathname !== "/" ? u.pathname : ""}`;
  } catch {
    return "endereço inválido";
  }
}
