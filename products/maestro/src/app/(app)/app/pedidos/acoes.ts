"use server";
/** Pedidos (Comercial): sessão e papel aqui; o banco confere de novo (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { apagarPedido, gerarOrcamentoDoPedido, mudarStatusPedido } from "@/lib/pedidos/equipe";
import type { EstadoForm } from "@/components/form";

const LE = "Seu papel nesta organização só lê.";

export async function gerarOrcamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await gerarOrcamentoDoPedido({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  redirect(`/app/orcamentos/${r.orcamentoId}`);
}

export async function statusPedidoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const para = fd.get("para") === "novo" ? "novo" : "recusado";
  const r = await mudarStatusPedido({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""), para);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Feito." };
}

export async function apagarPedidoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão apagam pedidos." };
  const r = await apagarPedido({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  redirect("/app/pedidos");
}
