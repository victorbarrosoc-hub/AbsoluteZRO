import { timingSafeEqual } from "node:crypto";
import { erro, json } from "@/lib/http";
import { varrerCompartilhamentos } from "@/lib/sobedesce/revisao";

/**
 * GET /api/cron/revisao: o agendamento da Vercel (vercel.json, uma vez por dia) desliga o "qualquer pessoa com o link"
 * das versões do Drive cujo link do cliente venceu, foi revogado ou cujo lote fechou (lib/sobedesce/revisao.ts). Só com
 * `Authorization: Bearer <CRON_SECRET>`; sem o segredo configurado, 503 (nunca aberto).
 */
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return erro(503, "sem_config", "Agendamento sem CRON_SECRET.");
  const veio = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (veio.length !== esperado.length || !timingSafeEqual(veio, esperado)) return erro(401, "nao_autorizado", "Não autorizado.");
  return json(await varrerCompartilhamentos());
}
