/**
 * Semente sintética, opcional, só para desenvolvimento: uma organização "Demo" (zro_org_id inventado), uma pessoa
 * demo e a mesma produtora de exemplo do botão "Carregar demonstração" (src/lib/demo): 10 clientes, projetos DEMO-…,
 * cards nas 8 colunas e lotes em aprovação, tudo marcado como demonstração e removível. Nenhum dado real.
 * Uso: npm run db:seed:demo [-- <zro_org_id>]  (sem o id, usa um UUID fixo de demonstração)
 */
import { databaseUrl } from "../src/lib/db/config";
import { fecharBanco, getBanco, schema } from "../src/lib/db/client";
import { carregarDemonstracao } from "../src/lib/demo/demonstracao";

if (!databaseUrl()) {
  console.error("Defina MAESTRO_DATABASE_URL (ou DATABASE_URL). Veja .env.example.");
  process.exit(1);
}
const zroOrgId = process.argv[2] ?? "00000000-0000-4000-8000-00000000de30";
const SUB_DEMO = "00000000-0000-4000-8000-00000000de31";
const { organizations, members } = schema;

try {
  const orgId = await getBanco().asSystem("seed demo", async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ zroOrgId, name: "demo-Produtora Exemplo", zroProducts: ["maestro"] })
      .onConflictDoUpdate({ target: organizations.zroOrgId, set: { name: "demo-Produtora Exemplo" } })
      .returning({ id: organizations.id });
    await tx
      .insert(members)
      .values({ orgId: org.id, zroSub: SUB_DEMO, displayName: "demo-Pessoa", email: "demo@exemplo.invalid", hubRole: "owner", role: "admin" })
      .onConflictDoNothing();
    return org.id;
  });
  const r = await carregarDemonstracao({ sub: SUB_DEMO, orgId });
  if (!r.ok) throw new Error(r.mensagem);
  const c = r.contagem;
  console.log(
    r.criou
      ? `Semente demo: organização ${orgId} (zro_org_id ${zroOrgId}), ${c.clientes} clientes, ${c.projetos} projetos, ${c.cards} cards, ${c.lotes} lotes. Pessoa demo: ${SUB_DEMO} (só local).`
      : `A organização ${orgId} já tem a demonstração; nada mudou.`,
  );
} finally {
  await fecharBanco();
}
