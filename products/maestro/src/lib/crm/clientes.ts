/**
 * Clientes (CRM básico): cadastro, lista com busca e a ficha com projetos e cards. Tudo como a pessoa (`asUser`,
 * RLS por organização; leitura só lê). Apagar é marcar `deleted_at` (o histórico dos cards continua de pé).
 * Inspirado no cadastro de clientes do ZRO (`crm/clientes`), adaptado para várias organizações.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { getBanco, schema, type Contexto } from "@/lib/db/client";
import type { StatusCliente } from "@/lib/db/schema";
import { ehUuid, falha, padraoBusca, textoOpcional, traduzirPg, type Erros, type Res } from "./comum";

const { clients, auditLog } = schema;

export const STATUS_CLIENTE: { k: StatusCliente; nome: string }[] = [
  { k: "lead", nome: "Lead" },
  { k: "ativo", nome: "Ativo" },
  { k: "pausado", nome: "Pausado" },
];
export const NOME_STATUS_CLIENTE: Record<StatusCliente, string> = { lead: "Lead", ativo: "Ativo", pausado: "Pausado" };
const ehStatus = (v: unknown): v is StatusCliente => v === "lead" || v === "ativo" || v === "pausado";

export type EntradaCliente = {
  nome: string;
  empresa: string | null;
  contato: string | null;
  whatsapp: string | null;
  email: string | null;
  observacoes: string | null;
  status: StatusCliente;
};

/**
 * WhatsApp só com dígitos e DDI, pronto para o wa.me. Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55.
 * Vazio = null; impossível = undefined.
 */
export function normalizarWhatsapp(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  if (!v.trim()) return null;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if ((d.length === 10 || d.length === 11) && !v.trim().startsWith("+")) d = `55${d}`;
  return /^[0-9]{8,15}$/.test(d) ? d : undefined;
}

/** "5511912345678" → "+55 11 91234-5678" (outros países: +DDI e o resto). */
export function whatsappLegivel(d: string | null | undefined): string {
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const n = d.slice(4);
    return `+55 ${ddd} ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
  }
  return `+${d}`;
}

/** Link do WhatsApp com texto pronto (sem API: decisão do titular). */
export function linkWhatsapp(d: string, texto?: string): string {
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Confere o formulário. Devolve a entrada pronta ou os erros por campo (mensagens curtas, para a tela). */
export function validarCliente(f: Record<string, unknown>): { ok: true; entrada: EntradaCliente } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const nome = textoOpcional(f.nome, 200);
  if (!nome) erros.nome = nome === undefined ? "Nome longo demais." : "Dê um nome ao cliente.";
  const empresa = textoOpcional(f.empresa, 200);
  if (empresa === undefined) erros.empresa = "Longo demais.";
  const contato = textoOpcional(f.contato, 200);
  if (contato === undefined) erros.contato = "Longo demais.";
  const whatsapp = normalizarWhatsapp(f.whatsapp);
  if (whatsapp === undefined) erros.whatsapp = "Confira o número (com DDD).";
  const email = textoOpcional(f.email, 254);
  if (email === undefined || (email && !EMAIL.test(email))) erros.email = "Confira o e-mail.";
  const observacoes = textoOpcional(f.observacoes, 5000);
  if (observacoes === undefined) erros.observacoes = "Até 5.000 caracteres.";
  const status = f.status === undefined || f.status === "" ? "ativo" : f.status;
  if (!ehStatus(status)) erros.status = "Escolha lead, ativo ou pausado.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      nome: nome!,
      empresa: empresa ?? null,
      contato: contato ?? null,
      whatsapp: whatsapp ?? null,
      email: email ? email.toLowerCase() : null,
      observacoes: observacoes ?? null,
      status: status as StatusCliente,
    },
  };
}

const colunas = (e: EntradaCliente) => ({
  name: e.nome,
  company: e.empresa,
  contactName: e.contato,
  whatsapp: e.whatsapp,
  email: e.email,
  notes: e.observacoes,
  status: e.status,
});

export type ClienteLista = {
  id: string;
  nome: string;
  empresa: string | null;
  contato: string | null;
  whatsapp: string | null;
  email: string | null;
  status: StatusCliente;
  projetos: number;
  cardsAbertos: number;
};

/** Lista da organização, com busca (nome, empresa, contato, e-mail, WhatsApp) e filtro de status. */
export async function listarClientes(ctx: Contexto, o: { busca?: string; status?: string } = {}): Promise<ClienteLista[]> {
  const busca = o.busca?.trim().slice(0, 100);
  const status = ehStatus(o.status) ? o.status : null;
  const digitos = busca?.replace(/\D/g, "") ?? "";
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select c.id, c.name as nome, c.company as empresa, c.contact_name as contato, c.whatsapp, c.email, c.status,
             (select count(*)::int from maestro.projects p where p.client_id = c.id and p.deleted_at is null) as projetos,
             (select count(*)::int from maestro.cards k where k.cliente = c.id::text and k.apagado_em is null and k.coluna <> 'entregue') as "cardsAbertos"
        from maestro.clients c
       where c.deleted_at is null
         ${status ? sql`and c.status = ${status}` : sql``}
         ${
           busca
             ? sql`and (c.name ilike ${padraoBusca(busca)} or c.company ilike ${padraoBusca(busca)} or c.contact_name ilike ${padraoBusca(busca)}
                    or c.email ilike ${padraoBusca(busca)} ${digitos.length >= 4 ? sql`or c.whatsapp like ${`%${digitos}%`}` : sql``})`
             : sql``
         }
       order by case c.status when 'ativo' then 0 when 'lead' then 1 else 2 end, lower(c.name)
       limit 500`);
    return r as unknown as ClienteLista[];
  });
}

