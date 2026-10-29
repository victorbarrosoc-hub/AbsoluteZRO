/**
 * O banco do Quadro, sempre como a pessoa (`asUser`, papel maestro_app, RLS): a organização e a pessoa vêm da sessão,
 * nunca do navegador. A escrita é só pelas funções `maestro.card_*` (drizzle/0000_fundacao.sql): grava por campo,
 * versão por campo (conflito quando outra pessoa mudou o mesmo campo antes), lápide e histórico só-inclusão.
 * Aqui só se confere a forma de cada campo e se cliente, projeto e responsável são da mesma organização.
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { CAMPOS_EDITAVEIS, ID_CARD, NOME_DO_CAMPO, valorDoCampo, type CampoEditavel, type CardQ, type DadosCard } from "./metodo";

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
