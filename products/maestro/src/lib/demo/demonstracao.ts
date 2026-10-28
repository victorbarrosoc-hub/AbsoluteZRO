/**
 * Demonstração: monta, na organização ativa, uma produtora de exemplo (10 clientes, projetos, cards nas 8 colunas e os
 * lotes em aprovação) para a pessoa ver o Maestro funcionando; e tira tudo de novo. Sempre como a pessoa (`asUser`,
 * RLS): a organização vem da sessão. Cards nascem pela `maestro.card_criar` (como a equipe faria) e saem pela
 * `maestro.demo_apagar_cards` (drizzle/0003). Carregar duas vezes não duplica; remover só toca no que é `demo`.
 */
import { sql } from "drizzle-orm";
import { getBanco, schema, type Contexto, type Tx } from "@/lib/db/client";
import { iso } from "@/lib/quadro/metodo";
import { traduzirPg, type Res } from "@/lib/crm/comum";
import { CARDS_DEMO, CLIENTES_DEMO, PROJETOS_DEMO } from "./produtora";

const { clients, projects, lotes, loteCards, auditLog } = schema;

export type Contagem = { clientes: number; projetos: number; cards: number; lotes: number };

const dia = (n: number, base = new Date()) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Uma transação por vez por organização: dois cliques ao mesmo tempo não montam duas produtoras. */
const travar = (tx: Tx, orgId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:demo:${orgId}`}))`);

async function existeDemo(tx: Tx): Promise<boolean> {
  const [r] = (await tx.execute(sql`
    select exists (select 1 from maestro.clients where demo)
        or exists (select 1 from maestro.projects where demo)
        or exists (select 1 from maestro.lotes where demo)
        or exists (select 1 from maestro.cards where id like 'demo-%' and dados ->> 'demo' = 'true') as tem`)) as unknown as { tem: boolean }[];
  return r.tem;
}

/** Há demonstração nesta organização? (o selo "Demonstração" aparece enquanto houver) */
export async function temDemonstracao(ctx: Contexto): Promise<boolean> {
  return getBanco().asUser(ctx, existeDemo);
}

