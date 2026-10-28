"use server";
/** Ações do banco de freelas e da escala: sessão e papel aqui; o banco confere de novo (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeEscrever, podeRemover, podeVerDinheiro } from "@/lib/papeis";
import {
  removerEscala,
  removerFreela,
  salvarEscala,
  salvarFreela,
  salvarPagamento,
  validarEscala,
  validarFreela,
  validarPagamento,
} from "@/lib/freelas/servidor";
import type { EstadoForm } from "@/components/form";

const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
const LE = "Seu papel nesta organização só lê.";

export async function salvarFreelaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarFreela(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarFreela({ sub: s.sub, orgId: s.orgId }, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app/freelas");
  redirect(`/app/freelas/${r.id}`);
}

export async function removerFreelaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão removem freelas." };
  const r = await removerFreela({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/freelas");
  redirect("/app/freelas");
}

export async function salvarPagamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeVerDinheiro(s.papel)) return { mensagem: "Só administração e gestão veem e mudam dados de pagamento." };
  const v = validarPagamento(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarPagamento({ sub: s.sub, orgId: s.orgId }, valores.freela, v.entrada);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath(`/app/freelas/${valores.freela}`);
  return { aviso: "Dados de pagamento guardados (cifrados)." };
}

export async function salvarEscalaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarEscala(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarEscala({ sub: s.sub, orgId: s.orgId }, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  if (v.entrada.projetoId) revalidatePath(`/app/projetos/${v.entrada.projetoId}`);
  revalidatePath(`/app/freelas/${v.entrada.freelaId}`);
  revalidatePath("/app/agenda");
  revalidatePath("/app/financeiro", "layout");
  return { aviso: "Na escala. O pagamento entrou no Financeiro.", n: Date.now() };
}

export async function removerEscalaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await removerEscala({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Saiu da escala." };
}
