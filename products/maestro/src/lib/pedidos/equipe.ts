/**
 * A equipe e os pedidos (plano v2 §6.2): o link de pedido da organização (Ajustes → Link de pedido: criar, trocar,
 * revogar e escolher as perguntas; só admin e gestão), a caixa Comercial → Pedidos e o "Gerar orçamento", que cria o
 * cliente como lead (se ainda não existe), roda o motor com o modelo e as respostas do pedido e abre o rascunho.
 * Sempre como a pessoa (`asUser`, RLS). Sem "server-only": os testes chamam direto.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { abrir, hashToken, novoToken, selar } from "@/lib/auth/cripto";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { hojeBr } from "@/lib/dinheiro";
import { criarOrcamentoNaTx } from "@/lib/orcamento/orcamentos";
import { lerTabela } from "@/lib/orcamento/precos";
import { lerConfig, rascunhoDoPedido, type ConfigPedido, type RespostasPedido, type StatusPedido } from "./formulario";

export const contextoTokenPublico = (id: string) => `links_publicos.token:${id}`;

async function auditar(tx: Tx, ctx: Contexto, acao: string, alvo: string, id: string, meta: Record<string, unknown> = {}) {
  await tx.execute(sql`
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (${ctx.orgId}, ${ctx.sub}, ${acao}, ${alvo}, ${id}, ${JSON.stringify(meta)}::jsonb)`);
}

/* ───────────── o link de pedido ───────────── */

export type LinkDePedido = { id: string; token: string | null; criadoEm: string; usos: number; usadoEm: string | null; config: ConfigPedido };

export async function lerLinkDePedido(ctx: Contexto): Promise<LinkDePedido | null> {
  return getBanco().asUser(ctx, async (tx) => {
    const [l] = (await tx.execute(sql`
      select id, token_enc, created_at, uses, last_used_at, config from maestro.links_publicos
       where tipo = 'pedido' and revogado_em is null limit 1`)) as unknown as Record<string, unknown>[];
    if (!l) return null;
    let token: string | null = null;
    try {
      token = l.token_enc ? abrir(l.token_enc as string, contextoTokenPublico(l.id as string)) : null;
    } catch {
      token = null;
    }
    return {
      id: l.id as string,
      token,
      criadoEm: new Date(l.created_at as string).toISOString(),
      usos: Number(l.uses),
      usadoEm: l.last_used_at ? new Date(l.last_used_at as string).toISOString() : null,
      config: lerConfig(l.config),
    };
  });
}

/** Cria o link (troca o anterior, mantendo as perguntas dele se `config` vier null). Só admin e gestão (o banco confere). */
export async function criarLinkDePedido(ctx: Contexto, config: ConfigPedido | null, demo = false): Promise<Res<{ token: string }>> {
  try {
    return await getBanco().asUser(ctx, (tx) => criarLinkDePedidoNaTx(tx, ctx, config, demo));
  } catch (e) {
    return traduzirPg(e);
  }
}

export async function criarLinkDePedidoNaTx(tx: Tx, ctx: Contexto, configDada: ConfigPedido | null, demo = false): Promise<Res<{ token: string }>> {
  const token = novoToken();
  const id = randomUUID();
  const [atual] = (await tx.execute(sql`select config from maestro.links_publicos where tipo = 'pedido' and revogado_em is null limit 1`)) as unknown as {
    config: unknown;
  }[];
  const config = configDada ?? lerConfig(atual?.config ?? {});
  await tx.execute(sql`update maestro.links_publicos set revogado_em = now(), revogado_por = ${ctx.sub} where tipo = 'pedido' and revogado_em is null`);
  await tx.execute(sql`
    insert into maestro.links_publicos (id, org_id, tipo, token_hash, token_enc, config, demo, created_by)
    values (${id}, ${ctx.orgId}, 'pedido', ${hashToken(token)}, ${selar(token, contextoTokenPublico(id))}, ${JSON.stringify(config)}::jsonb, ${demo}, ${ctx.sub})`);
  await auditar(tx, ctx, "pedido.link_criar", "link", id);
  return { ok: true as const, token };
}

