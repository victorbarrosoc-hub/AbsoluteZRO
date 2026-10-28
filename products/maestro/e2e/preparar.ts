/**
 * Antes do e2e: recria `maestro_test_e2e`, aplica as migrações, cria uma organização de teste com a pessoa admin e
 * uma sessão com acesso ao Maestro (claims como o login daria). O cookie vai para test-results/e2e-sessao.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { E2E_DB, E2E_KEY } from "../playwright.config";

export const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
export const ARQUIVO_SESSAO_DEMO = "test-results/e2e-sessao-demo.json";

export default async function preparar() {
  const alvo = new URL(E2E_DB);
  const admin = new URL(E2E_DB);
  admin.pathname = "/postgres";
  const a = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    await a.unsafe("drop database if exists maestro_test_e2e with (force)");
    await a.unsafe("create database maestro_test_e2e");
  } finally {
    await a.end();
  }
  const sql = postgres(alvo.toString(), { max: 1, onnotice: () => {} });
  try {
    const { migrarNoSchema } = await import("../src/lib/db/migrador");
    await migrarNoSchema(sql, "./drizzle");
  } finally {
    await sql.end();
  }

  Object.assign(process.env, { MAESTRO_DATABASE_URL: E2E_DB, MAESTRO_KEY: E2E_KEY });
  const { getBanco, fecharBanco, schema } = await import("../src/lib/db/client");
  const { criarSessao } = await import("../src/lib/auth/sessao");
  const SUB = "00000000-0000-4000-8000-0000000000e2";
  try {
    const orgId = await getBanco().asSystem("e2e: semente", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000e1", name: "Produtora E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB, displayName: "Pessoa E2E", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const { token } = await criarSessao({ orgId, sub: SUB, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    mkdirSync("test-results", { recursive: true });
    writeFileSync(ARQUIVO_SESSAO, JSON.stringify({ token }));
    // Uma segunda organização só para a demonstração da produtora (e2e/produtora.spec.ts), sem mexer na de cima.
    const SUB_DEMO = "00000000-0000-4000-8000-0000000000d2";
    const orgDemo = await getBanco().asSystem("e2e: semente da demonstração", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000d1", name: "Produtora Demonstração E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_DEMO, displayName: "Pessoa Demo", hubRole: "owner", role: "admin" });
      return org.id;
    });
    const demo = await criarSessao({ orgId: orgDemo, sub: SUB_DEMO, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_DEMO, JSON.stringify({ token: demo.token }));
  } finally {
    await fecharBanco();
  }
}
