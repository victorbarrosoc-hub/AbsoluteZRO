/**
 * O funil no banco (drizzle/0014): mover o pedido de etapa, valor estimado, próximo contato (pedido ou cliente),
 * "contato feito" com histórico e a lista "Retornar hoje". Sempre como a pessoa (`asUser`, RLS e acesso por cliente).
 * As regras puras estão em `regras.ts`; o gatilho do banco confere de novo. Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, mensagemPg, codigoPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { ehData, somarDias } from "@/lib/dinheiro";
import { podeMover, validarRetorno, type Etapa } from "./regras";

export type Alvo = "pedido" | "cliente";

async function auditar(tx: Tx, ctx: Contexto, acao: string, alvo: string, id: string, meta: Record<string, unknown> = {}) {
  await tx.execute(sql`
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (${ctx.orgId}, ${ctx.sub}, ${acao}, ${alvo}, ${id}, ${JSON.stringify(meta)}::jsonb)`);
}

function traduzir(e: unknown): Res {
  if (codigoPg(e) === PG.regra) {
    const m = mensagemPg(e);
    if (m.includes("ganho_sem_aceite")) return falha("ganho_sem_aceite", "Ganho só com o orçamento aprovado.");
    if (m.includes("ganho_final")) return falha("ganho_final", "Pedido ganho não volta.");
  }
  return traduzirPg(e);
}

/** Move o pedido de etapa. "Perdido" pede o motivo; "Ganho" só com o orçamento aprovado. */
export async function moverEtapa(ctx: Contexto, id: string, para: unknown, motivo?: string | null): Promise<Res<{ etapa: Etapa }>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse pedido não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [p] = (await tx.execute(sql`
        select p.etapa, coalesce(q.status = 'aprovado', false) as aprovado
          from maestro.pedidos p left join maestro.orcamentos q on q.org_id = p.org_id and q.id = p.orcamento_id
         where p.id = ${id} for update of p`)) as unknown as { etapa: Etapa; aprovado: boolean }[];
      if (!p) return falha("nao_existe", "Esse pedido não existe.");
      const t = podeMover(p.etapa, para, { orcamentoAprovado: p.aprovado, motivo });
      if (!t.ok) return falha(t.erro, t.mensagem);
      const etapa = para as Etapa;
      const r = await tx.execute(sql`
        update maestro.pedidos set etapa = ${etapa}, motivo_perda = ${etapa === "perdido" ? (motivo ?? "").trim() : null}
         where id = ${id} returning id`);
      if (!r.length) return falha("sem_permissao", "Seu papel nesta organização só lê.");
      await auditar(tx, ctx, "pedido.etapa", "pedido", id, { de: p.etapa, para: etapa });
      return { ok: true as const, etapa };
    });
  } catch (e) {
    return traduzir(e) as Res<{ etapa: Etapa }>;
  }
}

