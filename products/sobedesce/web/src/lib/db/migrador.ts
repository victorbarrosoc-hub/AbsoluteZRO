/**
 * Migrador próprio para um schema que não é o "public" (Supabase da Absolute ZRO: schema `sobedesce`).
 * Usado por runMigrations (./client.ts) quando SOBEDESCE_DATABASE_SCHEMA está definida.
 *
 * Compatível com o migrador do Drizzle: lê drizzle/meta/_journal.json, guarda o que já rodou numa tabela
 * `__drizzle_migrations (id serial, hash text, created_at bigint)` igual à dele (só que dentro do schema, e não no
 * schema "drizzle", que o papel do app não pode criar), com o sha256 do arquivo .sql e o `when` do journal, e aplica
 * só as migrações com `when` maior que o da última aplicada.
 *
 * Diferenças: cada migração roda na sua própria transação, com `set local search_path to <schema>` e com o
 * `"public".` que o drizzle-kit põe nas chaves estrangeiras trocado por `"<schema>".`.
 * Duas execuções ao mesmo tempo (dois deploys) esperam uma pela outra (trava consultiva por transação).
 *
 * Sem "server-only": o script de migração (scripts/db-migrate.mts) e os testes usam.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type postgres from "postgres";

export type Migracao = { tag: string; when: number; sql: string; hash: string };

const NOME_SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/;

/** Confere o nome do schema (ele entra no SQL entre aspas) e devolve já entre aspas. */
export function schemaEntreAspas(schema: string): string {
  if (!NOME_SCHEMA.test(schema)) throw new Error(`nome de schema inválido: ${JSON.stringify(schema)}`);
  return `"${schema}"`;
}

/** As migrações do journal, na ordem dele, com o SQL e o sha256 de cada arquivo (o mesmo hash do Drizzle). */
export function lerMigracoes(pasta: string): Migracao[] {
  const journal = JSON.parse(readFileSync(path.join(pasta, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  return journal.entries.map(({ tag, when }) => {
    const sql = readFileSync(path.join(pasta, `${tag}.sql`), "utf8");
    return { tag, when, sql, hash: createHash("sha256").update(sql).digest("hex") };
  });
}

/** Comandos de uma migração no schema: troca `"public".` por `"<schema>".` e divide em `--> statement-breakpoint`. */
export function comandosNoSchema(sql: string, schema: string): string[] {
  const alvo = `${schemaEntreAspas(schema)}.`;
  return sql
    .replaceAll('"public".', alvo)
    .split("--> statement-breakpoint")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Aplica as migrações pendentes no schema. Devolve as tags aplicadas agora (vazio = nada pendente). */
export async function migrarNoSchema(sql: postgres.Sql, schema: string, pasta = "./drizzle"): Promise<string[]> {
  const s = schemaEntreAspas(schema);
  const migracoes = lerMigracoes(pasta);
  const [{ existe }] = await sql<{ existe: boolean }[]>`select exists (select 1 from pg_namespace where nspname = ${schema}) as existe`;
  if (!existe) await sql.unsafe(`create schema ${s}`);
  await sql.unsafe(`create table if not exists ${s}."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)`);

  const aplicadas: string[] = [];
  for (const m of migracoes) {
    const aplicou = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`sobedesce:migracoes:${schema}`}))`;
      const [ultima] = await tx.unsafe<{ created_at: string | number | null }[]>(
        `select created_at from ${s}."__drizzle_migrations" order by created_at desc nulls last limit 1`,
      );
      if (ultima?.created_at != null && Number(ultima.created_at) >= m.when) return false;
      await tx.unsafe(`set local search_path to ${s}`);
      for (const comando of comandosNoSchema(m.sql, schema)) await tx.unsafe(comando);
      await tx.unsafe(`insert into ${s}."__drizzle_migrations" (hash, created_at) values ($1, $2)`, [m.hash, m.when]);
      return true;
    });
    if (aplicou) aplicadas.push(m.tag);
  }
  return aplicadas;
}

/**
 * O site consulta as tabelas sem o schema no nome: o papel do banco precisa ter `search_path = <schema>`
 * (ALTER ROLE sobedesce_app SET search_path = sobedesce). Confere numa conexão nova do pool; se não bater, o
 * build para antes de publicar um site que não acharia as tabelas.
 */
export async function conferirSchemaPadrao(sql: postgres.Sql, schema: string): Promise<void> {
  schemaEntreAspas(schema);
  const [{ atual }] = await sql<{ atual: string | null }[]>`select current_schema() as atual`;
  if (atual !== schema) {
    throw new Error(`o papel do banco usa o schema "${atual ?? "nenhum"}" por padrão, e não "${schema}": ajuste o search_path do papel`);
  }
}
