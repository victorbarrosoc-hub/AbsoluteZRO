import { getRoteiro, postRoteiro } from "@/lib/criacao/roteiro/rota";

/** O editor do Roteiro: poll e versões (GET), autosave com `rev`, versões, vínculo, estado e lixeira (POST). */
export async function GET(req: Request, ctx: RouteContext<"/api/criacao/roteiros/[id]">) {
  const { id } = await ctx.params;
  return getRoteiro(req, id);
}

export async function POST(req: Request, ctx: RouteContext<"/api/criacao/roteiros/[id]">) {
  const { id } = await ctx.params;
  return postRoteiro(req, id);
}
