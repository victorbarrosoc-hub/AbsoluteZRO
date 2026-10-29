"use server";
/** Ações da tabela de preços: só administração e gestão (aqui e no banco). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeVerDinheiro } from "@/lib/papeis";
import {
  removerItem,
  removerModelo,
  removerVariavel,
  salvarItem,
  salvarModelo,
  salvarVariavel,
  validarItem,
  validarModelo,
  validarVariavel,
} from "@/lib/orcamento/precos";
import type { EstadoForm } from "@/components/form";

const SO = "Só administração e gestão mudam a tabela de preços.";
const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));

async function quem() {
  const s = await exigirAcessoNaAcao();
  return { s, ctx: { sub: s.sub, orgId: s.orgId }, pode: podeVerDinheiro(s.papel) };
}

export async function salvarItemAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  const valores = valoresDe(fd);
  if (!pode) return { mensagem: SO, valores };
  const v = validarItem(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarItem(ctx, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app/ajustes/precos");
  return valores.id ? { aviso: "Item salvo.", valores } : { aviso: "Item adicionado.", n: Date.now() };
}

export async function removerItemAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await removerItem(ctx, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/precos");
  return { aviso: "Removido." };
}

export async function salvarVariavelAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  const valores = valoresDe(fd);
  if (!pode) return { mensagem: SO, valores };
  const v = validarVariavel(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarVariavel(ctx, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erros, valores };
  revalidatePath("/app/ajustes/precos");
  return valores.id ? { aviso: "Variável salva.", valores } : { aviso: "Variável adicionada.", n: Date.now() };
}

export async function removerVariavelAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await removerVariavel(ctx, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/precos");
  return { aviso: "Removida." };
}

export async function salvarModeloAcao(id: string | null, corpo: unknown): Promise<{ ok: boolean; mensagem?: string }> {
  const { ctx, pode } = await quem();
  if (!pode) return { ok: false, mensagem: SO };
  const v = validarModelo(corpo);
  if (!v.ok) return { ok: false, mensagem: v.mensagem };
  const r = await salvarModelo(ctx, v.entrada, id ?? undefined);
  if (!r.ok) return { ok: false, mensagem: r.mensagem };
  revalidatePath("/app/ajustes/precos");
  return { ok: true };
}

export async function removerModeloAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { ctx, pode } = await quem();
  if (!pode) return { mensagem: SO };
  const r = await removerModelo(ctx, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/precos");
  return { aviso: "Removido." };
}
