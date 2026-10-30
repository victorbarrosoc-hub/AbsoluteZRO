import { repassarSet } from "@/lib/zro/set";

/**
 * O Set da Absolute ZRO pelo SOBEDESCE: presença, contatos e conversas, repassados à Absolute ZRO com o token da conta,
 * que fica no servidor (lib/zro/set.ts).
 */
type Ctx = RouteContext<"/api/zro/set/[[...caminho]]">;
const repassar = async (req: Request, ctx: Ctx) => repassarSet(req, (await ctx.params).caminho ?? []);

export const GET = repassar;
export const POST = repassar;
export const PUT = repassar;
export const PATCH = repassar;
export const DELETE = repassar;
