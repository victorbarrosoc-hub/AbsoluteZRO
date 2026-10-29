/**
 * Documentos do projeto no banco. A ordem do dia nasce montada a partir da diária (local, horário e a equipe escalada,
 * como no StudioBinder) e o checklist nasce com o que está reservado no inventário para o projeto ou a diária.
 * Sempre como a pessoa (`asUser`, RLS).
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { ehData } from "@/lib/dinheiro";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import { conteudoVazio, ehTipoDoc, lerConteudo, type Conteudo, type OrdemDoDia, type TipoDoc } from "./conteudo";

export type DocLista = { id: string; tipo: TipoDoc; titulo: string; data: string | null; atualizado: string };
export type Doc = DocLista & { projetoId: string; projeto: string; projetoCodigo: string; eventoId: string | null; conteudo: Conteudo };

export async function listarDocumentos(ctx: Contexto, projetoId: string): Promise<DocLista[]> {
  if (!ehUuid(projetoId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select id, tipo, titulo, data::text, updated_at::text as atualizado from maestro.documentos where projeto_id = ${projetoId}
       order by array_position(array['ordem_do_dia','checklist','roteiro','decupagem'], tipo), data nulls last, titulo`);
    return r as unknown as DocLista[];
  });
}

export async function obterDocumento(ctx: Contexto, id: string): Promise<Doc | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [d] = (await tx.execute(sql`
      select d.id, d.tipo, d.titulo, d.data::text, d.updated_at::text as atualizado, d.projeto_id as "projetoId", p.title as projeto, p.code as "projetoCodigo",
             d.evento_id as "eventoId", d.conteudo
        from maestro.documentos d join maestro.projects p on p.id = d.projeto_id where d.id = ${id}`)) as unknown as Doc[];
    if (!d) return null;
    return { ...d, conteudo: lerConteudo(d.tipo, d.conteudo) ?? conteudoVazio(d.tipo) };
  });
}

/** Ordem do dia a partir da diária: chamada, local e a equipe escalada (função legível). */
export async function ordemDaDiaria(tx: Tx, eventoId: string): Promise<OrdemDoDia | null> {
  const [ev] = (await tx.execute(sql`
    select to_char(hora_ini, 'HH24:MI') as hora, local, notas from maestro.eventos where id = ${eventoId}`)) as unknown as {
    hora: string | null;
    local: string | null;
    notas: string | null;
  }[];
  if (!ev) return null;
  const equipe = (await tx.execute(sql`
    select f.nome, s.funcao from maestro.escalas s join maestro.freelas f on f.id = s.freela_id where s.evento_id = ${eventoId} order by f.nome`)) as unknown as {
    nome: string;
    funcao: string;
  }[];
  return {
    chamada: ev.hora,
    local: ev.local,
    localUrl: null,
    cronograma: ev.hora ? [{ hora: ev.hora, atividade: "Chegada da equipe", obs: "" }] : [],
    equipe: equipe.map((e) => ({ nome: e.nome, funcao: nomeFuncao(e.funcao), chamada: ev.hora ?? "" })),
    contatos: [],
    notas: ev.notas,
  };
}

export async function criarDocumento(
  ctx: Contexto,
  e: { projetoId: string; tipo: TipoDoc; titulo: string; data: string | null; eventoId: string | null; conteudo?: Conteudo; demo?: boolean },
): Promise<Res<{ id: string }>> {
  if (!ehUuid(e.projetoId) || !ehTipoDoc(e.tipo)) return falha("vinculo", "Escolha o projeto e o tipo.");
  const titulo = e.titulo.trim().slice(0, 200);
  if (!titulo) return falha("titulo", "Dê um título ao documento.");
  if (e.data && !ehData(e.data)) return falha("data", "Data inválida.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      let conteudo: Conteudo = e.conteudo ?? conteudoVazio(e.tipo);
      if (!e.conteudo && e.tipo === "ordem_do_dia" && e.eventoId) conteudo = (await ordemDaDiaria(tx, e.eventoId)) ?? conteudo;
      if (!e.conteudo && e.tipo === "checklist") {
        const itens = (await tx.execute(sql`
          select q.nome, count(*)::int as qtd from maestro.reservas r join maestro.equipamentos q on q.id = r.equipamento_id
           where r.cancelada_em is null and ${e.eventoId ? sql`r.evento_id = ${e.eventoId}` : sql`r.projeto_id = ${e.projetoId}`}
           group by q.nome order by q.nome`)) as unknown as { nome: string; qtd: number }[];
        conteudo = { itens: itens.map((i) => ({ nome: i.nome, qtd: i.qtd, saiu: false, voltou: false })) };
      }
      const [r] = (await tx.execute(sql`
        insert into maestro.documentos (org_id, projeto_id, evento_id, tipo, titulo, data, conteudo, demo, created_by)
        values (${ctx.orgId}, ${e.projetoId}, ${ehUuid(e.eventoId) ? e.eventoId : null}, ${e.tipo}, ${titulo}, ${e.data}, ${JSON.stringify(conteudo)}::jsonb,
                ${e.demo ?? false}, ${ctx.sub})
        returning id`)) as unknown as { id: string }[];
      return { ok: true as const, id: r.id };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function salvarDocumento(ctx: Contexto, id: string, titulo: string, data: string | null, conteudoBruto: unknown): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse documento não existe.");
  const t = titulo.trim().slice(0, 200);
  if (!t) return falha("titulo", "Dê um título ao documento.");
  if (data && !ehData(data)) return falha("data", "Data inválida.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [d] = (await tx.execute(sql`select tipo from maestro.documentos where id = ${id}`)) as unknown as { tipo: TipoDoc }[];
      if (!d) return falha("nao_existe", "Esse documento não existe.");
      const conteudo = lerConteudo(d.tipo, conteudoBruto);
      if (!conteudo) return falha("formato", "Algum campo veio num formato que não cabe.");
      const r = await tx.execute(sql`
        update maestro.documentos set titulo = ${t}, data = ${data}, conteudo = ${JSON.stringify(conteudo)}::jsonb where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function removerDocumento(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse documento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.documentos where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}
