/**
 * O funil leve de vendas (estudo MakersHub §4.1, drizzle/0014): as etapas do pedido, quem pode ir para onde e a
 * situação do próximo contato. Puro: a tela, o servidor e os testes usam as mesmas regras; o banco confere de novo
 * (gatilho maestro.pedido_etapa: "Ganho" só com o orçamento aprovado e é final; "Perdido" exige o motivo).
 */
import { ehData } from "@/lib/dinheiro";

export const ETAPAS = [
  { k: "novo", nome: "Novo", tom: "aviso" },
  { k: "conversa", nome: "Em conversa", tom: "neutro" },
  { k: "orcamento", nome: "Orçamento enviado", tom: "enviado" },
  { k: "negociando", nome: "Negociando", tom: "parcial" },
  { k: "ganho", nome: "Ganho", tom: "aprovado" },
  { k: "perdido", nome: "Perdido", tom: "recusado" },
] as const;
export type Etapa = (typeof ETAPAS)[number]["k"];
export const ETAPAS_ABERTAS: Etapa[] = ["novo", "conversa", "orcamento", "negociando"];

export const ehEtapa = (v: unknown): v is Etapa => typeof v === "string" && ETAPAS.some((e) => e.k === v);
export const nomeEtapa = (e: string) => ETAPAS.find((x) => x.k === e)?.nome ?? e;
export const tomEtapa = (e: string) => ETAPAS.find((x) => x.k === e)?.tom ?? "neutro";

/** Motivos de perda sugeridos (a pessoa também escreve o dela). */
export const MOTIVOS_PERDA = ["Preço", "Prazo", "Fechou com outra produtora", "Sem resposta", "Projeto cancelado"] as const;

export type Transicao = { ok: true } | { ok: false; erro: "ganho_final" | "ganho_sem_aceite" | "motivo" | "igual" | "etapa"; mensagem: string };

/**
 * Pode ir de `de` para `para`? `orcamentoAprovado`: o orçamento do pedido foi aprovado (aceite do cliente ou da equipe).
 * `motivo`: o motivo da perda (2 a 300 letras).
 */
export function podeMover(de: Etapa, para: unknown, o: { orcamentoAprovado: boolean; motivo?: string | null }): Transicao {
  if (!ehEtapa(para)) return { ok: false, erro: "etapa", mensagem: "Etapa desconhecida." };
  if (de === para) return { ok: false, erro: "igual", mensagem: "O pedido já está nessa etapa." };
  if (de === "ganho") return { ok: false, erro: "ganho_final", mensagem: "Pedido ganho não volta: o projeto já existe." };
  if (para === "ganho" && !o.orcamentoAprovado)
    return { ok: false, erro: "ganho_sem_aceite", mensagem: "Ganho só com o orçamento aprovado. Mande o link do orçamento." };
  if (para === "perdido") {
    const m = (o.motivo ?? "").trim();
    if (m.length < 2 || m.length > 300) return { ok: false, erro: "motivo", mensagem: "Diga o motivo da perda." };
  }
  return { ok: true };
}

export type SituacaoRetorno = "atrasado" | "hoje" | "proximo";

/** Atrasado (antes de hoje), hoje, ou próximo. */
export function situacaoRetorno(data: string, hoje: string): SituacaoRetorno {
  if (data < hoje) return "atrasado";
  if (data === hoje) return "hoje";
  return "proximo";
}

/** "hoje", "ontem", "há 3 dias", "amanhã", "em 5 dias". */
export function quandoRetorno(data: string, hoje: string): string {
  const d = Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
  if (d === 0) return "hoje";
  if (d === -1) return "ontem";
  if (d === 1) return "amanhã";
  return d < 0 ? `há ${-d} dias` : `em ${d} dias`;
}

/** Valida o próximo contato que chega do formulário: data obrigatória (AAAA-MM-DD), nota até 300. */
export function validarRetorno(dataV: unknown, notaV: unknown): { ok: true; data: string; nota: string | null } | { ok: false; mensagem: string } {
  const data = typeof dataV === "string" ? dataV.trim() : "";
  if (!ehData(data)) return { ok: false, mensagem: "Escolha a data do próximo contato." };
  const nota = typeof notaV === "string" ? notaV.trim() : "";
  if (nota.length > 300) return { ok: false, mensagem: "A nota cabe em 300 letras." };
  return { ok: true, data, nota: nota || null };
}
