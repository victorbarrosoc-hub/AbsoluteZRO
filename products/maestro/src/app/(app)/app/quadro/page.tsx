import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { carregarCards, referenciasDoQuadro } from "@/lib/quadro/servidor";
import { Quadro } from "@/components/quadro/quadro";
import { CarregarDemonstracao } from "@/components/demonstracao";

export const metadata = { title: "Quadro" };

/** O Quadro: os cards da organização, como a pessoa (RLS). A tela segue viva perguntando /api/quadro. */
export default async function PaginaQuadro({ searchParams }: PageProps<"/app/quadro">) {
  const sessao = await exigirAcessoNaPagina("/app/quadro");
  const sp = await searchParams;
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [{ cards, cursor }, refs] = await Promise.all([carregarCards(ctx), referenciasDoQuadro(ctx)]);
  const card = typeof sp.card === "string" ? sp.card : null;
  const cliente = typeof sp.cliente === "string" && refs.clientes.some((c) => c.id === sp.cliente) ? sp.cliente : null;
  return (
    <Quadro
      cards={cards}
      cursor={cursor}
      {...refs}
      eu={sessao.sub}
      podeEscrever={podeEscrever(sessao.papel)}
      demonstracao={podeRemover(sessao.papel) ? <CarregarDemonstracao /> : null}
      cardInicial={card && cards.some((c) => c.id === card) ? card : null}
      clienteInicial={cliente}
      novoInicial={sp.novo === "1"}
      projetoInicial={typeof sp.projeto === "string" && refs.projetos.some((p) => p.id === sp.projeto) ? sp.projeto : null}
    />
  );
}
