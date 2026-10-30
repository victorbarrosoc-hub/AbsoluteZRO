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
import { adicionarFreelaDaZro, funcoesDoPerfil } from "@/lib/freelas/da-zro";
import { convidarFreela, desligarConta, revogarConvite } from "@/lib/freelas/convite-servidor";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import type { ContaNoSalvar } from "@/lib/freelas/servidor";
import { siteUrl } from "@/lib/site";
import { buscarPessoas, pessoaPorArroba, type PessoaZro } from "@/lib/zro/pessoas";
import type { EstadoForm } from "@/components/form";

const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
const LE = "Seu papel nesta organização só lê.";

const ARROBA = /^[a-z0-9._]{3,30}$/;
const arrobaDe = (v: string | undefined) =>
  String(v ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

/**
 * Cadastrar ou editar o freela. `zro_arroba` (o campo "@ no Absolute ZRO"): o perfil é relido no HUB aqui, e o freela
 * fica ligado à conta (o nome que veio da tela é o que a produtora digitou). Vazio onde antes havia (`zro_antes`) =
 * desligar. `convidar=sim` no cadastro sem @: já sai com o convite para o Absolute ZRO (link na ficha).
 */
export async function salvarFreelaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarFreela(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const arroba = arrobaDe(valores.zro_arroba);
  const antes = arrobaDe(valores.zro_antes);
  let conta: ContaNoSalvar | undefined;
  if (arroba && arroba !== antes) {
    if (!ARROBA.test(arroba)) return { erros: { zro_arroba: "Esse @ não vale." }, valores };
    const p = await pessoaPorArroba(s.id, arroba);
    if (!p.ok) return { erros: { zro_arroba: p.mensagem }, valores };
    conta = { pessoa: p.pessoa };
  } else if (!arroba && antes && valores.id) conta = { desligar: true };
  const ctx = { sub: s.sub, orgId: s.orgId };
  const r = await salvarFreela(ctx, v.entrada, valores.id || undefined, false, conta);
  if (!r.ok) return r.erros?.zro_arroba ? { erros: r.erros, valores } : { mensagem: r.mensagem, valores };
  if (!valores.id && !arroba && valores.convidar === "sim") await convidarFreela(ctx, r.id, siteUrl());
  revalidatePath("/app/freelas");
  redirect(`/app/freelas/${r.id}`);
}

/** A prévia do "@ no Absolute ZRO" (foto, nome, @): escondido e inexistente dão a mesma resposta (o HUB decide). */
export async function verArrobaAcao(arroba: string): Promise<{ pessoa?: PessoaZro; funcoes?: string; erro?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { erro: LE };
  const a = arrobaDe(arroba);
  if (!ARROBA.test(a)) return { erro: "Não achamos esse @." };
  const p = await pessoaPorArroba(s.id, a);
  if (!p.ok) return { erro: p.mensagem };
  return { pessoa: p.pessoa, funcoes: funcoesDoPerfil(p.pessoa.funcoes).map(nomeFuncao).join(", ") };
}

/* ───────────── a conta Absolute ZRO na ficha (drizzle/0036) ───────────── */

export async function convidarFreelaAcao(freelaId: string): Promise<{ url?: string; expira?: string; mensagem?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await convidarFreela({ sub: s.sub, orgId: s.orgId }, freelaId, siteUrl());
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/freelas/${freelaId}`);
  return { url: r.url, expira: r.expira };
}

export async function revogarConviteAcao(freelaId: string): Promise<{ ok?: boolean; mensagem?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await revogarConvite({ sub: s.sub, orgId: s.orgId }, freelaId);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/freelas/${freelaId}`);
  return { ok: true };
}

export async function desligarContaAcao(freelaId: string): Promise<{ ok?: boolean; mensagem?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await desligarConta({ sub: s.sub, orgId: s.orgId }, freelaId);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/freelas/${freelaId}`);
  revalidatePath("/app/freelas");
  return { ok: true };
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
