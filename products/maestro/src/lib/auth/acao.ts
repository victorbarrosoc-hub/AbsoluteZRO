/**
 * Quem pede numa Server Action: a mesma sessão do cookie e o mesmo temAcesso() das páginas e rotas. Sem sessão vai
 * para /entrar, sem acesso para /sem-acesso; nunca confia no que a tela mostrou.
 */
import "server-only";
import { redirect } from "next/navigation";
import { ROTAS } from "@/lib/site";
import { temAcesso } from "./acesso";
import { sessaoDaPagina } from "./pagina";
import type { Sessao } from "./sessao";

export async function exigirAcessoNaAcao(): Promise<Sessao> {
  const s = await sessaoDaPagina();
  if (!s) redirect(ROTAS.entrar);
  if (!temAcesso(s)) redirect(ROTAS.semAcesso);
  return s;
}
