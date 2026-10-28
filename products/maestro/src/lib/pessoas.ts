/**
 * Ajustes → Pessoas: quem é da organização (as contas Absolute ZRO que já entraram; o papel vem do HUB a cada login,
 * src/lib/papeis.ts) e o acesso por cliente (drizzle/0018). Administração e gestão restringem quem é da equipe ou só
 * lê a alguns clientes; a regra vale no banco (políticas restritivas), não só aqui. O Maestro não tem cadastro de
 * usuário: não dá para "convidar" por aqui (quem convida é a Absolute ZRO). Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import type { Papel } from "@/lib/papeis";

export type Pessoa = {
  sub: string;
  nome: string | null;
  email: string | null;
  foto: string | null;
  papel: Papel;
  ativo: boolean;
  ultimoLogin: string | null;
  /** Só para equipe e leitura: restrita a alguns clientes? */
  restrito: boolean;
  clientes: string[];
};

/** Papéis que podem ser restritos (admin e gestão sempre veem tudo). */
export const PODE_RESTRINGIR: readonly Papel[] = ["equipe", "leitura"];

export async function listarPessoas(ctx: Contexto): Promise<Pessoa[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select m.zro_sub, m.display_name, m.email, m.picture_url, m.role, m.status, m.last_login_at,
             exists (select 1 from maestro.acesso_restrito r where r.org_id = m.org_id and r.zro_sub = m.zro_sub) as restrito,
             coalesce((select array_agg(a.cliente_id::text order by a.cliente_id) from maestro.acesso_clientes a
                        where a.org_id = m.org_id and a.zro_sub = m.zro_sub), '{}') as clientes
        from maestro.members m
       order by case m.role when 'admin' then 0 when 'gestor' then 1 when 'equipe' then 2 else 3 end, lower(coalesce(m.display_name, m.email, ''))`)) as unknown as Record<
      string,
      unknown
    >[];
    return r.map((m) => ({
      sub: m.zro_sub as string,
      nome: (m.display_name as string | null) ?? null,
      email: (m.email as string | null) ?? null,
      foto: (m.picture_url as string | null) ?? null,
      papel: m.role as Papel,
      ativo: m.status === "active",
      ultimoLogin: m.last_login_at ? new Date(m.last_login_at as string).toISOString() : null,
      restrito: Boolean(m.restrito) && PODE_RESTRINGIR.includes(m.role as Papel),
      clientes: (m.clientes as string[]) ?? [],
    }));
  });
}

/** O alcance da própria pessoa (para a tela avisar "você vê só alguns clientes"). */
export async function meuAlcance(ctx: Contexto): Promise<{ restrito: boolean; clientes: number }> {
  return getBanco().asUser(ctx, async (tx) => {
    const [r] = (await tx.execute(sql`
      select maestro.restrito(${ctx.orgId}::uuid) as restrito,
             (select count(*)::int from maestro.acesso_clientes where zro_sub = ${ctx.sub}) as n`)) as unknown as { restrito: boolean; n: number }[];
    return { restrito: Boolean(r?.restrito), clientes: Number(r?.n ?? 0) };
  });
}

/**
 * Define o acesso de uma pessoa: `restrito` false libera tudo; true restringe aos `clientes` (vazio = nenhum). Só
 * administração e gestão (o banco confere); admin e gestão não se restringem.
 */
export async function salvarAcesso(ctx: Contexto, sub: string, restrito: boolean, clientes: string[]): Promise<Res> {
  if (!ehUuid(sub)) return falha("nao_existe", "Pessoa não encontrada.");
  const ids = [...new Set(clientes)].filter(ehUuid).slice(0, 500);
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [eu] = (await tx.execute(sql`select maestro.has_role(${ctx.orgId}::uuid, array['admin', 'gestor']) as pode`)) as unknown as { pode: boolean }[];
      if (!eu?.pode) return falha("sem_permissao", "Só administração e gestão mudam o acesso.");
      const [m] = (await tx.execute(sql`select role from maestro.members where zro_sub = ${sub}`)) as unknown as { role: Papel }[];
      if (!m) return falha("nao_existe", "Pessoa não encontrada.");
      if (!PODE_RESTRINGIR.includes(m.role)) return falha("papel", "Administração e gestão sempre veem todos os clientes.");
      await tx.execute(sql`delete from maestro.acesso_clientes where zro_sub = ${sub}`);
      if (!restrito) {
        await tx.execute(sql`delete from maestro.acesso_restrito where zro_sub = ${sub}`);
      } else {
        await tx.execute(sql`
          insert into maestro.acesso_restrito (org_id, zro_sub, criado_por) values (${ctx.orgId}, ${sub}, ${ctx.sub})
          on conflict (org_id, zro_sub) do nothing`);
        for (const c of ids)
          await tx.execute(sql`
            insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id, criado_por)
            select ${ctx.orgId}, ${sub}, c.id, ${ctx.sub} from maestro.clients c where c.id = ${c} and c.deleted_at is null
            on conflict do nothing`);
      }
      // Quem não pode mudar não apaga nem grava (RLS): confere que ficou como pedido.
      const [ok] = (await tx.execute(sql`
        select exists (select 1 from maestro.acesso_restrito where zro_sub = ${sub}) as r`)) as unknown as { r: boolean }[];
      if (Boolean(ok?.r) !== restrito) return falha("sem_permissao", "Só administração e gestão mudam o acesso.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'acesso.clientes', 'membro', ${sub}, ${JSON.stringify({ restrito, clientes: ids.length })}::jsonb)`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
