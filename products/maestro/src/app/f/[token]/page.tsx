import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ipDe } from "@/lib/http";
import { abrirFluxoPublico } from "@/lib/criacao/fluxo/link";
import { ListaFluxo } from "@/components/criacao/fluxo/lista";
import { ImprimirFluxo } from "@/components/criacao/fluxo/imprimir";
import { Icone } from "@/components/icones";
import { CabecaMarca, estiloDaMarca, NeutroPublico, RodapeMaestro } from "@/components/publico/comum";
import { PedirPin } from "@/components/revisao/aprovar";
import "../../revisao.css";
import "../../fluxo.css";
import "../../fluxo-exportar.css";

/** Fora da busca e sem o nome de ninguém no título; o token está no endereço, então nada de Referer. */
export const metadata: Metadata = {
  title: { absolute: "Fluxo" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/**
 * O fluxo pelo link de exportação (plano da Criação §6.2, fase F6): sem conta, só de leitura, a vista Lista (o jeito
 * bom de ler no iPhone), com o Markdown para IA e o PDF. Tudo passa pela porta estreita (`abrirFluxoPublico`): link
 * desconhecido, revogado, vencido ou de fluxo na lixeira dá a mesma tela neutra.
 */
export default async function PaginaFluxoPublico({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const jar = await cookies();
  const r = await abrirFluxoPublico(token, { get: (n) => jar.get(n)?.value }, ipDe(await headers()), { contar: true }).catch(() => ({
    estado: "morto" as const,
  }));
  if (r.estado === "morto") return <NeutroPublico />;
  if (r.estado === "limite") return <NeutroPublico limite />;
  if (r.estado === "pin") return <PedirPin token={token} rota={`/f/${token}/pin`} />;
  const d = r.dados;
  const [primeira, ...resto] = d.titulo.split(" ");
  return (
    <main className="cl fxp" id="conteudo" style={estiloDaMarca(d.marca.cor)}>
      <header className="fxp-topo nao-imprime">
        <CabecaMarca marca={d.marca} />
        <div className="fxp-acoes">
          <a className="glass-btn glass-btn--sm" href={`/f/${token}.md`} title="O fluxo em Markdown, para colar numa IA">
            <Icone nome="documento" size={16} /> Markdown
          </a>
          <ImprimirFluxo />
        </div>
      </header>
      <section className="imprimivel fxp-folha" aria-labelledby="fxp-titulo">
        <div className="fxp-cabeca">
          <h1 id="fxp-titulo">
            <strong>{primeira}</strong>
            {resto.length ? ` ${resto.join(" ")}` : null}
          </h1>
          <p>Só leitura · até {DATA.format(new Date(d.expira))}</p>
        </div>
        <ListaFluxo titulo={d.titulo} nos={d.nos} ligacoes={d.ligacoes} refs={d.refs} publico className="fx-lista--publica" />
      </section>
      <RodapeMaestro propria={d.marca.propria} />
    </main>
  );
}
