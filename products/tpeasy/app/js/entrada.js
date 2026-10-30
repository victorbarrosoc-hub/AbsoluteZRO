// Aba de entrada (decisão do titular, 29/10/2026; Plano de Integração §7–8: "a tarefa principal do aplicativo vem
// primeiro"). Link com # (#roteiros, #tp, #ajustes, #z) abre a aba dele. Sem link, a entrada é Roteiros, a tarefa do
// TPeasy; a Z nunca é a entrada nem abre sozinha (fica no anel discreto do topo de Roteiros). Quando houver tarefa que
// sobreviva ao fechar (ex.: gravação em curso), ela entra em `emCurso` e ganha de Roteiros.
// Sem dependências: tests/entrada.test.mjs.

/** A aba de quem abre o app sem link: Roteiros (nunca a Z). */
export const INICIO = "roteiros";

/**
 * @param {string} hash location.hash
 * @param {string[]} abas as abas do app
 * @param {{ emCurso?: string|null }} [tarefa] a aba da tarefa em curso, se houver
 */
export function abaDeEntrada(hash, abas, { emCurso = null } = {}) {
  const pedida = String(hash || "").replace(/^#/, "");
  if (abas.includes(pedida)) return pedida;
  if (emCurso && abas.includes(emCurso)) return emCurso;
  return INICIO;
}
