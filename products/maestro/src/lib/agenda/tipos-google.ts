/** O que pode ir para o Google Agenda (módulo puro: a tela de Ajustes também lê). */
export const TIPOS_GOOGLE = [
  { k: "diaria", nome: "Diárias" },
  { k: "entrega", nome: "Entregas" },
  { k: "reuniao", nome: "Reuniões" },
  { k: "prazo", nome: "Prazos" },
  { k: "outro", nome: "Outros" },
] as const;
export type TipoGoogle = (typeof TIPOS_GOOGLE)[number]["k"];
export const TIPOS_PADRAO: TipoGoogle[] = ["diaria", "entrega", "prazo"];
export const ehTipoGoogle = (v: unknown): v is TipoGoogle => TIPOS_GOOGLE.some((t) => t.k === v);
