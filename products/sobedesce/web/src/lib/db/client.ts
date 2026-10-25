/**
 * Conexão com o banco (endereço em ./config.ts).
 * Produção: Postgres do Supabase da Absolute ZRO (ou o Neon de antes da virada), por postgres.js.
 * Computador: PGlite em ./data/pglite.
 * Este arquivo não importa "server-only" para poder ser usado pelos scripts.
 */
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { LOCAL_DATABASE_DIR, LOCAL_DATABASE_IN_MEMORY, databaseConfig, databaseSchema, postgresUrl } from "./config";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const config = databaseConfig();
const globalForDb = globalThis as unknown as { sobedesceDb?: DB; sobedescePglite?: PGlite; sobedesceSql?: postgres.Sql };

function connect(): DB {
  if (!config.server) {
    // Scripts de banco (migrate, seed): abrem o arquivo do PGlite direto.
    if (!LOCAL_DATABASE_IN_MEMORY) mkdirSync(LOCAL_DATABASE_DIR, { recursive: true });
    const client = globalForDb.sobedescePglite ?? new PGlite(LOCAL_DATABASE_DIR);
    globalForDb.sobedescePglite = client;
    // O PGlite fala o mesmo Postgres: as consultas são as mesmas da produção.
    return drizzlePglite(client, { schema, casing: "snake_case" }) as unknown as DB;
  }
  // Pooler (modo transação, Neon ou Supabase): sem prepared statements, poucas conexões por função.
  // Local (servidor do PGlite): uma conexão só, que ele atende uma consulta por vez.
  const sql =
    globalForDb.sobedesceSql ??
    postgres(postgresUrl(config.url), { prepare: false, max: config.local ? 1 : 5, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
  globalForDb.sobedesceSql = sql;
  return drizzlePostgres(sql, { schema, casing: "snake_case" });
}

export const db = globalForDb.sobedesceDb ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.sobedesceDb = db;

/**
 * Aplica as migrações pendentes (pasta ./drizzle).
 * Com SOBEDESCE_DATABASE_SCHEMA (só servidor Postgres, nunca PGlite): migrador próprio no schema (./migrador.ts),
 * e confere se o papel do banco usa esse schema por padrão. Sem ela: o migrador do Drizzle, como antes.
 */
export async function runMigrations() {
  const schemaDoApp = config.server && !config.local ? databaseSchema() : null;
  if (!config.server) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: "./drizzle" });
  } else if (schemaDoApp) {
    const { migrarNoSchema, conferirSchemaPadrao } = await import("./migrador");
    const sql = globalForDb.sobedesceSql!;
    const aplicadas = await migrarNoSchema(sql, schemaDoApp, "./drizzle");
    console.log(aplicadas.length ? `Migrações aplicadas no schema ${schemaDoApp}: ${aplicadas.join(", ")}` : `Schema ${schemaDoApp} em dia.`);
    await conferirSchemaPadrao(sql, schemaDoApp);
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
  }
}

/** Fecha a conexão (scripts terminam mais rápido). */
export async function closeDatabase() {
  await globalForDb.sobedesceSql?.end({ timeout: 5 });
  await globalForDb.sobedescePglite?.close();
}

export { schema };

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Várias escritas que valem juntas (tudo ou nada), na ordem dada.
 * Monte as consultas com o `t` recebido: elas só rodam aqui, dentro da transação.
 */
export async function transact(build: (t: Tx) => PromiseLike<unknown>[]) {
  return db.transaction(async (t) => {
    for (const query of build(t)) await query;
  });
}
