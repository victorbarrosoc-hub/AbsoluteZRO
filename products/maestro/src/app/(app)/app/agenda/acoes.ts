"use server";
/** Ações da agenda: sessão e papel aqui; o banco confere de novo (RLS). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { escalarNaDiaria, removerEvento, salvarEvento, validarEvento } from "@/lib/agenda/servidor";
import { lerReais } from "@/lib/dinheiro";
import { reservar } from "@/lib/inventario/servidor";
import { ehUuid } from "@/lib/crm/comum";
import { podeEscrever } from "@/lib/papeis";
import type { EstadoForm } from "@/components/form";
import { sincronizarDepois } from "@/lib/agenda/depois";

const valoresDe = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
const LE = "Seu papel nesta organização só lê.";

export async function salvarEventoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  const v = validarEvento(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarEvento({ sub: s.sub, orgId: s.orgId }, v.entrada, valores.id || undefined);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  sincronizarDepois(s);
  revalidatePath("/app", "layout");
  if (valores.id) return { aviso: "Salvo.", valores };
  redirect(`/app/agenda/${r.id}`);
}

export async function removerEventoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEscrever(s.papel)) return { mensagem: LE };
  const r = await removerEvento({ sub: s.sub, orgId: s.orgId }, String(fd.get("id") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  sincronizarDepois(s);
  revalidatePath("/app", "layout");
  redirect("/app/agenda");
}

export async function escalarAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  if (!ehUuid(valores.freela)) return { erros: { freela: "Escolha o freela." }, valores };
  const diaria = valores.valor ? lerReais(valores.valor) : null;
  if (diaria !== null && !(diaria >= 0)) return { erros: { valor: "Valor inválido." }, valores };
  const r = await escalarNaDiaria({ sub: s.sub, orgId: s.orgId }, valores.evento, valores.freela, valores.funcao ?? "", diaria);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  sincronizarDepois(s);
  revalidatePath("/app", "layout");
  return { aviso: "Escalado.", n: Date.now() };
}

export async function reservarNaDiariaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = valoresDe(fd);
  if (!podeEscrever(s.papel)) return { mensagem: LE, valores };
  if (!ehUuid(valores.equipamento)) return { erros: { equipamento: "Escolha o equipamento." }, valores };
  const r = await reservar(
    { sub: s.sub, orgId: s.orgId },
    {
      equipamentoId: valores.equipamento,
      projetoId: ehUuid(valores.projeto) ? valores.projeto : null,
      eventoId: valores.evento,
      inicio: valores.inicio,
      fim: valores.fim,
      notas: null,
    },
  );
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app", "layout");
  return { aviso: "Reservado.", n: Date.now() };
}
