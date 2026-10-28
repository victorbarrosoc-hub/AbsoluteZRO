"use server";
/** Dados da empresa: só administração (aqui e no banco, pela política de maestro.organizations). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { salvarEmpresa, validarEmpresa } from "@/lib/organizacao";
import type { EstadoForm } from "@/components/form";

export async function salvarEmpresaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  if (s.papel !== "admin") return { mensagem: "Só a administração muda os dados da empresa.", valores };
  const v = validarEmpresa({ ...valores, lat: valores.lat?.replace(",", "."), lon: valores.lon?.replace(",", ".") });
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarEmpresa({ sub: s.sub, orgId: s.orgId }, v.empresa);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app", "layout");
  return { aviso: "Salvo.", valores };
}
