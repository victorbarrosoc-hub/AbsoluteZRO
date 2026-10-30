/**
 * Fluxos no banco (drizzle/0031_fluxos.sql), sempre como a pessoa (`asUser`, RLS): organização e pessoa vêm da sessão
 * (`Contexto`), nunca do corpo do pedido. A rota (`rota.ts`) responde 403 antes pelo papel (`podeEditarCriacao`); o
 * banco decide de novo (políticas, gatilhos `fluxo_*_guarda`, cota no insert da imagem).
 *
 *   * Carregar: `obterFluxo` (fluxo, nós, ligações, referências resolvidas e o cursor) e `fluxoDesde` (o que mudou
 *     desde o cursor, com 5 s de folga como o Quadro, lápides inclusive; as referências vêm inteiras de novo, para o
 *     título de um roteiro renomeado andar sem o nó mudar).
 *   * Gravar: `aplicarOps` numa transação, em ordem (colar muitos, mover muitos, ligar no mesmo pedido). Cada nó e
 *     ligação tem `rev`: quem manda o `rev` visto e perdeu recebe `conflito` com o atual NAQUELE item (os outros
 *     gravam); sem `rev` (mover), quem grava por último leva. Erro de regra (limite, seção, vínculo, papel) desfaz o
 *     pedido inteiro.
 *   * Imagens: `enviarImagem` (prepararImagem → WebP + miniatura → insert; o banco confere a cota, e se não couber a
 *     limpeza das lápides velhas roda uma vez antes de dizer não), `lerImagem` pela porta `maestro.fluxo_imagem`.
 *   * Referências: `resolverReferencias` lê roteiros e cards com o RLS de quem vê; fora do alcance = "sem acesso"
 *     (nunca vai título), apagado de vez = "removido".
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Falha, type Res } from "@/lib/crm/comum";
import { PAPEIS_EDITAR_CRIACAO } from "../permissoes";
import type { EstadoRoteiro } from "../roteiro/servidor";
import { COTA, mensagemDaCota, type Uso } from "./cota";
import type { FluxoParaExportar } from "./exportar";
import { prepararImagem } from "./imagem";
import {
  type DadosNo,
  type ImagemNo,
  lerDados,
  type LigacaoFluxo,
  type NoFluxo,
  type Op,
  type RefResolvida,
  type TipoNo,
  tituloFluxo,
  urlDaImagem,
} from "./modelo";

export type FluxoInfo = {
  id: string;
  titulo: string;
  rev: number;
  projetoId: string | null;
  projeto: string | null;
  cardId: string | null;
  card: string | null;
  demo: boolean;
  apagado: boolean;
  atualizado: string;
  criadoPor: string | null;
};
export type FluxoLista = FluxoInfo & {
  /** Itens vivos (sem contar seções), para o cartão "Fluxo · 14 itens". */
  itens: number;
  imagens: number;
  /** A última mudança no fluxo ou em qualquer nó/ligação. */
  mudouEm: string;
  /** Links vivos (`/f/<token>`) que quem vê alcança (administração e gestão; para os outros, 0 pelo RLS). */
  linksVivos: number;
};
export type FluxoCompleto = {
  fluxo: FluxoInfo;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  /** Referências vivas (nós `roteiro` e `card`), pelo id do nó. */
  refs: Record<string, RefResolvida>;
  /** Hora do banco: mande em `fluxoDesde` no próximo poll. */
  cursor: string;
};
export type ConflitoFluxo = Falha & { erro: "conflito"; atual: FluxoInfo };

export type ResultadoOp =
  | { ok: true; no: NoFluxo }
  | { ok: true; ligacao: LigacaoFluxo }
  | { ok: false; erro: "conflito"; no: NoFluxo }
  | { ok: false; erro: "conflito"; ligacao: LigacaoFluxo }
  | { ok: false; erro: "nao_existe"; id: string };

const CARD = /^[A-Za-z0-9_-]{4,64}$/;
const ehCard = (v: unknown): v is string => typeof v === "string" && CARD.test(v);
const SHA = /^[0-9a-f]{64}$/;
const CURSOR = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
/** Entre a hora gravada e o commit: o poll volta 5 s para nada escapar (receber duas vezes não faz mal). */
const FOLGA = "5 seconds";

