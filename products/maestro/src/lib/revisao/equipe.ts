/**
 * Aprovações do lado da equipe (`/app/aprovacoes`), sempre como a pessoa (`asUser`, maestro_app, RLS por organização).
 * Lotes e itens pelo RLS (admin, gestor e equipe escrevem); versões e comentários pelas funções `maestro.versao_*` e
 * `maestro.comentario_*`; links do cliente só admin e gestão (políticas da 0000). O Quadro se mexe só pelas funções
 * `maestro.card_*`: gerar o link leva os cards em Revisão para Em aprovação; versão nova num card em Revisão com link
 * ativo volta para Em aprovação. A decisão do cliente move o card do outro lado (maestro.link_enviar).
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { abrir, hashToken, novoToken, selar } from "@/lib/auth/cripto";
import { detectarFonte } from "./fontes/detectar";
import { streamDoDrive } from "./fontes/player";
import { hashPin, PIN } from "./link";
import type { Nota } from "./tempo";
import type { ComentarioVisto, DecisaoVista, VersaoVista } from "./tipos";

export type Falha = { ok: false; erro: string; mensagem: string };
export type Res<T extends object = object> = ({ ok: true } & T) | Falha;
const falha = (erro: string, mensagem: string): Falha => ({ ok: false, erro, mensagem });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_CARD = /^[A-Za-z0-9_-]{4,64}$/;
export const DIAS_LINK = [7, 15, 30] as const;

function traduzir(e: unknown): Falha {
  const c = codigoPg(e);
  if (c === PG.semPrivilegio) return falha("sem_permissao", "Seu papel nesta organização não pode fazer isso.");
  if (c === "P0002") return falha("nao_existe", "Isso não existe mais.");
  if (c === PG.checagem) return falha("formato", "Algum campo veio num formato que não cabe.");
  if (c === PG.unicidade) return falha("repetido", "Isso já existe.");
  if (c === PG.chaveEstrangeira) return falha("vinculo", "Um dos vínculos não existe mais.");
  if (c === PG.regra) return falha("regra", mensagemPg(e));
  throw e;
}

async function auditar(tx: Tx, ctx: Contexto, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await tx.execute(
    sql`insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata) values (${ctx.orgId}, ${ctx.sub}, ${action}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)}::jsonb)`,
  );
}

// ───────────── lotes ─────────────

export type LinkVisto = { id: string; expira: string; pin: boolean; usos: number; usadoEm: string | null; criadoEm: string };

export type LoteResumo = {
  id: string;
  titulo: string;
  cliente: { id: string; nome: string };
  status: "rascunho" | "enviado" | "fechado";
  pecas: number;
  decididas: number;
  aprovadas: number;
  abertos: number;
  link: LinkVisto | null;
  criadoEm: string;
  demo: boolean;
};

const LINK_ATIVO = sql`a.kind = 'lote' and a.revoked_at is null and a.expires_at > now()`;

export async function listarLotes(ctx: Contexto): Promise<LoteResumo[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      select l.id, l.title as titulo, l.status, l.demo, l.created_at as "criadoEm",
             jsonb_build_object('id', c.id, 'nome', c.name) as cliente,
             (select count(*)::int from maestro.lote_cards lc join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
               where lc.lote_id = l.id and k.apagado_em is null) as pecas,
             (select count(distinct a.card_id)::int from maestro.approvals a join maestro.lote_cards lc on lc.lote_id = l.id and lc.card_id = a.card_id
               where a.lote_id = l.id and a.volta = lc.volta) as decididas,
             (select count(distinct a.card_id)::int from maestro.approvals a join maestro.lote_cards lc on lc.lote_id = l.id and lc.card_id = a.card_id
               where a.lote_id = l.id and a.volta = lc.volta and a.decision = 'aprovado') as aprovadas,
             (select count(*)::int from maestro.comentarios k join maestro.lote_cards lc on lc.lote_id = l.id and lc.card_id = k.card_id
               where k.resolvido_em is null and k.pai_id is null) as abertos,
             (select jsonb_build_object('id', a.id, 'expira', a.expires_at, 'pin', a.pin_hash is not null, 'usos', a.uses, 'usadoEm', a.last_used_at, 'criadoEm', a.created_at)
                from maestro.approval_links a where a.lote_id = l.id and ${LINK_ATIVO} limit 1) as link
        from maestro.lotes l
        join maestro.clients c on c.id = l.client_id
       where l.deleted_at is null
       order by case l.status when 'enviado' then 0 when 'rascunho' then 1 else 2 end, l.created_at desc
       limit 200`)) as unknown as LoteResumo[];
    return [...linhas];
  });
}

export type CardDisponivel = { id: string; tema: string; coluna: string; cliente: string | null };

/** Cards que podem entrar num lote (vivos, ainda não entregues), para escolher ao criar o lote. */
export async function cardsDisponiveis(ctx: Contexto): Promise<CardDisponivel[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select id, dados ->> 'tema' as tema, coluna, cliente from maestro.cards
       where apagado_em is null and coluna in ('fazendo', 'revisao', 'aprovacao')
       order by case coluna when 'revisao' then 0 when 'aprovacao' then 1 else 2 end, updated_at desc limit 300`)) as unknown as CardDisponivel[];
    return [...r];
  });
}

export async function clientesAtivos(ctx: Contexto): Promise<{ id: string; nome: string }[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`select id, name as nome from maestro.clients where deleted_at is null order by lower(name)`)) as unknown as {
      id: string;
      nome: string;
    }[];
    return [...r];
  });
}

/** A volta inicial de um card que entra num lote: o número da versão mais nova (ou 1). */
async function voltaAtual(tx: Tx, cardId: string): Promise<number> {
  const [r] = (await tx.execute(
    sql`select coalesce(max(n), 1)::int as n from maestro.versoes where card_id = ${cardId} and apagado_em is null`,
  )) as unknown as { n: number }[];
  return r?.n ?? 1;
}

export async function criarLote(ctx: Contexto, e: { clienteId: string; titulo: string; cards: string[] }): Promise<Res<{ id: string }>> {
  const titulo = e.titulo.replace(/\s+/g, " ").trim();
  if (!UUID.test(e.clienteId)) return falha("cliente", "Escolha o cliente.");
  if (titulo.length < 1 || titulo.length > 200) return falha("titulo", "Dê um nome ao lote.");
  const cards = [...new Set(e.cards)].filter((c) => ID_CARD.test(c)).slice(0, 100);
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const cli = await tx.execute(sql`select 1 from maestro.clients where id = ${e.clienteId} and deleted_at is null`);
      if (!cli.length) return falha("cliente", "Esse cliente não existe nesta organização.");
      const [l] = (await tx.execute(
        sql`insert into maestro.lotes (org_id, client_id, title, status, created_by) values (${ctx.orgId}, ${e.clienteId}, ${titulo}, 'rascunho', ${ctx.sub}) returning id`,
      )) as unknown as { id: string }[];
      let pos = 0;
      for (const c of cards) {
        const ok = await tx.execute(sql`select 1 from maestro.cards where id = ${c} and apagado_em is null`);
        if (!ok.length) continue;
        await tx.execute(
          sql`insert into maestro.lote_cards (lote_id, org_id, card_id, posicao, volta) values (${l.id}, ${ctx.orgId}, ${c}, ${pos++}, ${await voltaAtual(tx, c)})`,
        );
      }
      await auditar(tx, ctx, "lote.criar", "lote", l.id, { pecas: pos });
      return { ok: true as const, id: l.id };
    });
  } catch (err) {
    return traduzir(err);
  }
}

export async function adicionarPeca(ctx: Contexto, loteId: string, cardId: string): Promise<Res> {
  if (!UUID.test(loteId) || !ID_CARD.test(cardId)) return falha("formato", "Peça inválida.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const l = (await tx.execute(sql`select status from maestro.lotes where id = ${loteId} and deleted_at is null`)) as unknown as { status: string }[];
      if (!l.length) return falha("nao_existe", "Esse lote não existe mais.");
      if (l[0].status === "fechado") return falha("fechado", "Esse lote está fechado.");
      const ok = await tx.execute(sql`select 1 from maestro.cards where id = ${cardId} and apagado_em is null`);
      if (!ok.length) return falha("nao_existe", "Esse card não existe mais.");
      const [p] = (await tx.execute(sql`select coalesce(max(posicao), -1)::int + 1 as p from maestro.lote_cards where lote_id = ${loteId}`)) as unknown as {
        p: number;
      }[];
      await tx.execute(
        sql`insert into maestro.lote_cards (lote_id, org_id, card_id, posicao, volta) values (${loteId}, ${ctx.orgId}, ${cardId}, ${p.p}, ${await voltaAtual(tx, cardId)}) on conflict do nothing`,
      );
      return { ok: true as const };
    });
  } catch (err) {
    return traduzir(err);
  }
}

// ───────────── um lote inteiro ─────────────

export type PecaDaEquipe = {
  card: string;
  titulo: string;
  coluna: string;
  ajustePedido: boolean;
  volta: number;
  versoes: VersaoVista[];
  decisoes: DecisaoVista[];
};

export type LoteDaEquipe = {
  id: string;
  titulo: string;
  status: "rascunho" | "enviado" | "fechado";
  cliente: { id: string; nome: string; whatsapp: string | null };
  termo: { nome: string; em: string; hash: string } | null;
  link: LinkVisto | null;
  pecas: PecaDaEquipe[];
};

type VersaoLinha = Omit<VersaoVista, "stream" | "comentarios"> & { card: string };
type ComentarioLinha = ComentarioVisto & { versao: string };

export async function carregarLote(ctx: Contexto, loteId: string): Promise<LoteDaEquipe | null> {
  if (!UUID.test(loteId)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [l] = (await tx.execute(sql`
      select l.id, l.title as titulo, l.status, l.term,
             jsonb_build_object('id', c.id, 'nome', c.name, 'whatsapp', c.whatsapp) as cliente,
             (select jsonb_build_object('id', a.id, 'expira', a.expires_at, 'pin', a.pin_hash is not null, 'usos', a.uses, 'usadoEm', a.last_used_at, 'criadoEm', a.created_at)
                from maestro.approval_links a where a.lote_id = l.id and ${LINK_ATIVO} limit 1) as link
        from maestro.lotes l join maestro.clients c on c.id = l.client_id
       where l.id = ${loteId} and l.deleted_at is null`)) as unknown as (Omit<LoteDaEquipe, "pecas" | "termo"> & { term: Record<string, string> | null })[];
    if (!l) return null;
    const pecas = (await tx.execute(sql`
      select k.id as card, k.dados ->> 'tema' as titulo, k.coluna, coalesce((k.dados ->> 'ajustePedido')::boolean, false) as "ajustePedido", lc.volta
        from maestro.lote_cards lc join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
       where lc.lote_id = ${loteId} and k.apagado_em is null
       order by lc.posicao, k.id`)) as unknown as Omit<PecaDaEquipe, "versoes" | "decisoes">[];
    const ids = pecas.map((p) => p.card);
    const versoes = ids.length
      ? ((await tx.execute(sql`
          select v.id, v.card_id as card, v.n, v.titulo, v.fonte, v.url, v.drive_file_id as "driveId", v.drive_resource_key as "driveChave",
                 v.duracao_ms as "duracaoMs", v.fps::float8 as fps, v.criado_em as em
            from maestro.versoes v
           where v.card_id in (${sql.join(
             ids.map((i) => sql`${i}`),
             sql`, `,
           )}) and v.apagado_em is null
           order by v.n desc`)) as unknown as VersaoLinha[])
      : [];
    const vids = versoes.map((v) => v.id);
    const comentarios = vids.length
      ? ((await tx.execute(sql`
          select k.id, k.versao_id as versao, k.pai_id as pai, k.autor_tipo as autor,
                 coalesce(k.autor_nome, nullif(m.display_name, ''), 'Equipe') as nome,
                 k.t_ms as t, k.t_fim_ms as "tFim", k.tempo_digitado as digitado, k.x::float8 as x, k.y::float8 as y, k.texto,
                 k.resolvido_em is not null as resolvido, k.criado_em as em
            from maestro.comentarios k left join maestro.members m on m.org_id = k.org_id and m.zro_sub = k.autor_sub
           where k.versao_id in (${sql.join(
             vids.map((i) => sql`${i}::uuid`),
             sql`, `,
           )})
           order by k.criado_em, k.id`)) as unknown as ComentarioLinha[])
      : [];
    const decisoes = (await tx.execute(sql`
      select a.card_id as card, a.decision as decisao, a.note as nota, a.approver_name as nome, a.created_at as em, a.volta, a.versao_id as versao
        from maestro.approvals a where a.lote_id = ${loteId} order by a.created_at desc`)) as unknown as (DecisaoVista & { card: string })[];
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
    return {
      id: l.id,
      titulo: l.titulo,
      status: l.status,
      cliente: l.cliente,
      link: l.link,
      termo: l.term && l.term.nome ? { nome: l.term.nome, em: l.term.em, hash: l.term.hash } : null,
      pecas: pecas.map((p) => ({
        ...p,
        versoes: versoes
          .filter((v) => v.card === p.card)
          .map(({ card: _c, ...v }) => {
            void _c;
            return {
              ...v,
              em: iso(v.em),
              stream: streamDoDrive(v.fonte, v.driveId, v.driveChave),
              comentarios: comentarios
                .filter((c) => c.versao === v.id)
                .map(({ versao: _v, ...c }) => {
                  void _v;
                  return { ...c, em: iso(c.em) };
                }),
            };
          }),
        decisoes: decisoes.filter((d) => d.card === p.card).map(({ card: _c, ...d }) => (void _c, { ...d, em: iso(d.em) })),
      })),
    };
  });
}

// ───────────── versões e comentários ─────────────

export async function novaVersao(ctx: Contexto, cardId: string, link: string, titulo?: string | null): Promise<Res<{ n: number }>> {
  if (!ID_CARD.test(cardId)) return falha("formato", "Card inválido.");
  const f = detectarFonte(link);
  if (!f.ok) return falha("link", f.erro);
  const t = (titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const meta = { titulo: t || null, ...(f.tipo === "drive" ? { drive_file_id: f.id, drive_resource_key: f.chave ?? null } : {}) };
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [v] = (await tx.execute(sql`select n from maestro.versao_criar(${cardId}, ${f.tipo}, ${f.url}, ${JSON.stringify(meta)}::jsonb)`)) as unknown as {
        n: number;
      }[];
      // Versão nova de card em Revisão com o link do cliente ativo: volta para Em aprovação (o cliente vê a nova).
      const [k] = (await tx.execute(sql`
        select k.coluna, k.versoes ->> 'coluna' as vc from maestro.cards k
         where k.id = ${cardId} and k.coluna = 'revisao'
           and exists (select 1 from maestro.lote_cards lc join maestro.lotes l on l.id = lc.lote_id
                        join maestro.approval_links a on a.lote_id = l.id and ${LINK_ATIVO}
                       where lc.card_id = k.id and l.status = 'enviado' and l.deleted_at is null)`)) as unknown as { coluna: string }[];
      if (k) {
        await tx.execute(
          sql`select 1 from maestro.card_mudar(${cardId}, ${JSON.stringify({ coluna: "aprovacao", colunaEm: Date.now(), ajustePedido: null })}::jsonb)`,
        );
      }
      return { ok: true as const, n: v.n };
    });
  } catch (err) {
    return traduzir(err);
  }
}

export async function apagarVersao(ctx: Contexto, versaoId: string): Promise<Res> {
  if (!UUID.test(versaoId)) return falha("formato", "Versão inválida.");
  try {
    await getBanco().asUser(ctx, (tx) => tx.execute(sql`select 1 from maestro.versao_apagar(${versaoId}::uuid)`));
    return { ok: true };
  } catch (err) {
    return traduzir(err);
  }
}

export async function comentarComoEquipe(
  ctx: Contexto,
  versaoId: string,
  d: { texto: string; t?: number | null; tFim?: number | null; digitado?: boolean; x?: number | null; y?: number | null; pai?: string | null; idem: string },
): Promise<Res<{ id: string }>> {
  const texto = d.texto.trim();
  if (!UUID.test(versaoId)) return falha("formato", "Versão inválida.");
  if (texto.length < 1 || texto.length > 2000) return falha("texto", "Escreva o comentário (até 2.000 caracteres).");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(d.idem)) return falha("formato", "Pedido inválido.");
  if (d.pai && !UUID.test(d.pai)) return falha("formato", "Comentário de origem inválido.");
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const t = num(d.t, 86_400_000);
  const tFim = num(d.tFim, 86_400_000);
  const x = num(d.x, 100);
  const y = num(d.y, 100);
  const dados = {
    texto,
    idem: d.idem,
    pai: d.pai ?? null,
    t_ms: t === null ? null : Math.round(t),
    t_fim_ms: t !== null && tFim !== null && tFim > t ? Math.round(tFim) : null,
    digitado: d.digitado === true,
    x: x !== null && y !== null ? x : null,
    y: x !== null && y !== null ? y : null,
  };
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [c] = (await tx.execute(sql`select id from maestro.comentario_criar(${versaoId}::uuid, ${JSON.stringify(dados)}::jsonb)`)) as unknown as {
        id: string;
      }[];
      return { ok: true as const, id: c.id };
    });
  } catch (err) {
    return traduzir(err);
  }
}

export async function resolverComentario(ctx: Contexto, id: string, resolvido: boolean): Promise<Res> {
  if (!UUID.test(id)) return falha("formato", "Comentário inválido.");
  try {
    await getBanco().asUser(ctx, (tx) => tx.execute(sql`select 1 from maestro.comentario_resolver(${id}::uuid, ${resolvido})`));
    return { ok: true };
  } catch (err) {
    return traduzir(err);
  }
}

// ───────────── o link do cliente ─────────────

const contextoToken = (id: string) => `approval_links.token:${id}`;

/**
 * Gera o link do lote (troca o anterior, se houver: um ativo por lote). PIN opcional (4 a 8 números), validade de 7, 15
 * ou 30 dias. Leva os cards em Revisão para Em aprovação e marca o lote como enviado. Só admin e gestão (RLS).
 */
export async function gerarLink(ctx: Contexto, loteId: string, o: { pin?: string | null; dias?: number } = {}): Promise<Res<{ token: string }>> {
  try {
    return await getBanco().asUser(ctx, (tx) => gerarLinkNaTx(tx, ctx, loteId, o));
  } catch (err) {
    return traduzir(err);
  }
}

/** O mesmo, dentro de uma transação já aberta como a pessoa (a demonstração usa). */
export async function gerarLinkNaTx(tx: Tx, ctx: Contexto, loteId: string, o: { pin?: string | null; dias?: number } = {}): Promise<Res<{ token: string }>> {
  if (!UUID.test(loteId)) return falha("formato", "Lote inválido.");
  const pin = (o.pin ?? "").trim();
  if (pin && !PIN.test(pin)) return falha("pin", "O PIN tem de 4 a 8 números.");
  const dias = (DIAS_LINK as readonly number[]).includes(o.dias ?? 30) ? (o.dias ?? 30) : 30;
  const token = novoToken();
  const id = randomUUID();
  const [l] = (await tx.execute(sql`select client_id, status from maestro.lotes where id = ${loteId} and deleted_at is null for update`)) as unknown as {
    client_id: string;
    status: string;
  }[];
  if (!l) return falha("nao_existe", "Esse lote não existe mais.");
  if (l.status === "fechado") return falha("fechado", "Esse lote está fechado.");
  const pecas = (await tx.execute(sql`
    select k.id, k.coluna from maestro.lote_cards lc join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
     where lc.lote_id = ${loteId} and k.apagado_em is null`)) as unknown as { id: string; coluna: string }[];
  if (!pecas.length) return falha("vazio", "Ponha ao menos uma peça no lote.");
  await tx.execute(
    sql`update maestro.approval_links set revoked_at = now(), revoked_by = ${ctx.sub} where lote_id = ${loteId} and kind = 'lote' and revoked_at is null`,
  );
  await tx.execute(sql`
    insert into maestro.approval_links (id, org_id, client_id, kind, lote_id, token_hash, token_enc, expires_at, pin_hash, pin_version, created_by)
    values (${id}, ${ctx.orgId}, ${l.client_id}, 'lote', ${loteId}, ${hashToken(token)}, ${selar(token, contextoToken(id))},
            now() + make_interval(days => ${dias}), ${pin ? hashPin(pin) : null}, ${pin ? 1 : 0}, ${ctx.sub})`);
  await tx.execute(sql`update maestro.lotes set status = 'enviado', sent_at = coalesce(sent_at, now()) where id = ${loteId}`);
  for (const p of pecas)
    if (p.coluna === "revisao")
      await tx.execute(sql`select 1 from maestro.card_mudar(${p.id}, ${JSON.stringify({ coluna: "aprovacao", colunaEm: Date.now() })}::jsonb)`);
  await auditar(tx, ctx, "link.criar", "lote", loteId, { link: id, dias, pin: !!pin });
  return { ok: true as const, token };
}

/** O token do link ativo, para copiar de novo (só admin e gestão: quem pode gerar). */
export async function tokenDoLink(ctx: Contexto, loteId: string): Promise<string | null> {
  if (!UUID.test(loteId)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [a] = (await tx.execute(
      sql`select a.id, a.token_enc from maestro.approval_links a where a.lote_id = ${loteId} and ${LINK_ATIVO} limit 1`,
    )) as unknown as { id: string; token_enc: string | null }[];
    if (!a?.token_enc) return null;
    try {
      return abrir(a.token_enc, contextoToken(a.id));
    } catch {
      return null;
    }
  });
}

export async function revogarLink(ctx: Contexto, loteId: string): Promise<Res> {
  if (!UUID.test(loteId)) return falha("formato", "Lote inválido.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(
        sql`update maestro.approval_links set revoked_at = now(), revoked_by = ${ctx.sub} where lote_id = ${loteId} and kind = 'lote' and revoked_at is null returning id`,
      );
      if (!r.length) return falha("sem_link", "Esse lote não tem link ativo, ou seu papel não pode revogar.");
      await auditar(tx, ctx, "link.revogar", "lote", loteId);
      return { ok: true as const };
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Fecha o lote: o link para de abrir (a função do banco recusa lote fechado) e é revogado. */
export async function fecharLote(ctx: Contexto, loteId: string): Promise<Res> {
  if (!UUID.test(loteId)) return falha("formato", "Lote inválido.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(
        sql`update maestro.lotes set status = 'fechado', closed_at = now() where id = ${loteId} and status <> 'fechado' and deleted_at is null returning id`,
      );
      if (!r.length) return falha("nao_existe", "Esse lote já está fechado.");
      await tx.execute(
        sql`update maestro.approval_links set revoked_at = now(), revoked_by = ${ctx.sub} where lote_id = ${loteId} and kind = 'lote' and revoked_at is null`,
      );
      await auditar(tx, ctx, "lote.fechar", "lote", loteId);
      return { ok: true as const };
    });
  } catch (err) {
    return traduzir(err);
  }
}

// ───────────── exportar ─────────────

/** As notas do lote (só as de primeiro nível, em ordem de peça, versão e tempo) para o CSV e a EDL. */
export async function notasDoLote(ctx: Contexto, loteId: string): Promise<{ titulo: string; fps: number | null; notas: Nota[] } | null> {
  const lote = await carregarLote(ctx, loteId);
  if (!lote) return null;
  const notas: Nota[] = [];
  let fps: number | null = null;
  for (const p of lote.pecas)
    for (const v of [...p.versoes].sort((a, b) => a.n - b.n)) {
      fps ??= v.fps;
      for (const c of [...v.comentarios].filter((c) => !c.pai).sort((a, b) => (a.t ?? -1) - (b.t ?? -1)))
        notas.push({
          peca: p.titulo,
          versao: v.n,
          t: c.t,
          tFim: c.tFim,
          digitado: c.digitado,
          autor: c.autor,
          nome: c.nome,
          texto: c.texto,
          resolvido: c.resolvido,
          em: c.em,
        });
    }
  return { titulo: lote.titulo, fps, notas };
}
