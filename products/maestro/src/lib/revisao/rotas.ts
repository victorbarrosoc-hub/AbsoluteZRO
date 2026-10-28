/**
 * As rotas do link do cliente (`/api/link/*`): POST com JSON, origem do próprio site (CSRF), o token no corpo (nunca na
 * URL da API) e respostas mínimas. Sem "server-only": os testes chamam direto.
 */
import { erro, ipDe, json, lerCookie, lerJson, origemConfere, serializarCookie } from "@/lib/http";
import { cookieSeguro, origemDoSite, origensDoSite } from "@/lib/site";
import { comentarComoCliente, conferirPin, enviarDecisoes, lerComentario, lerEnvio } from "./link";

async function corpo(req: Request): Promise<{ token: string; dados: Record<string, unknown> } | Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outro site.");
  const dados = await lerJson(req, 64 * 1024);
  if (!dados || typeof dados.token !== "string") return erro(400, "formato", "Pedido inválido.");
  return { token: dados.token, dados };
}

const cookiesDe = (req: Request) => ({ get: (n: string) => lerCookie(req, n) });

export async function rotaPin(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const r = await conferirPin(c.token, String(c.dados.pin ?? ""), ipDe(req.headers));
  if (!r.ok) return erro(r.erro === "limite" ? 429 : r.erro === "morto" ? 404 : 401, r.erro, r.mensagem);
  const seguro = cookieSeguro(origemDoSite(req.headers.get("origin")));
  return json({ ok: true }, 200, {
    "Set-Cookie": serializarCookie(r.cookie.nome, r.cookie.valor, { maxAge: r.cookie.maxAge, path: "/", httpOnly: true, secure: seguro, sameSite: "Lax" }),
  });
}

export async function rotaComentar(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const d = lerComentario(c.dados);
  if (!d) return erro(400, "formato", "Comentário inválido.");
  const r = await comentarComoCliente(c.token, cookiesDe(req), ipDe(req.headers), d);
  return r.ok ? json(r) : erro(r.status, r.erro, r.mensagem);
}

export async function rotaEnviar(req: Request): Promise<Response> {
  const c = await corpo(req);
  if (c instanceof Response) return c;
  const e = lerEnvio(c.dados);
  if (!e) return erro(400, "formato", "Envio inválido.");
  const r = await enviarDecisoes(c.token, cookiesDe(req), ipDe(req.headers), req.headers.get("user-agent"), e);
  if (r.ok) return json(r);
  return json({ erro: r.erro, mensagem: r.mensagem, ...("card" in r && r.card ? { card: r.card } : {}) }, r.status);
}