export type ClienteFicha = EntradaCliente & {
  id: string;
  criadoEm: Date;
  projetos: { id: string; codigo: string; titulo: string; status: string; prazo: string | null; linkStatus: string }[];
  cards: { id: string; tema: string; coluna: string; prazo: string | null; resp: string | null }[];
  /** Próximo contato (drizzle/0014). */
  proximoContato: string | null;
  proximoNota: string | null;
};

export async function obterCliente(ctx: Contexto, id: string): Promise<ClienteFicha | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [c] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), isNull(clients.deletedAt)));
    if (!c) return null;
    const projetos = (await tx.execute(sql`
      select id, code as codigo, title as titulo, status, due_date::text as prazo, link_status as "linkStatus"
        from maestro.projects where client_id = ${id} and deleted_at is null order by code desc`)) as unknown as ClienteFicha["projetos"];
    const cards = (await tx.execute(sql`
      select id, dados ->> 'tema' as tema, coluna, prazo, resp
        from maestro.cards where cliente = ${id} and apagado_em is null
       order by array_position(array['pauta','afazer','fazendo','revisao','aprovacao','aprovado','agendado','entregue'], coluna), prazo nulls last
       limit 200`)) as unknown as ClienteFicha["cards"];
    const [rt] = (await tx.execute(sql`
      select proximo_contato::text as data, proximo_nota as nota from maestro.clients where id = ${id}`)) as unknown as {
      data: string | null;
      nota: string | null;
    }[];
    return {
      id: c.id,
      nome: c.name,
      empresa: c.company,
      contato: c.contactName,
      whatsapp: c.whatsapp,
      email: c.email,
      observacoes: c.notes,
      status: c.status,
      criadoEm: c.createdAt,
      projetos: [...projetos],
      cards: [...cards],
      proximoContato: rt?.data ?? null,
      proximoNota: rt?.nota ?? null,
    };
  });
}

export async function criarCliente(ctx: Contexto, entrada: EntradaCliente): Promise<Res<{ id: string }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [c] = await tx
        .insert(clients)
        .values({ orgId: ctx.orgId, createdBy: ctx.sub, ...colunas(entrada) })
        .returning({ id: clients.id });
      await tx.insert(auditLog).values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "cliente.criou", targetType: "client", targetId: c.id });
      return { ok: true as const, id: c.id };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

export async function atualizarCliente(ctx: Contexto, id: string, entrada: EntradaCliente): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse cliente não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx
        .update(clients)
        .set(colunas(entrada))
        .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
        .returning({ id: clients.id });
      // Sem linha: não existe nesta organização, ou o papel não escreve (o RLS esconde a linha da mudança).
      if (!r.length) return falha("nao_existe", "Não deu para salvar este cliente.");
      await tx.insert(auditLog).values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "cliente.mudou", targetType: "client", targetId: id });
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Tira o cliente da lista (marca `deleted_at`). Os cards dele continuam no Quadro, sem o nome. */
export async function removerCliente(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse cliente não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx
        .update(clients)
        .set({ deletedAt: new Date() })
        .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
        .returning({ id: clients.id });
      if (!r.length) return falha("nao_existe", "Não deu para remover este cliente.");
      await tx.insert(auditLog).values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "cliente.removeu", targetType: "client", targetId: id });
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
