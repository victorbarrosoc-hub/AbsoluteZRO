"use server";
/** Ajustes → Contrato: salvar (versão nova) e restaurar o modelo base. Só administração (aqui e no banco). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { CAMPOS_CONFIG } from "@/lib/contrato/modelo";
import { restaurarPadrao, salvarModelo } from "@/lib/contrato/servidor";
import type { EstadoForm } from "@/components/form";

const SO_ADMIN = "Só a administração muda o contrato.";

export async function salvarContratoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)]));
  if (s.papel !== "admin") return { mensagem: SO_ADMIN, valores };
  const config = Object.fromEntries(CAMPOS_CONFIG.map((c) => [c.chave, valores[c.chave] ?? ""]));
  const r = await salvarModelo({ sub: s.sub, orgId: s.orgId }, valores.texto ?? "", config);
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erros, valores };
  revalidatePath("/app/ajustes/contrato");
  return { aviso: `Salvo como versão ${r.versao}.`, valores };
}

export async function restaurarContratoAcao(_: EstadoForm): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (s.papel !== "admin") return { mensagem: SO_ADMIN };
  const r = await restaurarPadrao({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/contrato");
  return { aviso: `Modelo base restaurado (versão ${r.versao}).`, n: r.versao };
}
