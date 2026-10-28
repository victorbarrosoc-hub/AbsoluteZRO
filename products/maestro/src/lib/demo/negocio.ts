/**
 * Demonstração do negócio (estudo MakersHub §4): o funil dos pedidos de exemplo (uma etapa para cada um, valor
 * estimado, o motivo da perda), os retornos (um atrasado, um hoje, um amanhã e o de um lead), o histórico de contatos
 * e a meta de faturamento dos últimos seis meses. Só mexe no que é `demo`; completa sem duplicar (se já há contato de
 * exemplo, o funil está montado); "Remover demonstração" apaga metas e contatos de exemplo junto com os pedidos.
 */
import { sql } from "drizzle-orm";
import type { Contexto, Tx } from "@/lib/db/client";
import { somarDias, somarMeses } from "@/lib/dinheiro";

type Funil = { protocolo: string; etapa: string; valor?: number; retorno?: number; nota?: string; motivo?: string; contato?: string };

/** Por protocolo dos pedidos de exemplo (src/lib/demo/comercial.ts). Retorno em dias a partir de hoje. */
const FUNIL_DEMO: Funil[] = [
  { protocolo: "DEMO0001", etapa: "novo", valor: 900000, retorno: 0, nota: "Mandar portfólio de reels" },
  { protocolo: "DEMO0002", etapa: "conversa", valor: 2800000, retorno: -1, nota: "Confirmar a data do casamento", contato: "Falamos por WhatsApp" },
  { protocolo: "DEMO0003", etapa: "conversa", valor: 2200000, retorno: 3, nota: "Visita à clínica", contato: "Ligação de 15 min" },
  { protocolo: "DEMO0004", etapa: "negociando", retorno: 1, nota: "Ver se fecham 6 ou 8 reels", contato: "Pediu desconto no pacote" },
  { protocolo: "DEMO0006", etapa: "perdido", motivo: "Preço" },
];

export const METAS_DEMO = [3_800_000, 4_000_000, 4_200_000, 4_200_000, 4_500_000, 4_500_000];

export async function montarNegocio(tx: Tx, ctx: Contexto, hoje: string): Promise<number> {
  let n = 0;
  const [feito] = (await tx.execute(sql`select exists (select 1 from maestro.contatos where demo) as tem`)) as unknown as { tem: boolean }[];
  if (!feito.tem) {
    for (const f of FUNIL_DEMO) {
      const r = await tx.execute(sql`
        update maestro.pedidos
           set etapa = ${f.etapa}, motivo_perda = ${f.motivo ?? null}, valor_estimado_cents = ${f.valor ?? null},
               proximo_contato = ${f.retorno != null ? somarDias(hoje, f.retorno) : null}, proximo_nota = ${f.nota ?? null},
               ultimo_contato_em = ${f.contato ? `${somarDias(hoje, -2)}T15:00:00Z` : null}
         where demo and protocolo = ${f.protocolo} and etapa not in ('ganho') returning id`);
      const id = (r as unknown as { id: string }[])[0]?.id;
      if (!id) continue;
      n++;
      if (f.contato)
        await tx.execute(sql`
          insert into maestro.contatos (org_id, pedido_id, nota, feito_em, feito_por, demo)
          values (${ctx.orgId}, ${id}, ${f.contato}, ${`${somarDias(hoje, -2)}T15:00:00Z`}, ${ctx.sub}, true)`);
    }
    // Um lead (cliente) para retornar: o primeiro lead de exemplo.
    const [lead] = (await tx.execute(sql`
      select id from maestro.clients where demo and status = 'lead' and deleted_at is null order by name limit 1`)) as unknown as { id: string }[];
    if (lead) {
      await tx.execute(sql`
        update maestro.clients set proximo_contato = ${somarDias(hoje, 0)}, proximo_nota = 'Retomar a proposta de março' where id = ${lead.id}`);
      await tx.execute(sql`
        insert into maestro.contatos (org_id, cliente_id, nota, feito_em, feito_por, demo)
        values (${ctx.orgId}, ${lead.id}, 'Mandou mensagem pelo Instagram', ${`${somarDias(hoje, -6)}T12:00:00Z`}, ${ctx.sub}, true)`);
      n++;
    }
  }
  // Meta de faturamento: seis meses até o atual (só administração e gestão gravam; o banco confere).
  const [pode] = (await tx.execute(sql`select maestro.has_role(${ctx.orgId}::uuid, array['admin', 'gestor']) as ok`)) as unknown as { ok: boolean }[];
  if (pode?.ok) {
    const mes = hoje.slice(0, 7);
    for (const [i, v] of METAS_DEMO.entries()) {
      const m = somarMeses(mes, i - (METAS_DEMO.length - 1));
      const r = await tx.execute(sql`
        insert into maestro.metas (org_id, mes, receita_cents, demo, created_by) values (${ctx.orgId}, ${m}, ${v}, true, ${ctx.sub})
        on conflict (org_id, mes) do nothing returning id`);
      n += r.length;
    }
  }
  return n;
}
