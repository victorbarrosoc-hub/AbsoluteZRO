/**
 * Tabela de preços (Ajustes → Tabela de preços): itens com faixas por quantidade, variáveis (nicho, urgência…) e
 * modelos. Sempre como a pessoa (`asUser`, RLS): todos leem; só administração e gestão mudam (o banco confere).
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Erros, type Res } from "@/lib/crm/comum";
import { lerReais, lerNumero } from "@/lib/dinheiro";
import {
  GRUPOS,
  UNIDADES,
  lerLinhasDoModelo,
  lerOpcoes,
  type Faixa,
  type Grupo,
  type ItemTabela,
  type LinhaModelo,
  type Modelo,
  type OpcaoVariavel,
  type Respostas,
  type Variavel,
} from "./motor";

export type VariavelCompleta = Variavel & { id: string };
export type Tabela = { itens: ItemTabela[]; variaveis: VariavelCompleta[]; modelos: (Modelo & { descricao: string | null; ativo: boolean })[] };

type LinhaItem = {
  id: string;
  grupo: Grupo;
  nome: string;
  descricao: string | null;
  unidade: string;
  preco_cents: string;
  custo_cents: string;
  ativo: boolean;
  faixas: { aPartirDe: string; precoCents: string }[] | null;
};

export async function lerTabela(tx: Tx): Promise<Tabela> {
  const itens = (await tx.execute(sql`
    select i.id, i.grupo, i.nome, i.descricao, i.unidade, i.preco_cents, i.custo_cents, i.ativo,
           (select json_agg(json_build_object('aPartirDe', f.a_partir_de, 'precoCents', f.preco_cents) order by f.a_partir_de)
              from maestro.precos_faixas f where f.item_id = i.id) as faixas
      from maestro.precos_itens i
     order by array_position(array['pacote','captacao','pos','extra','logistica'], i.grupo), i.ordem, i.nome`)) as unknown as LinhaItem[];
  const variaveis = (await tx.execute(sql`
    select id, chave, rotulo, tipo, opcoes from maestro.precos_variaveis order by ordem, rotulo`)) as unknown as VariavelCompleta[];
  const modelos = (await tx.execute(sql`
    select id, nome, nicho, descricao, linhas, respostas, ativo from maestro.orcamento_modelos order by ativo desc, nome`)) as unknown as Tabela["modelos"];
  return {
    itens: itens.map((i) => ({
      id: i.id,
      grupo: i.grupo,
      nome: i.nome,
      descricao: i.descricao,
      unidade: i.unidade,
      precoCents: Number(i.preco_cents),
      custoCents: Number(i.custo_cents),
      ativo: i.ativo,
      faixas: (i.faixas ?? []).map((f) => ({ aPartirDe: Number(f.aPartirDe), precoCents: Number(f.precoCents) })),
    })),
    variaveis: variaveis.map((v) => ({ ...v, opcoes: (v.opcoes ?? []) as OpcaoVariavel[] })),
    modelos: modelos.map((m) => ({ ...m, linhas: (m.linhas ?? []) as LinhaModelo[], respostas: (m.respostas ?? {}) as Respostas })),
  };
}

export const carregarTabela = (ctx: Contexto) => getBanco().asUser(ctx, lerTabela);

/* ───────────── itens ───────────── */

export type EntradaItem = {
  grupo: Grupo;
  nome: string;
  descricao: string | null;
  unidade: string;
  precoCents: number;
  custoCents: number;
  ativo: boolean;
  faixas: Faixa[];
};

/** Faixas em texto, uma por linha: "4: 750,00" (a partir de 4, R$ 750,00 cada). */
export function lerFaixas(texto: string): Faixa[] | null {
  const out: Faixa[] = [];
  for (const linha of texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)) {
    const m = linha.match(/^(\d+(?:[.,]\d+)?)\s*(?:\+|ou mais)?\s*[:=→-]\s*(.+)$/i);
    if (!m) return null;
    const q = lerNumero(m[1]);
    const p = lerReais(m[2]);
    if (q == null || !(q > 0) || p == null || !(p >= 0)) return null;
    out.push({ aPartirDe: q, precoCents: p });
  }
  if (new Set(out.map((f) => f.aPartirDe)).size !== out.length || out.length > 12) return null;
  return out.sort((a, b) => a.aPartirDe - b.aPartirDe);
}

export const faixasEmTexto = (f: Faixa[]) =>
  f.map((x) => `${String(x.aPartirDe).replace(".", ",")}: ${(x.precoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`).join("\n");

