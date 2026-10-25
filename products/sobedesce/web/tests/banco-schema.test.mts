/**
 * Banco no Supabase da Absolute ZRO: escolha da variável (SOBEDESCE_DATABASE_URL antes do Neon), nome seguro do
 * banco, SOBEDESCE_DATABASE_SCHEMA e o migrador próprio com schema (src/lib/db/migrador.ts), compatível com o do Drizzle.
 * Roda num Postgres de verdade com TEST_DATABASE_URL; sem ela, em PGlite (tests/bancos-teste.mts).
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databaseCandidates, databaseConfig, databaseLabel, databaseSchema } from "../src/lib/db/config";
import { comandosNoSchema, conferirSchemaPadrao, lerMigracoes, migrarNoSchema } from "../src/lib/db/migrador";
import { abrirBancos, type Bancos } from "./bancos-teste.mjs";

const PASTA = fileURLToPath(new URL("../drizzle", import.meta.url));
const NEON = "postgres://neondb_owner:senha-neon@ep-cool-name-123456-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const SUPABASE = "postgres://sobedesce_app.abcdefghijklmnop:senha-supa@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

describe("qual banco o site usa", () => {
  test("SOBEDESCE_DATABASE_URL vem antes de DATABASE_URL e POSTGRES_URL", () => {
    assert.equal(databaseConfig({ SOBEDESCE_DATABASE_URL: SUPABASE, DATABASE_URL: NEON, POSTGRES_URL: NEON }).url, SUPABASE);
    assert.equal(databaseConfig({ DATABASE_URL: NEON, POSTGRES_URL: "postgres://outro" }).url, NEON);
    assert.equal(databaseConfig({ SOBEDESCE_DATABASE_URL: "", POSTGRES_URL: NEON }).url, NEON);
    assert.equal(databaseConfig({}).server, false, "sem nada: PGlite");
  });

  test("durante a virada, o Neon é só origem da cópia: um banco ligado, não dois", () => {
    const virada = databaseCandidates({ SOBEDESCE_DATABASE_URL: SUPABASE, DATABASE_URL: NEON, POSTGRES_URL: NEON.replace("-pooler", "") });
    assert.deepEqual(virada, [{ label: "abcdefghijklmnop (Supabase)", keys: ["SOBEDESCE_DATABASE_URL"] }]);
    const antes = databaseCandidates({ DATABASE_URL: NEON, POSTGRES_URL: NEON.replace("-pooler", "") });
    assert.deepEqual(antes, [{ label: "ep-cool-name-123456 (Neon, sa-east-1)", keys: ["DATABASE_URL", "POSTGRES_URL"] }]);
  });

  test("databaseLabel reconhece o pooler do Supabase e nunca mostra senha", () => {
    for (const [url, esperado] of [
      [SUPABASE, "abcdefghijklmnop (Supabase)"],
      ["postgres://postgres.abcdefghijklmnop:senha-supa@aws-1-sa-east-1.pooler.supabase.com:5432/postgres", "abcdefghijklmnop (Supabase)"],
      ["postgres://postgres:senha-supa@db.abcdefghijklmnop.supabase.co:5432/postgres", "abcdefghijklmnop (Supabase)"],
      [NEON, "ep-cool-name-123456 (Neon, sa-east-1)"],
    ]) {
      const label = databaseLabel(url);
      assert.equal(label, esperado);
      assert.doesNotMatch(label, /senha/);
    }
  });

  test("SOBEDESCE_DATABASE_SCHEMA: vazio = sem schema; nome fora do padrão = erro", () => {
    assert.equal(databaseSchema({}), null);
    assert.equal(databaseSchema({ SOBEDESCE_DATABASE_SCHEMA: " sobedesce " }), "sobedesce");
    for (const ruim of ["Sobedesce", 'x"; drop', "1abc", "a-b"]) assert.throws(() => databaseSchema({ SOBEDESCE_DATABASE_SCHEMA: ruim }));
  });
});

describe("migrações no formato do Drizzle", () => {
  test("mesmo hash e mesma ordem do migrador do Drizzle", () => {
    const nossas = lerMigracoes(PASTA);
    const doDrizzle = readMigrationFiles({ migrationsFolder: PASTA });
    assert.deepEqual(
      nossas.map((m) => [m.hash, m.when]),
      doDrizzle.map((m) => [m.hash, m.folderMillis]),
    );
  });

  test('"public". vira o schema e o SQL é dividido nos breakpoints', () => {
    const sql = readFileSync(path.join(PASTA, "0000_contas.sql"), "utf8");
    const comandos = comandosNoSchema(sql, "sobedesce");
    assert.ok(comandos.length > 5);
    assert.ok(comandos.every((c) => !c.includes('"public".') && !c.includes("statement-breakpoint")));
    assert.ok(comandos.some((c) => c.includes('REFERENCES "sobedesce"."usuarios"("id")')));
    assert.throws(() => comandosNoSchema(sql, 'x"'));
  });
});

describe("migrador com schema", () => {
  let bancos: Bancos;
  before(async () => {
    bancos = await abrirBancos();
  });
  after(async () => {
    await bancos.fechar();
  });

  test("aplica tudo no schema, registra como o Drizzle e não mexe no public", async () => {
    const sql = bancos.destino;
    const schema = bancos.novoSchema("mig");
    const migracoes = lerMigracoes(PASTA);
    const aplicadas = await migrarNoSchema(sql, schema, PASTA);
    assert.deepEqual(
      aplicadas,
      migracoes.map((m) => m.tag),
    );

    const registros = await sql.unsafe<{ hash: string; created_at: string }[]>(`select hash, created_at::text from "${schema}"."__drizzle_migrations" order by id`);
    assert.deepEqual(
      registros.map((r) => [r.hash, Number(r.created_at)]),
      migracoes.map((m) => [m.hash, m.when]),
    );

    const tabelas = await sql<{ nome: string }[]>`select table_name as nome from information_schema.tables where table_schema = ${schema}`;
    assert.ok(tabelas.some((t) => t.nome === "usuarios"));
    const noPublic = await sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usuarios'`;
    assert.equal(noPublic.length, 0, "nada no public");

    // As chaves estrangeiras apontam para o próprio schema.
    const fks = await sql<{ alvo: string }[]>`
      select distinct rn.nspname as alvo from pg_constraint k
      join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
      join pg_class r on r.oid = k.confrelid join pg_namespace rn on rn.oid = r.relnamespace
      where k.contype = 'f' and cn.nspname = ${schema}`;
    assert.deepEqual(
      fks.map((f) => f.alvo),
      [schema],
    );

    assert.deepEqual(await migrarNoSchema(sql, schema, PASTA), [], "de novo: nada pendente");
  });

  test("só aplica a migração nova; falha numa migração desfaz só ela", async () => {
    const sql = bancos.destino;
    const schema = bancos.novoSchema("mig");
    const pasta = mkdtempSync(path.join(tmpdir(), "sobedesce-mig-"));
    try {
      cpSync(PASTA, pasta, { recursive: true });
      await migrarNoSchema(sql, schema, pasta);

      const journal = JSON.parse(readFileSync(path.join(pasta, "meta", "_journal.json"), "utf8"));
      const ultima = journal.entries.at(-1);
      journal.entries.push({ ...ultima, idx: ultima.idx + 1, when: ultima.when + 1000, tag: "9998_nova" });
      journal.entries.push({ ...ultima, idx: ultima.idx + 2, when: ultima.when + 2000, tag: "9999_quebrada" });
      writeFileSync(path.join(pasta, "meta", "_journal.json"), JSON.stringify(journal));
      writeFileSync(
        path.join(pasta, "9998_nova.sql"),
        'CREATE TABLE "nova" ("id" text PRIMARY KEY, "usuario_id" text REFERENCES "public"."usuarios"("id"));',
      );
      writeFileSync(path.join(pasta, "9999_quebrada.sql"), 'CREATE TABLE "pela_metade" ("id" text);\n--> statement-breakpoint\nSELECT * FROM "nao_existe";');

      await assert.rejects(migrarNoSchema(sql, schema, pasta));
      const existentes = await sql<{ nome: string }[]>`
        select table_name as nome from information_schema.tables where table_schema = ${schema} and table_name in ('nova', 'pela_metade')`;
      assert.deepEqual(
        existentes.map((t) => t.nome),
        ["nova"],
        "a nova ficou; a quebrada não deixou nada",
      );
      const [{ n }] = await sql.unsafe<{ n: string }[]>(`select count(*)::text as n from "${schema}"."__drizzle_migrations"`);
      assert.equal(Number(n), journal.entries.length - 1);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  test("confere se o papel usa o schema por padrão", async () => {
    const sql = bancos.destino;
    const schema = bancos.novoSchema("mig");
    await migrarNoSchema(sql, schema, PASTA);
    await assert.rejects(conferirSchemaPadrao(sql, schema), /search_path/);
    await sql.unsafe(`set search_path to "${schema}"`);
    try {
      await conferirSchemaPadrao(sql, schema);
    } finally {
      await sql.unsafe("set search_path to public");
    }
  });
});
