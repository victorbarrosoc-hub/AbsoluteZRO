/**
 * Projetos: código MAE-AAAA-NNN por organização, cliente, status, datas e briefing. Tudo como a pessoa (`asUser`, RLS).
 * O vínculo com o projeto da Absolute ZRO é a etapa 3: aqui `link_status` nasce e fica `pending` (o Maestro funciona
 * sozinho; nada finge estar ligado).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { getBanco, schema, type Contexto, type Tx } from "@/lib/db/client";
import type { StatusProjeto } from "@/lib/db/schema";
import { dataOpcional, ehUuid, falha, padraoBusca, textoOpcional, traduzirPg, type Erros, type Res } from "./comum";

const { projects, auditLog } = schema;

export const STATUS_PROJETO: { k: StatusProjeto; nome: string }[] = [
  { k: "active", nome: "Em andamento" },
  { k: "paused", nome: "Pausado" },
  { k: "done", nome: "Concluído" },
  { k: "archived", nome: "Arquivado" },
];
export const NOME_STATUS_PROJETO: Record<StatusProjeto, string> = { active: "Em andamento", paused: "Pausado", done: "Concluído", archived: "Arquivado" };
const ehStatus = (v: unknown): v is StatusProjeto => v === "active" || v === "paused" || v === "done" || v === "archived";

export type EntradaProjeto = {
  titulo: string;
  cliente: string | null;
  status: StatusProjeto;
  inicio: string | null;
  prazo: string | null;
  briefing: string | null;
};

export function validarProjeto(f: Record<string, unknown>): { ok: true; entrada: EntradaProjeto } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const titulo = textoOpcional(f.titulo, 200);
  if (!titulo) erros.titulo = titulo === undefined ? "Título longo demais." : "Dê um título ao projeto.";
  const cliente = f.cliente === undefined || f.cliente === null || f.cliente === "" ? null : f.cliente;
  if (cliente !== null && !ehUuid(cliente)) erros.cliente = "Escolha um cliente da lista.";
  const status = f.status === undefined || f.status === "" ? "active" : f.status;
  if (!ehStatus(status)) erros.status = "Escolha um status.";
  const inicio = dataOpcional(f.inicio);
  if (inicio === undefined) erros.inicio = "Data inválida.";
  const prazo = dataOpcional(f.prazo);
  if (prazo === undefined) erros.prazo = "Data inválida.";
  if (inicio && prazo && prazo < inicio) erros.prazo = "O prazo vem depois do início.";
  const briefing = textoOpcional(f.briefing, 5000);
  if (briefing === undefined) erros.briefing = "Até 5.000 caracteres.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      titulo: titulo!,
      cliente: (cliente as string | null)?.toLowerCase() ?? null,
      status: status as StatusProjeto,
      inicio: inicio ?? null,
      prazo: prazo ?? null,
      briefing: briefing ?? null,
    },
  };
}

/** Próximo código do ano na organização (MAE-2026-001, 002…). Trava por organização: dois ao mesmo tempo não colidem. */
export async function proximoCodigo(tx: Tx, orgId: string, ano = new Date().getFullYear()): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:codigo:${orgId}:${ano}`}))`);
  const [r] = (await tx.execute(sql`
    select coalesce(max(substring(code from '^MAE-[0-9]{4}-([0-9]{3,5})$')::int), 0) as n
      from maestro.projects where code like ${`MAE-${ano}-%`}`)) as unknown as { n: number }[];
  return `MAE-${ano}-${String(Number(r.n) + 1).padStart(3, "0")}`;
}

async function conferirCliente(tx: Tx, cliente: string | null): Promise<boolean> {
  if (!cliente) return true;
  const r = await tx.execute(sql`select 1 from maestro.clients where id = ${cliente} and deleted_at is null`);
  return r.length > 0;
}

const colunas = (e: EntradaProjeto) => ({
  title: e.titulo,
  clientId: e.cliente,
  status: e.status,
  startDate: e.inicio,
  dueDate: e.prazo,
  briefing: e.briefing,
});

export type ProjetoLista = {
  id: string;
  codigo: string;
  titulo: string;
  status: StatusProjeto;
  prazo: string | null;
  clienteId: string | null;
  cliente: string | null;
  linkStatus: string;
  cardsAbertos: number;
};

