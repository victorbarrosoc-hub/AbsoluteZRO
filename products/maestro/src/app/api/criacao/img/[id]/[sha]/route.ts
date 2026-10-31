import { getImagem } from "@/lib/criacao/fluxo/rota";

/** Imagem do Fluxo (ou a miniatura, ?mini=1): só com sessão e o fluxo no alcance de quem pede. */
export function GET(req: Request, ctx: RouteContext<"/api/criacao/img/[id]/[sha]">) {
  return getImagem(req, ctx.params);
}