/** O `detail` do erro do Postgres (a cota manda "usado/limite"). */
function detalhePg(err: unknown): string | null {
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    const d = (e as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return null;
}

/** Erro de conferência dentro da transação: desfaz o pedido e vira `Falha`. */
class Recusa extends Error {
  constructor(readonly falha: Falha) {
    super(falha.mensagem);
  }
}

function traduzir(e: unknown): Falha {
  if (e instanceof Recusa) return e.falha;
  const c = codigoPg(e);
  const m = mensagemPg(e);
  if (m === "fluxo:nao_existe") return falha("nao_existe", "Esse fluxo não existe mais.");
  if (m === "fluxo:cota" || m === "fluxo:cota_fluxo") return falha(m.slice(6), mensagemDaCota(m === "fluxo:cota" ? "cota" : "cota_fluxo", detalhePg(e)));
  if (m === "fluxo:limite_nos") return falha("limite", "Este fluxo chegou a 2.000 itens.");
  if (m === "fluxo:limite_ligacoes") return falha("limite", "Este fluxo chegou a 4.000 ligações.");
  if (m === "fluxo:secao") return falha("secao", "Essa seção não é deste fluxo.");
  if (m === "fluxo:referencia") return falha("referencia", "Você não tem acesso a esse roteiro ou card.");
  if (m === "fluxo:ponta") return falha("ponta", "Um dos itens da ligação foi apagado.");
  if (c === PG.unicidade) return falha("ja_existe", "Esse item já existe.");
  return traduzirPg(e);
}

// ───────────── leitura ─────────────

const COLUNAS_FLUXO = sql`
  f.id, f.titulo, f.rev, f.projeto_id as "projetoId", p.title as projeto, f.card_id as "cardId", k.dados ->> 'tema' as card,
  f.demo, f.apagado_em is not null as apagado, f.updated_at::text as atualizado, f.created_by as "criadoPor"`;
const JUNTAS_FLUXO = sql`
  from maestro.fluxos f
  left join maestro.projects p on p.org_id = f.org_id and p.id = f.projeto_id
  left join maestro.cards k on k.org_id = f.org_id and k.id = f.card_id`;

const COLUNAS_NO = sql`
  n.id, n.tipo, n.x, n.y, n.w, n.h, n.z, n.secao_id as "secaoId", n.dados, n.imagem_id as "imagemId", n.roteiro_id as "roteiroId",
  n.card_id as "cardId", n.rev, n.apagado_em is not null as apagado, n.updated_at::text as atualizado, n.atualizado_por as "atualizadoPor",
  i.sha256 as "iSha", i.largura as "iLargura", i.altura as "iAltura", i.mini_largura as "iMiniLargura", i.mini_altura as "iMiniAltura"`;
const JUNTAS_NO = sql`
  from maestro.fluxo_nos n
  left join maestro.fluxo_imagens i on i.org_id = n.org_id and i.fluxo_id = n.fluxo_id and i.id = n.imagem_id`;

type LinhaNo = Omit<NoFluxo, "imagem" | "dados"> & {
  dados: unknown;
  iSha: string | null;
  iLargura: number | null;
  iAltura: number | null;
  iMiniLargura: number | null;
  iMiniAltura: number | null;
};

function paraNo(l: LinhaNo): NoFluxo {
  const imagem: ImagemNo | null =
    l.imagemId && l.iSha
      ? {
          id: l.imagemId,
          sha256: l.iSha,
          largura: Number(l.iLargura),
          altura: Number(l.iAltura),
          miniLargura: Number(l.iMiniLargura),
          miniAltura: Number(l.iMiniAltura),
          url: urlDaImagem(l.imagemId, l.iSha),
          miniUrl: urlDaImagem(l.imagemId, l.iSha, true),
        }
      : null;
  return {
    id: l.id,
    tipo: l.tipo,
    x: Number(l.x),
    y: Number(l.y),
    w: Number(l.w),
    h: Number(l.h),
    z: Number(l.z),
    secaoId: l.secaoId,
    // O banco guarda o que a aplicação conferiu; se algo antigo não couber mais, o tipo vazio (nunca quebra a tela).
    dados: lerDados(l.tipo, l.dados) ?? (lerDados(l.tipo, {}) as DadosNo) ?? ({} as DadosNo),
    imagemId: l.imagemId,
    roteiroId: l.roteiroId,
    cardId: l.cardId,
    imagem,
    rev: l.rev,
    apagado: l.apagado,
    atualizado: l.atualizado,
    atualizadoPor: l.atualizadoPor,
  };
}

const COLUNAS_LIGACAO = sql`
  l.id, l.de, l.para, l.rotulo, l.rev, l.apagado_em is not null as apagado, l.updated_at::text as atualizado`;

async function lerInfo(tx: Tx, id: string): Promise<FluxoInfo | null> {
  const [f] = (await tx.execute(sql`select ${COLUNAS_FLUXO} ${JUNTAS_FLUXO} where f.id = ${id}`)) as unknown as FluxoInfo[];
  return f ?? null;
}

async function agora(tx: Tx): Promise<string> {
  const [{ t }] = (await tx.execute(sql`select clock_timestamp()::text as t`)) as unknown as { t: string }[];
  return t;
}

const jsonIds = (ids: readonly string[]) => JSON.stringify([...new Set(ids)]);

/**
 * Título e estado das referências, lidos como a pessoa (RLS: organização e acesso por cliente). Fora do alcance =
 * "sem_acesso", sem título; vínculo nulo (apagado de vez) = "removido".
 */
export async function resolverReferencias(
  tx: Tx,
  nos: readonly Pick<NoFluxo, "id" | "tipo" | "roteiroId" | "cardId" | "apagado">[],
): Promise<Record<string, RefResolvida>> {
  const refs = nos.filter((n) => !n.apagado && (n.tipo === "roteiro" || n.tipo === "card"));
  const out: Record<string, RefResolvida> = {};
  if (!refs.length) return out;
  const rIds = refs.filter((n) => n.tipo === "roteiro" && n.roteiroId).map((n) => n.roteiroId!);
  const cIds = refs.filter((n) => n.tipo === "card" && n.cardId).map((n) => n.cardId!);
  const roteiros = new Map<string, { id: string; titulo: string; estado: EstadoRoteiro; versao: number; duracaoSeg: number; lixeira: boolean }>();
  const cards = new Map<
    string,
    { id: string; titulo: string | null; coluna: string | null; colunaNome: string | null; colunaCor: string | null; prazo: string | null; lixeira: boolean }
  >();
  if (rIds.length) {
    const r = (await tx.execute(sql`
      select r.id, r.titulo, r.estado, r.versao_atual as versao, r.duracao_seg as "duracaoSeg", r.apagado_em is not null as lixeira
        from maestro.roteiros r where r.id in (select jsonb_array_elements_text(${jsonIds(rIds)}::jsonb)::uuid)`)) as unknown as {
      id: string;
      titulo: string;
      estado: EstadoRoteiro;
      versao: number;
      duracaoSeg: number;
      lixeira: boolean;
    }[];
    for (const x of r) roteiros.set(x.id, x);
  }
  if (cIds.length) {
    const r = (await tx.execute(sql`
      select k.id, k.dados ->> 'tema' as titulo, k.coluna, c.nome as "colunaNome", c.cor as "colunaCor", k.prazo, k.apagado_em is not null as lixeira
        from maestro.cards k left join maestro.colunas c on c.org_id = k.org_id and c.id = k.coluna
       where k.id in (select jsonb_array_elements_text(${jsonIds(cIds)}::jsonb))`)) as unknown as {
      id: string;
      titulo: string | null;
      coluna: string | null;
      colunaNome: string | null;
      colunaCor: string | null;
      prazo: string | null;
      lixeira: boolean;
    }[];
    for (const x of r) cards.set(x.id, x);
  }
  for (const n of refs) {
    if (n.tipo === "roteiro") {
      if (!n.roteiroId) out[n.id] = { tipo: "roteiro", estado: "removido" };
      else {
        const r = roteiros.get(n.roteiroId);
        out[n.id] = r
          ? { tipo: "roteiro", estado: "ok", id: r.id, titulo: r.titulo, situacao: r.estado, versao: r.versao, duracaoSeg: r.duracaoSeg, naLixeira: r.lixeira }
          : { tipo: "roteiro", estado: "sem_acesso" };
      }
    } else {
      if (!n.cardId) out[n.id] = { tipo: "card", estado: "removido" };
      else {
        const k = cards.get(n.cardId);
        out[n.id] = k
          ? {
              tipo: "card",
              estado: "ok",
              id: k.id,
              titulo: k.titulo ?? "",
              coluna: k.coluna ?? "",
              colunaNome: k.colunaNome,
              colunaCor: k.colunaCor,
              prazo: k.prazo,
              naLixeira: k.lixeira,
            }
          : { tipo: "card", estado: "sem_acesso" };
      }
    }
  }
  return out;
}

/** Todas as referências vivas do fluxo (uma consulta pelos nós de referência + uma por tipo). */
async function refsDoFluxo(tx: Tx, fluxoId: string): Promise<Record<string, RefResolvida>> {
  const nos = (await tx.execute(sql`
    select n.id, n.tipo, n.roteiro_id as "roteiroId", n.card_id as "cardId", false as apagado
      from maestro.fluxo_nos n where n.fluxo_id = ${fluxoId} and n.tipo in ('roteiro', 'card') and n.apagado_em is null`)) as unknown as Pick<
    NoFluxo,
    "id" | "tipo" | "roteiroId" | "cardId" | "apagado"
  >[];
  return resolverReferencias(tx, nos);
}

/** Fluxos da organização (sem a lixeira, a não ser com `lixeira`), do que mudou por último para o mais antigo. */
export async function listarFluxos(ctx: Contexto, filtro: { projetoId?: string; cardId?: string; lixeira?: boolean } = {}): Promise<FluxoLista[]> {
  if (filtro.projetoId !== undefined && !ehUuid(filtro.projetoId)) return [];
  if (filtro.cardId !== undefined && !ehCard(filtro.cardId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select ${COLUNAS_FLUXO},
             coalesce(q.itens, 0)::int as itens, coalesce(q.imagens, 0)::int as imagens,
             greatest(f.updated_at, q.mudou, lq.mudou)::text as "mudouEm",
             (select count(*) from maestro.fluxo_links fl
               where fl.org_id = f.org_id and fl.fluxo_id = f.id and fl.revogado_em is null and fl.expira_em > now())::int as "linksVivos"
        ${JUNTAS_FLUXO}
        left join lateral (
          select count(*) filter (where n.apagado_em is null and n.tipo <> 'secao') as itens,
                 count(*) filter (where n.apagado_em is null and n.tipo = 'imagem') as imagens,
                 max(n.updated_at) as mudou
            from maestro.fluxo_nos n where n.org_id = f.org_id and n.fluxo_id = f.id) q on true
        left join lateral (select max(l.updated_at) as mudou from maestro.fluxo_ligacoes l where l.org_id = f.org_id and l.fluxo_id = f.id) lq on true
       where ${filtro.lixeira ? sql`f.apagado_em is not null` : sql`f.apagado_em is null`}
         ${filtro.projetoId ? sql`and f.projeto_id = ${filtro.projetoId}` : sql``}
         ${filtro.cardId ? sql`and f.card_id = ${filtro.cardId}` : sql``}
       order by "mudouEm" desc, f.id
       limit 500`);
    return Array.from(r as unknown as FluxoLista[]);
  });
}

/** O fluxo inteiro (também da lixeira, para ver). null = não existe ou fora do alcance. */
export async function obterFluxo(ctx: Contexto, id: string): Promise<FluxoCompleto | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const cursor = await agora(tx);
    const fluxo = await lerInfo(tx, id);
    if (!fluxo) return null;
    const nos = (
      (await tx.execute(
        sql`select ${COLUNAS_NO} ${JUNTAS_NO} where n.fluxo_id = ${id} and n.apagado_em is null order by n.z, n.created_at, n.id`,
      )) as unknown as LinhaNo[]
    ).map(paraNo);
    const ligacoes = Array.from(
      (await tx.execute(
        sql`select ${COLUNAS_LIGACAO} from maestro.fluxo_ligacoes l where l.fluxo_id = ${id} and l.apagado_em is null order by l.created_at, l.id`,
      )) as unknown as LigacaoFluxo[],
    );
    return { fluxo, nos, ligacoes, refs: await resolverReferencias(tx, nos), cursor };
  });
}

/**
 * O que mudou desde o cursor (nós e ligações, lápides inclusive), o fluxo e as referências vivas. Barato: usa o índice
 * (org, fluxo, updated_at) e nunca leva bytes de imagem.
 */
export async function fluxoDesde(ctx: Contexto, id: string, cursor: string): Promise<Res<FluxoCompleto>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse fluxo não existe mais.");
  if (typeof cursor !== "string" || !CURSOR.test(cursor)) return falha("formato", "Cursor inválido.");
  return getBanco().asUser(ctx, async (tx) => {
    const novo = await agora(tx);
    const fluxo = await lerInfo(tx, id);
    if (!fluxo) return falha("nao_existe", "Esse fluxo não existe mais.");
    const desde = sql`(${cursor}::timestamptz - interval ${sql.raw(`'${FOLGA}'`)})`;
    const nos = (
      (await tx.execute(
        sql`select ${COLUNAS_NO} ${JUNTAS_NO} where n.org_id = ${ctx.orgId} and n.fluxo_id = ${id} and n.updated_at > ${desde} order by n.updated_at, n.id`,
      )) as unknown as LinhaNo[]
    ).map(paraNo);
    const ligacoes = Array.from(
      (await tx.execute(
        sql`select ${COLUNAS_LIGACAO} from maestro.fluxo_ligacoes l where l.org_id = ${ctx.orgId} and l.fluxo_id = ${id} and l.updated_at > ${desde} order by l.updated_at, l.id`,
      )) as unknown as LigacaoFluxo[],
    );
    return { ok: true as const, fluxo, nos, ligacoes, refs: await refsDoFluxo(tx, id), cursor: novo };
  });
}

// ───────────── o fluxo ─────────────

type Vinculo = { projetoId?: string | null; cardId?: string | null };
function lerVinculo(v: Vinculo): { projetoId: string | null; cardId: string | null } | null {
  const projetoId = v.projetoId ?? null;
  const cardId = v.cardId ?? null;
  if ((projetoId !== null && !ehUuid(projetoId)) || (cardId !== null && !ehCard(cardId))) return null;
  return { projetoId, cardId };
}

/** Cria o fluxo vazio, ligado ou não a projeto/card. */
export async function criarFluxo(ctx: Contexto, e: { titulo: string; demo?: boolean } & Vinculo): Promise<Res<{ id: string; rev: number }>> {
  const t = tituloFluxo(e.titulo);
  if (!t) return falha("titulo", "Dê um título ao fluxo.");
  const v = lerVinculo(e);
  if (!v) return falha("vinculo", "Esse projeto ou card não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [r] = (await tx.execute(sql`
        insert into maestro.fluxos (org_id, projeto_id, card_id, titulo, demo)
        values (${ctx.orgId}, ${v.projetoId}, ${v.cardId}, ${t}, ${e.demo ?? false}) returning id, rev`)) as unknown as { id: string; rev: number }[];
      return { ok: true as const, id: r.id, rev: r.rev };
    });
  } catch (err) {
    return traduzir(err);
  }
}

async function porQueNaoFluxo(tx: Tx, id: string, rev: number | null): Promise<Falha | ConflitoFluxo> {
  const atual = await lerInfo(tx, id);
  if (!atual || atual.apagado) return falha("nao_existe", "Esse fluxo não existe mais.");
  if (rev !== null && atual.rev !== rev) return { ...falha("conflito", "Outra pessoa mudou o título do fluxo."), erro: "conflito", atual };
  return falha("sem_permissao", "Seu papel nesta organização só lê.");
}

/** Muda o título, se o `rev` ainda é o que a tela viu. */
export async function salvarFluxo(ctx: Contexto, id: string, e: { rev: number; titulo: string }): Promise<Res<{ rev: number }> | ConflitoFluxo> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse fluxo não existe mais.");
  if (!Number.isInteger(e.rev) || e.rev < 1) return falha("formato", "Falta a versão do fluxo que a tela viu.");
  const t = tituloFluxo(e.titulo);
  if (!t) return falha("titulo", "Dê um título ao fluxo.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(
        sql`update maestro.fluxos set titulo = ${t} where id = ${id} and rev = ${e.rev} and apagado_em is null returning rev`,
      )) as unknown as { rev: number }[];
      return r.length ? { ok: true as const, rev: r[0].rev } : porQueNaoFluxo(tx, id, e.rev);
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Liga (ou desliga, com null) o fluxo a um projeto e/ou card (a F6 usa em "Mandar para um card"). */
export async function ligarFluxo(ctx: Contexto, id: string, v: Vinculo): Promise<Res> {
  const l = lerVinculo(v);
  if (!ehUuid(id) || !l) return falha("vinculo", "Esse projeto ou card não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(
        sql`update maestro.fluxos set projeto_id = ${l.projetoId}, card_id = ${l.cardId} where id = ${id} and apagado_em is null returning id`,
      );
      return r.length ? { ok: true as const } : porQueNaoFluxo(tx, id, null);
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Manda para a lixeira (`apagar = true`) ou tira dela. */
export async function lixeiraFluxo(ctx: Contexto, id: string, apagar: boolean): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse fluxo não existe mais.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.fluxos set apagado_em = ${apagar ? sql`now()` : sql`null`}
         where id = ${id} and ${apagar ? sql`apagado_em is null` : sql`apagado_em is not null`} returning id`);
      if (r.length) return { ok: true as const };
      const atual = await lerInfo(tx, id);
      if (atual && atual.apagado === apagar) return { ok: true as const };
      return atual ? falha("sem_permissao", "Seu papel nesta organização só lê.") : falha("nao_existe", "Esse fluxo não existe mais.");
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Apaga de vez um fluxo que está na lixeira (nós, ligações e imagens juntos; libera a cota). Só administração e gestão. */
export async function apagarFluxoDeVez(ctx: Contexto, id: string): Promise<Res<{ bytes: number }>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse fluxo não existe mais.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const atual = await lerInfo(tx, id);
      if (!atual) return falha("nao_existe", "Esse fluxo não existe mais.");
      if (!atual.apagado) return falha("fora_da_lixeira", "Mande para a lixeira antes de apagar de vez.");
      const [b] = (await tx.execute(sql`select coalesce(sum(bytes), 0)::bigint as bytes from maestro.fluxo_imagens where fluxo_id = ${id}`)) as unknown as {
        bytes: string | number;
      }[];
      const r = await tx.execute(sql`delete from maestro.fluxos where id = ${id} and apagado_em is not null returning id`);
      if (!r.length) return falha("sem_permissao", "Só administração e gestão apagam de vez.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'fluxo.apagou', 'fluxo', ${id}, ${JSON.stringify({ titulo: atual.titulo, bytes: Number(b.bytes) })}::jsonb)`);
      return { ok: true as const, bytes: Number(b.bytes) };
    });
  } catch (err) {
    return traduzir(err);
  }
}

