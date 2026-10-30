/**
 * As rotas dos links públicos (`/api/publico/*`): POST com JSON, origem do próprio site (CSRF), o token no corpo (nunca
 * na URL da API) e respostas mínimas. O mesmo desenho de `src/lib/revisao/rotas.ts`. Sem "server-only".
 */
import { erro, ipDe, json, lerCookie, lerJson, origemConfere } from "@/lib/http";
import { aceitarConvite } from "@/lib/freelas/convite-servidor";
import { identidadeDosCookies } from "@/lib/zro/identidade";
import { origensDoSite } from "@/lib/site";
import { aceitarOrcamento, pedirAjusteDoOrcamento } from "@/lib/orcamento/link";
import { enviarPedido } from "@/lib/pedidos/publico";

async function corpo(req: Request): Promise<{ token: string; dados: Record<string, unknown> } | Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outro site.");
  const dados = await lerJson(req, 48 * 1024);
  if (!dados || typeof dados.token !== "string") return erro(400, "formato", "Pedido inválido.");
  return { token: dados.token, dados };
}

export async function rotaPedido(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const r = await enviarPedido(c.token, c.dados, ipDe(req.headers));
  if (r.ok) return json(r);
  return json({ erro: r.erro, mensagem: r.mensagem, ...(r.erros ? { erros: r.erros } : {}) }, r.status);
}

export async function rotaAceitar(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const r = await aceitarOrcamento(c.token, c.dados, ipDe(req.headers), req.headers.get("user-agent"));
  return r.ok ? json(r) : erro(r.status, r.erro, r.mensagem);
}

export async function rotaAjuste(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const r = await pedirAjusteDoOrcamento(c.token, c.dados, ipDe(req.headers));
  return r.ok ? json(r) : erro(r.status, r.erro, r.mensagem);
}

/** Aceite do convite de freela (drizzle/0036): quem aceita vem do login único (cookie do convite ou sessão). */
export async function rotaConvite(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const quem = await identidadeDosCookies((nome) => lerCookie(req, nome));
  const r = await aceitarConvite(c.token, quem, ipDe(req.headers));
  return r.ok ? json({ ok: true, arroba: r.arroba }) : erro(r.status, r.erro, r.mensagem);
}
