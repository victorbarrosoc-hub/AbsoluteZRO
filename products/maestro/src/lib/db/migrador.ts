/**
 * Migrador próprio para o schema `maestro` (nunca o "public"), no molde do SOBEDESCE
 * (products/sobedesce/web/src/lib/db/migrador.ts).
 *
 * Lê drizzle/meta/_journal.json (o mesmo formato do Drizzle), guarda o que já rodou em
 * `maestro.__drizzle_migrations (id serial, hash text, created_at bigint)` com o sha256 do arquivo .sql e o `when`
 * do journal, e aplica só as migrações com `when` maior que o da última aplicada. Cada migração roda na própria
 * transação, com `set local search_path` no schema; o `"public".` que o drizzle-kit põe nas chaves estrangeiras vira
 * `"maestro".`. Duas execuções ao mesmo tempo (dois deploys) esperam uma pela outra (trava consultiva).
 *
 * Um arquivo com `--> statement-breakpoint` é dividido nesses pontos; sem o marcador, roda inteiro (uma chamada,
 * protocolo simples), o que permite funções e blocos DO com ponto e vírgula dentro.
 * Sem "server-only": o script de migração (scripts/db-migrate.mts) e os testes usam.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type postgres from "postgres";
import { SCHEMA } from "./config";

export type Migracao = { tag: string; when: number; sql: string; hash: string };

const NOME_SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/;

/** Confere o nome do schema (ele entra no SQL entre aspas) e devolve já entre aspas. */
export function schemaEntreAspas(schema: string): string {
  if (!NOME_SCHEMA.test(schema)) throw new Error(`nome de schema inválido: ${JSON.stringify(schema)}`);
  return `"${schema}"`;
}

/** As migrações do journal, na ordem dele, com o SQL e o sha256 de cada arquivo. */
export function lerMigracoes(pasta: string): Migracao[] {
  const journal = JSON.parse(readFileSync(path.join(pasta, "meta", "_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };
  return journal.entries.map(({ tag, when }) => {
    const sql = readFileSync(path.join(pasta, `${tag}.sql`), "utf8");
    return { tag, when, sql, hash: createHash("sha256").update(sql).digest("hex") };
  });
}

/** Comandos de uma migração no schema: troca `"public".` por `"<schema>".` e divide em `--> statement-breakpoint`. */
export function comandosNoSchema(sql: string, schema: string): string[] {
  const alvo = `${schemaEntreAspas(schema)}.`;
  const texto = sql.replaceAll('"public".', alvo);
  if (!texto.includes("--> statement-breakpoint")) return texto.trim() ? [texto] : [];
  return texto
    .split("--> statement-breakpoint")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Aplica as migrações pendentes no schema. Devolve as tags aplicadas agora (vazio = nada pendente). */
export async function migrarNoSchema(sql: postgres.Sql, pasta = "./drizzle", schema = SCHEMA): Promise<string[]> {
  const s = schemaEntreAspas(schema);
  const migracoes = lerMigracoes(pasta);
  const [{ existe }] = await sql<{ existe: boolean }[]>`select exists (select 1 from pg_namespace where nspname = ${schema}) as existe`;
  if (!existe) await sql.unsafe(`create schema ${s}`);
  await sql.unsafe(`create table if not exists ${s}."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)`);

  const aplicadas: string[] = [];
  for (const m of migracoes) {
    const aplicou = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`maestro:migracoes:${schema}`}))`;
      const [ultima] = await tx.unsafe<{ created_at: string | number | null }[]>(
        `select created_at from ${s}."__drizzle_migrations" order by created_at desc nulls last limit 1`,
      );
      if (ultima?.created_at != null && Number(ultima.created_at) >= m.when) return false;
      await tx.unsafe(`set local search_path to ${s}, pg_catalog`);
      for (const comando of comandosNoSchema(m.sql, schema)) await tx.unsafe(comando);
      await tx.unsafe(`insert into ${s}."__drizzle_migrations" (hash, created_at) values ($1, $2)`, [m.hash, m.when]);
      return true;
    });
    if (aplicou) aplicadas.push(m.tag);
  }
  return aplicadas;
}

/** As migrações já aplicadas (hash e `when`), para conferir que nenhuma aplicada foi editada. */
export async function migracoesAplicadas(sql: postgres.Sql, schema = SCHEMA): Promise<{ hash: string; when: number }[]> {
  const s = schemaEntreAspas(schema);
  const linhas = await sql.unsafe<{ hash: string; created_at: string | number }[]>(
    `select hash, created_at from ${s}."__drizzle_migrations" order by created_at`,
  );
  return linhas.map((l) => ({ hash: l.hash, when: Number(l.created_at) }));
}

/**
 * Uma migração aplicada nunca é editada: se o hash do arquivo mudou, o deploy para antes de publicar um site com um
 * banco diferente do código. Devolve as tags divergentes.
 */
export async function conferirMigracoes(sql: postgres.Sql, pasta = "./drizzle", schema = SCHEMA): Promise<string[]> {
  const aplicadas = await migracoesAplicadas(sql, schema);
  const porWhen = new Map(aplicadas.map((a) => [a.when, a.hash]));
  return lerMigracoes(pasta)
    .filter((m) => porWhen.has(m.when) && porWhen.get(m.when) !== m.hash)
    .map((m) => m.tag);
}
