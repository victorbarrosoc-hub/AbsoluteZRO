/**
 * As áreas sensíveis no servidor (src/lib/acessos.ts é a parte pura): lê do banco o que a pessoa da transação vê
 * (`maestro.pode`, a mesma função do RLS) e grava os ajustes da administração com auditoria. Ler pelo banco, e não
 * pela sessão, deixa cada consulta decidir sozinha (a Z, o .ics e os testes também passam por aqui).
 * Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { falha, ehUuid, traduzirPg, type Res } from "@/lib/crm/comum";
import { AREAS, PADRAO, ehArea, type Acessos, type Area } from "@/lib/acessos";
import type { Papel } from "@/lib/papeis";

/** O que a pessoa desta transação vê, área por área, pelo banco. */
export async function areasNaTx(tx: Tx, orgId: string): Promise<Acessos> {
  const [r] = (await tx.execute(sql`
    select ${sql.join(
      AREAS.map((a) => sql`maestro.pode(${orgId}::uuid, ${a}) as ${sql.identifier(a)}`),
      sql`, `,
    )}`)) as unknown as Record<Area, boolean>[];
  const out = {} as Record<Area, boolean>;
  for (const a of AREAS) out[a] = r?.[a] === true;
  return out;
}

export async function minhasAreas(ctx: Contexto): Promise<Acessos> {
  return getBanco().asUser(ctx, (tx) => areasNaTx(tx, ctx.orgId));
}

/**
 * Define as áreas de uma pessoa (Ajustes → Pessoas). Só a administração (o banco confere: política `acessos_*`);
 * administração não se ajusta (vê tudo sempre). Guarda só o que difere do padrão do papel; cada mudança vai para
 * `audit_log` (`acesso.areas`, com antes e depois).
 */
export async function salvarAreas(ctx: Contexto, sub: string, ligadas: readonly string[]): Promise<Res<{ acessos: Acessos }>> {
  if (!ehUuid(sub)) return falha("nao_existe", "Pessoa não encontrada.");
  const marcadas = new Set(ligadas.filter(ehArea));
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [eu] = (await tx.execute(sql`select maestro.has_role(${ctx.orgId}::uuid, array['admin']) as pode`)) as unknown as { pode: boolean }[];
      if (!eu?.pode) return falha("sem_permissao", "Só a administração muda o acesso.");
      const [m] = (await tx.execute(sql`select role from maestro.members where zro_sub = ${sub}`)) as unknown as { role: Papel }[];
      if (!m) return falha("nao_existe", "Pessoa não encontrada.");
      if (m.role === "admin") return falha("papel", "A administração vê tudo.");
      const antes = (await tx.execute(sql`select area, permitido from maestro.acessos where zro_sub = ${sub}`)) as unknown as {
        area: Area;
        permitido: boolean;
      }[];
      const base = PADRAO[m.role];
      const depois = {} as Record<Area, boolean>;
      for (const a of AREAS) depois[a] = marcadas.has(a);
      await tx.execute(sql`delete from maestro.acessos where zro_sub = ${sub}`);
      for (const a of AREAS)
        if (depois[a] !== base[a])
          await tx.execute(sql`
            insert into maestro.acessos (org_id, zro_sub, area, permitido, atualizado_por)
            values (${ctx.orgId}, ${sub}, ${a}, ${depois[a]}, ${ctx.sub})`);
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'acesso.areas', 'membro', ${sub},
                ${JSON.stringify({ papel: m.role, antes: Object.fromEntries(antes.map((x) => [x.area, x.permitido])), depois })}::jsonb)`);
      return { ok: true as const, acessos: depois };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Os ajustes guardados de cada pessoa da organização (a administração lê todos; cada um lê os seus). */
export async function ajustesDaOrganizacao(tx: Tx): Promise<Map<string, Partial<Record<Area, boolean>>>> {
  const r = (await tx.execute(sql`select zro_sub, area, permitido from maestro.acessos`)) as unknown as { zro_sub: string; area: Area; permitido: boolean }[];
  const out = new Map<string, Partial<Record<Area, boolean>>>();
  for (const x of r) out.set(x.zro_sub, { ...(out.get(x.zro_sub) ?? {}), [x.area]: x.permitido });
  return out;
}
