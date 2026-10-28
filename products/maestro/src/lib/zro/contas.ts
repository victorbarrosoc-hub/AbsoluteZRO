/**
 * Entrar = entrar na organização. No callback do login, a organização da Absolute ZRO (claim zro_org) vira (ou
 * atualiza) uma organização do Maestro e a pessoa vira (ou atualiza) um membro dela, com o papel do HUB traduzido pela
 * tabela fixa de lib/papeis.ts. Uma conta Absolute ZRO por pessoa; nenhum cadastro próprio.
 */
import { getBanco, schema } from "@/lib/db/client";
import { papelDoHub, type Papel } from "@/lib/papeis";
import type { PerfilZro } from "./oidc";

const { organizations, members, auditLog } = schema;

export type Entrada = { orgId: string; orgNome: string; papel: Papel };

export async function entrarNaOrganizacao(perfil: PerfilZro, agora = new Date()): Promise<Entrada | null> {
  if (!perfil.org) return null;
  const org = perfil.org;
  const papel = papelDoHub(org.role);
  return getBanco().asSystem("login: organização e membro", async (tx) => {
    const [o] = await tx
      .insert(organizations)
      .values({ zroOrgId: org.id, name: org.name, zroProducts: perfil.produtos })
      .onConflictDoUpdate({ target: organizations.zroOrgId, set: { name: org.name, zroProducts: perfil.produtos } })
      .returning({ id: organizations.id, name: organizations.name });
    const pessoa = { displayName: perfil.nome, email: perfil.email, pictureUrl: perfil.foto, hubRole: org.role || null, role: papel, lastLoginAt: agora };
    await tx
      .insert(members)
      .values({ orgId: o.id, zroSub: perfil.sub, ...pessoa })
      .onConflictDoUpdate({ target: [members.orgId, members.zroSub], set: pessoa });
    await tx.insert(auditLog).values({
      orgId: o.id,
      actorSub: perfil.sub,
      action: "membro.entrou",
      targetType: "member",
      targetId: perfil.sub,
      metadata: { papel, hub_role: org.role || null, maestro: perfil.produtos.includes("maestro") },
    });
    return { orgId: o.id, orgNome: o.name, papel };
  });
}