// ───────────── nós e ligações ─────────────

async function lerNo(tx: Tx, fluxoId: string, id: string, travar: boolean): Promise<NoFluxo | null> {
  const [l] = (await tx.execute(
    sql`select ${COLUNAS_NO} ${JUNTAS_NO} where n.fluxo_id = ${fluxoId} and n.id = ${id} ${travar ? sql`for update of n` : sql``}`,
  )) as unknown as LinhaNo[];
  return l ? paraNo(l) : null;
}

async function lerLigacao(tx: Tx, fluxoId: string, id: string, travar = false): Promise<LigacaoFluxo | null> {
  const [l] = (await tx.execute(
    sql`select ${COLUNAS_LIGACAO} from maestro.fluxo_ligacoes l where l.fluxo_id = ${fluxoId} and l.id = ${id} ${travar ? sql`for update` : sql``}`,
  )) as unknown as LigacaoFluxo[];
  return l ?? null;
}

async function aplicarUma(tx: Tx, ctx: Contexto, fluxoId: string, op: Op, indice: number): Promise<ResultadoOp> {
  switch (op.op) {
    case "criar_no": {
      const [r] = (await tx.execute(sql`
        insert into maestro.fluxo_nos (${op.id ? sql`id, ` : sql``}org_id, fluxo_id, tipo, x, y, w, h, z, secao_id, dados, imagem_id, roteiro_id, card_id)
        values (${op.id ? sql`${op.id}, ` : sql``}${ctx.orgId}, ${fluxoId}, ${op.tipo}, ${op.x}, ${op.y}, ${op.w}, ${op.h}, ${op.z}, ${op.secaoId},
                ${JSON.stringify(op.dados)}::jsonb, ${op.imagemId}, ${op.roteiroId}, ${op.cardId})
        returning id`)) as unknown as { id: string }[];
      const no = await lerNo(tx, fluxoId, r.id, false);
      return { ok: true, no: no! };
    }
    case "mudar_no": {
      const atual = await lerNo(tx, fluxoId, op.id, true);
      if (!atual) return { ok: false, erro: "nao_existe", id: op.id };
      if (atual.apagado || (op.rev !== undefined && op.rev !== atual.rev)) return { ok: false, erro: "conflito", no: atual };
      const sets = [];
      for (const k of ["x", "y", "w", "h", "z"] as const) if (op[k] !== undefined) sets.push(sql`${sql.identifier(k)} = ${op[k]}`);
      if (op.secaoId !== undefined) {
        if (op.secaoId !== null && atual.tipo === "secao") throw new Recusa(falha("secao", "Seção não entra em outra seção."));
        sets.push(sql`secao_id = ${op.secaoId}`);
      }
      if (op.dados !== undefined) {
        const dados = lerDados(atual.tipo, { ...(atual.dados as Record<string, unknown>), ...op.dados });
        if (!dados) throw new Recusa({ ...falha("formato", `Confira o conteúdo do item (mudança ${indice + 1}).`) });
        sets.push(sql`dados = ${JSON.stringify(dados)}::jsonb`);
      }
      await tx.execute(sql`update maestro.fluxo_nos set ${sql.join(sets, sql`, `)} where fluxo_id = ${fluxoId} and id = ${op.id}`);
      return { ok: true, no: (await lerNo(tx, fluxoId, op.id, false))! };
    }
    case "apagar_no":
    case "restaurar_no": {
      const apagar = op.op === "apagar_no";
      await tx.execute(sql`
        update maestro.fluxo_nos set apagado_em = ${apagar ? sql`now()` : sql`null`}
         where fluxo_id = ${fluxoId} and id = ${op.id} and ${apagar ? sql`apagado_em is null` : sql`apagado_em is not null`}`);
      const no = await lerNo(tx, fluxoId, op.id, false);
      return no ? { ok: true, no } : { ok: false, erro: "nao_existe", id: op.id };
    }
    case "criar_ligacao": {
      const r = (await tx.execute(sql`
        insert into maestro.fluxo_ligacoes (${op.id ? sql`id, ` : sql``}org_id, fluxo_id, de, para, rotulo)
        values (${op.id ? sql`${op.id}, ` : sql``}${ctx.orgId}, ${fluxoId}, ${op.de}, ${op.para}, ${op.rotulo})
        on conflict (org_id, fluxo_id, de, para) where apagado_em is null do nothing
        returning id`)) as unknown as { id: string }[];
      let id = r[0]?.id;
      if (!id) {
        // a mesma ligação já existe viva: devolve a que está lá
        const [ja] = (await tx.execute(
          sql`select id from maestro.fluxo_ligacoes where fluxo_id = ${fluxoId} and de = ${op.de} and para = ${op.para} and apagado_em is null`,
        )) as unknown as { id: string }[];
        id = ja.id;
      }
      return { ok: true, ligacao: (await lerLigacao(tx, fluxoId, id))! };
    }
    case "mudar_ligacao": {
      const atual = await lerLigacao(tx, fluxoId, op.id, true);
      if (!atual) return { ok: false, erro: "nao_existe", id: op.id };
      if (atual.apagado || (op.rev !== undefined && op.rev !== atual.rev)) return { ok: false, erro: "conflito", ligacao: atual };
      await tx.execute(sql`update maestro.fluxo_ligacoes set rotulo = ${op.rotulo} where fluxo_id = ${fluxoId} and id = ${op.id}`);
      return { ok: true, ligacao: (await lerLigacao(tx, fluxoId, op.id))! };
    }
    case "apagar_ligacao":
    case "restaurar_ligacao": {
      const apagar = op.op === "apagar_ligacao";
      await tx.execute(sql`
        update maestro.fluxo_ligacoes set apagado_em = ${apagar ? sql`now()` : sql`null`}
         where fluxo_id = ${fluxoId} and id = ${op.id} and ${apagar ? sql`apagado_em is null` : sql`apagado_em is not null`}`);
      const l = await lerLigacao(tx, fluxoId, op.id);
      return l ? { ok: true, ligacao: l } : { ok: false, erro: "nao_existe", id: op.id };
    }
  }
}