export async function listarProjetos(ctx: Contexto, o: { busca?: string; status?: string; cliente?: string } = {}): Promise<ProjetoLista[]> {
  const busca = o.busca?.trim().slice(0, 100);
  const status = ehStatus(o.status) ? o.status : null;
  const cliente = ehUuid(o.cliente) ? o.cliente : null;
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select p.id, p.code as codigo, p.title as titulo, p.status, p.due_date::text as prazo, p.client_id as "clienteId",
             c.name as cliente, p.link_status as "linkStatus",
             (select count(*)::int from maestro.cards k where k.projeto = p.id::text and k.apagado_em is null and k.coluna <> 'entregue') as "cardsAbertos"
        from maestro.projects p
        left join maestro.clients c on c.id = p.client_id and c.deleted_at is null
       where p.deleted_at is null
         ${status ? sql`and p.status = ${status}` : sql`and p.status <> 'archived'`}
         ${cliente ? sql`and p.client_id = ${cliente}` : sql``}
         ${busca ? sql`and (p.title ilike ${padraoBusca(busca)} or p.code ilike ${padraoBusca(busca)} or c.name ilike ${padraoBusca(busca)})` : sql``}
       order by case p.status when 'active' then 0 when 'paused' then 1 when 'done' then 2 else 3 end, p.due_date nulls last, p.code desc
       limit 500`);
    return r as unknown as ProjetoLista[];
  });
}

export type ProjetoFicha = EntradaProjeto & {
  id: string;
  codigo: string;
  clienteNome: string | null;
  linkStatus: string;
  cards: { id: string; tema: string; coluna: string; colunaNome: string | null; colunaCor: string | null; prazo: string | null }[];
};

export async function obterProjeto(ctx: Contexto, id: string): Promise<ProjetoFicha | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [p] = (await tx.execute(sql`
      select p.id, p.code, p.title, p.client_id, c.name as cliente_nome, p.status, p.start_date::text as inicio, p.due_date::text as prazo,
             p.briefing, p.link_status
        from maestro.projects p left join maestro.clients c on c.id = p.client_id and c.deleted_at is null
       where p.id = ${id} and p.deleted_at is null`)) as unknown as Record<string, string | null>[];
    if (!p) return null;
    const cards = (await tx.execute(sql`
      select k.id, k.dados ->> 'tema' as tema, k.coluna, co.nome as "colunaNome", co.cor as "colunaCor", k.prazo
        from maestro.cards k left join maestro.colunas co on co.org_id = k.org_id and co.id = k.coluna
       where k.projeto = ${id} and k.apagado_em is null
       order by co.ordem nulls last, k.prazo nulls last
       limit 200`)) as unknown as ProjetoFicha["cards"];
    return {
      id: p.id!,
      codigo: p.code!,
      titulo: p.title!,
      cliente: p.client_id,
      clienteNome: p.cliente_nome,
      status: p.status as StatusProjeto,
      inicio: p.inicio,
      prazo: p.prazo,
      briefing: p.briefing,
      linkStatus: p.link_status!,
      cards: [...cards],
    };
  });
}

export async function criarProjeto(ctx: Contexto, entrada: EntradaProjeto): Promise<Res<{ id: string; codigo: string }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      if (!(await conferirCliente(tx, entrada.cliente))) return falha("cliente", "Escolha um cliente da lista.", { cliente: "Escolha um cliente da lista." });
      const codigo = await proximoCodigo(tx, ctx.orgId);
      const [p] = await tx
        .insert(projects)
        .values({ orgId: ctx.orgId, code: codigo, createdBy: ctx.sub, linkStatus: "pending", ...colunas(entrada) })
        .returning({ id: projects.id });
      await tx
        .insert(auditLog)
        .values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "projeto.criou", targetType: "project", targetId: p.id, metadata: { codigo } });
      return { ok: true as const, id: p.id, codigo };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

export async function atualizarProjeto(ctx: Contexto, id: string, entrada: EntradaProjeto): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse projeto não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      if (!(await conferirCliente(tx, entrada.cliente))) return falha("cliente", "Escolha um cliente da lista.", { cliente: "Escolha um cliente da lista." });
      const r = await tx
        .update(projects)
        .set(colunas(entrada))
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .returning({ id: projects.id });
      if (!r.length) return falha("nao_existe", "Não deu para salvar este projeto.");
      await tx.insert(auditLog).values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "projeto.mudou", targetType: "project", targetId: id });
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Tira o projeto da lista (marca `deleted_at`); o código não volta a ser usado. */
export async function removerProjeto(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse projeto não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx
        .update(projects)
        .set({ deletedAt: new Date() })
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .returning({ id: projects.id });
      if (!r.length) return falha("nao_existe", "Não deu para remover este projeto.");
      await tx.insert(auditLog).values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "projeto.removeu", targetType: "project", targetId: id });
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
