/**
 * Quem está na tela (componentes de servidor). No Next 16, layout e página renderizam em paralelo: cada página
 * protegida chama exigirAcessoNaPagina() por conta própria, nunca confia no layout.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROTAS } from "@/lib/site";
import { temAcesso } from "./acesso";
import { autenticar, COOKIE_SESSAO, type Sessao } from "./sessao";

export async function sessaoDaPagina(): Promise<Sessao | null> {
  return autenticar((await cookies()).get(COOKIE_SESSAO)?.value);
}

/** Sessão obrigatória (a tela "sem acesso" precisa saber quem é para oferecer Sair). */
export async function exigirSessaoNaPagina(volta: string): Promise<Sessao> {
  const s = await sessaoDaPagina();
  if (!s) redirect(`${ROTAS.entrar}?volta=${encodeURIComponent(volta)}`);
  return s;
}

/** Sessão com acesso ao Maestro; sem sessão vai para /entrar, sem acesso para /sem-acesso. */
export async function exigirAcessoNaPagina(volta: string): Promise<Sessao> {
  const s = await exigirSessaoNaPagina(volta);
  if (!temAcesso(s)) redirect(ROTAS.semAcesso);
  return s;
}
