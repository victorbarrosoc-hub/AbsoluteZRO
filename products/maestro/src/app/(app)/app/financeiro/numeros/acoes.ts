"use server";
/** A meta do mês (Números): sessão e papel aqui; o banco confere de novo (metas só admin e gestão). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { lerReais } from "@/lib/dinheiro";
import { salvarMeta } from "@/lib/numeros/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import type { EstadoForm } from "@/components/form";

export async function salvarMetaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeVerDinheiro(s.papel)) return { mensagem: "Só administração e gestão mudam a meta." };
  const bruto = String(fd.get("meta") ?? "").trim();
  const centavos = bruto ? lerReais(bruto) : null;
  if (bruto && (centavos == null || Number.isNaN(centavos) || centavos < 0)) return { mensagem: "Valor em reais, como 50.000,00." };
  const r = await salvarMeta({ sub: s.sub, orgId: s.orgId }, String(fd.get("mes") ?? ""), centavos);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: centavos ? "Meta salva." : "Meta tirada.", n: Date.now() };
}
