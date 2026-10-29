"use server";
/** Ações dos documentos do projeto: sessão e papel aqui; o banco confere de novo (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { ehTipoDoc, nomeTipoDoc } from "@/lib/documentos/conteudo";
import { criarDocumento, removerDocumento, salvarDocumento } from "@/lib/documentos/servidor";
import { podeEscrever } from "@/lib/papeis";
import type { EstadoForm } from "@/components/form";

export async function criarDocumentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê." };
  const projeto = String(fd.get("projeto") ?? "");
  const tipo = String(fd.get("tipo") ?? "");
  if (!ehTipoDoc(tipo)) return { mensagem: "Escolha o tipo." };
  const titulo = String(fd.get("titulo") ?? "").trim() || nomeTipoDoc(tipo);
  const r = await criarDocumento(
    { sub: s.sub, orgId: s.orgId },
    { projetoId: projeto, tipo, titulo, data: String(fd.get("data") ?? "") || null, eventoId: String(fd.get("evento") ?? "") || null },
  );
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/projetos/${projeto}`);
  redirect(`/app/projetos/${projeto}/documentos/${r.id}`);
}

export async function salvarDocumentoAcao(id: string, titulo: string, data: string | null, conteudo: unknown): Promise<{ ok: boolean; mensagem?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { ok: false, mensagem: "Seu papel nesta organização só lê." };
  const r = await salvarDocumento({ sub: s.sub, orgId: s.orgId }, id, titulo, data, conteudo);
  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
}

export async function removerDocumentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê." };
  const projeto = String(fd.get("projeto") ?? "");
  const r = await removerDocumento({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/projetos/${projeto}`);
  redirect(`/app/projetos/${projeto}`);
}
