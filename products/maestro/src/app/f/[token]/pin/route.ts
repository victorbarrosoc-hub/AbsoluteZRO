import { postPinPublico } from "@/lib/criacao/fluxo/link-rota";

/** PIN do link do Fluxo: confere (limite por link e IP) e devolve o cookie da prova. */
export function POST(req: Request, ctx: RouteContext<"/f/[token]/pin">) {
  return postPinPublico(req, ctx.params);
}
