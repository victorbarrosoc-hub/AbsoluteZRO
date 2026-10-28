/**
 * Quem pede numa rota de dados (/api/*): sessão pelo cookie e acesso ao Maestro conferido no servidor. Toda rota de
 * dados nega sem sessão (401) e sem acesso (403), nunca só a tela.
 */
import { erro, lerCookie } from "@/lib/http";
import { MENSAGEM_SEM_ACESSO, temAcesso } from "./acesso";
import { autenticar, COOKIE_SESSAO, type Sessao } from "./sessao";

export async function sessaoDaRequisicao(req: Request): Promise<Sessao | null> {
  return autenticar(lerCookie(req, COOKIE_SESSAO));
}

export const SEM_SESSAO = () => erro(401, "sem_sessao", "Entre com a Absolute ZRO.");

/** null = pode seguir; senão a resposta 403. */
export function semAcesso(s: Sessao): Response | null {
  return temAcesso(s) ? null : erro(403, "sem_acesso_zro", MENSAGEM_SEM_ACESSO);
}

/** Sessão com acesso ao Maestro, ou a resposta que nega (401/403). */
export async function exigirAcesso(req: Request): Promise<Sessao | Response> {
  const s = await sessaoDaRequisicao(req);
  if (!s) return SEM_SESSAO();
  return semAcesso(s) ?? s;
}
