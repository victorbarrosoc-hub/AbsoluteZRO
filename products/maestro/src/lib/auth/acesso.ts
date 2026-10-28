/**
 * O ÚNICO lugar que decide se uma conta Absolute ZRO pode usar o Maestro. Páginas (lib/auth/pagina.ts) e rotas de
 * dados (lib/auth/requisicao.ts) passam por aqui; nenhuma tela decide sozinha.
 *
 * Hoje: o produto `maestro` precisa estar em `zro_products` da organização ativa (contratado ou concedido pelo console
 * da Absolute ZRO). A lista vem do login e é relida no /api/zro/eu (userinfo), então o que o admin muda vale na próxima
 * leitura, sem a pessoa fazer nada.
 *
 * Gate de lançamento (auditoria de acesso, §2.4 e §5a; outro agente): quando a claim `zro_release` existir,
 * ela entra AQUI, antes dos produtos: `release.maestro` = "released" (aberto ao público) ou "allowed" (esta conta
 * está na lista enquanto fechado) libera; "closed" (ou ausente, com o gate em vigor) nega mesmo com o produto na
 * lista. Até lá o Maestro nasce fechado por outro caminho: só quem recebeu o produto pelo console entra.
 *
 * Sem imports de banco ou de rede: função pura, testável.
 */

/** Id do Maestro em zro_products (zro.products.id). */
export const PRODUTO = "maestro";

export const MENSAGEM_SEM_ACESSO = "Sua conta Absolute ZRO ainda não tem acesso ao Maestro.";

export type Acesso = {
  produtos: readonly string[];
  /** Claim zro_release, quando a Absolute ZRO passar a mandar. */
  release?: Readonly<Record<string, string>> | null;
};

export function temAcesso(a: Acesso): boolean {
  // Gate de lançamento: a claim zro_release entra aqui (ver cabeçalho). Enquanto não existe, não decide nada.
  if (a.release && PRODUTO in a.release) {
    const r = a.release[PRODUTO];
    if (r !== "released" && r !== "allowed") return false;
  }
  return a.produtos.includes(PRODUTO);
}
