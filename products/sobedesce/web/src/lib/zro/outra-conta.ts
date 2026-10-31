/**
 * "Entrar nessa conta" (pedido do titular, 31/10/2026). Quem está numa conta SOBEDESCE antiga e liga a Absolute ZRO pode
 * cair numa Absolute ZRO que já tem outra conta SOBEDESCE (`zro_outra_conta`). A pessoa acabou de provar, na Absolute
 * ZRO, que é dona daquela conta: o callback guarda isso num selo, e "Entrar nessa conta" troca a sessão para a conta
 * SOBEDESCE ligada a ela.
 *
 * Segurança:
 * - O selo nasce só no callback, depois de conferir o id_token (assinatura, emissor, público, nonce, state). É cifrado e
 *   autenticado (AES-256-GCM, contexto próprio: o cookie do login não abre aqui), httpOnly, sameSite=lax e vale 5 minutos.
 * - O zroSub vem só do selo, nunca do formulário. O POST confere a Origin (CSRF) e não lê nada do corpo.
 * - O selo é preso à sessão que pediu a ligação: outra sessão (ou nenhuma) não usa. Ao trocar, essa sessão é encerrada e
 *   o cookie apagado; reapresentar o mesmo selo não funciona mais (a sessão dele já não existe).
 */
import { eq } from "drizzle-orm";
import { COOKIE_APARELHO, conferirAparelho, opcoesCookieAparelho } from "@/lib/auth/aparelho";
import { autenticar, COOKIE_SESSAO, criarSessao, opcoesCookieSessao, revogarPorToken } from "@/lib/auth/sessao";
import { destinoDeEntrada, voltaSegura } from "@/lib/auth/volta";
import { db, schema } from "@/lib/db";
import { depoisDaResposta, type Depois } from "@/lib/depois";
import { abrirCookie, selarCookie } from "@/lib/google/cripto";
import { comParametro } from "@/lib/google/rotas";
import { erro, lerCookie, lugarDe, origemConfere, origemDoPedido, redirecionar, serializarCookie } from "@/lib/http";
import { cookieSeguro, origensDoSite } from "@/lib/site";

export const COOKIE_OUTRA_CONTA = "sd_zro_outra";
export const DURACAO_OUTRA_CONTA_S = 300;
const CONTEXTO = "cookie:sd_zro_outra";

/** `sessao`: a sessão SOBEDESCE que pediu a ligação. `email`: o da Absolute ZRO, só para mostrar na tela. */
export type SeloOutraConta = { zroSub: string; email: string; sessao: string; volta: string; expira: number };

export function selarOutraConta(s: Omit<SeloOutraConta, "expira">, agora = Date.now()): string {
  return selarCookie(JSON.stringify({ ...s, expira: agora + DURACAO_OUTRA_CONTA_S * 1000 }), CONTEXTO);
}

/** O selo, se vier inteiro, autêntico e dentro dos 5 minutos; senão null. */
export function abrirOutraConta(valor: string | undefined | null, agora = Date.now()): SeloOutraConta | null {
  if (!valor) return null;
  try {
    const s = JSON.parse(abrirCookie(valor, CONTEXTO)) as SeloOutraConta;
    if (typeof s.zroSub !== "string" || !s.zroSub || typeof s.sessao !== "string" || !s.sessao) return null;
    if (typeof s.email !== "string" || typeof s.volta !== "string") return null;
    if (typeof s.expira !== "number" || s.expira < agora) return null;
    return s;
  } catch {
    return null;
  }
}

/** Set-Cookie do selo, para o callback. Path "/": a tela de ligar lê o selo para mostrar o botão. */
export function cookieOutraConta(valor: string, seguro: boolean): string {
  return serializarCookie(COOKIE_OUTRA_CONTA, valor, { maxAge: DURACAO_OUTRA_CONTA_S, path: "/", secure: seguro });
}

/** O que a tela mostra junto do `zro_outra_conta`: o e-mail da Absolute ZRO, se o selo ainda vale para esta sessão. */
export function outraContaParaTela(valor: string | undefined, sessaoId: string): { email: string } | null {
  const s = abrirOutraConta(valor);
  return s && s.sessao === sessaoId ? { email: s.email } : null;
}

/** POST /api/zro/trocar-conta: encerra a sessão atual e abre a da conta SOBEDESCE ligada à Absolute ZRO do selo. */
export async function trocarConta(req: Request, depois: Depois = depoisDaResposta): Promise<Response> {
  const url = new URL(req.url);
  const seguro = cookieSeguro(origemDoPedido(req.headers, req.url));
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem recusado.");
  const limpar = serializarCookie(COOKIE_OUTRA_CONTA, "", { maxAge: 0, path: "/", secure: seguro });
  const ir = (caminho: string, cookies: string[] = []) => redirecionar(new URL(caminho, url.origin), 303, [limpar, ...cookies]);

  const token = lerCookie(req, COOKIE_SESSAO);
  const atual = await autenticar({ cookie: token });
  const selo = abrirOutraConta(lerCookie(req, COOKIE_OUTRA_CONTA));
  const volta = voltaSegura(selo?.volta);
  // Sem selo, vencido, adulterado ou de outra sessão: nada muda; a pessoa tenta de novo pela Absolute ZRO.
  if (!selo || !atual || atual.via !== "cookie" || atual.sessao.id !== selo.sessao) {
    return ir(atual ? comParametro(volta, "erro", "zro_expirou") : "/entrar?erro=zro_expirou");
  }
  const ligada = await db.query.contasZro.findFirst({ where: eq(schema.contasZro.zroSub, selo.zroSub) });
  // A Absolute ZRO foi desligada nesse meio-tempo, ou já é a desta conta: não há para onde trocar.
  if (!ligada || ligada.usuarioId === atual.usuario.id) return ir(comParametro(volta, "erro", "zro_expirou"));

  if (token) await revogarPorToken(token);
  await db.update(schema.usuarios).set({ ultimoLoginEm: new Date() }).where(eq(schema.usuarios.id, ligada.usuarioId));
  await db.update(schema.contasZro).set({ ultimoLoginEm: new Date() }).where(eq(schema.contasZro.usuarioId, ligada.usuarioId));
  const sessao = await criarSessao(ligada.usuarioId, "web");
  const o = opcoesCookieSessao(seguro);
  const cookies = [serializarCookie(COOKIE_SESSAO, sessao.token, { maxAge: o.maxAge, path: o.path, secure: o.secure })];
  const aparelho = await conferirAparelho({
    usuarioId: ligada.usuarioId,
    cookie: lerCookie(req, COOKIE_APARELHO),
    via: "zro",
    entrada: { userAgent: req.headers.get("user-agent"), lugar: lugarDe(req.headers) },
    avisar: true,
    depois,
  });
  if (aparelho) {
    const a = opcoesCookieAparelho(seguro);
    cookies.push(serializarCookie(COOKIE_APARELHO, aparelho, { maxAge: a.maxAge, path: a.path, secure: a.secure }));
  }
  return ir(destinoDeEntrada(volta), cookies);
}
