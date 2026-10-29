"use server";
/**
 * Ações de orçamentos: sessão e acesso conferidos aqui; organização e pessoa vêm da sessão; o banco confere o papel
 * (RLS). A calculadora de deslocamento usa os serviços abertos só se ligados (MAESTRO_SERVICOS_ABERTOS=1).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { ehUuid } from "@/lib/crm/comum";
import { podeEscrever, podeRemover, podeVerDinheiro } from "@/lib/papeis";
import { aprovarOrcamento, criarOrcamento, mudarStatus, novaVersao, removerOrcamento, salvarOrcamento, validarEdicao } from "@/lib/orcamento/orcamentos";
import type { StatusOrcamento } from "@/lib/orcamento/motor";
import { lerEmpresa } from "@/lib/organizacao";
import { buscarLugares, medirRota, precoDaGasolina } from "@/lib/orcamento/servicos";
import { gerarLinkDoOrcamento, revogarLinkDoOrcamento } from "@/lib/orcamento/link";
import type { Lugar, PrecoCombustivel } from "@/lib/orcamento/deslocamento";
import { ligarContrato } from "@/lib/contrato/servidor";
import type { EstadoForm } from "@/components/form";

const ctxDe = (s: { sub: string; orgId: string }) => ({ sub: s.sub, orgId: s.orgId });

export async function criarOrcamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê.", valores };
  const titulo = (valores.titulo ?? "").trim();
  if (!titulo || titulo.length > 200) return { erros: { titulo: "Dê um título (até 200)." }, valores };
  const respostas: Record<string, string> = {};
  for (const [k, v] of Object.entries(valores)) if (k.startsWith("r_") && v.trim()) respostas[k.slice(2)] = v.trim().slice(0, 40);
  const r = await criarOrcamento(ctxDe(s), {
    titulo,
    clienteId: ehUuid(valores.cliente) ? valores.cliente : null,
    projetoId: ehUuid(valores.projeto) ? valores.projeto : null,
    modeloId: ehUuid(valores.modelo) ? valores.modelo : null,
    respostas,
  });
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app/orcamentos");
  redirect(`/app/orcamentos/${r.id}`);
}

/** O editor manda o orçamento inteiro (campos e linhas) em JSON. */
export async function salvarEdicaoAcao(id: string, corpo: unknown): Promise<{ ok: boolean; mensagem?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { ok: false, mensagem: "Seu papel nesta organização só lê." };
  const v = validarEdicao(corpo);
  if (!v.ok) return { ok: false, mensagem: v.mensagem };
  const r = await salvarOrcamento(ctxDe(s), id, v.e);
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  revalidatePath(`/app/orcamentos/${id}`);
  revalidatePath("/app/orcamentos");
  return { ok: true };
}

export async function statusAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê." };
  const id = String(fd.get("id") ?? "");
  const para = String(fd.get("para") ?? "") as StatusOrcamento;
  if (!["rascunho", "enviado", "recusado"].includes(para)) return { mensagem: "Passo inválido." };
  const r = await mudarStatus(ctxDe(s), id, para);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/orcamentos/${id}`);
  revalidatePath("/app/orcamentos");
  return { aviso: "Feito." };
}

/** "Enviar contrato junto" (administração e gestão; rascunho ou enviado). */
export async function contratoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeVerDinheiro(s.papel)) return { mensagem: "Só administração e gestão." };
  const id = String(fd.get("id") ?? "");
  const r = await ligarContrato(ctxDe(s), id, fd.get("ligar") === "1");
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/orcamentos/${id}`);
  return { aviso: "Feito." };
}

export async function novaVersaoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: "Seu papel nesta organização só lê." };
  const r = await novaVersao(ctxDe(s), String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/orcamentos");
  redirect(`/app/orcamentos/${r.id}`);
}

export async function aprovarAcao(id: string, parcelas: unknown): Promise<{ ok: boolean; mensagem?: string; projetoId?: string }> {
  const s = await exigirAcessoNaAcao();
  if (!podeVerDinheiro(s.papel)) return { ok: false, mensagem: "Aprovar lança as parcelas no Financeiro: só administração e gestão." };
  const r = await aprovarOrcamento(ctxDe(s), id, parcelas);
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  revalidatePath(`/app/orcamentos/${id}`);
  revalidatePath("/app/orcamentos");
  revalidatePath("/app/financeiro");
  revalidatePath("/app/projetos");
  return { ok: true, projetoId: r.projetoId, mensagem: `Aprovado. Projeto ${r.codigo} e parcelas no Financeiro.` };
}

export async function removerOrcamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão apagam orçamentos." };
  const r = await removerOrcamento(ctxDe(s), String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/orcamentos");
  redirect("/app/orcamentos");
}

/* ───────────── calculadora de deslocamento ───────────── */

export async function buscarLugaresAcao(q: string): Promise<{ ok: true; lugares: Lugar[] } | { ok: false; erro: string }> {
  const s = await exigirAcessoNaAcao();
  try {
    const e = await lerEmpresa(ctxDe(s));
    const perto = e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null;
    return { ok: true, lugares: await buscarLugares(String(q ?? ""), perto) };
  } catch {
    return { ok: false, erro: "A busca de lugares não respondeu. Digite os km." };
  }
}

const ehPonto = (p: unknown): p is { lat: number; lon: number } => {
  const x = p as { lat?: unknown; lon?: unknown };
  return typeof x?.lat === "number" && typeof x?.lon === "number" && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180;
};

export async function medirRotaAcao(de: unknown, para: unknown): Promise<{ ok: true; km: number; minutos: number } | { ok: false; erro: string }> {
  await exigirAcessoNaAcao();
  if (!ehPonto(de) || !ehPonto(para)) return { ok: false, erro: "Escolha a saída e a chegada na lista." };
  try {
    const r = await medirRota(de, para);
    return r ? { ok: true, ...r } : { ok: false, erro: "Não achei rota de carro. Digite os km." };
  } catch {
    return { ok: false, erro: "O cálculo da rota não respondeu. Digite os km." };
  }
}

export async function precoGasolinaAcao(): Promise<PrecoCombustivel | null> {
  const s = await exigirAcessoNaAcao();
  const e = await lerEmpresa(ctxDe(s));
  if (!e.uf) return null;
  try {
    return await precoDaGasolina(e.uf, e.cidade);
  } catch {
    return null;
  }
}

/* ───────────── link do orçamento para o cliente (/o) ───────────── */

const SO_GESTAO = "Mandar o link é de administração e gestão: o aceite lança as parcelas no Financeiro.";

export async function gerarLinkOrcamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeVerDinheiro(s.papel)) return { mensagem: SO_GESTAO };
  const id = String(fd.get("id") ?? "");
  const r = await gerarLinkDoOrcamento(ctxDe(s), id, Number(fd.get("parcelas") ?? 2));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/orcamentos/${id}`);
  revalidatePath("/app/orcamentos");
  return { aviso: "Link pronto. Copie e mande ao cliente." };
}

export async function revogarLinkOrcamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeVerDinheiro(s.papel)) return { mensagem: SO_GESTAO };
  const id = String(fd.get("id") ?? "");
  const r = await revogarLinkDoOrcamento(ctxDe(s), id);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath(`/app/orcamentos/${id}`);
  return { aviso: "Link revogado." };
}
