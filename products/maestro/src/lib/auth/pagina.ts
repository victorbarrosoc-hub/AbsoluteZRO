/**
 * Quem está na tela (componentes de servidor). No Next 16, layout e página renderizam em paralelo: cada página
 * protegida chama exigirAcessoNaPagina() por conta própria, nunca confia no layout.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { produtorasDoFreela, type ProdutoraDoFreela } from "@/lib/freelas/area";
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

/**
 * A área do freela (drizzle/0037): sessão obrigatória e a pessoa ligada a um freela em alguma produtora (o banco diz,
 * pelo `sub` da sessão). Sem vínculo: quem tem o Maestro vai para o app; quem não tem, para "sem acesso".
 */
export async function exigirFreelaNaPagina(volta: string): Promise<{ sessao: Sessao; produtoras: ProdutoraDoFreela[] }> {
  const sessao = await exigirSessaoNaPagina(volta);
  const produtoras = await produtorasDoFreela(sessao.sub);
  if (!produtoras.length) redirect(temAcesso(sessao) ? ROTAS.app : ROTAS.semAcesso);
  return { sessao, produtoras };
}
