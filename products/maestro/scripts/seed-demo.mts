/**
 * Semente sintética, opcional, só para desenvolvimento: uma organização "Demo" (zro_org_id inventado), três clientes
 * (lead, ativo, pausado), dois projetos e cards espalhados pelas 8 colunas, todos com prefixo `demo-` no nome ou no id,
 * apagáveis depois. Nenhum dado real. Cards nascem pela função maestro.card_criar (como a equipe faria).
 * Uso: npm run db:seed:demo [-- <zro_org_id>]  (sem o id, usa um UUID fixo de demonstração)
 */
import { sql } from "drizzle-orm";
import { criarBanco, schema } from "../src/lib/db/client";
import { databaseUrl } from "../src/lib/db/config";
import { COLUNAS, iso } from "../src/lib/quadro/metodo";

const url = databaseUrl();
if (!url) {
  console.error("Defina MAESTRO_DATABASE_URL (ou DATABASE_URL). Veja .env.example.");
  process.exit(1);
}
const zroOrgId = process.argv[2] ?? "00000000-0000-4000-8000-00000000de30";
const SUB_DEMO = "00000000-0000-4000-8000-00000000de31";
const banco = criarBanco(url, { max: 1 });
const { organizations, members, clients, projects } = schema;
const dia = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

try {
  const r = await banco.asSystem("seed demo", async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ zroOrgId, name: "demo-Agência Exemplo", zroProducts: ["maestro"] })
      .onConflictDoUpdate({ target: organizations.zroOrgId, set: { name: "demo-Agência Exemplo" } })
      .returning({ id: organizations.id });
    await tx
      .insert(members)
      .values({ orgId: org.id, zroSub: SUB_DEMO, displayName: "demo-Pessoa", email: "demo@exemplo.invalid", hubRole: "owner", role: "admin" })
      .onConflictDoNothing();
    const ids: string[] = [];
    for (const [name, status] of [
      ["demo-Padaria Aurora", "ativo"],
      ["demo-Studio Pilates Norte", "lead"],
      ["demo-Café Bruma", "pausado"],
    ] as const) {
      const [c] = await tx
        .insert(clients)
        .values({ orgId: org.id, name, status, contactName: "demo-Contato", createdBy: SUB_DEMO })
        .returning({ id: clients.id });
      ids.push(c.id);
    }
    const ano = new Date().getFullYear();
    const [p] = await tx
      .insert(projects)
      .values({ orgId: org.id, clientId: ids[0], code: `MAE-${ano}-001`, title: "demo-Campanha de inverno", createdBy: SUB_DEMO })
      .onConflictDoNothing()
      .returning({ id: projects.id });
    return { orgId: org.id, clientes: ids, projeto: p?.id };
  });

  let n = 0;
  await banco.asUser({ sub: SUB_DEMO, orgId: r.orgId }, async (tx) => {
    for (const [i, col] of COLUNAS.entries()) {
      const dados: Record<string, unknown> = {
        tema: `Card de exemplo: ${col.nome}`,
        coluna: col.k,
        cliente: r.clientes[i % 2],
        ordem: i,
        prazo: dia(i - 2),
        ...(i % 3 === 0 ? { resp: SUB_DEMO } : {}),
        ...(i === 2 ? { prioridade: "alta" } : {}),
        ...(i < 4 && r.projeto ? { projeto: r.projeto } : {}),
        criadoEm: Date.now(),
        colunaEm: Date.now(),
        criadoPor: SUB_DEMO,
      };
      await tx.execute(sql`select maestro.card_criar(${`demo-${Date.now().toString(36)}${i}`}, ${JSON.stringify(dados)}::jsonb)`);
      n++;
    }
  });
  console.log(
    `Semente demo: organização ${r.orgId} (zro_org_id ${zroOrgId}), ${r.clientes.length} clientes, 1 projeto, ${n} cards. Pessoa demo: ${SUB_DEMO} (só local).`,
  );
} finally {
  await banco.close();
}