export async function salvarConfigDoLink(ctx: Contexto, config: ConfigPedido): Promise<Res> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(
        sql`update maestro.links_publicos set config = ${JSON.stringify(config)}::jsonb where tipo = 'pedido' and revogado_em is null returning id`,
      );
      return r.length ? { ok: true as const } : falha("sem_link", "Crie o link primeiro (só administração e gestão).");
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

export async function revogarLinkDePedido(ctx: Contexto): Promise<Res> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(sql`
        update maestro.links_publicos set revogado_em = now(), revogado_por = ${ctx.sub} where tipo = 'pedido' and revogado_em is null returning id`)) as unknown as {
        id: string;
      }[];
      if (!r.length) return falha("sem_link", "Não há link ativo, ou seu papel não pode revogar.");
      await auditar(tx, ctx, "pedido.link_revogar", "link", r[0].id);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/* ───────────── a caixa de pedidos ───────────── */

export type PedidoLista = {
  id: string;
  protocolo: string;
  status: StatusPedido;
  nome: string;
  empresa: string | null;
  tipo: string | null;
  criadoEm: string;
  orcamentoId: string | null;
};

export async function listarPedidos(ctx: Contexto): Promise<PedidoLista[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select id, protocolo, status, nome, empresa, respostas ->> 'tipo' as tipo, created_at, orcamento_id
        from maestro.pedidos order by case status when 'novo' then 0 when 'em_orcamento' then 1 else 2 end, created_at desc limit 500`)) as unknown as Record<
      string,
      unknown
    >[];
    return r.map((p) => ({
      id: p.id as string,
      protocolo: p.protocolo as string,
      status: p.status as StatusPedido,
      nome: p.nome as string,
      empresa: p.empresa as string | null,
      tipo: p.tipo as string | null,
      criadoEm: new Date(p.created_at as string).toISOString(),
      orcamentoId: p.orcamento_id as string | null,
    }));
  });
}

export async function contarPedidosNovos(ctx: Contexto): Promise<number> {
  return getBanco().asUser(ctx, async (tx) => {
    const [r] = (await tx.execute(sql`select count(*)::int as n from maestro.pedidos where status = 'novo'`)) as unknown as { n: number }[];
    return Number(r?.n ?? 0);
  });
}

export type PedidoFicha = PedidoLista & {
  email: string | null;
  whatsapp: string | null;
  respostas: RespostasPedido;
  consentimentoEm: string;
  clienteId: string | null;
  clienteNome: string | null;
  orcamento: { id: string; numero: string; versao: number; status: string } | null;
  notas: string | null;
};

export async function obterPedido(ctx: Contexto, id: string): Promise<PedidoFicha | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [p] = (await tx.execute(sql`
      select p.*, c.name as cliente_nome, q.numero, q.versao, q.status as orc_status
        from maestro.pedidos p
        left join maestro.clients c on c.id = p.cliente_id
        left join maestro.orcamentos q on q.id = p.orcamento_id
       where p.id = ${id}`)) as unknown as Record<string, unknown>[];
    if (!p) return null;
    const r = (p.respostas ?? { vars: {} }) as RespostasPedido;
    return {
      id,
      protocolo: p.protocolo as string,
      status: p.status as StatusPedido,
      nome: p.nome as string,
      empresa: p.empresa as string | null,
      tipo: r.tipo ?? null,
      criadoEm: new Date(p.created_at as string).toISOString(),
      orcamentoId: p.orcamento_id as string | null,
      email: p.email as string | null,
      whatsapp: p.whatsapp as string | null,
      respostas: { ...r, vars: r.vars ?? {} },
      consentimentoEm: new Date(p.consentimento_em as string).toISOString(),
      clienteId: p.cliente_id as string | null,
      clienteNome: p.cliente_nome as string | null,
      orcamento: p.orcamento_id ? { id: p.orcamento_id as string, numero: p.numero as string, versao: Number(p.versao), status: p.orc_status as string } : null,
      notas: p.notas as string | null,
    };
  });
}

export async function mudarStatusPedido(ctx: Contexto, id: string, para: "novo" | "recusado"): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse pedido não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.pedidos set status = ${para} where id = ${id} and status in ('novo', 'recusado', 'em_orcamento') returning id`);
      if (!r.length) return falha("status", "Esse pedido já virou projeto, ou seu papel só lê.");
      await auditar(tx, ctx, `pedido.${para}`, "pedido", id);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** LGPD: apagar a pedido do titular dos dados (só administração e gestão). O orçamento, se houver, fica. */
