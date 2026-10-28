/**
 * Vocabulário do banco de freelas (porte de FUNCTIONS, normalizeFunction, RATE_UNITS e freelaWhatsappText do ZRO).
 * Puro.
 */

export const FUNCOES = [
  { k: "captacao-camera", nome: "Captação com câmera" },
  { k: "captacao", nome: "Captação sem câmera" },
  { k: "edicao", nome: "Edição" },
  { k: "sameday", nome: "Sameday" },
  { k: "color", nome: "Color e finalização" },
  { k: "foto", nome: "Fotografia" },
  { k: "drone", nome: "Drone" },
  { k: "som", nome: "Som direto" },
  { k: "assistente", nome: "Assistente" },
  { k: "producao", nome: "Produção" },
  { k: "motion", nome: "Motion" },
  { k: "roteiro", nome: "Roteiro" },
] as const;

export const nomeFuncao = (k: string) => FUNCOES.find((f) => f.k === k)?.nome ?? k;

/** Função digitada → chave: "drone" e "Drone" viram a padrão; o resto vira um nome limpo ("maquiagem " → "Maquiagem"). */
export function normalizarFuncao(texto: string, existentes: Iterable<string> = []): string | null {
  const t = texto.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!t) return null;
  const min = t.toLocaleLowerCase("pt-BR");
  const padrao = FUNCOES.find((f) => f.k === t || f.nome.toLocaleLowerCase("pt-BR") === min);
  if (padrao) return padrao.k;
  for (const e of existentes) if (e.toLocaleLowerCase("pt-BR") === min) return e;
  return t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
}

export const UNIDADES_VALOR = [
  { k: "diaria", nome: "por diária" },
  { k: "projeto", nome: "por projeto" },
  { k: "video", nome: "por vídeo" },
] as const;
export type UnidadeValor = (typeof UNIDADES_VALOR)[number]["k"];
export const nomeUnidadeValor = (k: string) => UNIDADES_VALOR.find((u) => u.k === k)?.nome ?? k;

export const WHATSAPP_PADRAO = "Oi, {nome}! Tudo bem? Aqui é da {produtora}.";

/** A mensagem que abre a conversa: {nome} vira o primeiro nome; {produtora}, o nome da organização. */
export function textoWhatsapp(modelo: string | null | undefined, nome: string, produtora: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return (modelo?.trim() || WHATSAPP_PADRAO).replace(/\{nome\}/gi, primeiro).replace(/\{produtora\}/gi, produtora);
}

/** Valor sugerido para escalar: a diária da função; sem ela, a da primeira função. */
export function diariaSugerida(valores: { funcao: string; unidade: string; valorCents: number }[], funcao: string): number | null {
  const diarias = valores.filter((v) => v.unidade === "diaria");
  return (diarias.find((v) => v.funcao === funcao) ?? diarias[0])?.valorCents ?? null;
}

/** Dias de um período (início e fim inclusos). */
export function diasDoPeriodo(inicio: string, fim: string): number {
  const ms = Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10)) - Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10));
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
