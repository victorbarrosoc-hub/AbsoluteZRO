/**
 * Semente sintética, opcional, só para desenvolvimento: uma organização "Demo" (zro_org_id inventado), dois clientes,
 * um projeto e seis cards, todos com prefixo `demo-` no nome ou no id, apagáveis depois. Nenhum dado real.
 * Uso: npm run db:seed:demo [-- <zro_org_id>]  (sem o id, usa um UUID fixo de demonstração)
 */
import { criarBanco, schema } from "../src/lib/db/client";
import { databaseUrl } from "../src/lib/db/config";
import { COLUNAS, novoId } from "../src/lib/quadro/metodo";
import { sql } from "drizzle-orm";

const url = databaseUrl();
if (!url) {
  console.error("Defina MAESTRO_DATABASE_URL (ou DATABASE_URL). Veja .env.example.");
  process.exit(1);
}
const zroOrgId = process.argv[2] ?? "00000000-0000-4000-8000-00000000de30";
const SUB_DEMO = "00000000-0000-4000-8000-00000000de31";
const banco = criarBanco(url, { max: 1 });
const { organizations, members, clients, projects } = schema;

try {
  const resultado = await banco.asSystem("seed demo", async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ zroOrgId, name: "demo-Agência Exemplo", zroProducts: ["maestro"] })
      .onConflictDoUpdate({ target: organizations.zroOrgId, set: { name: "demo-Agência Exemplo" } })
      .returning({ id: organizations.id });
    await tx
      .insert(members)
      .values({ orgId: org.id, zroSub: SUB_DEMO, displayName: "demo-Pessoa", email: "demo@exemplo.invalid", hubRole: "owner", role: "admin" })
      .onConflictDoNothing();
    const nomes = ["demo-Padaria Aurora", "demo-Studio Pilates Norte"];
    const ids: string[] = [];
    for (const name of nomes) {
      const [c] = await tx
        .insert(clients)
        .values({ orgId: org.id, name, segment: "demo", approver: { nome: "demo-Aprovador", whatsapp: "" }, createdBy: SUB_DEMO })
        .returning({ id: clients.id });
      ids.push(c.id);
    }
    await tx
      .insert(projects)
      .values({ orgId: org.id, clientId: ids[0], code: "MAE-2026-001", title: "demo-Campanha de inverno", linkStatus: "unlinked", createdBy: SUB_DEMO })
      .onConflictDoNothing();
    return { orgId: org.id, clientes: ids };
  });

  let n = 0;
  await banco.asUser({ sub: SUB_DEMO, orgId: resultado.orgId }, async (tx) => {
    for (const [i, col] of COLUNAS.entries()) {
      if (i >= 6) break;
      const dados = {
        tema: `demo-Card ${i + 1}: ${col.nome}`,
        coluna: col.k,
        cliente: resultado.clientes[i % 2],
        ordem: i,
        criadoEm: new Date().toISOString(),
      };
      await tx.execute(sql`select maestro.card_criar(${`demo-${novoId()}`}, ${JSON.stringify(dados)}::jsonb)`);
      n++;
    }
  });
  console.log(
    `Semente demo: organização ${resultado.orgId} (zro_org_id ${zroOrgId}), ${resultado.clientes.length} clientes, 1 projeto, ${n} cards. Pessoa demo: ${SUB_DEMO} (só local).`,
  );
} finally {
  await banco.close();
}
