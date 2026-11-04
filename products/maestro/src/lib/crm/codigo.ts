/**
 * O código do projeto (titular, 03/11/2026: "O que seria esse MAE?"). MAE é de Maestro: o código nasce sozinho como
 * MAE + ano + número do ano na organização (MAE-2026-001), em `proximoCodigo` (src/lib/crm/projetos.ts) e no aceite do
 * orçamento pelo link (drizzle/0012). Puro: a tela mostra a dica no `title` do código.
 */
export function dicaDoCodigo(codigo: string | null | undefined): string {
  const m = /^MAE-(\d{4})-(\d{3,5})$/.exec(codigo ?? "");
  if (!m) return "Código do projeto";
  return `Código do projeto: MAE (Maestro) + ano ${m[1]} + nº ${Number(m[2])} do ano`;
}
