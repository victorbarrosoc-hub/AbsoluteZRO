/**
 * O banco do Quadro, sempre como a pessoa (`asUser`, papel maestro_app, RLS): a organização e a pessoa vêm da sessão,
 * nunca do navegador. A escrita é só pelas funções `maestro.card_*` (drizzle/0000_fundacao.sql): grava por campo,
 * versão por campo (conflito quando outra pessoa mudou o mesmo campo antes), lápide e histórico só-inclusão.
 * Aqui só se confere a forma de cada campo e se cliente, projeto e responsável são da mesma organização.
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { CAMPOS_EDITAVEIS, ID_CARD, NOME_DO_CAMPO, valorDoCampo, type CampoEditavel, type CardQ, type DadosCard } from "./metodo";
import { seloDaLinha, type CapaDoCard, type LinhaSelo, type Selo, type Selos } from "./selos";
import { prepararCapa } from "./capa";

export type Falha = { ok: false; status: number; erro: string; mensagem: string; campo?: string; card?: CardQ | null };
export type Res<T extends object = object> = ({ ok: true } & T) | Falha;

const falha = (status: number, erro: string, mensagem: string, extra: Partial<Falha> = {}): Falha => ({ ok: false, status, erro, mensagem, ...extra });
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Teto de um card (texto e briefing): evita gravação gigante por engano. */
const MAX_BYTES = 32_000;

type Linha = { id: string; dados: DadosCard; versao: number; versoes: Record<string, number> };
const paraCard = (l: Linha): CardQ => ({ id: l.id, dados: l.dados, versao: l.versao, versoes: l.versoes ?? {} });

/** Erro do banco → resposta: sem permissão (leitura), conflito por campo, não encontrado, regra. */
function traduzir(e: unknown): Falha {
  const codigo = codigoPg(e);
  const msg = mensagemPg(e);
  if (codigo === PG.semPrivilegio) return falha(403, "sem_permissao", "Seu papel nesta organização só lê o Quadro.");
  if (codigo === "P0002") return falha(404, "nao_existe", "Esse card não existe mais.");
  if (codigo === PG.regra && msg.startsWith("conflito:")) {
    const campo = msg.slice("conflito:".length);
    const nome = (NOME_DO_CAMPO as Record<string, string>)[campo] ?? campo;
    return falha(409, "conflito", `Alguém mudou ${nome} antes de você. O card foi atualizado.`, { campo });
  }
  if (codigo === PG.regra && msg === "coluna:nao_existe")
    return falha(409, "coluna", "Essa coluna não existe mais. O Quadro foi atualizado.", { campo: "coluna" });
  if (codigo === PG.regra && msg === "capa:cota")
    return falha(413, "cota", "As capas da produtora chegaram ao limite. Tire a capa de cards já entregues e tente de novo.");
  if (codigo === PG.unicidade) return falha(409, "id_existe", "Já existe um card com esse número.");
  if (codigo === PG.checagem) return falha(400, "formato", "Um dos campos veio num formato que o Quadro não aceita.");
  throw e;
}

/** Cliente, projeto e responsável precisam existir na organização ativa (o RLS já esconde os de outra). */
async function conferirVinculos(tx: Tx, campos: Partial<Record<CampoEditavel, unknown>>): Promise<Falha | null> {
  if (typeof campos.cliente === "string") {
    const r = await tx.execute(sql`select 1 from maestro.clients where id = ${campos.cliente} and deleted_at is null`);
    if (!r.length) return falha(400, "cliente", "Esse cliente não existe nesta organização.");
  }
  if (typeof campos.projeto === "string") {
    const r = await tx.execute(sql`select client_id from maestro.projects where id = ${campos.projeto} and deleted_at is null`);
    if (!r.length) return falha(400, "projeto", "Esse projeto não existe nesta organização.");
  }
  if (typeof campos.resp === "string") {
    const r = await tx.execute(sql`select 1 from maestro.members where zro_sub = ${campos.resp} and status = 'active'`);
    if (!r.length) return falha(400, "resp", "Essa pessoa não está nesta organização.");
  }
  return null;
}