/** Carrega a produtora de exemplo. Se já houver demonstração, não faz nada (`criou: false`). */
export async function carregarDemonstracao(ctx: Contexto): Promise<Res<{ criou: boolean; contagem: Contagem }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await travar(tx, ctx.orgId);
      const vazio = { clientes: 0, projetos: 0, cards: 0, lotes: 0 };
      if (await existeDemo(tx)) return { ok: true as const, criou: false, contagem: vazio };

      const idsClientes = await tx
        .insert(clients)
        .values(
          CLIENTES_DEMO.map((c) => ({
            orgId: ctx.orgId,
            name: c.nome,
            company: c.empresa,
            segment: c.segmento,
            city: c.cidade,
            contactName: c.contato,
            email: c.email,
            status: c.status,
            notes: c.notas,
            approver: { nome: c.contato, email: c.email },
            demo: true,
            createdBy: ctx.sub,
          })),
        )
        .returning({ id: clients.id })
        .then((l) => l.map((x) => x.id));

      // Código DEMO-AAAA-NNN: não ocupa a numeração MAE dos projetos de verdade; nunca liga ao HUB (unlinked).
      const ano = new Date().getFullYear();
      const idsProjetos = await tx
        .insert(projects)
        .values(
          PROJETOS_DEMO.map((p, i) => ({
            orgId: ctx.orgId,
            clientId: idsClientes[p.cliente],
            code: `DEMO-${ano}-${String(i + 1).padStart(3, "0")}`,
            title: p.titulo,
            category: p.categoria,
            status: p.status,
            startDate: p.inicio === null ? null : dia(p.inicio),
            dueDate: p.prazo === null ? null : dia(p.prazo),
            valueCents: p.valorCentavos,
            briefing: p.briefing,
            linkStatus: "unlinked" as const,
            demo: true,
            createdBy: ctx.sub,
          })),
        )
        .returning({ id: projects.id })
        .then((l) => l.map((x) => x.id));

      const sufixo = Math.random().toString(36).slice(2, 8);
      const agora = Date.now();
      const idsCards: string[] = [];
      for (const [i, c] of CARDS_DEMO.entries()) {
        const id = `demo-${sufixo}${String(i).padStart(2, "0")}`;
        const entrouNaColuna = agora - (CARDS_DEMO.length - i) * 3_600_000;
        const dados: Record<string, unknown> = {
          tema: c.tema,
          coluna: c.coluna,
          ordem: i,
          cliente: idsClientes[c.cliente],
          ...(c.projeto !== null ? { projeto: idsProjetos[c.projeto] } : {}),
          // Pauta = ideia sem responsável (o método); dali em diante, quem carregou a demonstração.
          ...(c.coluna !== "pauta" ? { resp: ctx.sub } : {}),
          ...(c.prazo !== null ? { prazo: dia(c.prazo) } : {}),
          ...(c.prioridade ? { prioridade: c.prioridade } : {}),
          ...(c.briefing ? { briefing: c.briefing } : {}),
          criadoEm: entrouNaColuna - 5 * 86_400_000,
          colunaEm: entrouNaColuna,
          criadoPor: ctx.sub,
          demo: true,
        };
        await tx.execute(sql`select 1 from maestro.card_criar(${id}, ${JSON.stringify(dados)}::jsonb)`);
        idsCards.push(id);
      }

      // Um lote enviado por cliente com cards em aprovação (o link do cliente chega na etapa 2: nenhum é criado aqui).
      const porCliente = new Map<number, number[]>();
      CARDS_DEMO.forEach((c, i) => {
        if (c.coluna === "aprovacao") porCliente.set(c.cliente, [...(porCliente.get(c.cliente) ?? []), i]);
      });
      let nLotes = 0;
      for (const [cliente, cardsDoLote] of porCliente) {
        const projeto = CARDS_DEMO[cardsDoLote[0]].projeto;
        const [l] = await tx
          .insert(lotes)
          .values({
            orgId: ctx.orgId,
            clientId: idsClientes[cliente],
            projectId: projeto !== null ? idsProjetos[projeto] : null,
            title: `Aprovação da semana: ${CLIENTES_DEMO[cliente].nome}`,
            objective: "Aprovar as peças antes do agendamento.",
            period: `${dia(0)} a ${dia(7)}`,
            status: "enviado",
            sentAt: new Date(agora - 86_400_000),
            demo: true,
            createdBy: ctx.sub,
          })
          .returning({ id: lotes.id });
        await tx.insert(loteCards).values(cardsDoLote.map((i, posicao) => ({ loteId: l.id, orgId: ctx.orgId, cardId: idsCards[i], posicao })));
        nLotes++;
      }

      const contagem = { clientes: idsClientes.length, projetos: idsProjetos.length, cards: idsCards.length, lotes: nLotes };
      await tx
        .insert(auditLog)
        .values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "demo.carregou", targetType: "organization", targetId: ctx.orgId, metadata: contagem });
      return { ok: true as const, criou: true, contagem };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Tira a demonstração: cards, lotes, projetos e clientes marcados como `demo` desta organização. Nada mais. */
export async function removerDemonstracao(ctx: Contexto): Promise<Res<{ contagem: Contagem }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await travar(tx, ctx.orgId);
      const [{ n: cards }] = (await tx.execute(sql`select maestro.demo_apagar_cards() as n`)) as unknown as { n: number }[];
      const l = await tx
        .delete(lotes)
        .where(sql`${lotes.demo}`)
        .returning({ id: lotes.id });
      const p = await tx
        .delete(projects)
        .where(sql`${projects.demo}`)
        .returning({ id: projects.id });
      const c = await tx
        .delete(clients)
        .where(sql`${clients.demo}`)
        .returning({ id: clients.id });
      const contagem = { clientes: c.length, projetos: p.length, cards: Number(cards), lotes: l.length };
      if (contagem.clientes + contagem.projetos + contagem.cards + contagem.lotes > 0) {
        await tx
          .insert(auditLog)
          .values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "demo.removeu", targetType: "organization", targetId: ctx.orgId, metadata: contagem });
      }
      return { ok: true as const, contagem };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
