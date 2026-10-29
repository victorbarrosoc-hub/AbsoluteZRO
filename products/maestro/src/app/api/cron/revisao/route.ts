import { recusaDoCron } from "@/lib/cron";
import { json } from "@/lib/http";
import { varrerCompartilhamentos } from "@/lib/sobedesce/revisao";

/**
 * GET /api/cron/revisao: o agendamento da Vercel (vercel.json, uma vez por dia) desliga o "qualquer pessoa com o link"
 * das versões do Drive cujo link do cliente venceu, foi revogado ou cujo lote fechou (lib/sobedesce/revisao.ts). Só com
 * `Authorization: Bearer <CRON_SECRET>`; sem o segredo configurado, 503 (nunca aberto).
 */
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return recusaDoCron(req) ?? json(await varrerCompartilhamentos());
}