export function validarItem(f: Record<string, string>): { ok: true; entrada: EntradaItem } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const nome = (f.nome ?? "").trim();
  if (!nome) erros.nome = "Dê um nome ao item.";
  else if (nome.length > 120) erros.nome = "Até 120 caracteres.";
  const descricao = (f.descricao ?? "").trim();
  if (descricao.length > 500) erros.descricao = "Até 500 caracteres.";
  const grupo = GRUPOS.some((g) => g.k === f.grupo) ? (f.grupo as Grupo) : null;
  if (!grupo) erros.grupo = "Escolha o grupo.";
  const unidade = UNIDADES.some((u) => u.k === f.unidade) ? f.unidade : null;
  if (!unidade) erros.unidade = "Escolha a unidade.";
  const preco = lerReais(f.preco);
  if (preco == null || !(preco >= 0)) erros.preco = "Valor inválido.";
  const custo = lerReais(f.custo || "0");
  if (custo == null || !(custo >= 0)) erros.custo = "Valor inválido.";
  const faixas = lerFaixas(f.faixas ?? "");
  if (!faixas) erros.faixas = "Uma por linha, assim: 4: 750,00";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      grupo: grupo!,
      nome,
      descricao: descricao || null,
      unidade: unidade!,
      precoCents: preco!,
      custoCents: custo!,
      ativo: f.ativo !== "nao",
      faixas: faixas!,
    },
  };
}

export async function salvarItem(ctx: Contexto, e: EntradaItem, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Esse item não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      let itemId = id;
      if (id) {
        const r = await tx.execute(sql`
          update maestro.precos_itens set grupo = ${e.grupo}, nome = ${e.nome}, descricao = ${e.descricao}, unidade = ${e.unidade},
                 preco_cents = ${e.precoCents}, custo_cents = ${e.custoCents}, ativo = ${e.ativo}
           where id = ${id} returning id`);
        if (!r.length) return falha("sem_permissao", "Só administração e gestão mudam a tabela de preços.");
        await tx.execute(sql`delete from maestro.precos_faixas where item_id = ${id}`);
      } else {
        const [r] = (await tx.execute(sql`
          insert into maestro.precos_itens (org_id, grupo, nome, descricao, unidade, preco_cents, custo_cents, ativo, ordem)
          values (${ctx.orgId}, ${e.grupo}, ${e.nome}, ${e.descricao}, ${e.unidade}, ${e.precoCents}, ${e.custoCents}, ${e.ativo},
                  (select coalesce(max(ordem), 0) + 1 from maestro.precos_itens where grupo = ${e.grupo}))
          returning id`)) as unknown as { id: string }[];
        itemId = r.id;
      }
      for (const f of e.faixas) {
        await tx.execute(
          sql`insert into maestro.precos_faixas (org_id, item_id, a_partir_de, preco_cents) values (${ctx.orgId}, ${itemId}, ${f.aPartirDe}, ${f.precoCents})`,
        );
      }
      return { ok: true as const, id: itemId! };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function removerItem(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse item não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.precos_itens where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Só administração e gestão mudam a tabela de preços.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── variáveis ───────────── */

/** Opções em texto, uma por linha: "Casamento: 1,3" (rótulo e multiplicador; "| pos, extra" limita aos grupos). */
export function lerOpcoesEmTexto(texto: string): OpcaoVariavel[] | null {
  const brutas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [antes, gruposTxt] = l.split("|");
      const m = antes.match(/^(.+?)(?:\s*[:=]\s*(\d+(?:[.,]\d+)?))?\s*$/);
      if (!m) return null;
      const rotulo = m[1].trim();
      const valor = rotulo
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const grupos = gruposTxt ? gruposTxt.split(/[,\s]+/).filter(Boolean) : undefined;
      return { valor, rotulo, mult: m[2] ? Number(m[2].replace(",", ".")) : undefined, grupos };
    });
  if (brutas.some((b) => !b)) return null;
  return lerOpcoes(brutas);
}

export const opcoesEmTexto = (o: OpcaoVariavel[]) =>
  o.map((x) => `${x.rotulo}${x.mult != null ? `: ${String(x.mult).replace(".", ",")}` : ""}${x.grupos?.length ? ` | ${x.grupos.join(", ")}` : ""}`).join("\n");

export type EntradaVariavel = { chave: string; rotulo: string; tipo: "escolha" | "numero"; opcoes: OpcaoVariavel[] };

