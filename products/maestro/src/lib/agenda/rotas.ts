/**
 * As rotas da agenda por assinatura: `GET /api/agenda/<token>.ics` (o aplicativo de calendário, sem sessão) e
 * `GET /api/agenda/minha` (baixar o .ics com a sessão). Respostas privadas, sem cache compartilhado e fora de busca.
 * Sem "server-only": os testes chamam direto.
 */
import { erro, ipDe } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { feedDoToken, icsDaPessoa } from "./feed";

const CABECALHOS = (arquivo: string, anexo: boolean) => ({
  "content-type": "text/calendar; charset=utf-8",
  "cache-control": "private, max-age=300",
  "content-disposition": `${anexo ? "attachment" : "inline"}; filename="${arquivo}"`,
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
});

export async function rotaFeed(req: Request, arquivo: string): Promise<Response> {
  const token = arquivo.endsWith(".ics") ? arquivo.slice(0, -4) : arquivo;
  const r = await feedDoToken(token, ipDe(req.headers));
  if (r.estado === "limite") return erro(429, "limite", "Muitas leituras seguidas. Tente daqui a pouco.", { "retry-after": "600" });
  if (r.estado !== "ok") return erro(404, "nao_existe", "Endereço de agenda desconhecido ou desligado.", { "x-robots-tag": "noindex" });
  return new Response(r.ics, { status: 200, headers: CABECALHOS("maestro.ics", false) });
}

export async function rotaMinha(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const ics = await icsDaPessoa({ sub: s.sub, orgId: s.orgId }, s.orgNome);
  return new Response(ics, { status: 200, headers: CABECALHOS("maestro-agenda.ics", true) });
}