/** Confere e normaliza os campos que vieram da tela. Campo fora da lista ou valor inválido: recusa tudo. */
function lerCampos(bruto: unknown): { campos: Partial<Record<CampoEditavel, unknown>> } | Falha {
  if (!objeto(bruto)) return falha(400, "formato", "Campos inválidos.");
  const campos: Partial<Record<CampoEditavel, unknown>> = {};
  for (const [k, v] of Object.entries(bruto)) {
    if (!(CAMPOS_EDITAVEIS as readonly string[]).includes(k)) return falha(400, "formato", `O campo ${k} não se muda por aqui.`);
    const valor = valorDoCampo(k as CampoEditavel, v);
    if (valor === undefined) return falha(400, "formato", `Confira ${NOME_DO_CAMPO[k as CampoEditavel]}.`, { campo: k });
    campos[k as CampoEditavel] = valor;
  }
  if (new TextEncoder().encode(JSON.stringify(campos)).length > MAX_BYTES) return falha(413, "card_grande_demais", "O card passou do tamanho máximo.");
  return { campos };
}

const ehFalha = (v: object): v is Falha => (v as Falha).ok === false;

/** Os cards vivos da organização e o cursor (hora do banco) para perguntar "o que mudou desde". */
export async function carregarCards(ctx: Contexto): Promise<{ cards: CardQ[]; cursor: string }> {
  return getBanco().asUser(ctx, async (tx) => {
    const linhas = (await tx.execute(
      sql`select id, dados, versao, versoes from maestro.cards where apagado_em is null order by (dados ->> 'ordem')::numeric nulls last, id`,
    )) as unknown as Linha[];
    const [{ agora }] = (await tx.execute(sql`select clock_timestamp()::text as agora`)) as unknown as { agora: string }[];
    return { cards: linhas.map(paraCard), cursor: agora };
  });
}

/**
 * O que mudou desde o cursor (com 5 s de folga: uma gravação que começou antes e terminou depois não escapa), inclusive
 * os apagados (a tela tira da coluna). Receber o mesmo card duas vezes não faz mal.
 */
export async function cardsDesde(ctx: Contexto, cursor: string): Promise<Res<{ cards: CardQ[]; cursor: string }>> {
  const desde = new Date(cursor);
  if (Number.isNaN(desde.getTime())) return falha(400, "formato", "Cursor inválido.");
  return getBanco().asUser(ctx, async (tx) => {
    const linhas = (await tx.execute(
      sql`select id, dados, versao, versoes from maestro.cards where updated_at > ${new Date(desde.getTime() - 5000).toISOString()}::timestamptz`,
    )) as unknown as Linha[];
    const [{ agora }] = (await tx.execute(sql`select clock_timestamp()::text as agora`)) as unknown as { agora: string }[];
    return { ok: true as const, cards: linhas.map(paraCard), cursor: agora };
  });
}

async function lerCard(ctx: Contexto, id: string): Promise<CardQ | null> {
  return getBanco().asUser(ctx, async (tx) => {
    const [l] = (await tx.execute(sql`select id, dados, versao, versoes from maestro.cards where id = ${id}`)) as unknown as Linha[];
    return l ? paraCard(l) : null;
  });
}

