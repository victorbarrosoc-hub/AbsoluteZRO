"use server";
/**
 * A resposta do freela (drizzle/0037): confirmar ou recusar um trabalho. A pessoa vem da sessão, o trabalho do
 * formulário; o banco confere que a escala é dela (RLS do freela) e que não passou, e audita.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sessaoDaPagina } from "@/lib/auth/pagina";
import { responderTrabalho } from "@/lib/freelas/area";
import { ehUuid } from "@/lib/crm/comum";
import { ROTAS } from "@/lib/site";

export async function responderAcao(fd: FormData): Promise<void> {
  const s = await sessaoDaPagina();
  if (!s) redirect(`${ROTAS.entrar}?volta=${encodeURIComponent(ROTAS.trabalhos)}`);
  const id = String(fd.get("id") ?? "");
  const r = await responderTrabalho(s.sub, id, String(fd.get("resposta") ?? ""));
  if (!ehUuid(id) || (!r.ok && r.erro === "nao_existe")) redirect(ROTAS.trabalhos);
  revalidatePath(ROTAS.trabalhos);
  redirect(`${ROTAS.trabalhos}/${id}${r.ok ? "" : `?erro=${encodeURIComponent(r.erro)}`}`);
}
