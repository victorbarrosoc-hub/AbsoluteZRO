/** Estados do roteiro e os nomes na tela (sem banco: a tela no navegador também lê). */
export const ESTADOS_ROTEIRO = ["rascunho", "com_cliente", "aprovado", "ajuste"] as const;
export type EstadoRoteiro = (typeof ESTADOS_ROTEIRO)[number];
export const NOME_ESTADO_ROTEIRO: Record<EstadoRoteiro, string> = {
  rascunho: "Rascunho",
  com_cliente: "Com o cliente",
  aprovado: "Aprovado",
  ajuste: "Ajuste",
};
