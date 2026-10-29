/**
 * Exportar as notas do lote: `?formato=csv` (planilha) ou `?formato=edl` (marcadores para o DaVinci Resolve). Sessão e
 * acesso conferidos aqui (401/403); a organização vem da sessão e o RLS confere de novo.
 */
import { erro } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { notasDoLote } from "@/lib/revisao/equipe";
import { notasCsv, notasEdl } from "@/lib/revisao/tempo";

export async function GET(req: Request, ctx: RouteContext<"/app/aprovacoes/[id]/notas">): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const formato = new URL(req.url).searchParams.get("formato") === "edl" ? "edl" : "csv";
  const n = await notasDoLote({ sub: s.sub, orgId: s.orgId }, id);
  if (!n) return erro(404, "nao_existe", "Esse lote não existe.");
  const nome = (
    n.titulo
      .normalize("NFD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "lote"
  ).slice(0, 60);
  const corpo = formato === "edl" ? notasEdl(n.titulo, n.notas, n.fps ?? undefined) : notasCsv(n.notas, n.fps ?? undefined);
  return new Response(corpo, {
    headers: {
      "Content-Type": formato === "edl" ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notas-${nome}.${formato}"`,
      "Cache-Control": "no-store",
    },
  });
}
