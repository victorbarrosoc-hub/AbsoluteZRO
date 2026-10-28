/**
 * Números do negócio no banco: uma leitura como a pessoa (`asUser`, RLS). Lançamentos, baixas e metas só aparecem
 * para administração e gestão (o banco esconde de qualquer jeito); as contas ficam em `formulas.ts`. Só dados reais:
 * sem lançamento, sem orçamento ou sem meta, o número aparece como "—". Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto } from "@/lib/db/client";
import { falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { ehMes, somarMeses } from "@/lib/dinheiro";
import { margem, mesesDoPeriodo, metaDoPeriodo, progressoMeta, taxa, ticketMedio, topo, type Periodo } from "./formulas";

export type LinhaMargem = { id: string; nome: string; apoio: string | null; entradas: number; saidas: number; margem: number | null };
export type Fatia = { nome: string; valor: number; outros?: true };
export type MesDaSerie = { mes: string; faturado: number; meta: number | null };

export type Numeros = {
  faturado: number;
  recebido: number;
  despesas: number;
  meta: number | null;
  progresso: number | null;
  /** A meta do mês de referência (para editar). */
  metaDoMes: number | null;
  ticket: number | null;
  aprovados: number;
  conversao: number | null;
  pedidos: number;
  pedidosConvertidos: number;
  ganhos: number;
  perdidos: number;
  taxaGanho: number | null;
  motivosPerda: Fatia[];
  projetos: LinhaMargem[];
  clientes: LinhaMargem[];
  nichos: Fatia[];
  serie: MesDaSerie[];
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function numerosDoNegocio(ctx: Contexto, p: Periodo): Promise<Numeros> {
  return getBanco().asUser(ctx, async (tx) => {
    const [d] = (await tx.execute(sql`
      select coalesce(sum(valor_cents) filter (where tipo = 'entrada'), 0)::float8 as faturado,
             coalesce(sum(valor_cents) filter (where tipo = 'saida'), 0)::float8 as despesas
        from maestro.lancamentos where vencimento between ${p.de}::date and ${p.ate}::date`)) as unknown as Record<string, number>[];
    const [rc] = (await tx.execute(sql`
      select coalesce(sum(b.valor_cents), 0)::float8 as recebido
        from maestro.baixas b join maestro.lancamentos l on l.org_id = b.org_id and l.id = b.lancamento_id
       where l.tipo = 'entrada' and b.data between ${p.de}::date and ${p.ate}::date`)) as unknown as Record<string, number>[];

    // Orçamentos aprovados no período (a versão aprovada de cada número): total = itens − desconto.
    const aprovados = (await tx.execute(sql`
      select q.id, coalesce(nullif(q.respostas ->> 'nicho', ''), nullif(q.categoria, ''), '') as nicho,
             greatest(0, coalesce((select sum(round(i.quantidade * i.preco_cents)) from maestro.orcamento_itens i where i.org_id = q.org_id and i.orcamento_id = q.id), 0) - q.desconto_cents)::float8 as total
        from maestro.orcamentos q
       where q.status = 'aprovado' and coalesce(q.decidido_em, q.updated_at)::date between ${p.de}::date and ${p.ate}::date`)) as unknown as {
      id: string;
      nicho: string;
      total: number;
    }[];

    const [pd] = (await tx.execute(sql`
      select count(*)::int as pedidos,
             count(*) filter (where exists (select 1 from maestro.orcamentos q where q.org_id = p.org_id and q.pedido_id = p.id and q.status = 'aprovado'))::int as convertidos
        from maestro.pedidos p where p.created_at::date between ${p.de}::date and ${p.ate}::date`)) as unknown as Record<string, number>[];
    const [fx] = (await tx.execute(sql`
      select count(*) filter (where etapa = 'ganho')::int as ganhos, count(*) filter (where etapa = 'perdido')::int as perdidos
        from maestro.pedidos where etapa in ('ganho', 'perdido') and etapa_em::date between ${p.de}::date and ${p.ate}::date`)) as unknown as Record<
      string,
      number
    >[];
    const motivos = (await tx.execute(sql`
      select coalesce(motivo_perda, 'Sem motivo') as nome, count(*)::float8 as valor
        from maestro.pedidos where etapa = 'perdido' and etapa_em::date between ${p.de}::date and ${p.ate}::date
       group by 1`)) as unknown as Fatia[];

    // Margem por projeto e por cliente: lançamentos do período ligados a eles (o cliente do lançamento ou o do projeto).
    const projetos = (await tx.execute(sql`
      select pr.id, pr.title as nome, pr.code as apoio,
             coalesce(sum(l.valor_cents) filter (where l.tipo = 'entrada'), 0)::float8 as entradas,
             coalesce(sum(l.valor_cents) filter (where l.tipo = 'saida'), 0)::float8 as saidas
        from maestro.lancamentos l join maestro.projects pr on pr.org_id = l.org_id and pr.id = l.projeto_id
       where l.vencimento between ${p.de}::date and ${p.ate}::date
       group by pr.id, pr.title, pr.code
       order by entradas desc, nome limit 12`)) as unknown as LinhaMargem[];
    const clientes = (await tx.execute(sql`
      select c.id, c.name as nome, null as apoio,
             coalesce(sum(l.valor_cents) filter (where l.tipo = 'entrada'), 0)::float8 as entradas,
             coalesce(sum(l.valor_cents) filter (where l.tipo = 'saida'), 0)::float8 as saidas
        from maestro.lancamentos l
        left join maestro.projects pr on pr.org_id = l.org_id and pr.id = l.projeto_id
        join maestro.clients c on c.org_id = l.org_id and c.id = coalesce(l.cliente_id, pr.client_id)
       where l.vencimento between ${p.de}::date and ${p.ate}::date
       group by c.id, c.name
       order by entradas desc, nome limit 8`)) as unknown as LinhaMargem[];

    // Rótulos do nicho, da tabela de preços (variável `nicho`).
    const [vn] = (await tx.execute(sql`select opcoes from maestro.precos_variaveis where chave = 'nicho' limit 1`)) as unknown as { opcoes: unknown }[];
    const rotulos = new Map<string, string>();
    if (Array.isArray(vn?.opcoes))
      for (const op of vn.opcoes as { valor?: string; rotulo?: string }[]) if (op?.valor) rotulos.set(op.valor, op.rotulo ?? op.valor);
    const porNicho = new Map<string, number>();
    for (const a of aprovados) {
      const nome = a.nicho ? (rotulos.get(a.nicho) ?? a.nicho) : "Sem nicho";
      porNicho.set(nome, (porNicho.get(nome) ?? 0) + n(a.total));
    }

    // Metas: as do período e as dos 6 meses da série.
    const ini = somarMeses(p.mes, -5);
    const metasLinhas = (await tx.execute(sql`
      select mes, receita_cents::float8 as v from maestro.metas where mes >= ${ini < p.de.slice(0, 7) ? ini : p.de.slice(0, 7)} and mes <= ${p.ate.slice(0, 7)}`)) as unknown as {
      mes: string;
      v: number;
    }[];
    const metas = Object.fromEntries(metasLinhas.map((m) => [m.mes, n(m.v)]));
    const serieLinhas = (await tx.execute(sql`
      select to_char(vencimento, 'YYYY-MM') as mes, sum(valor_cents)::float8 as v
        from maestro.lancamentos where tipo = 'entrada' and vencimento >= ${`${ini}-01`}::date and vencimento < ${`${somarMeses(p.mes, 1)}-01`}::date
       group by 1`)) as unknown as { mes: string; v: number }[];
    const serie: MesDaSerie[] = Array.from({ length: 6 }, (_, i) => {
      const mes = somarMeses(ini, i);
      return { mes, faturado: n(serieLinhas.find((x) => x.mes === mes)?.v), meta: metas[mes] ?? null };
    });

    const faturado = n(d?.faturado);
    const meta = metaDoPeriodo(metas, mesesDoPeriodo(p));
    const ganhos = n(fx?.ganhos);
    const perdidos = n(fx?.perdidos);
    const comMargem = (l: LinhaMargem): LinhaMargem => ({ ...l, entradas: n(l.entradas), saidas: n(l.saidas), margem: margem(n(l.entradas), n(l.saidas)) });
    return {
      faturado,
      recebido: n(rc?.recebido),
      despesas: n(d?.despesas),
      meta,
      progresso: progressoMeta(faturado, meta),
      metaDoMes: metas[p.mes] ?? null,
      ticket: ticketMedio(aprovados.map((a) => n(a.total))),
      aprovados: aprovados.length,
      conversao: taxa(n(pd?.convertidos), n(pd?.pedidos)),
      pedidos: n(pd?.pedidos),
      pedidosConvertidos: n(pd?.convertidos),
      ganhos,
      perdidos,
      taxaGanho: taxa(ganhos, ganhos + perdidos),
      motivosPerda: topo(
        motivos.map((m) => ({ nome: m.nome, valor: n(m.valor) })),
        4,
      ),
      projetos: projetos.map(comMargem),
      clientes: clientes.map(comMargem),
      nichos: topo(
        [...porNicho].map(([nome, valor]) => ({ nome, valor })),
        6,
      ),
      serie,
    };
  });
}

