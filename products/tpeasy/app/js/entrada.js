// Aba de entrada (decisão do titular, 28/10/2026): "a Z continua como aba, mas o app abre na tarefa quando há algo em
// andamento". Link com # (#roteiros, #tp, #ajustes) abre a aba dele; #hub/<projeto> abre Roteiros. No TPeasy nenhuma tarefa segue com o app fechado
// (o TP e o editor fecham junto, e cada roteiro já fica salvo), então sem link a entrada é a Z. Quando houver tarefa
// que sobreviva (ex.: gravação em curso), ela entra em `emCurso` e ganha da Z. Sem dependências: tests/entrada.test.mjs.

/**
 * @param {string} hash location.hash
 * @param {string[]} abas as abas do app (a Z primeiro)
 * @param {{ emCurso?: string|null }} [tarefa] a aba da tarefa em curso, se houver
 */
export function abaDeEntrada(hash, abas, { emCurso = null } = {}) {
  const pedida = String(hash || "").replace(/^#/, "");
  // "Abrir no TPeasy" (#hub/<projeto>): o roteiro abre por cima de Roteiros (hub.js)
  if (pedida.startsWith("hub/") && abas.includes("roteiros")) return "roteiros";
  if (abas.includes(pedida)) return pedida;
  if (emCurso && abas.includes(emCurso)) return emCurso;
  return "z";
}
