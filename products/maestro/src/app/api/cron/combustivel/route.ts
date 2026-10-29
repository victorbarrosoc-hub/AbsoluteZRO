import { recusaDoCron } from "@/lib/cron";
import { erro, json } from "@/lib/http";
import { coletarSemanaAnp } from "@/lib/orcamento/servicos";

/**
 * GET /api/cron/combustivel: o agendamento da Vercel (vercel.json, uma vez por semana) guarda a planilha semanal da
 * ANP (gasolina, etanol e diesel S10 por município, estado e Brasil) em maestro.combustivel_precos (drizzle/0022). A
 * calculadora de deslocamento só lê dali. Só com `Authorization: Bearer <CRON_SECRET>`; sem o segredo, 503. ANP fora
 * do ar = 502, e as semanas guardadas continuam.
 */
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const recusa = recusaDoCron(req);
  if (recusa) return recusa;
  const r = await coletarSemanaAnp();
  return r.ok ? json(r) : erro(502, "fonte_indisponivel", r.erro);
}