export async function apagarPedido(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse pedido não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.pedidos where id = ${id} returning id`);
      if (!r.length) return falha("sem_permissao", "Só administração e gestão apagam pedidos.");
      await auditar(tx, ctx, "pedido.apagou", "pedido", id);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/**
 * "Gerar orçamento": o cliente (lead, se ainda não existe), o rascunho com as linhas do motor e o vínculo com o pedido.
 * Idempotente: pedido que já tem orçamento devolve o mesmo.
 */
export async function gerarOrcamentoDoPedido(ctx: Contexto, id: string, hoje = hojeBr()): Promise<Res<{ orcamentoId: string; novo: boolean }>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse pedido não existe.");
  try {
    return await getBanco().asUser(ctx, (tx) => gerarOrcamentoDoPedidoNaTx(tx, ctx, id, hoje));
  } catch (e) {
    return traduzirPg(e);
  }
}

/** O mesmo, dentro de uma transação já aberta como a pessoa (a demonstração usa). */
export async function gerarOrcamentoDoPedidoNaTx(tx: Tx, ctx: Contexto, id: string, hoje = hojeBr()): Promise<Res<{ orcamentoId: string; novo: boolean }>> {
  const [p] = (await tx.execute(sql`select * from maestro.pedidos where id = ${id} for update`)) as unknown as Record<string, unknown>[];
  if (!p) return falha("nao_existe", "Esse pedido não existe.");
  if (p.orcamento_id) return { ok: true as const, orcamentoId: p.orcamento_id as string, novo: false };
  let clienteId = p.cliente_id as string | null;
  if (!clienteId) {
    const whats = typeof p.whatsapp === "string" && /^[0-9]{8,15}$/.test(p.whatsapp) ? p.whatsapp : null;
    const [c] = (await tx.execute(sql`
      insert into maestro.clients (org_id, name, company, contact_name, email, whatsapp, status, notes, demo, created_by)
      values (${ctx.orgId}, ${(p.empresa as string | null) ?? (p.nome as string)}, ${p.empresa as string | null}, ${p.nome as string},
              ${p.email as string | null}, ${whats}, 'lead', ${`Chegou pelo pedido ${p.protocolo as string}.`}, ${p.demo as boolean}, ${ctx.sub})
      returning id`)) as unknown as { id: string }[];
    clienteId = c.id;
  }
  const tabela = await lerTabela(tx);
  const r = rascunhoDoPedido(
    {
      protocolo: p.protocolo as string,
      nome: p.nome as string,
      empresa: p.empresa as string | null,
      respostas: (p.respostas ?? { vars: {} }) as RespostasPedido,
    },
    tabela.modelos,
    tabela.variaveis,
  );
  const q = await criarOrcamentoNaTx(
    tx,
    ctx,
    {
      titulo: r.titulo,
      clienteId,
      projetoId: null,
      modeloId: r.modeloId,
      respostas: r.respostas,
      pedidoId: id,
      escopo: r.escopo,
      periodo: r.periodo,
      notasInternas: r.notasInternas,
      demo: p.demo as boolean,
    },
    hoje,
  );
  await tx.execute(sql`update maestro.pedidos set status = 'em_orcamento', cliente_id = ${clienteId}, orcamento_id = ${q.id} where id = ${id}`);
  await auditar(tx, ctx, "pedido.orcou", "pedido", id, { orcamento: q.numero, modelo: r.modeloId });
  return { ok: true as const, orcamentoId: q.id, novo: true };
}
