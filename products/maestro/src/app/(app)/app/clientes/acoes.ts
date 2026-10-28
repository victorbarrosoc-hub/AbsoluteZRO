"use server";
/** Ações de clientes: sessão e acesso conferidos aqui; organização e pessoa vêm da sessão; o banco confere o papel (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { atualizarCliente, criarCliente, removerCliente, validarCliente } from "@/lib/crm/clientes";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import type { EstadoForm } from "@/components/form";

const CAMPOS = ["nome", "empresa", "contato", "whatsapp", "email", "observacoes", "status"] as const;

export async function salvarCliente(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = Object.fromEntries(CAMPOS.map((k) => [k, String(fd.get(k) ?? "")]));
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê.", valores };
  const v = validarCliente(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const ctx = { sub: s.sub, orgId: s.orgId };
  const id = String(fd.get("id") ?? "");
  const r = id ? await atualizarCliente(ctx, id, v.entrada) : await criarCliente(ctx, v.entrada);
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erros, valores };
  const destino = id || ("id" in r ? (r as { id: string }).id : "");
  revalidatePath("/app/clientes");
  redirect(`/app/clientes/${destino}`);
}

export async function removerClienteAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão removem clientes." };
  const r = await removerCliente({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/clientes");
  redirect("/app/clientes");
}
