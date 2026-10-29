/**
 * Roteiros no banco (drizzle/0030_roteiros.sql), sempre como a pessoa (`asUser`, RLS): a organização e a pessoa vêm da
 * sessão (`Contexto`, nunca do corpo do pedido) e o papel é conferido pelo banco (políticas, gatilho `roteiros_guarda`
 * e `maestro.roteiro_versao_salvar`). A tela e as rotas usam antes `podeEditarCriacao`/`podeEnviarCriacao`
 * (`../permissoes.ts`) para responder 403 sem ir ao banco; o banco decide de novo.
 *
 * Gravação com `rev`: `salvarRoteiro` manda o `rev` que a tela viu; se mudou, volta `{ erro: "conflito", atual }` (a
 * tela junta com `juntarRoteiros` e grava de novo com o `rev` do atual). O conteúdo passa sempre por `lerRoteiro` e o
 * total estimado (`duracao_seg`) é recalculado aqui.
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Falha, type Res } from "@/lib/crm/comum";
import { roteiroDoDocumentoAntigo } from "./antigo";
import { type Alvo, type Formato, lerRoteiro, type Roteiro } from "./modelo";
import { ehModeloRoteiro, type ModeloRoteiro, roteiroDoModelo } from "./modelos";
import { duracaoDoRoteiro } from "./tempo";

import { ESTADOS_ROTEIRO, type EstadoRoteiro } from "./nomes";

export { ESTADOS_ROTEIRO, NOME_ESTADO_ROTEIRO, type EstadoRoteiro } from "./nomes";
const ehEstado = (v: unknown): v is EstadoRoteiro => ESTADOS_ROTEIRO.includes(v as EstadoRoteiro);

/** Modelo gravado: um dos 6, ou "documento" (veio de um documento antigo do projeto). */
export type ModeloGravado = ModeloRoteiro | "documento";

export type RoteiroLista = {
  id: string;
  titulo: string;
  modelo: ModeloGravado;
  formato: Formato;
  estado: EstadoRoteiro;
  duracaoSeg: number;
  /** O alvo do conteúdo (para o medidor do cartão). */
  alvo: Alvo | null;
  versaoAtual: number;
  rev: number;
  projetoId: string | null;
  projeto: string | null;
  cardId: string | null;
  card: string | null;
  demo: boolean;
  atualizado: string;
  apagado: boolean;
};
export type RoteiroCompleto = RoteiroLista & { conteudo: Roteiro; origemDocumentoId: string | null; criadoPor: string | null; atualizadoPor: string | null };

export type VersaoLista = {
  id: string;
  n: number;
  titulo: string;
  sha256: string;
  nota: string | null;
  duracaoSeg: number;
  criadoPor: string | null;
  criadoEm: string;
};
export type VersaoCompleta = VersaoLista & { conteudo: Roteiro };

export type Conflito = Falha & { erro: "conflito"; atual: RoteiroCompleto };

const TITULO_MAX = 200;
const titulo = (t: unknown) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, TITULO_MAX) : "");
const CARD = /^[A-Za-z0-9_-]{4,64}$/;
const ehCard = (v: unknown): v is string => typeof v === "string" && CARD.test(v);

function traduzir(e: unknown): Falha {
  const c = codigoPg(e);
  const m = mensagemPg(e);
  if (m === "roteiro:nao_existe") return falha("nao_existe", "Esse roteiro não existe mais.");
  if (m === "roteiro:nota") return falha("formato", "A nota da versão passa de 500 letras.");
  if (c === PG.semPrivilegio && /estado do roteiro/.test(m)) return falha("sem_permissao", "Só administração e gestão mudam o estado do roteiro.");
  if (c === PG.semPrivilegio && /registro imutável/.test(m)) return falha("tem_versao", "Esse roteiro tem versões salvas e não pode ser apagado de vez.");
  if (c === PG.unicidade) return falha("ja_existe", "Esse documento já foi aberto no editor novo.");
  return traduzirPg(e);
}

