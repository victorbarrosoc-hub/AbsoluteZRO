"use server";
/**
 * Ações de Aprovações: sessão e acesso conferidos aqui, organização e pessoa da sessão; o banco confere o papel de novo
 * (RLS e as funções `versao_*`, `comentario_*` e `card_*`). O link do cliente só sai para administração e gestão.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeEscrever } from "@/lib/papeis";
import { origemDoSite } from "@/lib/site";
import * as eq from "@/lib/revisao/equipe";
import { compartilharLote, compartilharVersaoSeComLink, recolherLote } from "@/lib/sobedesce/revisao";
import type { EstadoForm } from "@/components/form";

const ctxDe = (s: { sub: string; orgId: string }) => ({ sub: s.sub, orgId: s.orgId });
const podeLink = (papel: string) => papel === "admin" || papel === "gestor";
export type Resposta = { ok: true; url?: string } | { ok: false; mensagem: string };

async function urlDoLink(token: string): Promise<string> {
  const h = await headers();
  return `${origemDoSite(h.get("origin"))}/a/${token}`;
}

export async function criarLoteAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = { cliente: String(fd.get("cliente") ?? ""), titulo: String(fd.get("titulo") ?? "") };
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê.", valores };
  const erros: Record<string, string> = {};
  if (!valores.cliente) erros.cliente = "Escolha o cliente.";
  if (!valores.titulo.trim()) erros.titulo = "Dê um nome ao lote.";
  if (Object.keys(erros).length) return { erros, valores };
  const r = await eq.criarLote(ctxDe(s), { clienteId: valores.cliente, titulo: valores.titulo, cards: fd.getAll("cards").map(String) });
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app/aprovacoes");
  redirect(`/app/aprovacoes/${r.id}`);
}

export async function adicionarPecaAcao(loteId: string, cardId: string): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  const r = await eq.adicionarPeca(ctxDe(s), loteId, cardId);
  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
}

export async function novaVersaoAcao(cardId: string, link: string, titulo: string): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  const r = await eq.novaVersao(ctxDe(s), cardId, link, titulo);
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  // Versão nova do Drive num card que já está com o cliente: o arquivo também fica como "qualquer pessoa com o link".
  await compartilharVersaoSeComLink(s, cardId).catch(() => undefined);
  return { ok: true };
}

export async function apagarVersaoAcao(versaoId: string): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  const r = await eq.apagarVersao(ctxDe(s), versaoId);
  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
}

export async function comentarAcao(
  versaoId: string,
  d: { texto: string; t: number | null; tFim: number | null; digitado: boolean; x: number | null; y: number | null; pai: string | null; idem: string },
): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  const r = await eq.comentarComoEquipe(ctxDe(s), versaoId, d);
  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
}

export async function resolverAcao(id: string, resolvido: boolean): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  const r = await eq.resolverComentario(ctxDe(s), id, resolvido);
  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
}

export async function gerarLinkAcao(loteId: string, pin: string, dias: number): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  if (!podeLink(s.papel)) return { ok: false, mensagem: "Só administração e gestão geram o link do cliente." };
  const r = await eq.gerarLink(ctxDe(s), loteId, { pin, dias });
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  // Com o SOBEDESCE no plano: os vídeos do Drive do lote tocam para o cliente enquanto o link vale (plano v2 §4.1).
  // Falha do Drive não impede o link: o cliente cai no iframe do Drive, como antes.
  await compartilharLote(s, loteId).catch(() => undefined);
  return { ok: true, url: await urlDoLink(r.token) };
}

export async function copiarLinkAcao(loteId: string): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  if (!podeLink(s.papel)) return { ok: false, mensagem: "Só administração e gestão copiam o link do cliente." };
  const token = await eq.tokenDoLink(ctxDe(s), loteId);
  return token ? { ok: true, url: await urlDoLink(token) } : { ok: false, mensagem: "Este lote não tem link ativo." };
}

export async function revogarLinkAcao(loteId: string): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  if (!podeLink(s.papel)) return { ok: false, mensagem: "Só administração e gestão revogam o link do cliente." };
  const r = await eq.revogarLink(ctxDe(s), loteId);
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  await recolherLote(s, loteId).catch(() => undefined); // o que falhar, o agendamento tenta de novo
  return { ok: true };
}

export async function fecharLoteAcao(loteId: string): Promise<Resposta> {
  const s = await exigirAcessoNaAcao();
  if (!podeLink(s.papel)) return { ok: false, mensagem: "Só administração e gestão fecham o lote." };
  const r = await eq.fecharLote(ctxDe(s), loteId);
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  await recolherLote(s, loteId).catch(() => undefined);
  return { ok: true };
}
