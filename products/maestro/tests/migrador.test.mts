// Migrador (src/lib/db/migrador.ts): buraco na numeração e migração que entra na main DEPOIS de uma de número maior
// (frentes em paralelo: a 0030 da Criação antes da 0027 de outra frente) rodam uma vez cada; rodar de novo não refaz
// nada; `when` repetido no journal para o deploy.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { migrarNoSchema } from "../src/lib/db/migrador";

const BASE = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres";
type Entrada = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };

test("migração atrasada (when menor que a última aplicada) roda uma vez; when repetido para", async () => {
  const u = new URL(BASE);
  u.pathname = "/postgres";
  const admin = postgres(u.toString(), { max: 1, onnotice: () => {} });
  const db = `maestro_test_migrador${process.env.TEST_DB_SUFIXO ? `_${process.env.TEST_DB_SUFIXO.replace(/[^a-z0-9_]/g, "").slice(0, 12)}` : ""}`;
  await admin.unsafe(`drop database if exists ${db} with (force)`);
  await admin.unsafe(`create database ${db}`);
  await admin.end();
  u.pathname = `/${db}`;
  const banco = postgres(u.toString(), { max: 1, onnotice: () => {} });
  const pasta = mkdtempSync(path.join(tmpdir(), "maestro-migrador-"));
  try {
    cpSync("./drizzle", pasta, { recursive: true });
    const arquivo = path.join(pasta, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(arquivo, "utf8")) as { entries: Entrada[] };
    const todas = await migrarNoSchema(banco, pasta);
    assert.ok(todas.includes("0030_roteiros"));

    // outra frente entra depois com uma migração de número (e when) menor que a 0030
    const ultima = journal.entries.find((e) => e.tag === "0030_roteiros")!;
    writeFileSync(path.join(pasta, "0027_atrasada.sql"), "create table maestro.migracao_atrasada (id integer primary key);\n");
    const usados = new Set(journal.entries.map((e) => e.when));
    let when = ultima.when - 3_600_000;
    while (usados.has(when)) when -= 3_600_000;
    const atrasada: Entrada = { idx: 27, version: "7", when, tag: "0027_atrasada", breakpoints: false };
    writeFileSync(arquivo, JSON.stringify({ ...journal, entries: [...journal.entries, atrasada] }));
    assert.deepEqual(await migrarNoSchema(banco, pasta), ["0027_atrasada"]);
    const [{ existe }] = await banco`select to_regclass('maestro.migracao_atrasada') is not null as existe`;
    assert.equal(existe, true);
    assert.deepEqual(await migrarNoSchema(banco, pasta), [], "nada roda duas vezes");

    writeFileSync(arquivo, JSON.stringify({ ...journal, entries: [...journal.entries, atrasada, { ...atrasada, tag: "0028_mesmo_when" }] }));
    writeFileSync(path.join(pasta, "0028_mesmo_when.sql"), "select 1;\n");
    await assert.rejects(migrarNoSchema(banco, pasta), /when.*repetido/);
  } finally {
    await banco.end();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("o journal da main não repete when nem tag", () => {
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as { entries: Entrada[] };
  for (const k of ["when", "tag"] as const) {
    const v = journal.entries.map((e) => e[k]);
    assert.equal(new Set(v).size, v.length, k);
  }
});
