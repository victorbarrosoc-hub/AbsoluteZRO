"use server";
/** Marca da produtora: só administração (aqui e no banco). O logo é conferido e reencodado no servidor. */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { LOGO_ENTRADA_MAX } from "@/lib/marca/logo";
import { removerLogo, salvarLogo, salvarMarca, validarMarca } from "@/lib/marca/servidor";
import type { EstadoForm } from "@/components/form";

const ctxDe = (s: { sub: string; orgId: string }) => ({ sub: s.sub, orgId: s.orgId });
const SO_ADMIN = "Só a administração muda a marca.";

export async function salvarMarcaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  const valores = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)]));
  if (s.papel !== "admin") return { mensagem: SO_ADMIN, valores };
  const v = validarMarca(valores);
  if (!v.ok) return { erros: v.erros, valores };
  const r = await salvarMarca(ctxDe(s), v.entrada);
  if (!r.ok) return { mensagem: r.mensagem, valores };
  revalidatePath("/app", "layout");
  return { aviso: "Salvo.", valores: { ...valores, cor: v.entrada.cor ?? "" } };
}

export async function enviarLogoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (s.papel !== "admin") return { mensagem: SO_ADMIN };
  const f = fd.get("logo");
  if (!(f instanceof File) || !f.size) return { mensagem: "Escolha a imagem do logo." };
  if (f.size > LOGO_ENTRADA_MAX) return { mensagem: "Imagem grande demais (até 4 MB)." };
  const r = await salvarLogo(ctxDe(s), new Uint8Array(await f.arrayBuffer()));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Logo atualizado." };
}

export async function tirarLogoAcao(_: EstadoForm): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (s.papel !== "admin") return { mensagem: SO_ADMIN };
  const r = await removerLogo(ctxDe(s));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: "Logo removido." };
}
