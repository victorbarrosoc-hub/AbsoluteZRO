/**
 * Semente comum dos testes da produtora: duas organizações (A e B) e uma pessoa por papel. Ana é admin na A, Gil é
 * gestor na A, Eva é equipe na A, Leo é leitura na A; Bia é admin na B. Use depois de prepararAmbiente().
 */
import { sql } from "drizzle-orm";
import { UUID } from "./ambiente.mts";

export async function duasOrganizacoes() {
  const { getBanco, schema } = await import("../src/lib/db/client");
  const ANA = UUID();
  const GIL = UUID();
  const EVA = UUID();
  const LEO = UUID();
  const BIA = UUID();
  const { orgA, orgB } = await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora A" }).returning({ id: schema.organizations.id });
    const [b] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora B" }).returning({ id: schema.organizations.id });
    await tx.insert(schema.members).values([
      { orgId: a.id, zroSub: ANA, role: "admin" },
      { orgId: a.id, zroSub: GIL, role: "gestor" },
      { orgId: a.id, zroSub: EVA, role: "equipe" },
      { orgId: a.id, zroSub: LEO, role: "leitura" },
      { orgId: b.id, zroSub: BIA, role: "admin" },
    ]);
    // A gestão não vê o Financeiro por padrão (drizzle/0027); nesta semente a Ana (administração) ligou para o Gil, como
    // uma produtora que confia o Financeiro à gestão. O padrão sem o ajuste está em tests/acessos.test.mts.
    await tx.execute(sql`
      insert into maestro.acessos (org_id, zro_sub, area, permitido, atualizado_por) values (${a.id}, ${GIL}, 'financeiro', true, ${ANA})`);
    return { orgA: a.id, orgB: b.id };
  });
  return {
    orgA,
    orgB,
    ANA,
    BIA,
    admin: { sub: ANA, orgId: orgA },
    gestor: { sub: GIL, orgId: orgA },
    equipe: { sub: EVA, orgId: orgA },
    leitura: { sub: LEO, orgId: orgA },
    b: { sub: BIA, orgId: orgB },
    /** Ana tentando a B (não é membro lá). */
    forjado: { sub: ANA, orgId: orgB },
  };
}
