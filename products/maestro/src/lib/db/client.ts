/**
 * Acesso ao banco do Maestro. Duas portas, e só duas (mesmo desenho de packages/db do HUB):
 *
 * - `asUser(ctx, fn)`: toda operação de usuário. Abre a transação, informa a pessoa (sub da Absolute ZRO) e a
 *   organização ativa (set_config local) e assume o papel `maestro_app`, que não é dono das tabelas: o RLS de
 *   drizzle/0000_fundacao.sql vale sempre, mesmo se a checagem do servidor falhar.
 * - `asSystem(motivo, fn)`: autenticação (sessões), callback do login, link do cliente, migração e a lista de espera
 *   (que assume `maestro_app` na hora). Roda como dono
 *   (sem RLS); o motivo vai para o log.
 *
 * Este arquivo não importa "server-only" para poder ser usado pelos scripts e pelos testes.
 */
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl, normalizarUrl, PAPEL_APP, urlDeExecucao } from "./config";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Contexto = {
  /** id da pessoa na Absolute ZRO (claim sub). */
  sub: string;
  /** Organização do Maestro (maestro.organizations.id) já validada pela sessão. */
  orgId: string;
};

export type Banco = {
  sql: postgres.Sql;
  db: DB;
  asUser<T>(ctx: Contexto, fn: (tx: Tx) => Promise<T>): Promise<T>;
  asSystem<T>(motivo: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarBanco(url: string, opcoes: { max?: number; prepare?: boolean; aoSistema?: (motivo: string) => void } = {}): Banco {
  const client = postgres(normalizarUrl(url), {
    max: opcoes.max ?? 5,
    // Pooler em modo transação (Supabase) não aceita prepared statements nomeados.
    prepare: opcoes.prepare ?? false,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: "snake_case" });

  async function asUser<T>(ctx: Contexto, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(ctx.sub)) throw new Error("asUser: sub inválido");
    if (!UUID.test(ctx.orgId)) throw new Error("asUser: orgId inválido");
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('maestro.user_sub', ${ctx.sub}, true), set_config('maestro.org_id', ${ctx.orgId}, true)`);
      await tx.execute(sql.raw(`set local role ${PAPEL_APP}`));
      return fn(tx);
    });
  }

  async function asSystem<T>(motivo: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    opcoes.aoSistema?.(motivo);
    return db.transaction((tx) => fn(tx));
  }

  return { sql: client, db, asUser, asSystem, close: () => client.end({ timeout: 5 }) };
}

const g = globalThis as unknown as { __maestroBanco?: Banco };

/** Conexão compartilhada do processo (Next.js e scripts). Exige MAESTRO_DATABASE_URL (ou DATABASE_URL). */
export function getBanco(): Banco {
  if (g.__maestroBanco) return g.__maestroBanco;
  const url = databaseUrl();
  if (!url) throw new Error("MAESTRO_DATABASE_URL não configurada. Veja .env.example.");
  g.__maestroBanco = criarBanco(urlDeExecucao(url), { max: Number(process.env.MAESTRO_DATABASE_POOL_MAX || (process.env.VERCEL ? 3 : 5)) });
  return g.__maestroBanco;
}

/** Fecha a conexão compartilhada (scripts terminam mais rápido). */
export async function fecharBanco(): Promise<void> {
  await g.__maestroBanco?.close();
  g.__maestroBanco = undefined;
}

/** Erros do Postgres que o domínio trata (o Drizzle embrulha o erro do driver em `cause`). */
export function codigoPg(err: unknown): string | null {
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

/** A mensagem do erro mais interno (a do Postgres, por baixo do embrulho do Drizzle). */
export function mensagemPg(err: unknown): string {
  let msg = "";
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") msg = m;
  }
  return msg;
}

export const PG = {
  unicidade: "23505",
  checagem: "23514",
  chaveEstrangeira: "23503",
  semPrivilegio: "42501",
  rls: "42501",
  /** `raise exception … using errcode = 'P0001'` nas funções do Quadro. */
  regra: "P0001",
} as const;

export { schema };