/** Cria um card. Título obrigatório; coluna padrão Pauta; quem criou e quando vêm do servidor. */
export async function criarCard(ctx: Contexto, id: unknown, dados: unknown): Promise<Res<{ card: CardQ }>> {
  if (typeof id !== "string" || !ID_CARD.test(id)) return falha(400, "formato", "Número de card inválido.");
  const lido = lerCampos(dados);
  if (ehFalha(lido)) return lido;
  const { campos } = lido;
  if (campos.tema === undefined || campos.tema === null) return falha(400, "formato", "Dê um título ao card.", { campo: "tema" });
  const doc: Record<string, unknown> = { coluna: "pauta" };
  for (const [k, v] of Object.entries(campos)) if (v !== null) doc[k] = v;
  doc.criadoEm = Date.now();
  doc.colunaEm = doc.criadoEm;
  doc.criadoPor = ctx.sub;
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const vinculo = await conferirVinculos(tx, campos);
      if (vinculo) return vinculo;
      const [l] = (await tx.execute(
        sql`select id, dados, versao, versoes from maestro.card_criar(${id}, ${JSON.stringify(doc)}::jsonb)`,
      )) as unknown as Linha[];
      return { ok: true as const, card: paraCard(l) };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/**
 * Muda só os campos enviados. `base` traz a versão de cada campo que a pessoa viu: se outra pessoa mudou o mesmo
 * campo antes, nada é gravado e a resposta traz o card atual (409). Mudar de coluna marca `colunaEm`.
 */
export async function mudarCard(ctx: Contexto, id: unknown, camposBrutos: unknown, base?: unknown): Promise<Res<{ card: CardQ }>> {
  if (typeof id !== "string" || !ID_CARD.test(id)) return falha(400, "formato", "Número de card inválido.");
  const lido = lerCampos(camposBrutos);
  if (ehFalha(lido)) return lido;
  const { campos } = lido;
  if (!Object.keys(campos).length) return falha(400, "formato", "Nada para mudar.");
  let baseOk: Record<string, number> | null = null;
  if (base !== undefined && base !== null) {
    if (!objeto(base) || !Object.values(base).every((v) => Number.isInteger(v) && (v as number) >= 0)) return falha(400, "formato", "Base inválida.");
    baseOk = base as Record<string, number>;
  }
  const doc: Record<string, unknown> = { ...campos };
  if (campos.coluna) doc.colunaEm = Date.now();
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const vinculo = await conferirVinculos(tx, campos);
      if (vinculo) return vinculo;
      const [l] = (await tx.execute(
        sql`select id, dados, versao, versoes from maestro.card_mudar(${id}, ${JSON.stringify(doc)}::jsonb, ${baseOk ? JSON.stringify(baseOk) : null}::jsonb)`,
      )) as unknown as Linha[];
      return { ok: true as const, card: paraCard(l) };
    });
  } catch (e) {
    const f = traduzir(e);
    if (f.erro === "conflito" || f.erro === "coluna") f.card = await lerCard(ctx, id);
    return f;
  }
}

/** Apagar é lápide; restaurar tira a lápide. Nada some do banco. */
export async function apagarCard(ctx: Contexto, id: unknown, restaurar = false): Promise<Res<{ card: CardQ }>> {
  if (typeof id !== "string" || !ID_CARD.test(id)) return falha(400, "formato", "Número de card inválido.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [l] = (await tx.execute(
        restaurar
          ? sql`select id, dados, versao, versoes from maestro.card_restaurar(${id})`
          : sql`select id, dados, versao, versoes from maestro.card_apagar(${id})`,
      )) as unknown as Linha[];
      return { ok: true as const, card: paraCard(l) };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/* ───────────── selos: a peça, o cliente (src/lib/quadro/selos.ts) ───────────── */

/**
 * Os selos dos cards vivos (todos, ou só `ids`), como a pessoa: o RLS e o acesso por cliente valem (lote, link e
 * decisão que a pessoa não alcança não aparecem). A versão mais nova de cada card; o lote mais recente que já saiu de
 * rascunho, com o link ativo e a decisão desta volta.
 */
