/**
 * "Hoje" (plano v2 §3 e fase 19): a visão do dia da produtora, só com contagens e atalhos para cada painel. Uma leitura
 * como a pessoa (`asUser`, RLS): a organização vem da sessão e o dinheiro só aparece para administração e gestão (o
 * banco esconde os lançamentos dos outros papéis; a tela nem pergunta). Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto } from "@/lib/db/client";
import { somarDias } from "@/lib/dinheiro";
import { listarRetornosNaTx, type Retorno } from "@/lib/funil/servidor";
import { FORA_DO_TRABALHO } from "@/lib/quadro/metodo";

export type EventoDoDia = { id: string; titulo: string; tipo: string; hora: string | null; local: string | null; projeto: string | null };

export type Dinheiro = {
  receberSemana: { n: number; valor: number };
  receberAtrasado: { n: number; valor: number };
  pagarSemana: { n: number; valor: number };
  pagarAtrasado: { n: number; valor: number };
  /** Recebido − pago, de tudo o que teve baixa. */
  caixa: number;
};

/** Um card que vence (prazo até amanhã) ou que está com o cliente. */
export type CardDoDia = { id: string; tema: string; cliente: string | null; prazo: string | null; coluna: string; cor: string | null; desde: string | null };

/** Um dia da semana no caixa: o que entrou e saiu de fato (baixas), em centavos. */
export type DiaDoCaixa = { dia: string; entrou: number; saiu: number };

export type ResumoDoDia = {
  hoje: string;
  agenda: { hoje: EventoDoDia[]; semana: number };
  cards: { vencemHoje: number; atrasados: number; meus: number };
  cliente: { lotes: number; pecas: number };
  pedidosNovos: number;
  orcamentos: { aguardando: number; comAjuste: number; valor: number };
  dinheiro: Dinheiro | null;
  /** Os cards que vencem até amanhã (os atrasados primeiro), no máximo 5. */
  vencendo: CardDoDia[];
  /** Peças em aprovação (com o cliente), as mais antigas primeiro, no máximo 4. */
  comCliente: CardDoDia[];
  /** Retornar hoje: pedidos abertos e clientes com o próximo contato vencido ou hoje. */
  retornos: Retorno[];
  /** Caixa da semana (segunda a domingo), só para quem vê dinheiro. */
  semana: DiaDoCaixa[] | null;
};

