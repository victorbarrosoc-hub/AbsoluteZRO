import type { Metadata } from "next";
import { headers } from "next/headers";
import { brl, dataBr, hojeBr } from "@/lib/dinheiro";
import { ipDe } from "@/lib/http";
import { abrirOrcamentoDoCliente, dadosDoContrato } from "@/lib/orcamento/link";
import { FolhaContrato } from "@/components/contrato/folha";
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
  const { doc, marca, contrato } = r.dados;
  const paraAceitar =
    contrato && !contrato.aceito
      ? { texto: contrato.texto, dados: dadosDoContrato(r.dados, contrato, { nome: "", documento: "", endereco: "", portfolio: true }, hojeBr()) }
      : null;
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
        contrato={paraAceitar}
      />
      {contrato?.aceito ? (
        <section className="ct-cliente" aria-label="Contrato aceito">
          <div className="ct-cliente__cabeca">
            <h2>Contrato aceito</h2>
            <p className="sutil">O texto que você aceitou, com o registro. Baixe o PDF para guardar.</p>
          </div>
          <FolhaContrato html={contrato.aceito.html} registro={{ nome: contrato.aceito.nome, em: contrato.aceito.em, hash: contrato.aceito.hash }} />
        </section>
      ) : null}
      <Timbrado doc={doc} />
      <RodapeMaestro propria={!!marca.propria} />
    </main>
  );
}