export async function salvarValorEstimado(ctx: Contexto, id: string, centavos: number | null): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse pedido não existe.");
  if (centavos != null && (!Number.isInteger(centavos) || centavos < 0 || centavos > 100_000_000_000)) return falha("formato", "Valor fora do alcance.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`update maestro.pedidos set valor_estimado_cents = ${centavos} where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("nao_existe", "Esse pedido não existe, ou seu papel só lê.");
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

const tabela = (a: Alvo) => (a === "pedido" ? sql.raw("maestro.pedidos") : sql.raw("maestro.clients"));

/** Marca (ou troca) o próximo contato. `data` null tira. */
export async function agendarRetorno(ctx: Contexto, alvo: Alvo, id: string, dataV: unknown, notaV: unknown): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Não encontrado.");
  let data: string | null = null;
  let nota: string | null = null;
  if (dataV !== null && dataV !== "") {
    const v = validarRetorno(dataV, notaV);
    if (!v.ok) return falha("formato", v.mensagem);
    data = v.data;
    nota = v.nota;
  }
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update ${tabela(alvo)} set proximo_contato = ${data}, proximo_nota = ${nota}
         where id = ${id} ${alvo === "pedido" ? sql`and etapa not in ('ganho', 'perdido')` : sql`and deleted_at is null`} returning id`);
      if (!r.length) return falha("nao_existe", "Não dá para marcar retorno aqui (fechado, sumiu ou seu papel só lê).");
      await auditar(tx, ctx, `${alvo}.retorno`, alvo, id, { data });
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/**
 * "Contato feito": registra no histórico, marca a hora do último contato e tira o retorno (ou já marca o próximo,
 * se `proximo` vier). Um pedido "Novo" passa a "Em conversa".
 */
export async function contatoFeito(ctx: Contexto, alvo: Alvo, id: string, o: { nota?: string | null; proximo?: string | null } = {}): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Não encontrado.");
  const nota = (o.nota ?? "").trim().slice(0, 500) || null;
  const proximo = o.proximo && ehData(o.proximo) ? o.proximo : null;
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(sql`
        update ${tabela(alvo)} set ultimo_contato_em = now(), proximo_contato = ${proximo}, proximo_nota = ${proximo ? nota : null}
         where id = ${id} ${alvo === "cliente" ? sql`and deleted_at is null` : sql``} returning id`)) as unknown as { id: string }[];
      if (!r.length) return falha("nao_existe", "Não encontrado, ou seu papel só lê.");
      if (alvo === "pedido") await tx.execute(sql`update maestro.pedidos set etapa = 'conversa' where id = ${id} and etapa = 'novo'`);
      await tx.execute(sql`
        insert into maestro.contatos (org_id, pedido_id, cliente_id, nota, feito_por, demo)
        select ${ctx.orgId}, ${alvo === "pedido" ? id : null}, ${alvo === "cliente" ? id : null}, ${nota}, ${ctx.sub},
               coalesce((select demo from ${tabela(alvo)} where id = ${id}), false)`);
      await auditar(tx, ctx, `${alvo}.contato`, alvo, id);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Reagendar para daqui a `dias` (a partir de hoje), mantendo a nota. */
export async function reagendar(ctx: Contexto, alvo: Alvo, id: string, dias: number, hoje: string): Promise<Res> {
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) return falha("formato", "Escolha entre 1 e 90 dias.");
  if (!ehUuid(id)) return falha("nao_existe", "Não encontrado.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update ${tabela(alvo)} set proximo_contato = ${somarDias(hoje, dias)} where id = ${id} and proximo_contato is not null returning id`);
      return r.length ? { ok: true as const } : falha("nao_existe", "Não encontrado, ou seu papel só lê.");
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

export type Retorno = {
  alvo: Alvo;
  id: string;
  nome: string;
  apoio: string | null;
  data: string;
  nota: string | null;
  etapa: Etapa | null;
};

/** Os retornos até `ate` (inclusive), os atrasados primeiro: pedidos abertos e clientes. */
export async function listarRetornos(ctx: Contexto, ate: string, limite = 50): Promise<Retorno[]> {
  return getBanco().asUser(ctx, (tx) => listarRetornosNaTx(tx, ate, limite));
}

export async function listarRetornosNaTx(tx: Tx, ate: string, limite = 50): Promise<Retorno[]> {
  const r = (await tx.execute(sql`
    select * from (
      select 'pedido' as alvo, p.id, coalesce(p.empresa, p.nome) as nome, p.respostas ->> 'tipo' as apoio,
             p.proximo_contato::text as data, p.proximo_nota as nota, p.etapa
        from maestro.pedidos p
       where p.proximo_contato is not null and p.proximo_contato <= ${ate}::date and p.etapa not in ('ganho', 'perdido')
      union all
      select 'cliente', c.id, c.name, c.contact_name, c.proximo_contato::text, c.proximo_nota, null
        from maestro.clients c
       where c.proximo_contato is not null and c.proximo_contato <= ${ate}::date and c.deleted_at is null
    ) x order by data, nome limit ${limite}`)) as unknown as Record<string, unknown>[];
  return r.map((x) => ({
    alvo: x.alvo as Alvo,
    id: x.id as string,
    nome: x.nome as string,
    apoio: (x.apoio as string | null) ?? null,
    data: x.data as string,
    nota: (x.nota as string | null) ?? null,
    etapa: (x.etapa as Etapa | null) ?? null,
  }));
}

export type ContatoFeito = { id: string; em: string; nota: string | null; por: string | null };

export async function historicoDeContatos(ctx: Contexto, alvo: Alvo, id: string): Promise<ContatoFeito[]> {
  if (!ehUuid(id)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select k.id, k.feito_em, k.nota, coalesce(m.display_name, m.email) as por
        from maestro.contatos k left join maestro.members m on m.org_id = k.org_id and m.zro_sub = k.feito_por
       where ${alvo === "pedido" ? sql`k.pedido_id = ${id}` : sql`k.cliente_id = ${id}`}
       order by k.feito_em desc limit 20`)) as unknown as Record<string, unknown>[];
    return r.map((k) => ({ id: k.id as string, em: new Date(k.feito_em as string).toISOString(), nota: k.nota as string | null, por: k.por as string | null }));
  });
}
