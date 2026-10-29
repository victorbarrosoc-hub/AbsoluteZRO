"use server";
/** Ações do banco de freelas e da escala: sessão e papel aqui; o banco confere de novo (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { pode as podeArea } from "@/lib/acessos";
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
import { marcarEquipNaEscala, removerEquipFreela, salvarEquipFreela, validarEquipFreela } from "@/lib/freelas/equipamentos";
import { adicionarFreelaDaZro } from "@/lib/freelas/da-zro";
import { buscarPessoas, pessoaPorArroba, type PessoaZro } from "@/lib/zro/pessoas";
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
  if (!podeArea(s, "dados_equipe") || !podeEscrever(s.papel)) return { mensagem: "Você não mexe nos dados de pagamento." };
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

/* ───────────── kit próprio do freela (drizzle/0013) ───────────── */

export async function salvarEquipFreelaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarEquipFreela(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarEquipFreela({ sub: s.sub, orgId: s.orgId }, valores.freela, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath(`/app/freelas/${valores.freela}`);
  revalidatePath("/app/freelas");
  return { aviso: valores.id ? "Salvo." : "Adicionado.", n: Date.now() };
}

export async function removerEquipFreelaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await removerEquipFreela({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/freelas/${String(fd.get("freela") ?? "")}`);
  revalidatePath("/app/freelas");
  return { aviso: "Removido." };
}

/** O que o freela leva na escala: os itens marcados (checkbox `equip`). O aluguel soma ao a pagar da escala. */
export async function equipNaEscalaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await marcarEquipNaEscala({ sub: s.sub, orgId: s.orgId }, String(fd.get("escala") ?? ""), fd.getAll("equip").map(String));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Salvo.", n: Date.now() };
}

/* ───────────── freela achado pelo @ na Absolute ZRO (ADR 0029 do HUB, drizzle/0022) ───────────── */

export async function buscarFreelaNaZroAcao(q: string): Promise<{ pessoas: PessoaZro[]; erro?: string; reconectar?: boolean }> {
  const s = await exigirAcessoNaAcao();
  const r = await buscarPessoas(s.id, q);
  if (!r.ok) return { pessoas: [], erro: r.mensagem, reconectar: r.estado === "reconectar_zro" };
  return { pessoas: r.pessoas };
}

/** Adiciona ao banco pelo @: o perfil é relido na Absolute ZRO (a tela não manda nome nem função). */
export async function adicionarFreelaDaZroAcao(arroba: string): Promise<EstadoForm & { id?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const p = await pessoaPorArroba(s.id, arroba);
  if (!p.ok) return { mensagem: p.mensagem };
  const r = await adicionarFreelaDaZro({ sub: s.sub, orgId: s.orgId }, p.pessoa);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/freelas");
  return { aviso: r.novo ? "No banco de freelas." : "Já estava no banco.", id: r.id, n: Date.now() };
}
