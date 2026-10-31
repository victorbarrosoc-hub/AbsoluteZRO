/**
 * As rotas da exportação do Fluxo (fase F6). Só Web API: os testes chamam direto, sem servidor.
 *
 * Equipe (sessão e acesso conferidos no servidor; Origin nas gravações):
 *   GET  /api/criacao/fluxo/links?fluxo=<id>          os links vivos (só administração e gestão)
 *   POST /api/criacao/fluxo/links                      { op: "criar", fluxo, dias?, pin? } | { op: "revogar", id }
 *   GET  /api/criacao/fluxo/pacote?id=<id>             o .zip (fluxo.md, fluxo.json, imagens/), a quem vê o fluxo
 *
 * Quem abre de fora (sem conta, pela porta estreita; noindex, no-referrer, sem cache):
 *   GET  /f/<token>.md  e  /f/<token>.json             (reescritas para /f/<token>/fluxo.md|json em next.config.ts)
 *   GET  /f/<token>/i/<id>/<sha>.webp[?mini=1]         a imagem pelo token
 *   POST /f/<token>/pin                                { pin } → cookie da prova (path /f)
 */
import { erro, ipDe, json, lerCookie, lerJson, origemConfere, serializarCookie } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { cookieSeguro, origemDoSite, origensDoSite, siteUrl } from "@/lib/site";
import { podeEnviarCriacao, podeVerCriacao } from "../permissoes";
import { slug, urlImagemPeloLink } from "./compartilhar";
import { fluxoParaJson, fluxoParaMarkdown } from "./exportar";
import { abrirFluxoPublico, conferirPinFluxo, criarLinkFluxo, imagemPeloLink, listarLinksFluxo, revogarLinkFluxo } from "./link";
import { pacoteDoFluxo } from "./pacote";

const STATUS: Record<string, number> = { nao_existe: 404, sem_permissao: 403, limite: 409, revogado: 409, formato: 422, pin: 422 };
const SO_ENVIAR = () => erro(403, "sem_permissao", "Só administração e gestão criam e revogam links.");
const texto = (v: unknown) => (typeof v === "string" ? v : "");

// ───────────── equipe ─────────────

export async function getLinks(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEnviarCriacao(s.papel)) return SO_ENVIAR();
  const fluxo = new URL(req.url).searchParams.get("fluxo") ?? "";
  return json({ links: await listarLinksFluxo({ sub: s.sub, orgId: s.orgId }, fluxo) }, 200, { "Cache-Control": "no-store" });
}

export async function postLinks(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEnviarCriacao(s.papel)) return SO_ENVIAR();
  const corpo = await lerJson(req, 4 * 1024);
  if (!corpo) return erro(400, "formato", "Pedido inválido.");
  const ctx = { sub: s.sub, orgId: s.orgId };
  if (corpo.op === "criar") {
    const r = await criarLinkFluxo(ctx, texto(corpo.fluxo), { dias: corpo.dias, pin: corpo.pin });
    return r.ok ? json({ link: r.link }, 201) : json({ erro: r.erro, mensagem: r.mensagem }, STATUS[r.erro] ?? 400);
  }
  if (corpo.op === "revogar") {
    const r = await revogarLinkFluxo(ctx, texto(corpo.id));
    return r.ok ? json({ ok: true }) : json({ erro: r.erro, mensagem: r.mensagem }, STATUS[r.erro] ?? 400);
  }
  return erro(400, "formato", "Operação desconhecida.");
}

/** Nome do arquivo no Content-Disposition (ASCII e a forma UTF-8). */
const anexo = (nome: string) => `attachment; filename="${nome.replace(/[^A-Za-z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`;

export async function getPacote(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeVerCriacao(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização não vê a Criação.");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const p = await pacoteDoFluxo({ sub: s.sub, orgId: s.orgId }, id);
  // 404 também para o fluxo fora do alcance: nada diz se ele existe
  if (!p) return erro(404, "nao_existe", "Esse fluxo não existe mais.");
  return new Response(p.corpo, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": anexo(p.nome),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

// ───────────── quem abre de fora ─────────────

const PUBLICO = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
};
const textoPuro = (status: number, t: string) => new Response(`${t}\n`, { status, headers: { ...PUBLICO, "Content-Type": "text/plain; charset=utf-8" } });
const cookiesDe = (req: Request) => ({ get: (n: string) => lerCookie(req, n) });

/** `/f/<token>.md` e `.json`: o mesmo fluxo da página, com as imagens pelo token deste link. */
export async function getArquivoPublico(req: Request, token: string, formato: "md" | "json"): Promise<Response> {
  const r = await abrirFluxoPublico(token, cookiesDe(req), ipDe(req.headers), { contar: true }).catch(() => ({ estado: "morto" as const }));
  if (r.estado === "morto") return textoPuro(404, "Este link não está mais ativo.");
  if (r.estado === "limite") return textoPuro(429, "Muitas tentativas. Espere alguns minutos.");
  if (r.estado === "pin") return textoPuro(401, "Este link pede PIN. Abra no navegador.");
  const d = r.dados;
  const o = { agora: new Date(), urlImagem: urlImagemPeloLink(siteUrl(), token) };
  const nome = `fluxo-${slug(d.titulo)}.${formato}`;
  if (formato === "md")
    return new Response(fluxoParaMarkdown(d, o), {
      status: 200,
      headers: { ...PUBLICO, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `inline; filename="${nome}"` },
    });
  return new Response(`${JSON.stringify(fluxoParaJson(d, o), null, 2)}\n`, {
    status: 200,
    headers: { ...PUBLICO, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `inline; filename="${nome}"` },
  });
}

export async function getImagemPublica(req: Request, params: Promise<{ token: string; id: string; arquivo: string }>): Promise<Response> {
  const { token, id, arquivo } = await params;
  const sha = arquivo.replace(/\.webp$/, "");
  const mini = new URL(req.url).searchParams.get("mini") === "1";
  const b = await imagemPeloLink(token, cookiesDe(req), ipDe(req.headers), id, sha, mini).catch(() => null);
  if (b === "limite") return textoPuro(429, "Muitas tentativas. Espere alguns minutos.");
  if (!b) return textoPuro(404, "Não encontrado.");
  return new Response(new Uint8Array(b), {
    status: 200,
    headers: {
      ...PUBLICO,
      "Content-Type": "image/webp",
      "Content-Length": String(b.length),
      // curto e só no navegador de quem abriu: revogou, a imagem para logo
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

export async function postPinPublico(req: Request, params: Promise<{ token: string }>): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outro site.", PUBLICO);
  const { token } = await params;
  const corpo = await lerJson(req, 1024);
  if (!corpo) return erro(400, "formato", "Pedido inválido.", PUBLICO);
  const r = await conferirPinFluxo(token, corpo.pin, ipDe(req.headers));
  if (!r.ok) return erro(r.erro === "limite" ? 429 : r.erro === "morto" ? 404 : 401, r.erro, r.mensagem, PUBLICO);
  const seguro = cookieSeguro(origemDoSite(req.headers.get("origin")));
  return json({ ok: true }, 200, {
    ...PUBLICO,
    "Set-Cookie": serializarCookie(r.cookie.nome, r.cookie.valor, { maxAge: r.cookie.maxAge, path: "/f", httpOnly: true, secure: seguro, sameSite: "Lax" }),
  });
}