const COLUNAS = sql`
  r.id, r.titulo, r.modelo, r.formato, r.estado, r.duracao_seg as "duracaoSeg", r.conteudo -> 'alvo' as alvo, r.versao_atual as "versaoAtual", r.rev,
  r.projeto_id as "projetoId", p.title as projeto, r.card_id as "cardId", k.dados ->> 'tema' as card, r.demo,
  r.updated_at::text as atualizado, r.apagado_em is not null as apagado`;
const JUNTAS = sql`
  from maestro.roteiros r
  left join maestro.projects p on p.org_id = r.org_id and p.id = r.projeto_id
  left join maestro.cards k on k.org_id = r.org_id and k.id = r.card_id`;

async function lerCompleto(tx: Tx, id: string): Promise<RoteiroCompleto | null> {
  const [r] = (await tx.execute(sql`
    select ${COLUNAS}, r.conteudo, r.origem_documento_id as "origemDocumentoId", r.created_by as "criadoPor", r.updated_by as "atualizadoPor"
    ${JUNTAS} where r.id = ${id}`)) as unknown as (RoteiroCompleto & { conteudo: unknown })[];
  if (!r) return null;
  return { ...r, conteudo: lerRoteiro(r.conteudo) ?? roteiroDoModelo("branco") };
}

