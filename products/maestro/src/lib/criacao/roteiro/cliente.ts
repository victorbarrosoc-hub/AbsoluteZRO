/**
 * "Para o cliente aprovar" (plano da Criação §4.6, fase F7; decisão do titular nº 4): o roteiro vira mais uma peça do
 * link de aprovação do CARD (`/a/<token>`, drizzle/0005 + 0033). Sempre como a pessoa (`asUser`, RLS); papel no banco
 * (`maestro.roteiro_para_cliente` exige `pode_criacao(…, 'enviar')`: administração e gestão; lote e link pelas
 * políticas de sempre). Nada de segundo sistema: lote, link, PIN, validade e a decisão uma vez por peça são os mesmos.
 *
 * - `paraOClienteEstado`: o que a folha precisa antes de mandar (card, a versão que já está com o cliente, o lote e o
 *   cliente do card).
 * - `enviarAoCliente`: a versão n vira a versão mais nova do card; se o card ainda não está num lote aberto, nasce um
 *   lote do cliente do card com ele; sem link ativo, o link nasce (30 dias, sem PIN; o PIN e a validade continuam no
 *   lote). Tudo numa transação. Devolve o token para a tela copiar.
 * - `clienteDoRoteiro`: os comentários do cliente (por bloco e versão) e as decisões, para o editor.
 * - `resolverDoRoteiro`: resolve ou reabre um comentário do roteiro (o texto nunca muda).
 */
import { sql } from "drizzle-orm";
import { getBanco, mensagemPg, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Falha, type Res } from "@/lib/crm/comum";
import { gerarLinkNaTx, resolverComentario, tokenDoLinkNaTx } from "@/lib/revisao/equipe";

export type ComentarioDoRoteiro = {
  id: string;
  /** O bloco comentado (id estável do bloco; null = o roteiro inteiro). */
  bloco: string | null;
  pai: string | null;
  autor: "cliente" | "equipe";
  nome: string;
  texto: string;
  resolvido: boolean;
  em: string;
  /** A versão do roteiro em que o comentário foi feito (v2). */
  n: number;
};

export type DecisaoDoRoteiro = { n: number; decisao: "aprovado" | "ajuste"; nome: string | null; nota: string | null; em: string };

export type ClienteDoRoteiro = { comentarios: ComentarioDoRoteiro[]; decisoes: DecisaoDoRoteiro[] };

export type EstadoParaCliente = {
  card: { id: string; tema: string } | null;
  /** A versão do roteiro que está no card agora (a última mandada), ou null. */
  enviada: number | null;
  lote: { id: string; titulo: string; link: boolean } | null;
  /** O cliente do card (quando é um cliente vivo da organização). */
  cliente: { id: string; nome: string } | null;
  /** Para escolher, só quando não há lote e o card não tem cliente. */
  clientes: { id: string; nome: string }[];
};

function traduzir(e: unknown): Falha {
  const m = mensagemPg(e);
  if (m === "roteiro:nao_existe") return falha("nao_existe", "Esse roteiro não existe mais.");
  if (m === "roteiro:sem_card") return falha("sem_card", "Ligue o roteiro a um card antes.");
  if (m === "roteiro:sem_versao") return falha("nao_existe", "Essa versão não existe.");
  if (/mandam o roteiro ao cliente/.test(m)) return falha("sem_permissao", "Só administração e gestão mandam o roteiro ao cliente.");
  return traduzirPg(e);
}

type Base = { cardId: string | null; tema: string | null; cliente: string | null; titulo: string };

async function base(tx: Tx, roteiroId: string): Promise<Base | null> {
  const [r] = (await tx.execute(sql`
    select r.titulo, k.id as "cardId", k.dados ->> 'tema' as tema, k.dados ->> 'cliente' as cliente
      from maestro.roteiros r
      left join maestro.cards k on k.org_id = r.org_id and k.id = r.card_id and k.apagado_em is null
     where r.id = ${roteiroId} and r.apagado_em is null`)) as unknown as Base[];
  return r ?? null;
}

