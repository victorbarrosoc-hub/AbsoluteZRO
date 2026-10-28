"use server";
/**
 * Demonstração: sessão e acesso conferidos aqui; organização e pessoa vêm da sessão (nunca do formulário). Só
 * administração e gestão carregam e removem (o mesmo corte da remoção no banco, que confere de novo).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { carregarDemonstracao, removerDemonstracao } from "@/lib/demo/demonstracao";
import { podeRemover } from "@/lib/papeis";
import type { EstadoForm } from "@/components/form";

export async function carregarDemonstracaoAcao(_: EstadoForm, __: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão carregam a demonstração." };
  const r = await carregarDemonstracao({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  redirect("/app/quadro");
}

export async function removerDemonstracaoAcao(_: EstadoForm, __: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão removem a demonstração." };
  const r = await removerDemonstracao({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  redirect("/app/quadro");
}
