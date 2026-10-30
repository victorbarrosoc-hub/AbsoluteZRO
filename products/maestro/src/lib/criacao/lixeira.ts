/**
 * A lixeira da Criação (roteiros e fluxos), sem banco: o que a tela pede ao servidor para mandar para a lixeira, tirar
 * dela ou apagar de vez, e a linha que avisa o que muda quando sai da lista. A tela (`components/criacao/lixeira.tsx`)
 * e os testes usam daqui; as rotas continuam as de cada tipo (`roteiro/rota.ts` e `fluxo/rota.ts`).
 *
 * Apagar = mandar para a lixeira (some na hora, com Desfazer). Apagar de vez só da lixeira e só administração e gestão
 * (`podeApagarDeVezCriacao`); roteiro com versão salva não sai de vez (as versões são registro imutável, 0030).
 */
export type TipoCriacao = "roteiro" | "fluxo";

/** O que a lista sabe de cada cartão para apagar e avisar. */
export type ItemLixeira = {
  tipo: TipoCriacao;
  id: string;
  titulo: string;
  /** Nome do card ligado (o bloco "Criação" da ficha deixa de mostrar enquanto estiver na lixeira). */
  card: string | null;
  /** Links vivos do fluxo (`/f/<token>`): na lixeira, abrem a tela neutra. Roteiro: 0. */
  links: number;
  /** A última versão salva (roteiro); 0 = nenhuma. */
  versoes: number;
};

export type AcaoLixeira = "apagar" | "restaurar" | "de_vez";

export const LISTA_DO_TIPO: Record<TipoCriacao, string> = { roteiro: "/app/criacao", fluxo: "/app/criacao/fluxos" };
export const NOME_DO_TIPO: Record<TipoCriacao, string> = { roteiro: "Roteiro", fluxo: "Fluxo" };

/** O pedido de cada ação, pela rota do tipo. */
export function pedidoDaLixeira(tipo: TipoCriacao, id: string, acao: AcaoLixeira): { url: string; corpo: Record<string, unknown> } {
  if (tipo === "roteiro") {
    const url = `/api/criacao/roteiros/${encodeURIComponent(id)}`;
    return { url, corpo: acao === "de_vez" ? { op: "apagar_de_vez" } : { op: "lixeira", apagar: acao === "apagar" } };
  }
  return { url: "/api/criacao/fluxo", corpo: { op: acao === "apagar" ? "lixeira" : acao === "restaurar" ? "restaurar" : "apagar_de_vez", id } };
}

/** A linha do aviso ao apagar (no toque longo, no "•••" e no "Apagado · Desfazer"). null = nada a dizer. */
export function avisoAoApagar(i: Pick<ItemLixeira, "card" | "links">): string | null {
  const card = Boolean(i.card);
  if (card && i.links > 0) return i.links === 1 ? "Sai do card e o link para de abrir." : "Sai do card e os links param de abrir.";
  if (card) return "Sai do card até voltar da lixeira.";
  if (i.links > 0) return i.links === 1 ? "O link para de abrir." : "Os links param de abrir.";
  return null;
}

/** Sai de vez? Roteiro com versão salva fica guardado na lixeira (a explicação é `porQueFica`). */
export const saiDeVez = (i: Pick<ItemLixeira, "tipo" | "versoes">): boolean => i.tipo === "fluxo" || i.versoes === 0;
export const POR_QUE_FICA = "Tem versões salvas: fica guardado.";

/** Volta à lista com o "Apagado · Desfazer" (o editor e o canvas mandam para cá depois de apagar). */
export const listaDepoisDeApagar = (tipo: TipoCriacao, id: string) => `${LISTA_DO_TIPO[tipo]}?apagou=${encodeURIComponent(id)}`;