async function selosNaTx(tx: Tx, ids: string[] | null): Promise<Selos> {
  if (ids && !ids.length) return {};
  const filtro = ids
    ? sql`and k.id in (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`
    : sql``;
  const linhas = (await tx.execute(sql`
    with alvo as (select k.id from maestro.cards k where k.apagado_em is null ${filtro}),
    ult as (
      select distinct on (v.card_id) v.card_id, v.n, v.fonte, v.url, v.miniatura_url, v.criado_em
        from maestro.versoes v join alvo on alvo.id = v.card_id
       where v.apagado_em is null
       order by v.card_id, v.n desc),
    lote as (
      select distinct on (lc.card_id) lc.card_id, lc.lote_id, lc.volta
        from maestro.lote_cards lc join alvo on alvo.id = lc.card_id
        join maestro.lotes l on l.id = lc.lote_id and l.deleted_at is null and l.status <> 'rascunho'
       order by lc.card_id, coalesce(l.sent_at, l.created_at) desc, l.id)
    select alvo.id, ult.n, ult.fonte, ult.url, ult.miniatura_url as mini, ult.criado_em as "versaoEm",
           d.decision as decisao, d.created_at as "decisaoEm", al.created_at as "linkCriado", al.last_used_at as "linkUsado"
      from alvo
      left join ult on ult.card_id = alvo.id
      left join lote on lote.card_id = alvo.id
      left join lateral (
        select a.decision, a.created_at from maestro.approvals a
         where a.lote_id = lote.lote_id and a.card_id = lote.card_id and coalesce(a.volta, 1) = lote.volta
         order by a.created_at desc limit 1) d on true
      left join lateral (
        select a.created_at, a.last_used_at from maestro.approval_links a
         where a.lote_id = lote.lote_id and a.kind = 'lote' and a.revoked_at is null and a.expires_at > now()
         order by a.created_at desc limit 1) al on true
     where ult.card_id is not null or d.decision is not null or al.created_at is not null`)) as unknown as LinhaSelo[];
  const out: Selos = {};
  for (const l of linhas) {
    const s = seloDaLinha(l);
    if (s) out[l.id] = s;
  }
  return out;
}

/** Os selos de todos os cards vivos (abrir o Quadro). */
export async function selosDoQuadro(ctx: Contexto): Promise<Selos> {
  return getBanco().asUser(ctx, (tx) => selosNaTx(tx, null));
}

/**
 * Os selos que podem ter mudado desde o cursor (poll de 5 s): card mudado, versão nova ou tirada, decisão, lote mexido,
 * link criado, revogado ou aberto. `null` = o card não tem mais selo (link revogado, versão tirada).
 */
export async function selosDesde(ctx: Contexto, cursor: string): Promise<Record<string, Selo | null>> {
  const desde = new Date(cursor);
  if (Number.isNaN(desde.getTime())) return {};
  const d = new Date(desde.getTime() - 5000).toISOString();
  return getBanco().asUser(ctx, async (tx) => {
    const mudaram = (await tx.execute(sql`
      select k.id from maestro.cards k
       where k.apagado_em is null and (
             k.updated_at > ${d}::timestamptz
          or exists (select 1 from maestro.versoes v where v.card_id = k.id and (v.criado_em > ${d}::timestamptz or v.apagado_em > ${d}::timestamptz))
          or exists (select 1 from maestro.approvals a where a.card_id = k.id and a.created_at > ${d}::timestamptz)
          or exists (select 1 from maestro.lote_cards lc join maestro.lotes l on l.id = lc.lote_id
                       left join maestro.approval_links al on al.lote_id = l.id
                      where lc.card_id = k.id
                        and (l.updated_at > ${d}::timestamptz or al.created_at > ${d}::timestamptz
                             or al.revoked_at > ${d}::timestamptz or al.last_used_at > ${d}::timestamptz)))
       limit 2000`)) as unknown as { id: string }[];
    const ids = mudaram.map((r) => r.id);
    const selos = await selosNaTx(tx, ids);
    return Object.fromEntries(ids.map((id) => [id, selos[id] ?? null]));
  });
}

/* ───────────── a capa do card (drizzle/0035, src/lib/quadro/capa.ts) ───────────── */

