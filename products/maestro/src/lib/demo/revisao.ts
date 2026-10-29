/**
 * Aprovações na demonstração: os lotes `demo` ganham versões (vídeos sintéticos do próprio Maestro em
 * public/demo/*.mp4), comentários com tempo e pino, decisões do cliente e um link ativo por lote. Tudo pelos mesmos
 * caminhos de verdade: a equipe pelas funções `versao_*`/`comentario_*` e o link (`gerarLinkNaTx`); o "cliente" pela
 * porta estreita (`maestro.link_comentar` e `maestro.link_enviar`), como se tivesse aberto o link. Idempotente: se os
 * cards da demonstração já têm versão, não faz nada. Sai junto com "Remover demonstração" (cards, versões,
 * comentários, decisões, lotes e links da demonstração).
 */
import { sql } from "drizzle-orm";
import type { Contexto, Tx } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/cripto";
import { gerarLinkNaTx } from "@/lib/revisao/equipe";

const CORTE_1 = "/demo/demo-corte-1.mp4";
const CORTE_2 = "/demo/demo-corte-2.mp4";
const META = { duracao_ms: 12_000, fps: 24, largura: 960, altura: 540 };

async function versao(tx: Tx, card: string, url: string, titulo: string): Promise<string> {
  const [v] = (await tx.execute(
    sql`select id from maestro.versao_criar(${card}, 'mp4', ${url}, ${JSON.stringify({ ...META, titulo })}::jsonb)`,
  )) as unknown as { id: string }[];
  return v.id;
}

async function daEquipe(tx: Tx, versaoId: string, idem: string, texto: string, t: number | null, resolver = false) {
  const [c] = (await tx.execute(
    sql`select id from maestro.comentario_criar(${versaoId}::uuid, ${JSON.stringify({ texto, t_ms: t, idem: `demo-${idem}` })}::jsonb)`,
  )) as unknown as { id: string }[];
  if (resolver) await tx.execute(sql`select 1 from maestro.comentario_resolver(${c.id}::uuid, true)`);
}

type DoCliente = { card: string; versao: string; texto: string; t?: number; tFim?: number; x?: number; y?: number; idem: string };

async function doCliente(tx: Tx, th: string, nome: string, c: DoCliente) {
  const [r] = (await tx.execute(
    sql`select maestro.link_comentar(${th}, true, ${JSON.stringify({ ...c, nome, idem: `demo-${c.idem}` })}::jsonb) as r`,
  )) as unknown as { r: { ok?: boolean; erro?: string } }[];
  if (!r.r.ok) throw new Error(`demonstração: comentário recusado (${r.r.erro})`);
}

async function decidir(tx: Tx, th: string, nome: string, decisoes: { card: string; versao: string | null; decisao: "aprovado" | "ajuste"; nota?: string }[]) {
  const [r] = (await tx.execute(sql`select maestro.link_enviar(${th}, true, ${JSON.stringify({ nome, aceite: true, decisoes })}::jsonb) as r`)) as unknown as {
    r: { ok?: boolean; erro?: string };
  }[];
  if (!r.r.ok) throw new Error(`demonstração: decisão recusada (${r.r.erro})`);
}

/** Monta as aprovações da demonstração. Devolve quantas versões criou (0 = já estava). */
export async function carregarRevisaoDemo(tx: Tx, ctx: Contexto): Promise<number> {
  const [ja] = (await tx.execute(sql`select exists (select 1 from maestro.versoes where card_id like 'demo-%') as tem`)) as unknown as { tem: boolean }[];
  if (ja.tem) return 0;
  const lotes = (await tx.execute(sql`
    select l.id, c.contact_name as contato
      from maestro.lotes l join maestro.clients c on c.id = l.client_id
     where l.demo and l.deleted_at is null and l.status <> 'fechado'
     order by l.created_at, l.id`)) as unknown as { id: string; contato: string | null }[];
  let versoes = 0;
  for (const [i, l] of lotes.entries()) {
    const cards = (await tx.execute(
      sql`select card_id from maestro.lote_cards where lote_id = ${l.id} and card_id like 'demo-%' order by posicao`,
    )) as unknown as { card_id: string }[];
    if (!cards.length) continue;
    const link = await gerarLinkNaTx(tx, ctx, l.id, { dias: 30 });
    if (!link.ok) continue;
    const th = hashToken(link.token);
    const nome = (l.contato ?? "Cliente").split(" ")[0] || "Cliente";
    const card = cards[0].card_id;
    switch (i % 4) {
      case 0: {
        // Pediu ajuste no corte 1; a equipe mandou o corte 2: "Antes | Agora", esperando a decisão.
        const v1 = await versao(tx, card, CORTE_1, "Corte 1");
        await daEquipe(tx, v1, `${i}-a`, "Abertura com o logo maior?", 2_500, true);
        await doCliente(tx, th, nome, { card, versao: v1, texto: "Esse logo pode crescer um pouco.", t: 3_200, x: 50, y: 42, idem: `${i}-b` });
        await doCliente(tx, th, nome, { card, versao: v1, texto: "A trilha está alta aqui.", t: 8_000, idem: `${i}-c` });
        await decidir(tx, th, nome, [{ card, versao: v1, decisao: "ajuste", nota: "Logo maior e trilha mais baixa." }]);
        const v2 = await versao(tx, card, CORTE_2, "Corte 2");
        await tx.execute(
          sql`select 1 from maestro.card_mudar(${card}, ${JSON.stringify({ coluna: "aprovacao", colunaEm: Date.now(), ajustePedido: null })}::jsonb)`,
        );
        await daEquipe(tx, v2, `${i}-d`, "Logo 20% maior e a trilha 6 dB abaixo.", 3_000);
        versoes += 2;
        break;
      }
      case 1: {
        // Aprovado de primeira.
        const v1 = await versao(tx, card, CORTE_2, "Versão final");
        await doCliente(tx, th, nome, { card, versao: v1, texto: "Ficou ótimo, pode seguir.", t: 5_500, idem: `${i}-a` });
        await decidir(tx, th, nome, [{ card, versao: v1, decisao: "aprovado" }]);
        versoes += 1;
        break;
      }
      case 2:
        // Sem vídeo: o cliente decide pelo texto (fica esperando).
        break;
      default: {
        // Ajuste pedido num trecho (intervalo) com a nota.
        const v1 = await versao(tx, card, CORTE_1, "Corte 1");
        await daEquipe(tx, v1, `${i}-a`, "Cor ainda não finalizada.", 1_000);
        await doCliente(tx, th, nome, { card, versao: v1, texto: "Dá para cortar este trecho?", t: 9_400, tFim: 11_000, idem: `${i}-b` });
        await decidir(tx, th, nome, [{ card, versao: v1, decisao: "ajuste", nota: "Encurtar o final." }]);
        versoes += 1;
      }
    }
  }
  return versoes;
}