/** Grava (ou tira, com 0/null) a meta de faturamento do mês. Só administração e gestão (o banco confere). */
export async function salvarMeta(ctx: Contexto, mes: string, centavos: number | null, demo = false): Promise<Res> {
  if (!ehMes(mes)) return falha("formato", "Mês inválido.");
  if (centavos != null && (!Number.isInteger(centavos) || centavos < 0 || centavos > 100_000_000_000)) return falha("formato", "Valor fora do alcance.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      if (!centavos) {
        await tx.execute(sql`delete from maestro.metas where mes = ${mes}`);
        return { ok: true as const };
      }
      const r = await tx.execute(sql`
        insert into maestro.metas (org_id, mes, receita_cents, demo, created_by) values (${ctx.orgId}, ${mes}, ${centavos}, ${demo}, ${ctx.sub})
        on conflict (org_id, mes) do update set receita_cents = excluded.receita_cents returning id`);
      if (!r.length) return falha("sem_permissao", "Só administração e gestão mudam a meta.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'meta.salvar', 'meta', ${mes}, ${JSON.stringify({ centavos })}::jsonb)`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** A meta do mês e o faturado até agora (para o Hoje). null para quem não vê dinheiro ou sem meta. */
export async function metaDoMes(ctx: Contexto, mes: string): Promise<{ meta: number; faturado: number } | null> {
  return getBanco().asUser(ctx, async (tx) => {
    const [m] = (await tx.execute(sql`select receita_cents::float8 as v from maestro.metas where mes = ${mes}`)) as unknown as { v: number }[];
    if (!m) return null;
    const [f] = (await tx.execute(sql`
      select coalesce(sum(valor_cents), 0)::float8 as v from maestro.lancamentos
       where tipo = 'entrada' and to_char(vencimento, 'YYYY-MM') = ${mes}`)) as unknown as { v: number }[];
    return { meta: n(m.v), faturado: n(f?.v) };
  });
}