/**
 * Grava as operações (já conferidas por `lerOps`) numa transação, em ordem. Devolve um resultado por operação e as
 * referências dos nós de referência tocados.
 */
export async function aplicarOps(
  ctx: Contexto,
  fluxoId: string,
  ops: readonly Op[],
): Promise<Res<{ resultados: ResultadoOp[]; refs: Record<string, RefResolvida> }>> {
  if (!ehUuid(fluxoId)) return falha("nao_existe", "Esse fluxo não existe mais.");
  if (!ops.length) return falha("formato", "Nada para gravar.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [eu] = (await tx.execute(
        sql`select maestro.has_role(${ctx.orgId}::uuid, ${`{${PAPEIS_EDITAR_CRIACAO.join(",")}}`}::text[]) as pode`,
      )) as unknown as {
        pode: boolean;
      }[];
      if (!eu?.pode) return falha("sem_permissao", "Seu papel nesta organização só lê.");
      const f = await lerInfo(tx, fluxoId);
      if (!f) return falha("nao_existe", "Esse fluxo não existe mais.");
      if (f.apagado) return falha("na_lixeira", "Esse fluxo está na lixeira. Tire de lá para mexer.");
      const resultados: ResultadoOp[] = [];
      for (let i = 0; i < ops.length; i++) resultados.push(await aplicarUma(tx, ctx, fluxoId, ops[i], i));
      const tocados = resultados.flatMap((r) => ("no" in r && r.ok ? [r.no] : []));
      return { ok: true as const, resultados, refs: await resolverReferencias(tx, tocados) };
    });
  } catch (err) {
    return traduzir(err);
  }
}

