/**
 * Agenda por assinatura (.ics, drizzle/0017): o endereço secreto de cada pessoa e o calendário que ele serve.
 *
 * - Gerar: 32 bytes aleatórios; o banco guarda só o sha256 e o endereço aparece uma vez (gerar de novo troca e derruba
 *   o anterior; revogar desliga). Cada um mexe só no próprio (RLS por current_sub()).
 * - Servir (`/api/agenda/<token>.ics`): a porta estreita `maestro.agenda_feed_dono` (como maestro_app sem organização)
 *   diz de quem é; vale só se a pessoa segue ativa e o último login dela tinha acesso ao Maestro (o mesmo temAcesso()).
 *   Depois tudo é lido como a pessoa (`asUser`: RLS, papel e acesso por cliente), então o feed mostra só o que ela vê:
 *   agenda (diárias, entregas, reuniões), escala dos freelas, prazos dos cards, vencimento dos links de aprovação e os
 *   retornos do funil. Limites: 60/h por endereço; endereço desconhecido 30/h por IP.
 * Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { PAPEL_APP } from "@/lib/db/config";
import { hashComChave, hashToken, novoToken } from "@/lib/auth/cripto";
import { temAcesso } from "@/lib/auth/acesso";
import { dentroDoLimite, registrarTentativa } from "@/lib/auth/limite";
import { falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { hojeBr, somarDias } from "@/lib/dinheiro";
import { siteUrl } from "@/lib/site";
import { gerarIcs, type ItemAgenda } from "./ics";

export const TOKEN_AGENDA = /^[A-Za-z0-9_-]{43}$/;
export const LIMITE_FEED = { max: 60, janelaMs: 60 * 60_000 };
export const LIMITE_FEED_MORTO = { max: 30, janelaMs: 60 * 60_000 };

export const enderecoDoFeed = (token: string) => `${siteUrl()}/api/agenda/${token}.ics`;

export type Assinatura = { ativa: boolean; criadaEm: string | null; usadaEm: string | null; usos: number };

export async function lerAssinatura(ctx: Contexto): Promise<Assinatura> {
  return getBanco().asUser(ctx, async (tx) => {
    const [a] = (await tx.execute(sql`
      select criado_em, usado_em, usos from maestro.agenda_assinaturas where zro_sub = ${ctx.sub} and revogado_em is null`)) as unknown as Record<
      string,
      unknown
    >[];
    if (!a) return { ativa: false, criadaEm: null, usadaEm: null, usos: 0 };
    return {
      ativa: true,
      criadaEm: new Date(a.criado_em as string).toISOString(),
      usadaEm: a.usado_em ? new Date(a.usado_em as string).toISOString() : null,
      usos: Number(a.usos),
    };
  });
}

/** Gera (ou troca) o endereço. Devolve o token uma única vez. */
export async function gerarAssinatura(ctx: Contexto): Promise<Res<{ token: string; url: string }>> {
  const token = novoToken();
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await tx.execute(sql`update maestro.agenda_assinaturas set revogado_em = now() where zro_sub = ${ctx.sub} and revogado_em is null`);
      await tx.execute(sql`
        insert into maestro.agenda_assinaturas (org_id, zro_sub, token_hash) values (${ctx.orgId}, ${ctx.sub}, ${hashToken(token)})`);
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id) values (${ctx.orgId}, ${ctx.sub}, 'agenda.assinar', 'membro', ${ctx.sub})`);
      return { ok: true as const, token, url: enderecoDoFeed(token) };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

export async function revogarAssinatura(ctx: Contexto): Promise<Res> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.agenda_assinaturas set revogado_em = now() where zro_sub = ${ctx.sub} and revogado_em is null returning id`);
      if (!r.length) return falha("sem_link", "Não há endereço ativo.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id) values (${ctx.orgId}, ${ctx.sub}, 'agenda.revogar', 'membro', ${ctx.sub})`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Os itens que a pessoa vê, de 60 dias atrás a um ano à frente. */
export async function itensDaAgenda(tx: Tx, hoje: string): Promise<ItemAgenda[]> {
  const de = somarDias(hoje, -60);
  const ate = somarDias(hoje, 365);
  const base = siteUrl();
  const itens: ItemAgenda[] = [];
  const NOME_TIPO: Record<string, string> = { diaria: "Diária", entrega: "Entrega", reuniao: "Reunião", outro: "Agenda" };

  const eventos = (await tx.execute(sql`
    select e.id, e.tipo, e.titulo, e.data::text as data, e.data_fim::text as data_fim, to_char(e.hora_ini, 'HH24:MI') as hora_ini,
           to_char(e.hora_fim, 'HH24:MI') as hora_fim, e.local, e.notas, e.updated_at, p.title as projeto
      from maestro.eventos e left join maestro.projects p on p.org_id = e.org_id and p.id = e.projeto_id
     where coalesce(e.data_fim, e.data) >= ${de}::date and e.data <= ${ate}::date
     order by e.data limit 1000`)) as unknown as Record<string, string | null>[];
  for (const e of eventos)
    itens.push({
      uid: `evento-${e.id}`,
      titulo: e.titulo ?? "Agenda",
      data: e.data!,
      dataFim: e.data_fim,
      horaIni: e.hora_ini,
      horaFim: e.hora_fim,
      local: e.local,
      descricao: [e.projeto ? `Projeto: ${e.projeto}` : null, e.notas].filter(Boolean).join("\n") || null,
      categoria: NOME_TIPO[e.tipo ?? ""] ?? "Agenda",
      url: `${base}/app/agenda/${e.id}`,
      atualizadoEm: e.updated_at ? new Date(e.updated_at) : null,
    });

  const escalas = (await tx.execute(sql`
    select s.id, s.funcao, s.inicio::text as inicio, s.fim::text as fim, s.updated_at, f.nome as freela, p.title as projeto, p.id as projeto_id
      from maestro.escalas s
      join maestro.freelas f on f.org_id = s.org_id and f.id = s.freela_id
      left join maestro.projects p on p.org_id = s.org_id and p.id = s.projeto_id
     where s.fim >= ${de}::date and s.inicio <= ${ate}::date
     order by s.inicio limit 1000`)) as unknown as Record<string, string | null>[];
  for (const s of escalas)
    itens.push({
      uid: `escala-${s.id}`,
      titulo: `Escala: ${s.freela} (${s.funcao})`,
      data: s.inicio!,
      dataFim: s.fim,
      descricao: s.projeto ? `Projeto: ${s.projeto}` : null,
      categoria: "Escala",
      url: s.projeto_id ? `${base}/app/projetos/${s.projeto_id}` : `${base}/app/freelas`,
      atualizadoEm: s.updated_at ? new Date(s.updated_at) : null,
    });

  const cards = (await tx.execute(sql`
    select k.id, coalesce(k.dados ->> 'tema', k.id) as tema, left(k.prazo, 10) as prazo, k.coluna, k.updated_at, c.name as cliente
      from maestro.cards k left join maestro.clients c on c.org_id = k.org_id and c.id::text = k.cliente
     where k.apagado_em is null and k.prazo is not null and k.coluna <> 'entregue'
       and left(k.prazo, 10) between ${de} and ${ate}
     order by k.prazo limit 1000`)) as unknown as Record<string, string | null>[];
  for (const k of cards)
    itens.push({
      uid: `card-${k.id}`,
      titulo: `Prazo: ${k.tema}`,
      data: k.prazo!,
      descricao: k.cliente ? `Cliente: ${k.cliente}` : null,
      categoria: "Quadro",
      url: `${base}/app/quadro?card=${encodeURIComponent(k.id!)}`,
      atualizadoEm: k.updated_at ? new Date(k.updated_at) : null,
    });

  const aprov = (await tx.execute(sql`
    select a.id, l.id as lote, l.title, (a.expires_at at time zone 'America/Sao_Paulo')::date::text as vence, c.name as cliente
      from maestro.approval_links a
      join maestro.lotes l on l.org_id = a.org_id and l.id = a.lote_id and l.deleted_at is null and l.status <> 'fechado'
      left join maestro.clients c on c.org_id = a.org_id and c.id = a.client_id
     where a.kind = 'lote' and a.revoked_at is null and a.expires_at > now()
       and (a.expires_at at time zone 'America/Sao_Paulo')::date <= ${ate}::date
     limit 200`)) as unknown as Record<string, string | null>[];
  for (const a of aprov)
    itens.push({
      uid: `aprovacao-${a.id}`,
      titulo: `Aprovação vence: ${a.title}`,
      data: a.vence!,
      descricao: a.cliente ? `Cliente: ${a.cliente}` : null,
      categoria: "Aprovação",
      url: `${base}/app/aprovacoes/${a.lote}`,
    });

  const retornos = (await tx.execute(sql`
    select 'pedido' as alvo, p.id, coalesce(p.empresa, p.nome) as nome, p.proximo_contato::text as data, p.proximo_nota as nota
      from maestro.pedidos p where p.proximo_contato between ${de}::date and ${ate}::date and p.etapa not in ('ganho', 'perdido')
    union all
    select 'cliente', c.id, c.name, c.proximo_contato::text, c.proximo_nota
      from maestro.clients c where c.proximo_contato between ${de}::date and ${ate}::date and c.deleted_at is null
    limit 500`)) as unknown as Record<string, string | null>[];
  for (const r of retornos)
    itens.push({
      uid: `retorno-${r.alvo}-${r.id}`,
      titulo: `Retornar: ${r.nome}`,
      data: r.data!,
      descricao: r.nota,
      categoria: "Retorno",
      url: `${base}/app/${r.alvo === "pedido" ? "pedidos" : "clientes"}/${r.id}`,
    });

  return itens;
}

/** O calendário da pessoa logada (botão "Baixar .ics" em Ajustes). */
export async function icsDaPessoa(ctx: Contexto, orgNome: string, hoje = hojeBr()): Promise<string> {
  const itens = await getBanco().asUser(ctx, (tx) => itensDaAgenda(tx, hoje));
  return gerarIcs({ nome: `Maestro · ${orgNome}`, itens });
}

type Dono = { org: string; sub: string; produtos: string[] | null; release: Record<string, string> | null };

/**
 * O feed pelo endereço secreto. `morto` = endereço desconhecido, revogado, pessoa fora ou sem acesso (a mesma
 * resposta); `limite` = demais leituras.
 */
export async function feedDoToken(token: string, ip: string, hoje = hojeBr()): Promise<{ estado: "ok"; ics: string } | { estado: "morto" | "limite" }> {
  const ipChave = `agenda-morto:${hashComChave(ip || "?", "agenda:ip")}`;
  if (!(await dentroDoLimite(ipChave, LIMITE_FEED_MORTO))) return { estado: "limite" };
  if (!TOKEN_AGENDA.test(token)) {
    await registrarTentativa(ipChave);
    return { estado: "morto" };
  }
  const th = hashToken(token);
  const dono = await getBanco().asSystem("agenda por assinatura (porta estreita)", async (tx) => {
    await tx.execute(sql.raw(`set local role ${PAPEL_APP}`));
    const [r] = (await tx.execute(sql`select maestro.agenda_feed_dono(${th}) as r`)) as unknown as { r: Dono | null }[];
    return r?.r ?? null;
  });
  if (!dono || !temAcesso({ produtos: dono.produtos ?? [], release: dono.release })) {
    await registrarTentativa(ipChave);
    return { estado: "morto" };
  }
  const chave = `agenda:${th.slice(0, 32)}`;
  if (!(await dentroDoLimite(chave, LIMITE_FEED))) return { estado: "limite" };
  await registrarTentativa(chave);
  const ctx = { sub: dono.sub, orgId: dono.org };
  const nome = await getBanco().asUser(ctx, async (tx) => {
    const [o] = (await tx.execute(sql`select name from maestro.organizations limit 1`)) as unknown as { name: string }[];
    return o?.name ?? "Produtora";
  });
  return { estado: "ok", ics: await icsDaPessoa(ctx, nome, hoje) };
}
