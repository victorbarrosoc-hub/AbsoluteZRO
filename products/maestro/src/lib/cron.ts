/**
 * Porta dos agendamentos da Vercel (`/api/cron/*`, vercel.json): só com `Authorization: Bearer <CRON_SECRET>`. Sem o
 * segredo configurado, 503 (nunca aberto); segredo errado, 401. Comparação em tempo constante.
 */
import { timingSafeEqual } from "node:crypto";
import { erro } from "@/lib/http";

/** null = pode seguir; senão, a resposta de recusa. */
export function recusaDoCron(req: Request): Response | null {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return erro(503, "sem_config", "Agendamento sem CRON_SECRET.");
  const veio = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (veio.length !== esperado.length || !timingSafeEqual(veio, esperado)) return erro(401, "nao_autorizado", "Não autorizado.");
  return null;
}