// ───────────── imagens ─────────────

const COLUNAS_IMAGEM = sql`id, sha256, largura, altura, mini_largura as "miniLargura", mini_altura as "miniAltura"`;
type LinhaImagem = Omit<ImagemNo, "url" | "miniUrl">;
const comUrl = (i: LinhaImagem): ImagemNo => ({ ...i, url: urlDaImagem(i.id, i.sha256), miniUrl: urlDaImagem(i.id, i.sha256, true) });

async function inserirImagem(
  ctx: Contexto,
  fluxoId: string,
  p: Extract<Awaited<ReturnType<typeof prepararImagem>>, { ok: true }>,
): Promise<{ imagem: ImagemNo; jaExistia: boolean }> {
  return getBanco().asUser(ctx, async (tx) => {
    // A mesma imagem colada de novo no mesmo fluxo: reaproveita (não gasta cota).
    const [ja] = (await tx.execute(
      sql`select ${COLUNAS_IMAGEM} from maestro.fluxo_imagens where fluxo_id = ${fluxoId} and sha256 = ${p.sha256}`,
    )) as unknown as LinhaImagem[];
    if (ja) return { imagem: comUrl(ja), jaExistia: true };
    const [r] = (await tx.execute(sql`
      insert into maestro.fluxo_imagens (org_id, fluxo_id, sha256, largura, altura, webp, mini, mini_largura, mini_altura)
      values (${ctx.orgId}, ${fluxoId}, ${p.sha256}, ${p.largura}, ${p.altura}, ${p.webp}, ${p.mini}, ${p.miniLargura}, ${p.miniAltura})
      returning ${COLUNAS_IMAGEM}`)) as unknown as LinhaImagem[];
    return { imagem: comUrl(r), jaExistia: false };
  });
}

