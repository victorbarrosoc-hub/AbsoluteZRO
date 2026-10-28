import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { entradaDoMaestro } from "@/lib/entrada";
import { carregarCards } from "@/lib/quadro/servidor";

/**
 * /app: a entrada (decisão do titular, 28/10/2026). Com card seu em produção ou revisão, abre no Quadro; senão, na Z,
 * a primeira aba (src/lib/entrada.ts). Os cards são lidos como a pessoa (RLS).
 */
export default async function Entrada() {
  const sessao = await exigirAcessoNaPagina("/app");
  const { cards } = await carregarCards({ sub: sessao.sub, orgId: sessao.orgId });
  redirect(entradaDoMaestro(cards, sessao.sub));
}
