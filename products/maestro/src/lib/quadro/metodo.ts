/**
 * O método do Quadro: 8 colunas, um estado só por card (`dados.coluna`). O método não muda; os nomes são os do
 * proprietário (28/10/2026): "Com o cliente" virou "Em aprovação" e "Publicado" virou "Entregue".
 */
export type ColunaKey = "pauta" | "afazer" | "fazendo" | "revisao" | "aprovacao" | "aprovado" | "agendado" | "entregue";

export const COLUNAS: { k: ColunaKey; nome: string; desc: string }[] = [
  { k: "pauta", nome: "Pauta", desc: "Ideias sem responsável. Escolha quem faz." },
  { k: "afazer", nome: "A fazer", desc: "Tem dono e prazo. Ainda não começou." },
  { k: "fazendo", nome: "Fazendo", desc: "Em produção agora." },
  { k: "revisao", nome: "Revisão", desc: "Alguém da casa confere antes do cliente." },
  { k: "aprovacao", nome: "Em aprovação", desc: "Esperando a decisão do cliente." },
  { k: "aprovado", nome: "Aprovado", desc: "O cliente aprovou. Falta agendar." },
  { k: "agendado", nome: "Agendado", desc: "Programado para ir ao ar." },
  { k: "entregue", nome: "Entregue", desc: "No ar, entregue ao cliente." },
];

/** Id de card: relógio em base 36 + acaso, dentro do formato que o banco exige (^[A-Za-z0-9_-]{4,64}$). */
export function novoId(agora = Date.now()): string {
  const acaso = Math.random().toString(36).slice(2, 8);
  return `c${agora.toString(36)}${acaso}`;
}