/**
 * Recebe os bytes colados, confere e reencoda (WebP ≤ 400 KB + miniatura) e grava no fluxo. Sem cota: roda a limpeza
 * (lápides com mais de 7 dias e imagens soltas) uma vez e tenta de novo; se ainda não couber, a mensagem diz quanto.
 * Depois a tela cria o nó com `criar_no` (tipo imagem, `imagemId`).
 */
export async function enviarImagem(ctx: Contexto, fluxoId: string, bytes: Uint8Array | ArrayBuffer): Promise<Res<{ imagem: ImagemNo; jaExistia: boolean }>> {
  if (!ehUuid(fluxoId)) return falha("nao_existe", "Esse fluxo não existe mais.");
  const p = await prepararImagem(bytes);
  if (!p.ok) return falha(p.erro, p.mensagem);
  try {
    return { ok: true, ...(await inserirImagem(ctx, fluxoId, p)) };
  } catch (err) {
    const f = traduzir(err);
    if (f.erro !== "cota") return f;
    try {
      const l = await limparFluxos(ctx);
      if (!l.ok || l.bytes === 0) return f;
      return { ok: true, ...(await inserirImagem(ctx, fluxoId, p)) };
    } catch (err2) {
      return traduzir(err2);
    }
  }
}

/** Os bytes da imagem (ou da miniatura), como a pessoa: só com id e sha256 certos e o fluxo no alcance. */
export async function lerImagem(ctx: Contexto, id: string, sha: string, mini = false): Promise<Buffer | null> {
  if (!ehUuid(id) || !SHA.test(sha)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [r] = (await tx.execute(sql`select bytes from maestro.fluxo_imagem(${id}::uuid, ${sha}, ${mini})`)) as unknown as { bytes: Buffer | null }[];
    return r?.bytes ? Buffer.from(r.bytes) : null;
  });
}

