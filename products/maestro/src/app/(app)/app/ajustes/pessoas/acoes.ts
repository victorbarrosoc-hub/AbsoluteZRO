"use server";
/** Acesso por cliente (Ajustes → Pessoas): sessão e papel aqui; o banco confere de novo (só admin e gestão). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeRemover } from "@/lib/papeis";
import { salvarAcesso } from "@/lib/pessoas";
import type { EstadoForm } from "@/components/form";

export async function salvarAcessoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão mudam o acesso." };
  const restrito = fd.get("alcance") === "alguns";
  const clientes = fd.getAll("cliente").map(String);
  const r = await salvarAcesso({ sub: s.sub, orgId: s.orgId }, String(fd.get("sub") ?? ""), restrito, clientes);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: restrito ? `Vê ${clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}.` : "Vê todos os clientes.", n: Date.now() };
}
