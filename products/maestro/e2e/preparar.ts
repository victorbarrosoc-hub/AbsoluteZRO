/**
 * Antes do e2e: recria `maestro_test_e2e`, aplica as migrações, cria uma organização de teste com a pessoa admin e
 * uma sessão com acesso ao Maestro (claims como o login daria). O cookie vai para test-results/e2e-sessao.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { E2E_DB, E2E_KEY } from "../playwright.config";

export const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
export const ARQUIVO_SESSAO_DEMO = "test-results/e2e-sessao-demo.json";
export const ARQUIVO_SESSAO_COMERCIAL = "test-results/e2e-sessao-comercial.json";

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
  const { sql: q } = await import("drizzle-orm");
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
    // Uma terceira organização para o ciclo comercial (e2e/comercial.spec.ts): tabela de preços mínima e a marca.
    const SUB_COM = "00000000-0000-4000-8000-0000000000c2";
    const orgCom = await getBanco().asSystem("e2e: semente do comercial", async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ zroOrgId: "00000000-0000-4000-8000-0000000000c1", name: "Lumen Filmes E2E", zroProducts: ["maestro"] })
        .returning({ id: schema.organizations.id });
      await tx.insert(schema.members).values({ orgId: org.id, zroSub: SUB_COM, displayName: "Pessoa Comercial", hubRole: "owner", role: "admin" });
      const um = async (x: ReturnType<typeof q>) => ((await tx.execute(x)) as unknown as { id: string }[])[0].id;
      const diaria = await um(
        q`insert into maestro.precos_itens (org_id, grupo, nome, unidade, preco_cents, custo_cents) values (${org.id}, 'captacao', 'Diária de captação', 'diaria', 180000, 90000) returning id`,
      );
      const edicao = await um(
        q`insert into maestro.precos_itens (org_id, grupo, nome, unidade, preco_cents, custo_cents) values (${org.id}, 'pos', 'Edição de vídeo curto', 'video', 90000, 35000) returning id`,
      );
      await tx.execute(q`
        insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo, opcoes, ordem) values
          (${org.id}, 'nicho', 'Nicho', 'escolha', ${JSON.stringify([
            { valor: "corporativo", rotulo: "Corporativo", mult: 1 },
            { valor: "casamento", rotulo: "Casamento", mult: 1.3 },
          ])}::jsonb, 0),
          (${org.id}, 'videos', 'Vídeos', 'numero', '[]'::jsonb, 1),
          (${org.id}, 'diarias', 'Diárias', 'numero', '[]'::jsonb, 2)`);
      await tx.execute(q`
        insert into maestro.orcamento_modelos (org_id, nome, nicho, descricao, linhas, respostas) values (${org.id}, 'Filme institucional', 'corporativo',
          'Diárias, edição e cor.', ${JSON.stringify([
            { itemId: diaria, qtd: { var: "diarias", min: 1 } },
            { itemId: edicao, qtd: { var: "videos", min: 1 } },
          ])}::jsonb, ${JSON.stringify({ nicho: "corporativo", diarias: 1, videos: 1 })}::jsonb)`);
      await tx.execute(q`insert into maestro.org_marca (org_id, nome, cor, email) values (${org.id}, 'Lumen Filmes', '#0f7b5f', 'contato@exemplo.com')`);
      return org.id;
    });
    const com = await criarSessao({ orgId: orgCom, sub: SUB_COM, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    writeFileSync(ARQUIVO_SESSAO_COMERCIAL, JSON.stringify({ token: com.token }));
  } finally {
    await fecharBanco();
  }
}
