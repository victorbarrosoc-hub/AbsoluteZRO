import { rotaFeed } from "@/lib/agenda/rotas";

/** A agenda por assinatura (.ics): o endereço secreto de cada pessoa, lido pelo aplicativo de calendário. */
export async function GET(req: Request, ctx: RouteContext<"/api/agenda/[arquivo]">) {
  const { arquivo } = await ctx.params;
  return rotaFeed(req, arquivo);
}