/** Quanto da cota de imagens a produtora já usou. */
export async function usoDasImagens(ctx: Contexto): Promise<Uso> {
  return getBanco().asUser(ctx, async (tx) => {
    const [u] = (await tx.execute(
      sql`select usado::bigint as usado, limite, imagens, imagens_por_fluxo as "porFluxo" from maestro.fluxo_imagens_uso()`,
    )) as unknown as { usado: string | number; limite: string | number; imagens: number; porFluxo: number }[];
    if (!u) return { usado: 0, limite: COTA.bytesPorOrganizacao, imagens: 0, imagensPorFluxo: COTA.imagensPorFluxo };
    return { usado: Number(u.usado), limite: Number(u.limite), imagens: Number(u.imagens), imagensPorFluxo: Number(u.porFluxo) };
  });
}

/** Tira de vez lápides com mais de 7 dias e imagens que nenhum nó usa (há mais de 1 hora). Só quem escreve. */
export async function limparFluxos(ctx: Contexto): Promise<Res<{ nos: number; ligacoes: number; imagens: number; bytes: number }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [r] = (await tx.execute(sql`select nos, ligacoes, imagens, bytes from maestro.fluxo_limpar()`)) as unknown as {
        nos: number;
        ligacoes: number;
        imagens: number;
        bytes: string | number;
      }[];
      return { ok: true as const, nos: Number(r.nos), ligacoes: Number(r.ligacoes), imagens: Number(r.imagens), bytes: Number(r.bytes) };
    });
  } catch (err) {
    return traduzir(err);
  }
}

// ───────────── exportação ─────────────

/** O fluxo vivo, lido como quem exporta, pronto para `fluxoParaMarkdown`/`fluxoParaJson` (exportar.ts). */
export async function dadosParaExportar(ctx: Contexto, id: string): Promise<(FluxoParaExportar & { fluxo: FluxoInfo }) | null> {
  const f = await obterFluxo(ctx, id);
  if (!f) return null;
  return { fluxo: f.fluxo, titulo: f.fluxo.titulo, nos: f.nos, ligacoes: f.ligacoes, refs: f.refs };
}

/** Os tipos de nó que levam referência (para a tela). */
export const TIPOS_REFERENCIA: readonly TipoNo[] = ["roteiro", "card"];