/** O lote aberto em que o card está (o que tem link ativo primeiro; depois o mais novo). */
async function loteDoCard(tx: Tx, cardId: string): Promise<EstadoParaCliente["lote"]> {
  const [l] = (await tx.execute(sql`
    select l.id, l.title as titulo,
           exists (select 1 from maestro.approval_links a where a.lote_id = l.id and a.kind = 'lote' and a.revoked_at is null and a.expires_at > now()) as link
      from maestro.lote_cards lc join maestro.lotes l on l.id = lc.lote_id
     where lc.card_id = ${cardId} and l.status <> 'fechado' and l.deleted_at is null
     order by 3 desc, l.created_at desc limit 1`)) as unknown as NonNullable<EstadoParaCliente["lote"]>[];
  return l ?? null;
}

async function clienteVivo(tx: Tx, id: string | null | undefined): Promise<{ id: string; nome: string } | null> {
  if (!ehUuid(id)) return null;
  const [c] = (await tx.execute(sql`select id, name as nome from maestro.clients where id = ${id} and deleted_at is null`)) as unknown as {
    id: string;
    nome: string;
  }[];
  return c ?? null;
}

async function enviadaAgora(tx: Tx, roteiroId: string, cardId: string): Promise<number | null> {
  const [v] = (await tx.execute(sql`
    select rv.n from maestro.versoes v
      join maestro.roteiro_versoes rv on rv.org_id = v.org_id and rv.id = v.roteiro_versao_id
     where v.card_id = ${cardId} and v.apagado_em is null and rv.roteiro_id = ${roteiroId}
     order by v.n desc limit 1`)) as unknown as { n: number }[];
  return v?.n ?? null;
}

export async function paraOClienteEstado(ctx: Contexto, roteiroId: string): Promise<EstadoParaCliente | null> {
  if (!ehUuid(roteiroId)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const b = await base(tx, roteiroId);
    if (!b) return null;
    if (!b.cardId) return { card: null, enviada: null, lote: null, cliente: null, clientes: [] };
    const [lote, cliente, enviada] = [await loteDoCard(tx, b.cardId), await clienteVivo(tx, b.cliente), await enviadaAgora(tx, roteiroId, b.cardId)];
    const clientes =
      lote || cliente
        ? []
        : ((await tx.execute(sql`select id, name as nome from maestro.clients where deleted_at is null order by lower(name) limit 300`)) as unknown as {
            id: string;
            nome: string;
          }[]);
    return { card: { id: b.cardId, tema: b.tema || "Card sem tema" }, enviada, lote, cliente, clientes: [...clientes] };
  });
}

export type Enviado = { token: string; loteId: string; novo: boolean; n: number; loteNovo: boolean };

