import type { Metadata } from "next";
import { headers } from "next/headers";
import { brl, dataBr } from "@/lib/dinheiro";
import { ipDe } from "@/lib/http";
import { abrirOrcamentoDoCliente } from "@/lib/orcamento/link";
import { BotaoImprimir } from "@/components/acao";
import { Timbrado } from "@/components/orcamento/timbrado";
import { AceiteOrcamento, ParcelasDoOrcamento } from "@/components/publico/aceite";
import { CabecaMarca, estiloDaMarca, NeutroPublico, RodapeMaestro } from "@/components/publico/comum";
import "../../revisao.css";

export const metadata: Metadata = {
  title: { absolute: "Orçamento" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin",
};

/**
 * O orçamento para o cliente (plano v2 §6.3): o resumo (total, validade, parcelas), "Aceitar" ou "Pedir ajuste" e o
 * timbrado inteiro com a marca da produtora, que vira PDF pelo navegador. Sem conta: tudo pela porta estreita.
 */
export default async function PaginaOrcamento({ params }: PageProps<"/o/[token]">) {
  const { token } = await params;
  const r = await abrirOrcamentoDoCliente(token, ipDe(await headers())).catch(() => ({ estado: "morto" as const }));
  if (r.estado !== "ok") return <NeutroPublico limite={r.estado === "limite"} />;
  const { doc, marca } = r.dados;
  return (
    <main className="cl oc" id="conteudo" style={estiloDaMarca(marca.cor)}>
      <header className="oc-topo">
        <CabecaMarca marca={marca} />
        <BotaoImprimir rotulo="Baixar PDF" />
      </header>
      <section className="oc-resumo" aria-label="Resumo">
        <span className="cl-filete" aria-hidden="true" />
        <p className="oc-resumo__codigo">Proposta {doc.codigo.replace(" v", " · v")}</p>
        <h1 className="oc-resumo__titulo">{doc.titulo}</h1>
        <dl className="oc-resumo__numeros">
          <div>
            <dt>Total</dt>
            <dd className="oc-total">{brl(doc.total)}</dd>
          </div>
          {doc.validade ? (
            <div>
              <dt>Vale até</dt>
              <dd>{dataBr(doc.validade)}</dd>
            </div>
          ) : null}
        </dl>
        <ParcelasDoOrcamento parcelas={r.dados.parcelas} />
      </section>
      <AceiteOrcamento
        token={token}
        codigo={doc.codigo}
        total={doc.total}
        produtora={marca.nome}
        parcelas={r.dados.parcelas}
        status={r.dados.status}
        aceite={r.dados.aceite}
        retorno={r.dados.retorno}
        whatsapp={r.dados.whatsapp}
      />
      <Timbrado doc={doc} />
      <RodapeMaestro />
    </main>
  );
}
