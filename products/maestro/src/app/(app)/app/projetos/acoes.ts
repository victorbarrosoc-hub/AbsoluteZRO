"use server";
/** Ações de projetos: sessão e acesso conferidos aqui; organização e pessoa vêm da sessão; o banco confere o papel (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { atualizarProjeto, criarProjeto, removerProjeto, validarProjeto } from "@/lib/crm/projetos";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import type { EstadoForm } from "@/components/form";

const CAMPOS = ["titulo", "cliente", "status", "inicio", "prazo", "briefing"] as const;

export async function salvarProjeto(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = Object.fromEntries(CAMPOS.map((k) => [k, String(fd.get(k) ?? "")]));
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê.", valores };
  const v = validarProjeto(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const ctx = { sub: s.sub, orgId: s.orgId };
  const id = String(fd.get("id") ?? "");
  const r = id ? await atualizarProjeto(ctx, id, v.entrada) : await criarProjeto(ctx, v.entrada);
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erros, valores };
  const destino = id || ("id" in r ? (r as { id: string }).id : "");
  revalidatePath("/app/projetos");
  redirect(`/app/projetos/${destino}`);
}

export async function removerProjetoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão removem projetos." };
  const r = await removerProjeto({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/projetos");
  redirect("/app/projetos");
}
