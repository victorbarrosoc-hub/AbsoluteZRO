/**
 * GET /api/marca/<org>/<sha256>: o logo da produtora para o timbrado e as páginas do cliente. Público (quem recebe o
 * link não tem conta), mas só com a organização e o sha256 certos; o nome muda quando o logo muda, então o cache é
 * imutável. `nosniff` e CSP fechada: a resposta é só imagem. Sem "server-only": os testes chamam direto.
 */
import { lerLogoPublico } from "./servidor";

export async function rotaLogo(_req: Request, params: Promise<{ org: string; sha: string }>): Promise<Response> {
  const { org, sha } = await params;
  const l = await lerLogoPublico(org, sha).catch(() => null);
  if (!l) return new Response("Não encontrado.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(l.bytes), {
    status: 200,
    headers: {
      "Content-Type": l.mime,
      "Content-Length": String(l.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
