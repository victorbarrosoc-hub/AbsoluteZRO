/**
 * Onde está o banco.
 * - Produção: Supabase da Absolute ZRO, schema `sobedesce`, papel `sobedesce_app`, pela
 *   SOBEDESCE_DATABASE_URL (pooler de transação, porta 6543). Enquanto a virada não termina,
 *   a integração Neon da Vercel continua criando DATABASE_URL e POSTGRES_URL: com a
 *   SOBEDESCE_DATABASE_URL definida, elas só servem de origem da cópia (scripts/copiar-do-neon.mts).
 *   Sem a SOBEDESCE_DATABASE_URL, vale DATABASE_URL e depois POSTGRES_URL (o Neon de antes).
 * - Computador: PGlite (Postgres num arquivo) em ./data/pglite. Com `npm run dev`
 *   ele roda como servidor local (scripts/dev.mjs) e o site conecta por SOBEDESCE_LOCAL_DB_URL;
 *   os scripts de banco (migrate, seed) abrem o arquivo direto, com o site parado.
 * - Testes: SOBEDESCE_PGLITE_DIR=memory:// (ou um diretório temporário) troca o arquivo.
 * Sem "server-only" para os scripts e o drizzle.config poderem usar.
 */
export const LOCAL_DATABASE_DIR = process.env.SOBEDESCE_PGLITE_DIR || "./data/pglite";

/** "memory://" (testes): banco em memória, nada no disco. */
export const LOCAL_DATABASE_IN_MEMORY = LOCAL_DATABASE_DIR.startsWith("memory://");

const isPostgresUrl = (value: string | undefined) => !!value && /^postgres(ql)?:\/\//.test(value);

/** Variáveis de ambiente (process.env ou um objeto de teste). */
export type Ambiente = Record<string, string | undefined>;

/** Variáveis do banco do site, na ordem de preferência. */
export const DATABASE_URL_KEYS = ["SOBEDESCE_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"] as const;

/**
 * Schema do SOBEDESCE no Postgres (SOBEDESCE_DATABASE_SCHEMA, ex.: "sobedesce"). Só vale para servidor
 * Postgres (nunca PGlite): com ele, as migrações rodam no migrador próprio (./migrador.ts). Sem ele, null.
 * Nome fora do padrão (letras minúsculas, números e _) é erro: entra no SQL entre aspas.
 */
export function databaseSchema(env: Ambiente = process.env): string | null {
  const v = env.SOBEDESCE_DATABASE_SCHEMA?.trim();
  if (!v) return null;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) throw new Error("SOBEDESCE_DATABASE_SCHEMA inválido (use letras minúsculas, números e _)");
  return v;
}

export function databaseConfig(env: Ambiente = process.env) {
  const url = DATABASE_URL_KEYS.map((k) => env[k]).find(isPostgresUrl);
  if (url) return { url, local: false as const, server: true as const };
  const localServer = env.SOBEDESCE_LOCAL_DB_URL;
  if (localServer) return { url: localServer, local: true as const, server: true as const };
  return { url: `pglite:${LOCAL_DATABASE_DIR}`, local: true as const, server: false as const };
}

/**
 * Todos os bancos Postgres diferentes que o site pode usar, com os nomes das
 * variáveis (nunca as senhas). Mais de um = dois bancos ligados ao projeto,
 * e o site poderia ler um e gravar no outro de um deploy para o seguinte.
 * O mesmo banco por endereços diferentes (pooler e conexão direta) conta uma vez.
 * Com SOBEDESCE_DATABASE_URL, só ela conta: DATABASE_URL/POSTGRES_URL (Neon) viram só a
 * origem da cópia durante a virada e o site nunca as usa.
 */
export function databaseCandidates(env: Ambiente = process.env) {
  const byDatabase = new Map<string, string[]>();
  const keys = isPostgresUrl(env.SOBEDESCE_DATABASE_URL) ? (["SOBEDESCE_DATABASE_URL"] as const) : (["DATABASE_URL", "POSTGRES_URL"] as const);
  for (const key of keys) {
    const value = env[key];
    if (!isPostgresUrl(value)) continue;
    const label = databaseLabel(value!);
    byDatabase.set(label, [...(byDatabase.get(label) ?? []), key]);
  }
  return [...byDatabase.entries()].map(([label, keys]) => ({ label, keys }));
}

/** Nome curto e seguro do banco, para mostrar na tela e no log (sem senha). */
export function databaseLabel(url: string) {
  if (url.startsWith("pglite:") || url.includes("@127.0.0.1:")) return "arquivo local (data/pglite)";
  try {
    const u = new URL(url);
    // Supabase: "db.<ref>.supabase.co" (direto) ou usuário "<papel>.<ref>" no pooler
    // (aws-0-<região>.pooler.supabase.com, ex.: "sobedesce_app.<ref>" na porta 6543).
    const ref =
      u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ??
      (/\.pooler\.supabase\.com$/.test(u.hostname) || /^postgres\./.test(decodeURIComponent(u.username))
        ? decodeURIComponent(u.username).match(/^[a-z_][a-z0-9_]*\.([a-z0-9]+)$/)?.[1]
        : undefined);
    if (ref) return `${ref} (Supabase)`;
    // Neon: o mesmo banco aparece com e sem "-pooler" no endereço.
    const neon = u.hostname.match(/^(ep-[a-z0-9-]+?)(-pooler)?\.([a-z0-9-]+)\.aws\.neon\.tech$/);
    if (neon) return `${neon[1]} (Neon, ${neon[3]})`;
    return `${u.hostname}${u.pathname !== "/" ? u.pathname : ""}`;
  } catch {
    return "endereço inválido";
  }
}

/**
 * O postgres.js manda ao servidor, como configuração, todo parâmetro da URL que ele
 * não conhece. O Neon põe "channel_binding=require" na URL e o Postgres recusaria.
 */
export function postgresUrl(raw: string) {
  try {
    const u = new URL(raw);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return raw;
  }
}
