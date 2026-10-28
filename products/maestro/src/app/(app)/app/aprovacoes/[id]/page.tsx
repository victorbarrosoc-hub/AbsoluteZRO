import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEscrever } from "@/lib/papeis";
import { cardsDisponiveis, carregarLote } from "@/lib/revisao/equipe";
import { chaveGoogle } from "@/lib/revisao/fontes/player";
import { LoteEquipe } from "@/components/revisao/lote-equipe";
import "../../../../revisao.css";

export const metadata = { title: "Lote" };

/** Um lote: as peças, as versões (links), a régua com os comentários, o link do cliente e a exportação das notas. */
export default async function LotePagina({ params, searchParams }: PageProps<"/app/aprovacoes/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/aprovacoes/${id}`);
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [lote, disponiveis] = await Promise.all([carregarLote(ctx, id), cardsDisponiveis(ctx)]);
  if (!lote) notFound();
  const sp = await searchParams;
  const peca = typeof sp.peca === "string" ? sp.peca : null;
  return (
    <LoteEquipe
      lote={lote}
      disponiveis={disponiveis.filter((c) => c.cliente === lote.cliente.id && !lote.pecas.some((p) => p.card === c.id))}
      escreve={podeEscrever(sessao.papel)}
      gereLink={sessao.papel === "admin" || sessao.papel === "gestor"}
      pecaInicial={peca}
      driveStream={!!chaveGoogle()}
    />
  );
}
