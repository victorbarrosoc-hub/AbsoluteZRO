/**
 * O ÚNICO lugar que decide se uma conta Absolute ZRO pode usar o Maestro. Páginas (lib/auth/pagina.ts) e rotas de
 * dados (lib/auth/requisicao.ts) passam por aqui; nenhuma tela decide sozinha.
 *
 * Duas condições, as duas vindas do login e relidas no /api/zro/eu (userinfo), então o que o HUB muda vale na próxima
 * leitura, sem a pessoa fazer nada:
 * 1. Gate de lançamento (ADR 0023): a claim `zro_release.maestro` precisa ser "released" (aberto ao público; desde a
 *    migration 0020 do HUB o Maestro está em teste aberto) ou "allowed" (esta conta está na lista enquanto fechado).
 *    "closed", outro valor ou a claim ausente = fechado (deny-by-default, como os outros produtos da família).
 * 2. Entitlement: `maestro` em `zro_products` da organização ativa (plano grátis, Completo, Pro ou concessão do console).
 *
 * Sem imports de banco ou de rede: função pura, testável.
 */

/** Id do Maestro em zro_products e em zro_release (zro.products.id). */
export const PRODUTO = "maestro";

export const MENSAGEM_SEM_ACESSO = "Sua conta Absolute ZRO ainda não tem acesso ao Maestro.";

export type Acesso = {
  produtos: readonly string[];
  /** Claim zro_release do login (ou da última releitura). */
  release?: Readonly<Record<string, string>> | null;
};

/** O que o HUB diz desta conta sobre o Maestro: released | allowed | closed (sem a claim = closed). */
export function liberacao(a: Pick<Acesso, "release">): "released" | "allowed" | "closed" {
  const r = a.release?.[PRODUTO];
  return r === "released" || r === "allowed" ? r : "closed";
}

export function temAcesso(a: Acesso): boolean {
  return liberacao(a) !== "closed" && a.produtos.includes(PRODUTO);
}
