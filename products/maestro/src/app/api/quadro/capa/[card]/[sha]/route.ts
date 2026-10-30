import { getCapa } from "@/lib/quadro/rota";

/** A capa do card, só com sessão e o card no alcance de quem pede. */
export function GET(req: Request, ctx: RouteContext<"/api/quadro/capa/[card]/[sha]">) {
  return getCapa(req, ctx.params);
}