/** Roteiros da organização (sem os da lixeira, a não ser com `lixeira`), do mais novo para o mais velho. */
export async function listarRoteiros(ctx: Contexto, filtro: { projetoId?: string; cardId?: string; lixeira?: boolean } = {}): Promise<RoteiroLista[]> {
  if (filtro.projetoId !== undefined && !ehUuid(filtro.projetoId)) return [];
  if (filtro.cardId !== undefined && !ehCard(filtro.cardId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select ${COLUNAS} ${JUNTAS}
       where ${filtro.lixeira ? sql`r.apagado_em is not null` : sql`r.apagado_em is null`}
         ${filtro.projetoId ? sql`and r.projeto_id = ${filtro.projetoId}` : sql``}
         ${filtro.cardId ? sql`and r.card_id = ${filtro.cardId}` : sql``}
       order by r.updated_at desc, r.id
       limit 500`);
    return Array.from(r as unknown as RoteiroLista[]);
  });
}

/** Um roteiro com o conteúdo (também da lixeira). null = não existe ou fora do alcance da pessoa. */
export async function obterRoteiro(ctx: Contexto, id: string): Promise<RoteiroCompleto | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, (tx) => lerCompleto(tx, id));
}

type Vinculo = { projetoId?: string | null; cardId?: string | null };
function lerVinculo(v: Vinculo): { projetoId: string | null; cardId: string | null } | null {
  const projetoId = v.projetoId ?? null;
  const cardId = v.cardId ?? null;
  if ((projetoId !== null && !ehUuid(projetoId)) || (cardId !== null && !ehCard(cardId))) return null;
  return { projetoId, cardId };
}

/**
 * Cria o roteiro a partir de um modelo (padrão "Em branco") ou de um conteúdo pronto (conferido por `lerRoteiro`),
 * ligado ou não a projeto/card.
 */
export async function criarRoteiro(
  ctx: Contexto,
  e: { titulo: string; modelo?: ModeloRoteiro; conteudo?: unknown; demo?: boolean } & Vinculo,
): Promise<Res<{ id: string; rev: number }>> {
  const t = titulo(e.titulo);
  if (!t) return falha("titulo", "Dê um título ao roteiro.");
  const modelo = e.modelo ?? "branco";
  if (!ehModeloRoteiro(modelo)) return falha("modelo", "Escolha um dos modelos.");
  const v = lerVinculo(e);
  if (!v) return falha("vinculo", "Esse projeto ou card não existe.");
  const conteudo = e.conteudo === undefined ? roteiroDoModelo(modelo) : lerRoteiro(e.conteudo);
  if (!conteudo) return falha("formato", "O roteiro passou do tamanho ou veio num formato que não cabe.");
  return gravarNovo(ctx, { titulo: t, modelo, conteudo, ...v, origem: null, demo: e.demo ?? false });
}

async function gravarNovo(
  ctx: Contexto,
  e: { titulo: string; modelo: ModeloGravado; conteudo: Roteiro; projetoId: string | null; cardId: string | null; origem: string | null; demo: boolean },
): Promise<Res<{ id: string; rev: number }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [r] = (await tx.execute(sql`
        insert into maestro.roteiros (org_id, projeto_id, card_id, origem_documento_id, titulo, modelo, formato, conteudo, duracao_seg, demo)
        values (${ctx.orgId}, ${e.projetoId}, ${e.cardId}, ${e.origem}, ${e.titulo}, ${e.modelo}, ${e.conteudo.formato}, ${JSON.stringify(e.conteudo)}::jsonb,
                ${Math.round(duracaoDoRoteiro(e.conteudo))}, ${e.demo})
        returning id, rev`)) as unknown as { id: string; rev: number }[];
      return { ok: true as const, id: r.id, rev: r.rev };
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Por que um update não pegou linha: conflito de rev, sem papel ou não existe. */
async function porQueNao(tx: Tx, id: string, rev: number | null): Promise<Falha | Conflito> {
  const atual = await lerCompleto(tx, id);
  if (!atual || atual.apagado) return falha("nao_existe", "Esse roteiro não existe mais.");
  if (rev !== null && atual.rev !== rev) return { ...falha("conflito", "Outra pessoa mudou este roteiro. Juntamos as duas versões."), erro: "conflito", atual };
  return falha("sem_permissao", "Seu papel nesta organização só lê.");
}

/**
 * Grava o rascunho (título, formato e/ou conteúdo) se o `rev` ainda é o que a tela viu. O formato do conteúdo manda
 * na coluna `formato`. Devolve o `rev` novo.
 */
export async function salvarRoteiro(
  ctx: Contexto,
  id: string,
  e: { rev: number; titulo?: string; conteudo?: unknown },
): Promise<Res<{ rev: number; duracaoSeg: number; atualizado: string }> | Conflito> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse roteiro não existe mais.");
  if (!Number.isInteger(e.rev) || e.rev < 1) return falha("formato", "Falta a versão do rascunho que a tela viu.");
  const t = e.titulo === undefined ? undefined : titulo(e.titulo);
  if (t === "") return falha("titulo", "Dê um título ao roteiro.");
  const conteudo = e.conteudo === undefined ? undefined : lerRoteiro(e.conteudo);
  if (conteudo === null) return falha("formato", "O roteiro passou do tamanho ou veio num formato que não cabe.");
  if (t === undefined && conteudo === undefined) return falha("formato", "Nada para gravar.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const sets = [
        t !== undefined ? sql`titulo = ${t}` : null,
        conteudo
          ? sql`conteudo = ${JSON.stringify(conteudo)}::jsonb, formato = ${conteudo.formato}, duracao_seg = ${Math.round(duracaoDoRoteiro(conteudo))}`
          : null,
      ].filter((x): x is ReturnType<typeof sql> => x !== null);
      const r = (await tx.execute(sql`
        update maestro.roteiros set ${sql.join(sets, sql`, `)}
         where id = ${id} and rev = ${e.rev} and apagado_em is null
        returning rev, duracao_seg as "duracaoSeg", updated_at::text as atualizado`)) as unknown as { rev: number; duracaoSeg: number; atualizado: string }[];
      if (r.length) return { ok: true as const, ...r[0] };
      return porQueNao(tx, id, e.rev);
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Liga (ou desliga, com null) o roteiro a um projeto e/ou card da organização. */
export async function ligarRoteiro(ctx: Contexto, id: string, v: Vinculo): Promise<Res> {
  const l = lerVinculo(v);
  if (!ehUuid(id) || !l) return falha("vinculo", "Esse projeto ou card não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.roteiros set projeto_id = ${l.projetoId}, card_id = ${l.cardId} where id = ${id} and apagado_em is null returning id`);
      return r.length ? { ok: true as const } : porQueNao(tx, id, null);
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Muda o estado (rascunho, com o cliente, aprovado, ajuste). Só administração e gestão (o banco confere). */
export async function mudarEstadoRoteiro(ctx: Contexto, id: string, estado: EstadoRoteiro): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse roteiro não existe mais.");
  if (!ehEstado(estado)) return falha("formato", "Estado desconhecido.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`update maestro.roteiros set estado = ${estado} where id = ${id} and apagado_em is null returning id`);
      return r.length ? { ok: true as const } : porQueNao(tx, id, null);
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** Manda para a lixeira (`apagar = true`) ou tira dela. Nada se apaga de vez por aqui. */
export async function lixeiraRoteiro(ctx: Contexto, id: string, apagar: boolean): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse roteiro não existe mais.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.roteiros set apagado_em = ${apagar ? sql`now()` : sql`null`}
         where id = ${id} and ${apagar ? sql`apagado_em is null` : sql`apagado_em is not null`} returning id`);
      if (r.length) return { ok: true as const };
      const atual = await lerCompleto(tx, id);
      if (atual && atual.apagado === apagar) return { ok: true as const };
      return atual ? falha("sem_permissao", "Seu papel nesta organização só lê.") : falha("nao_existe", "Esse roteiro não existe mais.");
    });
  } catch (err) {
    return traduzir(err);
  }
}

/** "Salvar versão": congela o rascunho como está gravado (n = a anterior + 1). */
export async function salvarVersao(ctx: Contexto, id: string, nota?: string | null): Promise<Res<{ id: string; n: number; sha256: string }>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse roteiro não existe mais.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [v] = (await tx.execute(sql`select id, n, sha256 from maestro.roteiro_versao_salvar(${id}::uuid, ${nota ?? null})`)) as unknown as {
        id: string;
        n: number;
        sha256: string;
      }[];
      return { ok: true as const, ...v };
    });
  } catch (err) {
    return traduzir(err);
  }
}

const COLUNAS_VERSAO = sql`
  id, n, titulo, sha256, nota, duracao_seg as "duracaoSeg", criado_por as "criadoPor", criado_em::text as "criadoEm"`;

export async function listarVersoes(ctx: Contexto, roteiroId: string): Promise<VersaoLista[]> {
  if (!ehUuid(roteiroId)) return [];
  return getBanco().asUser(ctx, async (tx) =>
    Array.from(
      (await tx.execute(
        sql`select ${COLUNAS_VERSAO} from maestro.roteiro_versoes where roteiro_id = ${roteiroId} order by n desc`,
      )) as unknown as VersaoLista[],
    ),
  );
}

export async function obterVersao(ctx: Contexto, roteiroId: string, n: number): Promise<VersaoCompleta | null> {
  if (!ehUuid(roteiroId) || !Number.isInteger(n) || n < 1) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [v] = (await tx.execute(sql`
      select ${COLUNAS_VERSAO}, conteudo from maestro.roteiro_versoes where roteiro_id = ${roteiroId} and n = ${n}`)) as unknown as (VersaoLista & {
      conteudo: unknown;
    })[];
    if (!v) return null;
    return { ...v, conteudo: lerRoteiro(v.conteudo) ?? roteiroDoModelo("branco") };
  });
}

/**
 * "Restaurar": o rascunho passa a ser o conteúdo (e o título) da versão n. A versão antiga nunca muda; o rascunho
 * restaurado vira a próxima versão só quando alguém salvar.
 */
export async function restaurarVersao(ctx: Contexto, roteiroId: string, n: number, rev: number): Promise<Res<{ rev: number }> | Conflito> {
  if (!ehUuid(roteiroId) || !Number.isInteger(n) || n < 1) return falha("nao_existe", "Essa versão não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [v] = (await tx.execute(sql`select titulo, conteudo from maestro.roteiro_versoes where roteiro_id = ${roteiroId} and n = ${n}`)) as unknown as {
        titulo: string;
        conteudo: unknown;
      }[];
      if (!v) return falha("nao_existe", "Essa versão não existe.");
      const conteudo = lerRoteiro(v.conteudo);
      if (!conteudo) return falha("formato", "Essa versão não abre neste editor.");
      const r = (await tx.execute(sql`
        update maestro.roteiros set titulo = ${v.titulo}, conteudo = ${JSON.stringify(conteudo)}::jsonb, formato = ${conteudo.formato},
               duracao_seg = ${Math.round(duracaoDoRoteiro(conteudo))}
         where id = ${roteiroId} and rev = ${rev} and apagado_em is null returning rev`)) as unknown as { rev: number }[];
      return r.length ? { ok: true as const, rev: r[0].rev } : porQueNao(tx, roteiroId, rev);
    });
  } catch (err) {
    return traduzir(err);
  }
}

/**
 * "Abrir no editor novo": converte o roteiro ou a decupagem antiga do projeto num roteiro novo ligado ao mesmo
 * projeto. Um por documento: chamar de novo devolve o que já existe. O documento antigo não muda.
 */
export async function abrirDocumentoAntigo(ctx: Contexto, documentoId: string): Promise<Res<{ id: string; rev: number; jaExistia: boolean }>> {
  if (!ehUuid(documentoId)) return falha("nao_existe", "Esse documento não existe.");
  const lido = await getBanco().asUser(ctx, async (tx) => {
    const [d] = (await tx.execute(
      sql`select id, projeto_id as "projetoId", tipo, titulo, conteudo from maestro.documentos where id = ${documentoId}`,
    )) as unknown as {
      id: string;
      projetoId: string;
      tipo: string;
      titulo: string;
      conteudo: unknown;
    }[];
    const [ja] = (await tx.execute(sql`select id, rev from maestro.roteiros where origem_documento_id = ${documentoId}`)) as unknown as {
      id: string;
      rev: number;
    }[];
    return { d, ja };
  });
  if (lido.ja) return { ok: true, id: lido.ja.id, rev: lido.ja.rev, jaExistia: true };
  const d = lido.d;
  if (!d) return falha("nao_existe", "Esse documento não existe.");
  const conteudo = roteiroDoDocumentoAntigo(d.tipo, d.conteudo);
  if (!conteudo) return falha("tipo", "Só roteiro e decupagem abrem no editor novo.");
  if (!lerRoteiro(conteudo)) return falha("formato", "Esse documento é grande demais para o editor novo.");
  const r = await gravarNovo(ctx, {
    titulo: titulo(d.titulo) || "Roteiro",
    modelo: "documento",
    conteudo,
    projetoId: d.projetoId,
    cardId: null,
    origem: d.id,
    demo: false,
  });
  if (!r.ok && r.erro === "ja_existe") {
    const outro = await getBanco().asUser(
      ctx,
      async (tx) =>
        (await tx.execute(sql`select id, rev from maestro.roteiros where origem_documento_id = ${documentoId}`)) as unknown as { id: string; rev: number }[],
    );
    if (outro[0]) return { ok: true, id: outro[0].id, rev: outro[0].rev, jaExistia: true };
  }
  return r.ok ? { ...r, jaExistia: false } : r;
}

/** Projetos e cards que um roteiro pode ligar (folha "Novo roteiro" e "Ligar"): só os vivos que a pessoa vê. */
export async function opcoesDeVinculo(ctx: Contexto): Promise<{
  projetos: { id: string; codigo: string; titulo: string }[];
  cards: { id: string; tema: string; projetoId: string | null }[];
}> {
  return getBanco().asUser(ctx, async (tx) => {
    const projetos = (await tx.execute(sql`
      select id, code as codigo, title as titulo from maestro.projects
       where deleted_at is null and status in ('active', 'paused') order by code desc limit 300`)) as unknown as {
      id: string;
      codigo: string;
      titulo: string;
    }[];
    const cards = (await tx.execute(sql`
      select id, coalesce(nullif(dados ->> 'tema', ''), 'Card sem tema') as tema, projeto as "projetoId" from maestro.cards
       where apagado_em is null order by updated_at desc limit 300`)) as unknown as { id: string; tema: string; projetoId: string | null }[];
    return { projetos: [...projetos], cards: [...cards] };
  });
}