const SHA = /^[0-9a-f]{64}$/;

/**
 * Põe (ou troca) a capa: a imagem limpa vai para `maestro.card_capas` e a referência para `dados.capa` pelo
 * `card_mudar`, na mesma transação (a versão do card sobe; o poll leva às outras telas). Só quem escreve no Quadro.
 */
export async function porCapa(ctx: Contexto, id: unknown, bytes: Uint8Array): Promise<Res<{ card: CardQ }>> {
  if (typeof id !== "string" || !ID_CARD.test(id)) return falha(400, "formato", "Número de card inválido.");
  const p = await prepararCapa(bytes);
  if (!p.ok) return falha(p.erro === "grande" ? 413 : p.erro === "tipo" ? 415 : 400, p.erro, p.mensagem);
  const capa: CapaDoCard = { sha: p.sha256, l: p.largura, a: p.altura };
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await tx.execute(sql`delete from maestro.card_capas where card_id = ${id}`);
      await tx.execute(
        sql`insert into maestro.card_capas (org_id, card_id, sha256, largura, altura, webp) values (${ctx.orgId}, ${id}, ${p.sha256}, ${p.largura}, ${p.altura}, ${p.webp})`,
      );
      const [l] = (await tx.execute(
        sql`select id, dados, versao, versoes from maestro.card_mudar(${id}, ${JSON.stringify({ capa })}::jsonb)`,
      )) as unknown as Linha[];
      return { ok: true as const, card: paraCard(l) };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/** Tira a capa (bytes e referência). Sem capa, devolve o card como está. */
export async function tirarCapa(ctx: Contexto, id: unknown): Promise<Res<{ card: CardQ }>> {
  if (typeof id !== "string" || !ID_CARD.test(id)) return falha(400, "formato", "Número de card inválido.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await tx.execute(sql`delete from maestro.card_capas where card_id = ${id}`);
      const [l] = (await tx.execute(
        sql`select id, dados, versao, versoes from maestro.card_mudar(${id}, ${JSON.stringify({ capa: null })}::jsonb)`,
      )) as unknown as Linha[];
      return { ok: true as const, card: paraCard(l) };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/** Os bytes da capa, como a pessoa: só com o card e o sha256 certos e o card no alcance (porta `maestro.card_capa`). */
export async function lerCapa(ctx: Contexto, id: string, sha: string): Promise<Buffer | null> {
  if (!ID_CARD.test(id) || !SHA.test(sha)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [r] = (await tx.execute(sql`select maestro.card_capa(${id}, ${sha}) as bytes`)) as unknown as { bytes: Buffer | null }[];
    return r?.bytes ? Buffer.from(r.bytes) : null;
  });
}

/** Pessoas, clientes e projetos que o Quadro mostra nos filtros e na ficha. */
export type Referencias = {
  pessoas: { sub: string; nome: string; foto: string | null }[];
  clientes: { id: string; nome: string }[];
  projetos: { id: string; codigo: string; titulo: string; cliente: string | null }[];
};

export async function referenciasDoQuadro(ctx: Contexto): Promise<Referencias> {
  return getBanco().asUser(ctx, async (tx) => {
    const pessoas = (await tx.execute(
      sql`select zro_sub as sub, coalesce(nullif(display_name, ''), email, 'Pessoa') as nome, picture_url as foto from maestro.members where status = 'active' order by 2`,
    )) as unknown as Referencias["pessoas"];
    const clientes = (await tx.execute(
      sql`select id, name as nome from maestro.clients where deleted_at is null order by lower(name)`,
    )) as unknown as Referencias["clientes"];
    const projetos = (await tx.execute(
      sql`select id, code as codigo, title as titulo, client_id as cliente from maestro.projects where deleted_at is null and status in ('active', 'paused') order by code desc`,
    )) as unknown as Referencias["projetos"];
    return { pessoas: [...pessoas], clientes: [...clientes], projetos: [...projetos] };
  });
}
