"use server";
/** Pedidos (Comercial): sessão e papel aqui; o banco confere de novo (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { hojeBr, lerReais } from "@/lib/dinheiro";
import { agendarRetorno, contatoFeito, moverEtapa, reagendar, salvarValorEstimado, type Alvo } from "@/lib/funil/servidor";
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

/* ───────────── funil e retornos (drizzle/0014) ───────────── */

const alvoDe = (fd: FormData): Alvo => (fd.get("alvo") === "cliente" ? "cliente" : "pedido");

export async function moverEtapaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await moverEtapa({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""), fd.get("etapa"), String(fd.get("motivo") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Etapa mudou.", n: Date.now() };
}

export async function valorEstimadoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const bruto = String(fd.get("valor") ?? "").trim();
  const centavos = bruto ? lerReais(bruto) : null;
  if (bruto && (centavos == null || Number.isNaN(centavos))) return { mensagem: "Valor em reais, como 4.500,00." };
  const r = await salvarValorEstimado({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""), centavos);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Salvo.", n: Date.now() };
}

export async function retornoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const tirar = fd.get("tirar") === "1";
  const r = await agendarRetorno({ sub: s.sub, orgId: s.orgId }, alvoDe(fd), String(fd.get("id") ?? ""), tirar ? null : fd.get("data"), fd.get("nota"));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: tirar ? "Retorno tirado." : "Retorno marcado.", n: Date.now() };
}

export async function contatoFeitoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await contatoFeito({ sub: s.sub, orgId: s.orgId }, alvoDe(fd), String(fd.get("id") ?? ""), {
    nota: String(fd.get("nota") ?? ""),
    proximo: String(fd.get("proximo") ?? "") || null,
  });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Contato registrado.", n: Date.now() };
}

export async function reagendarAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await reagendar({ sub: s.sub, orgId: s.orgId }, alvoDe(fd), String(fd.get("id") ?? ""), Number(fd.get("dias") ?? 1), hojeBr());
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Reagendado." };
}
