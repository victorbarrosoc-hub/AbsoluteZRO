"use server";
/**
 * Demonstração: sessão e acesso conferidos aqui; organização e pessoa vêm da sessão (nunca do formulário). Só
 * administração e gestão que veem todas as áreas carregam e removem: a demonstração preenche o Financeiro, os contratos
 * e as diárias (o banco confere de novo, área por área).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { carregarDemonstracao, removerDemonstracao } from "@/lib/demo/demonstracao";
import { podeRemover } from "@/lib/papeis";
import { veTudo } from "@/lib/acessos";
import type { EstadoForm } from "@/components/form";

export async function carregarDemonstracaoAcao(_: EstadoForm, __: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel) || !veTudo(s.acessos)) return { mensagem: "Só quem vê todas as áreas carrega a demonstração." };
  const r = await carregarDemonstracao({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  redirect("/app/quadro");
}

export async function removerDemonstracaoAcao(_: EstadoForm, __: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel) || !veTudo(s.acessos)) return { mensagem: "Só quem vê todas as áreas remove a demonstração." };
  const r = await removerDemonstracao({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  redirect("/app/quadro");
}
