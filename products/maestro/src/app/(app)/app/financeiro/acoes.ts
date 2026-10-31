"use server";
/** Ações do Financeiro: quem tem a área Financeiro e escreve (aqui e no banco, em todo comando: maestro.pode). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { ehData, lerReais } from "@/lib/dinheiro";
import { pode as podeArea } from "@/lib/acessos";
import { podeEscrever } from "@/lib/papeis";
import {
  darBaixa,
  desfazerBaixa,
  gerarRecorrencias,
  removerLancamento,
  removerRecorrencia,
  salvarLancamento,
  salvarRecorrencia,
  validarLancamento,
  validarRecorrencia,
} from "@/lib/financeiro/servidor";
import type { EstadoForm } from "@/components/form";

const SO = "Você não mexe no Financeiro. A administração libera em Ajustes → Pessoas.";
const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));

async function quem() {
  const s = await exigirAcessoNaAcao();
  return { ctx: { sub: s.sub, orgId: s.orgId }, pode: podeArea(s, "financeiro") && podeEscrever(s.papel) };
}
const atualizar = () => revalidatePath("/app/financeiro", "layout");

export async function salvarLancamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  const valores = valoresDe(fd);
  if (!pode) return { mensagem: SO, valores };
  const v = validarLancamento(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarLancamento(ctx, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erros, valores };
  atualizar();
  redirect(`/app/financeiro/${r.id}`);
}

export async function removerLancamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await removerLancamento(ctx, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  atualizar();
  redirect("/app/financeiro");
}

export async function darBaixaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  const valores = valoresDe(fd);
  if (!pode) return { mensagem: SO, valores };
  const valor = valores.valor ? lerReais(valores.valor) : null;
  if (valor !== null && !(valor > 0)) return { erros: { valor: "Valor inválido." }, valores };
  if (valores.data && !ehData(valores.data)) return { erros: { data: "Data inválida." }, valores };
  const r = await darBaixa(ctx, valores.lancamento ?? valores.id, {
    valorCents: valor,
    data: valores.data || null,
    forma: valores.forma || null,
    notas: valores.notas || null,
  });
  if (!r.ok) return { mensagem: r.mensagem, valores };
  atualizar();
  return { aviso: "Baixa registrada.", n: Date.now() };
}

export async function desfazerBaixaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await desfazerBaixa(ctx, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  atualizar();
  return { aviso: "Desfeita." };
}

export async function salvarRecorrenciaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  const valores = valoresDe(fd);
  if (!pode) return { mensagem: SO, valores };
  const v = validarRecorrencia(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarRecorrencia(ctx, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  atualizar();
  return valores.id ? { aviso: "Salvo.", valores } : { aviso: "Recorrência criada. O mês atual entra ao gerar.", n: Date.now() };
}

export async function removerRecorrenciaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await removerRecorrencia(ctx, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  atualizar();
  return { aviso: "Removida." };
}

export async function gerarRecorrenciasAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await gerarRecorrencias(ctx, String(fd.get("mes") || "") || undefined);
  if (!r.ok) return { mensagem: r.mensagem };
  atualizar();
  return { aviso: r.lancamentos ? `${r.lancamentos} lançamentos gerados${r.cards ? ` e ${r.cards} cards na Pauta` : ""}.` : "Nada faltando neste mês." };
}
