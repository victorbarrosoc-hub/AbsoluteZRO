/**
 * As colunas do Quadro de cada produtora (drizzle/0024_colunas.sql): nome, cor, ordem e arquivada. Puro: roda no
 * navegador, no servidor e nos testes.
 *
 * - As 8 do método são de sistema: o id é o papel (`COLUNAS` em metodo.ts) e nunca muda; podem ser renomeadas,
 *   recoloridas e reordenadas, mas não arquivadas (o produto depende delas: o card nasce na Pauta, a aprovação do
 *   cliente leva a Aprovado ou Revisão, gerar o link leva a Em aprovação, Entregue fecha o card no Hoje e na agenda).
 * - As da produtora (`x-…`) contam como "em produção" e podem ser arquivadas (os cards vão para outra coluna).
 * - Cor é só ponto e filete (o texto segue grafite/branco); a paleta é fechada e cada cor tem o tom do claro e do
 *   escuro em `--cor-*` (globals.css).
 */
import { COLUNA, COLUNAS, ehPapel, type ColunaId, type PapelColuna } from "./metodo";

export const CORES_COLUNA = [
  { k: "pedra", nome: "Pedra" },
  { k: "lavanda", nome: "Lavanda" },
  { k: "ambar", nome: "Âmbar" },
  { k: "laranja", nome: "Laranja" },
  { k: "latao", nome: "Latão" },
  { k: "verde", nome: "Verde" },
  { k: "turquesa", nome: "Turquesa" },
  { k: "oliva", nome: "Oliva" },
  { k: "rosa", nome: "Rosa" },
  { k: "ceu", nome: "Céu" },
  { k: "ameixa", nome: "Ameixa" },
  { k: "grafite", nome: "Grafite" },
] as const;
export type CorColuna = (typeof CORES_COLUNA)[number]["k"];
export const ehCorColuna = (v: unknown): v is CorColuna => typeof v === "string" && CORES_COLUNA.some((c) => c.k === v);

/** Os tons de cada cor (claro, escuro): os mesmos de `--cor-*` em globals.css (o teste confere o contraste). */
export const TONS_COLUNA: Record<CorColuna, { claro: string; escuro: string }> = {
  pedra: { claro: "#a8a29e", escuro: "#a8a29e" },
  lavanda: { claro: "#9aa3d8", escuro: "#a4adf0" },
  ambar: { claro: "#f5a524", escuro: "#f5b03e" },
  laranja: { claro: "#f76b15", escuro: "#ff8a3d" },
  latao: { claro: "#c8962f", escuro: "#ffc857" },
  verde: { claro: "#46a758", escuro: "#5bbf6e" },
  turquesa: { claro: "#12a594", escuro: "#2ec4b0" },
  oliva: { claro: "#6e8b3d", escuro: "#95b35c" },
  rosa: { claro: "#e0607e", escuro: "#f28ba3" },
  ceu: { claro: "#3e8ed0", escuro: "#6cb0ef" },
  ameixa: { claro: "#9a62b8", escuro: "#c49be0" },
  grafite: { claro: "#6e6e73", escuro: "#aeaeb2" },
};

export type Coluna = {
  id: ColunaId;
  /** Papel de sistema (= id) ou null (coluna da produtora). */
  papel: PapelColuna | null;
  nome: string;
  cor: CorColuna;
  ordem: number;
  arquivada: boolean;
};

export const LIMITE_NOME_COLUNA = 30;
/** Quantas colunas da produtora (vivas ou arquivadas) cabem: o mesmo limite de `maestro.coluna_criar`. */
export const LIMITE_COLUNAS_DA_PRODUTORA = 24;

/** Nome de coluna normalizado (espaços colapsados) ou `undefined` se vazio ou longo demais. Igual a `maestro.coluna_nome`. */
export function nomeDeColuna(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length >= 1 && t.length <= LIMITE_NOME_COLUNA ? t : undefined;
}

/** As 8 colunas de fábrica (o que uma organização nova recebe e o que "Restaurar padrão" devolve). */
export function colunasPadrao(): Coluna[] {
  return COLUNAS.map((c, i) => ({ id: c.k, papel: c.k, nome: c.nome, cor: c.cor as CorColuna, ordem: i + 1, arquivada: false }));
}

/** Para que serve cada coluna de sistema: o selo discreto (dica) que explica por que ela não pode ser arquivada. */
export const USO_DO_PAPEL: Record<PapelColuna, string> = {
  pauta: "Onde nasce o card novo",
  afazer: "Parte do método: o prazo conta aqui",
  fazendo: "Parte do método: o prazo conta aqui",
  revisao: "Usada pela aprovação do cliente",
  aprovacao: "Usada pela aprovação do cliente",
  aprovado: "Usada pela aprovação do cliente",
  agendado: "Parte do método",
  entregue: "Fecha o card no Hoje e na agenda",
};

/** A descrição curta (estado vazio da coluna, dica do cabeçalho). */
export function descricaoDaColuna(c: Pick<Coluna, "papel">): string {
  return c.papel ? COLUNA[c.papel].desc : "Em produção.";
}

/** As colunas vivas na ordem do Quadro. */
export function colunasVivas(l: readonly Coluna[]): Coluna[] {
  return l.filter((c) => !c.arquivada).sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

/** As arquivadas (as mais recentes primeiro não importa: pela ordem que tinham). */
export function colunasArquivadas(l: readonly Coluna[]): Coluna[] {
  return l.filter((c) => c.arquivada).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Tira `id` da lista e põe na posição `para` (índice na lista final). */
export function moverNaLista(ids: readonly string[], id: string, para: number): string[] {
  const sem = ids.filter((x) => x !== id);
  const i = Math.max(0, Math.min(para, sem.length));
  return [...sem.slice(0, i), id, ...sem.slice(i)];
}

/** Aplica uma ordem nova (ids das vivas) à lista inteira, renumerando 1..n como o banco. */
export function aplicarOrdem(l: readonly Coluna[], ids: readonly string[]): Coluna[] {
  const pos = new Map(ids.map((id, i) => [id, i + 1]));
  return l.map((c) => (pos.has(c.id) ? { ...c, ordem: pos.get(c.id)! } : c));
}

/** Linha do banco → Coluna (confere papel e cor; o que não reconhece vira o padrão seguro). */
export function colunaDaLinha(l: { id: string; papel: string | null; nome: string; cor: string; ordem: number; arquivada: boolean }): Coluna {
  return {
    id: l.id,
    papel: ehPapel(l.papel) ? l.papel : null,
    nome: l.nome,
    cor: ehCorColuna(l.cor) ? l.cor : "grafite",
    ordem: Number(l.ordem) || 0,
    arquivada: !!l.arquivada,
  };
}

/** Nome de uma coluna pelo id (cai no nome de fábrica e, por fim, no próprio id). */
export function nomeDaColuna(l: readonly Coluna[], id: string | null | undefined): string {
  if (!id) return "";
  return l.find((c) => c.id === id)?.nome ?? (ehPapel(id) ? COLUNA[id].nome : "Coluna");
}

/** Cor de uma coluna pelo id (cai na cor de fábrica). */
export function corDaColuna(l: readonly Coluna[], id: string | null | undefined): CorColuna {
  const c = id ? l.find((x) => x.id === id) : undefined;
  if (c) return c.cor;
  return id && ehPapel(id) ? (COLUNA[id].cor as CorColuna) : "grafite";
}