export function validarVariavel(f: Record<string, string>): { ok: true; entrada: EntradaVariavel } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const rotulo = (f.rotulo ?? "").trim();
  if (!rotulo || rotulo.length > 80) erros.rotulo = "Dê um nome curto (até 80).";
  const chave =
    (f.chave ?? "").trim() ||
    rotulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(chave)) erros.chave = "Só letras minúsculas, números e _, começando por letra.";
  const tipo = f.tipo === "numero" ? "numero" : "escolha";
  const opcoes = tipo === "escolha" ? lerOpcoesEmTexto(f.opcoes ?? "") : [];
  if (!opcoes || (tipo === "escolha" && !opcoes.length)) erros.opcoes = "Uma opção por linha, assim: Casamento: 1,3";
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, entrada: { chave, rotulo, tipo, opcoes: opcoes! } };
}

export async function salvarVariavel(ctx: Contexto, e: EntradaVariavel, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Essa variável não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = (await (id
        ? tx.execute(sql`update maestro.precos_variaveis set chave = ${e.chave}, rotulo = ${e.rotulo}, tipo = ${e.tipo}, opcoes = ${JSON.stringify(e.opcoes)}::jsonb
                          where id = ${id} returning id`)
        : tx.execute(sql`insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo, opcoes, ordem)
                          values (${ctx.orgId}, ${e.chave}, ${e.rotulo}, ${e.tipo}, ${JSON.stringify(e.opcoes)}::jsonb,
                                  (select coalesce(max(ordem), 0) + 1 from maestro.precos_variaveis)) returning id`))) as unknown as { id: string }[];
      return r.length ? { ok: true as const, id: r[0].id } : falha("sem_permissao", "Só administração e gestão mudam a tabela de preços.");
    });
  } catch (err) {
    if (codigoPg(err) === PG.unicidade) return falha("repetida", "Já existe uma variável com essa chave.", { chave: "Já existe." });
    return traduzirPg(err);
  }
}

export async function removerVariavel(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Essa variável não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.precos_variaveis where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Só administração e gestão mudam a tabela de preços.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── modelos ───────────── */

export type EntradaModelo = { nome: string; nicho: string | null; descricao: string | null; linhas: LinhaModelo[]; respostas: Respostas; ativo: boolean };

export function validarModelo(corpo: unknown): { ok: true; entrada: EntradaModelo } | { ok: false; mensagem: string } {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (!nome || nome.length > 120) return { ok: false, mensagem: "Dê um nome ao modelo (até 120)." };
  const linhas = lerLinhasDoModelo(c.linhas);
  if (!linhas) return { ok: false, mensagem: "Alguma linha do modelo veio num formato que não cabe." };
  const respostas: Respostas = {};
  if (c.respostas && typeof c.respostas === "object")
    for (const [k, v] of Object.entries(c.respostas as Record<string, unknown>).slice(0, 40)) {
      if (/^[a-z][a-z0-9_]{0,39}$/.test(k) && (typeof v === "string" || typeof v === "number")) respostas[k] = typeof v === "string" ? v.slice(0, 40) : v;
    }
  const t = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return { ok: true, entrada: { nome, nicho: t(c.nicho, 60), descricao: t(c.descricao, 500), linhas, respostas, ativo: c.ativo !== false } };
}

export async function salvarModelo(ctx: Contexto, e: EntradaModelo, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Esse modelo não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const linhas = JSON.stringify(e.linhas);
      const respostas = JSON.stringify(e.respostas);
      const r = (await (id
        ? tx.execute(sql`update maestro.orcamento_modelos set nome = ${e.nome}, nicho = ${e.nicho}, descricao = ${e.descricao}, linhas = ${linhas}::jsonb,
                                respostas = ${respostas}::jsonb, ativo = ${e.ativo} where id = ${id} returning id`)
        : tx.execute(sql`insert into maestro.orcamento_modelos (org_id, nome, nicho, descricao, linhas, respostas, ativo)
                          values (${ctx.orgId}, ${e.nome}, ${e.nicho}, ${e.descricao}, ${linhas}::jsonb, ${respostas}::jsonb, ${e.ativo}) returning id`))) as unknown as {
        id: string;
      }[];
      return r.length ? { ok: true as const, id: r[0].id } : falha("sem_permissao", "Só administração e gestão mudam a tabela de preços.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function removerModelo(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse modelo não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.orcamento_modelos where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Só administração e gestão mudam a tabela de preços.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}
