// Balões da barra de abas: quantas coisas em cada aba esperam uma ação da pessoa. Só o que a própria tela já pede.
// Roteiros e Teleprompter não têm nada que dependa da pessoa (os roteiros ficam no aparelho, sem revisão nem fila),
// então não ganham balão. Função pura: recebe o estado e devolve { aba: { n, t } }.

/**
 * @param {object} e
 * @param {{estado:string, pessoa:object|null}} [e.zro] conta Absolute ZRO (zro.js)
 * @param {boolean} [e.nuvem] sincronização ligada (sync.cloudEnabled)
 * @param {object|null} [e.usuario] quem entrou na nuvem (sync.currentUser())
 * @param {{status:string}} [e.sync] estado da sincronização (sync.syncState)
 */
export function pendencias({ zro, nuvem, usuario, sync } = {}) {
  const itens = [];
  // Ajustes › Conta: entrou, mas a organização ainda não liberou o TPeasy ("Ver na Absolute ZRO")
  if (zro && zro.estado === "dentro" && zro.pessoa && zro.pessoa.acesso === false) itens.push("Sua conta ainda não tem acesso ao TPeasy");
  // Ajustes › Conta: a sincronização com a nuvem falhou ("Erro ao sincronizar")
  if (nuvem && usuario && sync && sync.status === "error") itens.push("Erro ao sincronizar");
  return itens.length ? { ajustes: { n: itens.length, t: itens.join(" · ") } } : {};
}

/** Número do balão: até 99, depois "99+". */
export const numeroBalao = (n) => (n > 99 ? "99+" : String(n));
/** Texto para leitor de tela. */
export const rotuloBalao = (n) => `${n} ${n === 1 ? "pendência" : "pendências"}`;