/** A segunda-feira da semana de `dia` (AAAA-MM-DD). */
export function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return somarDias(dia, -((d + 6) % 7));
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function resumoDoDia(ctx: Contexto, verDinheiro: boolean, hoje: string): Promise<ResumoDoDia> {
  const semana = somarDias(hoje, 7);
  return getBanco().asUser(ctx, async (tx) => {
    const eventos = (await tx.execute(sql`
      select e.id, e.titulo, e.tipo, to_char(e.hora_ini, 'HH24:MI') as hora, e.local, p.title as projeto
        from maestro.eventos e left join maestro.projects p on p.id = e.projeto_id
       where e.data <= ${hoje}::date and coalesce(e.data_fim, e.data) >= ${hoje}::date
       order by e.hora_ini nulls last, e.titulo limit 6`)) as unknown as EventoDoDia[];
    const [ag] = (await tx.execute(sql`
      select count(*)::int as n from maestro.eventos where data > ${hoje}::date and data <= ${semana}::date`)) as unknown as { n: number }[];
    const [cd] = (await tx.execute(sql`
      select count(*) filter (where left(prazo, 10) = ${hoje})::int as hoje,
             count(*) filter (where left(prazo, 10) < ${hoje})::int as atrasados,
             count(*) filter (where left(prazo, 10) <= ${hoje} and resp = ${ctx.sub})::int as meus
        from maestro.cards
       where apagado_em is null and prazo is not null and coluna is not null and coluna <> all (${`{${FORA_DO_TRABALHO.join(",")}}`}::text[])`)) as unknown as Record<
      string,
      number
    >[];
    const [cl] = (await tx.execute(sql`
      select count(distinct a.lote_id)::int as lotes,
             count(k.id) filter (where k.coluna = 'aprovacao')::int as pecas
        from maestro.approval_links a
        join maestro.lotes l on l.id = a.lote_id and l.deleted_at is null and l.status <> 'fechado'
        left join maestro.lote_cards lc on lc.lote_id = l.id
        left join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id and k.apagado_em is null
       where a.kind = 'lote' and a.revoked_at is null and a.expires_at > now()`)) as unknown as Record<string, number>[];
    const [pd] = (await tx.execute(sql`select count(*)::int as n from maestro.pedidos where status = 'novo'`)) as unknown as { n: number }[];
    const [oc] = (await tx.execute(sql`
      with ultima as (
        select distinct on (q.numero) q.id, q.status, q.validade, q.retorno, q.desconto_cents
          from maestro.orcamentos q order by q.numero, q.versao desc)
      select count(*)::int as n,
             count(*) filter (where u.retorno is not null)::int as ajuste,
             coalesce(sum(greatest(0, (select coalesce(sum(round(i.quantidade * i.preco_cents)), 0) from maestro.orcamento_itens i where i.orcamento_id = u.id)
                                        - u.desconto_cents)), 0)::float8 as valor
        from ultima u
       where u.status = 'enviado' and (u.validade is null or u.validade >= ${hoje}::date)`)) as unknown as Record<string, number>[];

    const amanha = somarDias(hoje, 1);
    const vencendo = (await tx.execute(sql`
      select k.id, coalesce(k.dados ->> 'tema', k.id) as tema, c.name as cliente, left(k.prazo, 10) as prazo, k.coluna, co.cor, null as desde
        from maestro.cards k left join maestro.clients c on c.org_id = k.org_id and c.id::text = k.cliente
        left join maestro.colunas co on co.org_id = k.org_id and co.id = k.coluna
       where k.apagado_em is null and k.prazo is not null and left(k.prazo, 10) <= ${amanha}
         and k.coluna is not null and k.coluna <> all (${`{${FORA_DO_TRABALHO.join(",")}}`}::text[])
       order by k.prazo, k.id limit 5`)) as unknown as CardDoDia[];
    const comCliente = (await tx.execute(sql`
      select k.id, coalesce(k.dados ->> 'tema', k.id) as tema, c.name as cliente, left(k.prazo, 10) as prazo, k.coluna, co.cor, k.updated_at::date::text as desde
        from maestro.cards k left join maestro.clients c on c.org_id = k.org_id and c.id::text = k.cliente
        left join maestro.colunas co on co.org_id = k.org_id and co.id = k.coluna
       where k.apagado_em is null and k.coluna = 'aprovacao'
       order by k.updated_at limit 4`)) as unknown as CardDoDia[];
    const retornos = await listarRetornosNaTx(tx, hoje, 8);

    let dinheiro: Dinheiro | null = null;
    let semanaCaixa: DiaDoCaixa[] | null = null;
    if (verDinheiro) {
      const [d] = (await tx.execute(sql`
        select count(*) filter (where tipo = 'entrada' and vencimento between ${hoje}::date and ${semana}::date)::int as rs_n,
               coalesce(sum(valor_cents - pago_cents) filter (where tipo = 'entrada' and vencimento between ${hoje}::date and ${semana}::date), 0)::float8 as rs_v,
               count(*) filter (where tipo = 'entrada' and vencimento < ${hoje}::date)::int as ra_n,
               coalesce(sum(valor_cents - pago_cents) filter (where tipo = 'entrada' and vencimento < ${hoje}::date), 0)::float8 as ra_v,
               count(*) filter (where tipo = 'saida' and vencimento between ${hoje}::date and ${semana}::date)::int as ps_n,
               coalesce(sum(valor_cents - pago_cents) filter (where tipo = 'saida' and vencimento between ${hoje}::date and ${semana}::date), 0)::float8 as ps_v,
               count(*) filter (where tipo = 'saida' and vencimento < ${hoje}::date)::int as pa_n,
               coalesce(sum(valor_cents - pago_cents) filter (where tipo = 'saida' and vencimento < ${hoje}::date), 0)::float8 as pa_v
          from maestro.lancamentos where pago_cents < valor_cents`)) as unknown as Record<string, number>[];
      const [c] = (await tx.execute(sql`
        select coalesce(sum(case when tipo = 'entrada' then pago_cents else -pago_cents end), 0)::float8 as caixa from maestro.lancamentos`)) as unknown as {
        caixa: number;
      }[];
      dinheiro = {
        receberSemana: { n: n(d.rs_n), valor: n(d.rs_v) },
        receberAtrasado: { n: n(d.ra_n), valor: n(d.ra_v) },
        pagarSemana: { n: n(d.ps_n), valor: n(d.ps_v) },
        pagarAtrasado: { n: n(d.pa_n), valor: n(d.pa_v) },
        caixa: n(c.caixa),
      };
      const seg = segundaDaSemana(hoje);
      const dias = (await tx.execute(sql`
        select b.data::text as dia,
               coalesce(sum(b.valor_cents) filter (where l.tipo = 'entrada'), 0)::float8 as entrou,
               coalesce(sum(b.valor_cents) filter (where l.tipo = 'saida'), 0)::float8 as saiu
          from maestro.baixas b join maestro.lancamentos l on l.org_id = b.org_id and l.id = b.lancamento_id
         where b.data between ${seg}::date and ${somarDias(seg, 6)}::date
         group by b.data`)) as unknown as DiaDoCaixa[];
      semanaCaixa = Array.from({ length: 7 }, (_, i) => {
        const dia = somarDias(seg, i);
        const d = dias.find((x) => x.dia === dia);
        return { dia, entrou: n(d?.entrou), saiu: n(d?.saiu) };
      });
    }
    return {
      hoje,
      agenda: { hoje: [...eventos], semana: n(ag?.n) },
      cards: { vencemHoje: n(cd?.hoje), atrasados: n(cd?.atrasados), meus: n(cd?.meus) },
      cliente: { lotes: n(cl?.lotes), pecas: n(cl?.pecas) },
      pedidosNovos: n(pd?.n),
      orcamentos: { aguardando: n(oc?.n), comAjuste: n(oc?.ajuste), valor: n(oc?.valor) },
      dinheiro,
      vencendo: [...vencendo],
      comCliente: [...comCliente],
      retornos,
      semana: semanaCaixa,
    };
  });
}
