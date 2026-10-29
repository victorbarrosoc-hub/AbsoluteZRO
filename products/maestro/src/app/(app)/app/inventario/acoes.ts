"use server";
/** Ações do inventário: sessão e papel aqui; o banco confere de novo e barra reserva dupla. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { mudarReserva, removerEquipamento, reservar, salvarEquipamento, validarEquipamento, validarReserva } from "@/lib/inventario/servidor";
import type { EstadoForm } from "@/components/form";

const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
const LE = "Seu papel nesta organização só lê.";

export async function salvarEquipamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarEquipamento(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarEquipamento({ sub: s.sub, orgId: s.orgId }, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erros, valores };
  revalidatePath("/app/inventario");
  redirect(`/app/inventario/${r.id}`);
}

export async function removerEquipamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão removem equipamentos." };
  const r = await removerEquipamento({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/inventario");
  redirect("/app/inventario");
}

export async function reservarAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarReserva(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await reservar({ sub: s.sub, orgId: s.orgId }, v.entrada);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app", "layout");
  return { aviso: "Reservado.", n: Date.now() };
}

export async function mudarReservaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const acao = String(fd.get("acao") ?? "");
  if (acao !== "cancelar" && acao !== "saida" && acao !== "retorno") return { mensagem: "Passo inválido." };
  const r = await mudarReserva({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""), acao);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Feito." };
}
