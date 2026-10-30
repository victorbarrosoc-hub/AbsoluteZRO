import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEditarColunas, podeEscrever, podeRemover } from "@/lib/papeis";
import { veTudo } from "@/lib/acessos";
import { carregarCards, referenciasDoQuadro, selosDoQuadro } from "@/lib/quadro/servidor";
import { carregarColunas } from "@/lib/quadro/colunas-servidor";
import { Quadro } from "@/components/quadro/quadro";
import { CarregarDemonstracao } from "@/components/demonstracao";
import "../../../versoes-card.css";
import "../../../colunas.css";
import "../../../quadro-achar.css";

export const metadata = { title: "Quadro" };

/** O Quadro: os cards da organização, como a pessoa (RLS). A tela segue viva perguntando /api/quadro. */
export default async function PaginaQuadro({ searchParams }: PageProps<"/app/quadro">) {
  const sessao = await exigirAcessoNaPagina("/app/quadro");
  const sp = await searchParams;
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [{ cards, cursor }, refs, colunas, selos] = await Promise.all([carregarCards(ctx), referenciasDoQuadro(ctx), carregarColunas(ctx), selosDoQuadro(ctx)]);
  const card = typeof sp.card === "string" ? sp.card : null;
  const cliente = typeof sp.cliente === "string" && refs.clientes.some((c) => c.id === sp.cliente) ? sp.cliente : null;
  return (
    <Quadro
      cards={cards}
      cursor={cursor}
      selos={selos}
      {...refs}
      eu={sessao.sub}
      colunas={colunas}
      podeEscrever={podeEscrever(sessao.papel)}
      podeEditarColunas={podeEditarColunas(sessao.papel)}
      demonstracao={podeRemover(sessao.papel) && veTudo(sessao.acessos) ? <CarregarDemonstracao /> : null}
      cardInicial={card && cards.some((c) => c.id === card) ? card : null}
      clienteInicial={cliente}
      novoInicial={sp.novo === "1"}
      projetoInicial={typeof sp.projeto === "string" && refs.projetos.some((p) => p.id === sp.projeto) ? sp.projeto : null}
    />
  );
}
