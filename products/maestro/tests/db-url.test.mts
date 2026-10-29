// Endereço do banco em execução: pooler do Supabase em modo sessão (5432) vira modo transação (6543); o resto fica.
import assert from "node:assert/strict";
import { test } from "node:test";
import { urlDeExecucao } from "../src/lib/db/config";

test("pooler do Supabase na 5432 vai para a 6543, com o mesmo usuário e senha", () => {
  const u = new URL(urlDeExecucao("postgresql://maestro.ref:s3nha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"));
  assert.equal(u.port, "6543");
  assert.equal(u.username, "maestro.ref");
  assert.equal(u.password, "s3nha");
  assert.equal(u.searchParams.get("sslmode"), "require");
});

test("transação, banco local e endereço inválido ficam como estão", () => {
  const t = "postgresql://maestro.ref:x@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
  assert.equal(urlDeExecucao(t), t);
  const local = "postgres://postgres:postgres@localhost:5432/maestro";
  assert.equal(urlDeExecucao(local), local);
  assert.equal(urlDeExecucao("isso não é url"), "isso não é url");
});
