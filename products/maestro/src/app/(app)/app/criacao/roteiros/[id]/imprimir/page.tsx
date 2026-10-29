import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { obterRoteiro } from "@/lib/criacao/roteiro/servidor";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import {
  COLUNAS_TECNICO,
  type ColunaTecnico,
  dadosImpressao,
  nomeNaFala,
  NOME_COLUNA_TECNICO,
  VISTAS_IMPRESSAO,
  type VistaImpressao,
} from "@/lib/criacao/roteiro/vistas";
import { textoAlvo } from "@/components/criacao/roteiro/comum";
import { BotaoImprimir } from "@/components/criacao/roteiro/imprimir";
import { marcacao } from "@/components/criacao/roteiro/marcacao";
import { Icone } from "@/components/icones";
import { lerEmpresa } from "@/lib/organizacao";

export const metadata = { title: "Imprimir roteiro" };

const NOME_VISTA: Record<VistaImpressao, string> = { literario: "Literário", tecnico: "Técnico", teleprompter: "Teleprompter" };

/** A folha A4 do roteiro (`dadosImpressao`): Literário, Técnico ou Teleprompter, papel branco, "salvar como PDF". */
export default async function ImprimirRoteiro({ params, searchParams }: PageProps<"/app/criacao/roteiros/[id]/imprimir">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await exigirAcessoNaPagina(`/app/criacao/roteiros/${id}/imprimir`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [r, empresa] = await Promise.all([obterRoteiro(ctx, id), lerEmpresa(ctx)]);
  if (!r || r.apagado) notFound();
  const vista: VistaImpressao = VISTAS_IMPRESSAO.includes(sp.vista as VistaImpressao) ? (sp.vista as VistaImpressao) : "literario";
  const ocultar = (typeof sp.ocultar === "string" ? sp.ocultar.split(",") : []).filter((c): c is ColunaTecnico => COLUNAS_TECNICO.includes(c as ColunaTecnico));
  const pessoa = typeof sp.pessoa === "string" && r.conteudo.pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : null;
  const d = dadosImpressao(r.conteudo, { titulo: r.titulo, vista, versao: null, ocultar, pessoa });
  const marca = empresa.fantasia ?? empresa.nomeOrg;
  const href = (v: VistaImpressao) => `/app/criacao/roteiros/${id}/imprimir?vista=${v}`;
  return (
    <div className="pagina pagina--larga cr-imprimir">
      <div className="doc__barra nao-imprime">
        <Link className="voltar" href={`/app/criacao/roteiros/${id}?vista=${vista}`}>
          <Icone nome="voltar" size={16} /> Roteiro
        </Link>
        <nav className="q-segmentos cr-abas" aria-label="Vista da folha">
          {VISTAS_IMPRESSAO.map((v) => (
            <Link key={v} href={href(v)} aria-current={v === vista ? "page" : undefined}>
              {NOME_VISTA[v]}
            </Link>
          ))}
        </nav>
        <BotaoImprimir />
      </div>
      <article className="folha imprimivel cr-folha" data-vista={vista}>
        <header className="folha__topo">
          <span className="lh-mono">
            {marca} · Roteiro {NOME_VISTA[vista].toLowerCase()}
          </span>
          <h1 className="cr-folha__titulo-doc">{d.titulo}</h1>
          <p className="folha__meta">
            {[d.formato, `${d.cenas} ${d.cenas === 1 ? "cena" : "cenas"}`, `${d.duracao} estimados`, textoAlvo(d.medidor.alvo), r.projeto]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {d.elenco.length ? <p className="folha__meta">{d.elenco.join(" · ")}</p> : null}
        </header>

        {d.vista === "literario"
          ? d.literario.cenas.map((c) => (
              <section key={c.id} className="cr-folha__cena">
                <h2>{c.cabecalho}</h2>
                {c.titulo ? <p className="cr-folha__subtitulo">{c.titulo}</p> : null}
                {c.linhas.map((l) =>
                  l.tipo === "acao" ? (
                    <p key={l.blocoId} className="cr-folha__acao">
                      {l.texto}
                    </p>
                  ) : l.tipo === "fala" ? (
                    <div key={l.blocoId} className="cr-folha__fala">
                      <p className="cr-folha__nome">{nomeNaFala(l.nome, l.modo)}</p>
                      {l.obs ? <p className="cr-folha__obs">({l.obs})</p> : null}
                      <p>{l.texto}</p>
                    </div>
                  ) : (
                    <p key={l.blocoId} className="cr-folha__linha">
                      <b>{l.rotulo}</b> {l.texto}
                    </p>
                  ),
                )}
              </section>
            ))
          : null}

        {d.vista === "tecnico" ? (
          <section className="folha__secao" data-rolagem aria-label="Roteiro técnico">
            <table className="folha__tabela cr-folha__tabela">
              <thead>
                <tr>
                  {d.tecnico.colunas.map((c) => (
                    <th key={c}>{NOME_COLUNA_TECNICO[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.tecnico.cenas.map((c) =>
                  (c.linhas.length ? c.linhas : [null]).map((l, j) => (
                    <tr key={`${c.id}-${j}`}>
                      {d.tecnico.colunas.map((col) =>
                        col === "cena" ? (
                          <td key={col}>{j === 0 ? <b>{c.cabecalho}</b> : null}</td>
                        ) : col === "tempo" ? (
                          <td key={col} className="num">
                            {l ? `${formatarTempo(l.inicioSeg)}–${formatarTempo(l.fimSeg)}` : ""}
                          </td>
                        ) : (
                          <td key={col}>
                            {l
                              ? l[col].map((x) => (
                                  <p key={x.blocoId}>
                                    {x.rotulo ? <b>{x.rotulo} </b> : null}
                                    {x.obs ? <i>({x.obs}) </i> : null}
                                    {x.texto}
                                  </p>
                                ))
                              : null}
                          </td>
                        ),
                      )}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </section>
        ) : null}

        {d.vista === "teleprompter" ? (
          <div className="cr-folha__tp">
            {d.teleprompter.texto ? (
              d.teleprompter.texto.split("\n\n").map((p, i) =>
                p.startsWith("# ") ? (
                  <h2 key={i}>{p.slice(2)}</h2>
                ) : (
                  <p key={i}>
                    {p.split("\n").map((linha, j) => (
                      <Fragment key={j}>
                        {j ? <br /> : null}
                        {marcacao(linha)}
                      </Fragment>
                    ))}
                  </p>
                ),
              )
            ) : (
              <p className="nada">Sem fala.</p>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
}