/** Manda a versão n do roteiro ao cliente pelo link do card (veja o topo do arquivo). */
export async function enviarAoCliente(ctx: Contexto, roteiroId: string, n: number, o: { clienteId?: string | null } = {}): Promise<Res<Enviado>> {
  if (!ehUuid(roteiroId) || !Number.isInteger(n) || n < 1) return falha("nao_existe", "Essa versão não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const b = await base(tx, roteiroId);
      if (!b) return falha("nao_existe", "Esse roteiro não existe mais.");
      if (!b.cardId) return falha("sem_card", "Ligue o roteiro a um card antes.");
      const lote = await loteDoCard(tx, b.cardId);
      const cliente = lote ? null : ((await clienteVivo(tx, b.cliente)) ?? (await clienteVivo(tx, o.clienteId)));
      if (!lote && !cliente) return falha("sem_cliente", "Escolha o cliente.");

      // daqui em diante tudo grava: um erro desfaz a transação inteira (lança, nunca devolve no meio)
      const [{ r: v }] = (await tx.execute(sql`select maestro.roteiro_para_cliente(${roteiroId}::uuid, ${n}) as r`)) as unknown as {
        r: { versao: string; n: number; card: string; novo: boolean };
      }[];
      let loteId = lote?.id ?? null;
      if (!loteId) {
        const [l] = (await tx.execute(sql`
          insert into maestro.lotes (org_id, client_id, title, status, created_by)
          values (${ctx.orgId}, ${cliente!.id}, ${b.titulo.slice(0, 200)}, 'rascunho', ${ctx.sub}) returning id`)) as unknown as { id: string }[];
        loteId = l.id;
        await tx.execute(
          sql`insert into maestro.lote_cards (lote_id, org_id, card_id, posicao, volta) values (${loteId}, ${ctx.orgId}, ${b.cardId}, 0, ${v.n})`,
        );
        await tx.execute(sql`
          insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
          values (${ctx.orgId}, ${ctx.sub}, 'lote.criar', 'lote', ${loteId}, ${JSON.stringify({ pecas: 1, roteiro: roteiroId })}::jsonb)`);
      }
      let token = lote?.link ? await tokenDoLinkNaTx(tx, loteId) : null;
      if (!token) {
        const g = await gerarLinkNaTx(tx, ctx, loteId, {});
        if (!g.ok) throw new Error(`link: ${g.mensagem}`);
        token = g.token;
      } else if (v.novo) {
        // Versão nova num card em Revisão com o link ativo: volta para Em aprovação (como a versão de vídeo).
        const [k] = (await tx.execute(sql`select 1 from maestro.cards where id = ${b.cardId} and coluna = 'revisao'`)) as unknown as unknown[];
        if (k)
          await tx.execute(
            sql`select 1 from maestro.card_mudar(${b.cardId}, ${JSON.stringify({ coluna: "aprovacao", colunaEm: Date.now(), ajustePedido: null })}::jsonb)`,
          );
      }
      return { ok: true as const, token, loteId, novo: v.novo, n, loteNovo: !lote };
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Comentários do cliente (e respostas da equipe) em todas as versões mandadas, e as decisões, da mais nova para trás. */
export async function clienteDoRoteiro(ctx: Contexto, roteiroId: string): Promise<ClienteDoRoteiro> {
  if (!ehUuid(roteiroId)) return { comentarios: [], decisoes: [] };
  return getBanco().asUser(ctx, async (tx) => {
    const comentarios = (await tx.execute(sql`
      select k.id, k.bloco_id as bloco, k.pai_id as pai, k.autor_tipo as autor,
             coalesce(k.autor_nome, nullif(m.display_name, ''), 'Equipe') as nome, k.texto, k.resolvido_em is not null as resolvido,
             k.criado_em::text as em, rv.n
        from maestro.comentarios k
        join maestro.versoes v on v.org_id = k.org_id and v.id = k.versao_id
        join maestro.roteiro_versoes rv on rv.org_id = v.org_id and rv.id = v.roteiro_versao_id
        left join maestro.members m on m.org_id = k.org_id and m.zro_sub = k.autor_sub
       where rv.roteiro_id = ${roteiroId}
       order by k.criado_em, k.id limit 500`)) as unknown as ComentarioDoRoteiro[];
    const decisoes = (await tx.execute(sql`
      select rv.n, a.decision as decisao, a.approver_name as nome, a.note as nota, a.created_at::text as em
        from maestro.approvals a
        join maestro.versoes v on v.org_id = a.org_id and v.id = a.versao_id
        join maestro.roteiro_versoes rv on rv.org_id = v.org_id and rv.id = v.roteiro_versao_id
       where rv.roteiro_id = ${roteiroId}
       order by a.created_at desc limit 20`)) as unknown as DecisaoDoRoteiro[];
    return { comentarios: [...comentarios], decisoes: [...decisoes] };
  });
}

/** Resolve (ou reabre) um comentário que é de uma versão deste roteiro. */
export async function resolverDoRoteiro(ctx: Contexto, roteiroId: string, comentarioId: string, resolvido: boolean): Promise<Res> {
  if (!ehUuid(roteiroId) || !ehUuid(comentarioId)) return falha("nao_existe", "Esse comentário não existe mais.");
  const meu = await getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select 1 from maestro.comentarios k
        join maestro.versoes v on v.org_id = k.org_id and v.id = k.versao_id
        join maestro.roteiro_versoes rv on rv.org_id = v.org_id and rv.id = v.roteiro_versao_id
       where k.id = ${comentarioId} and rv.roteiro_id = ${roteiroId}`);
    return r.length > 0;
  });
  if (!meu) return falha("nao_existe", "Esse comentário não existe mais.");
  const r = await resolverComentario(ctx, comentarioId, resolvido);
  return r.ok ? { ok: true } : falha(r.erro, r.mensagem);
}
