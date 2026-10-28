import type { Metadata } from "next";
import { headers } from "next/headers";
import { ipDe } from "@/lib/http";
import { abrirFormulario } from "@/lib/pedidos/publico";
import { CabecaMarca, estiloDaMarca, NeutroPublico, RodapeMaestro } from "@/components/publico/comum";
import { PedidoPublico } from "@/components/publico/pedido";
import "../../revisao.css";

export const metadata: Metadata = {
  title: { absolute: "Pedido de orçamento" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin",
};

/**
 * O formulário público de pedido de orçamento da produtora (plano v2 §6.2): sem conta, pelo link que ela compartilha.
 * Tudo passa pela porta estreita (`abrirFormulario`); link desconhecido ou revogado dá a mesma tela neutra.
 */
export default async function PaginaPedido({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const r = await abrirFormulario(token, ipDe(await headers())).catch(() => ({ estado: "morto" as const }));
  if (r.estado !== "ok") return <NeutroPublico limite={r.estado === "limite"} />;
  return (
    <main className="cl pd-pagina" id="conteudo" style={estiloDaMarca(r.form.marca.cor)}>
      <header className="pd-topo">
        <CabecaMarca marca={r.form.marca} />
      </header>
      <PedidoPublico token={token} form={r.form} selo={r.selo} />
      <RodapeMaestro />
    </main>
  );
}
