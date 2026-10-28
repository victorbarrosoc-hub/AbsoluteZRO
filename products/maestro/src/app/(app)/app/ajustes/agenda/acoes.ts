"use server";
/** Agenda por assinatura: cada pessoa gera, troca ou desliga o próprio endereço (o banco confere que é dela). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { gerarAssinatura, revogarAssinatura } from "@/lib/agenda/feed";

export type EstadoAgenda = { url?: string; mensagem?: string; aviso?: string } | undefined;

export async function gerarAssinaturaAcao(_: EstadoAgenda, __: FormData): Promise<EstadoAgenda> {
  const s = await exigirAcessoNaAcao();
  const r = await gerarAssinatura({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/agenda");
  return { url: r.url };
}

export async function revogarAssinaturaAcao(_: EstadoAgenda, __: FormData): Promise<EstadoAgenda> {
  const s = await exigirAcessoNaAcao();
  const r = await revogarAssinatura({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/agenda");
  return { aviso: "Endereço desligado. O calendário para de atualizar." };
}
