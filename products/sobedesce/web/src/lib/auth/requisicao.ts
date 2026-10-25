/**
 * Autenticação nas rotas da API (Request da Web API, sem next/headers).
 * Cookie `sd_sessao` (site, confere Origin nas mutações) ou `Authorization: Bearer sdd_...` (computador).
 */
import { erro, lerCookie, origemConfere } from "@/lib/http";
import { origensDoSite } from "@/lib/site";
import { FERRAMENTAS_ZRO, MENSAGEM_SEM_ACESSO } from "@/lib/zro/acesso";
import { autenticar, COOKIE_SESSAO, type Autenticado } from "./sessao";

export function usuarioDaRequisicao(req: Request): Promise<Autenticado | null> {
  const build = Number(req.headers.get("x-sobedesce-build"));
  return autenticar({
    cookie: lerCookie(req, COOKIE_SESSAO),
    authorization: req.headers.get("authorization"),
    celular: req.headers.get("x-sobedesce-app") === "celular",
    build: req.headers.has("x-sobedesce-build") && Number.isSafeInteger(build) ? build : null,
  });
}

export const SEM_SESSAO = () => erro(401, "sem_sessao", "Entre na sua conta para continuar.");

/** Conta ligada à Absolute ZRO sem a SOBEDESCE liberada (lib/zro/acesso.ts). 403, não 401: a sessão continua valendo. */
export const SEM_ACESSO_ZRO = () => erro(403, "sem_acesso_zro", `${MENSAGEM_SEM_ACESSO} Veja em ${FERRAMENTAS_ZRO}`);

/** A resposta de bloqueio quando a conta não tem a SOBEDESCE liberada pela Absolute ZRO; null quando pode seguir. */
export function semAcesso(atual: Autenticado): Response | null {
  return atual.liberado ? null : SEM_ACESSO_ZRO();
}

/**
 * Para rotas que mudam algo: sessão, acesso liberado pela Absolute ZRO e Origin quando a sessão veio do cookie.
 * Devolve o usuário ou a resposta de erro pronta.
 */
export async function exigirNaApi(req: Request, opcoes: { mutacao: boolean }): Promise<Autenticado | Response> {
  const atual = await usuarioDaRequisicao(req);
  if (!atual) return SEM_SESSAO();
  const bloqueio = semAcesso(atual);
  if (bloqueio) return bloqueio;
  if (opcoes.mutacao && atual.via === "cookie" && !origemConfere(req.headers, req.url, origensDoSite())) {
    return erro(403, "origem", "Pedido de outra origem recusado.");
  }
  return atual;
}
