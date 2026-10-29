"use server";
/** Link de pedido: administração e gestão com a área Orçamentos e preços (aqui e no banco). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { pode as podeArea } from "@/lib/acessos";
import { podeRemover } from "@/lib/papeis";
import { criarLinkDePedido, revogarLinkDePedido, salvarConfigDoLink } from "@/lib/pedidos/equipe";
import { lerConfig, PERGUNTAS_PADRAO } from "@/lib/pedidos/formulario";
import type { EstadoForm } from "@/components/form";

const SO_GESTAO = "Você não mexe no link de pedido.";

function configDe(fd: FormData) {
  return lerConfig({
    perguntas: Object.fromEntries(Object.keys(PERGUNTAS_PADRAO).map((k) => [k, fd.get(`p_${k}`) === "on"])),
    boasVindas: String(fd.get("boasVindas") ?? ""),
  });
}

export async function criarLinkPedidoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeArea(s, "orcamentos") || !podeRemover(s.papel)) return { mensagem: SO_GESTAO };
  void fd;
  const r = await criarLinkDePedido({ sub: s.sub, orgId: s.orgId }, null);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/pedido");
  return { aviso: "Link novo pronto." };
}

export async function salvarConfigPedidoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeArea(s, "orcamentos") || !podeRemover(s.papel)) return { mensagem: SO_GESTAO };
  const r = await salvarConfigDoLink({ sub: s.sub, orgId: s.orgId }, configDe(fd));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/pedido");
  return { aviso: "Salvo." };
}

export async function revogarLinkPedidoAcao(_: EstadoForm): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeArea(s, "orcamentos") || !podeRemover(s.papel)) return { mensagem: SO_GESTAO };
  const r = await revogarLinkDePedido({ sub: s.sub, orgId: s.orgId });
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/pedido");
  return { aviso: "Link revogado. Quem tinha não abre mais." };
}
