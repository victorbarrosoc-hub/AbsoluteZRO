import { repassarIa } from "@/lib/zro/ia";

/**
 * A Z (IA da Absolute ZRO) pelo Maestro: estado, conversas e mensagens (NDJSON em streaming), repassados à Absolute
 * ZRO com o token da sessão, que fica no servidor (lib/zro/ia.ts).
 */
export const maxDuration = 120;

type Ctx = RouteContext<"/api/zro/ia/[...caminho]">;
const repassar = async (req: Request, ctx: Ctx) => repassarIa(req, (await ctx.params).caminho);

export const GET = repassar;
export const POST = repassar;
export const DELETE = repassar;
