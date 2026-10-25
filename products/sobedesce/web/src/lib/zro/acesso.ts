/**
 * Direito de uso vindo da Absolute ZRO. O id_token traz `zro_products` (produtos liberados pelo admin para a
 * organização ativa); a SOBEDESCE guarda a lista em contas_zro.produtos a cada login ou religação pela Absolute ZRO.
 * - Conta ligada à Absolute ZRO sem "sobedesce" na lista: entra, mas as funções da conta ficam bloqueadas.
 * - Conta antiga que nunca passou pela Absolute ZRO (sem linha em contas_zro): segue como sempre.
 * Sem imports: sessao.ts usa isto no caminho de toda autenticação.
 */

/** Id da SOBEDESCE em zro_products. */
export const PRODUTO_ZRO = "sobedesce";

/** Onde a pessoa vê (e pede) as ferramentas liberadas para a conta dela. */
export const FERRAMENTAS_ZRO = "https://absolutezro.vercel.app/ferramentas";

export const MENSAGEM_SEM_ACESSO = "Sua conta Absolute ZRO ainda não tem acesso ao SOBEDESCE.";

/** `produtos`: o texto guardado em contas_zro (separado por espaço), ou null quando a conta não tem vínculo. */
export function liberadoPelaZro(produtos: string | null | undefined): boolean {
  if (produtos === null || produtos === undefined) return true;
  return produtos.split(" ").includes(PRODUTO_ZRO);
}
