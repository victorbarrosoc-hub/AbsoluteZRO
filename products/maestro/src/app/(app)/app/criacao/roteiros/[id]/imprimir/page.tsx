import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { obterRoteiro, obterVersao } from "@/lib/criacao/roteiro/servidor";
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

const NOME_VISTA: Record<VistaImpressao, string> = { literario: "Literário", tecnico: "Técnico", teleprompter: "Teleprompter", edicao: "Edição" };
const NOME_COR = { fala: "Fala", lettering: "Lettering", audio: "Áudio", imagem: "Imagem" } as const;

/**
 * A folha A4 do roteiro (`dadosImpressao`): Literário, Técnico, Teleprompter ou Edição, papel branco, "salvar como
 * PDF". Com `?versao=n` é a versão salva (o que o "Enviar" manda); sem, o rascunho (só para ler e imprimir aqui).
 */
export default async function ImprimirRoteiro({ params, searchParams }: PageProps<"/app/criacao/roteiros/[id]/imprimir">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await exigirAcessoNaPagina(`/app/criacao/roteiros/${id}/imprimir`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const n = typeof sp.versao === "string" && /^\d{1,6}$/.test(sp.versao) ? Number(sp.versao) : null;
  const [r, empresa, v] = await Promise.all([obterRoteiro(ctx, id), lerEmpresa(ctx), n ? obterVersao(ctx, id, n) : Promise.resolve(null)]);
  if (!r || r.apagado || (n && !v)) notFound();
  const conteudo = v ? v.conteudo : r.conteudo;
  const vista: VistaImpressao = VISTAS_IMPRESSAO.includes(sp.vista as VistaImpressao) ? (sp.vista as VistaImpressao) : "literario";
  const ocultar = (typeof sp.ocultar === "string" ? sp.ocultar.split(",") : []).filter((c): c is ColunaTecnico => COLUNAS_TECNICO.includes(c as ColunaTecnico));
  const pessoa = typeof sp.pessoa === "string" && conteudo.pessoas.some((p) => p.id === sp.pessoa) ? sp.pessoa : null;
  const d = dadosImpressao(conteudo, { titulo: v ? v.titulo : r.titulo, vista, versao: v ? v.n : null, ocultar, pessoa });
  const marca = empresa.fantasia ?? empresa.nomeOrg;
  const href = (x: VistaImpressao) => `/app/criacao/roteiros/${id}/imprimir?vista=${x}${v ? `&versao=${v.n}` : ""}`;
  return (
    <div className="pagina pagina--larga cr-imprimir">
      <div className="doc__barra nao-imprime">
        <Link className="voltar" href={`/app/criacao/roteiros/${id}?vista=${vista}`}>
          <Icone nome="voltar" size={16} /> Roteiro
        </Link>
        <nav className="q-segmentos cr-abas cr-imprimir__vistas" aria-label="Vista da folha" data-rolagem>
          {VISTAS_IMPRESSAO.map((x) => (
            <Link key={x} href={href(x)} aria-current={x === vista ? "page" : undefined}>
              {NOME_VISTA[x]}
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
            {[
              d.versao ?? "Rascunho",
              d.formato,
              `${d.cenas} ${d.cenas === 1 ? "cena" : "cenas"}`,
              `${d.duracao} estimados`,
              textoAlvo(d.medidor.alvo),
              r.projeto,
            ]
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

        {d.vista === "edicao" ? (
          <div className="cr-folha__edicao">
            {d.cenasEdicao.map((c) => {
              const deixas = d.edicao.deixas.filter((x) => x.cenaNumero === c.numero);
              return (
                <section key={c.numero} className="cr-folha__cena">
                  <h2>
                    {c.cabecalho}{" "}
                    <span className="num cr-folha__tempo">
                      {formatarTempo(c.inicioSeg)}–{formatarTempo(c.fimSeg)}
                    </span>
                  </h2>
                  {deixas.length ? (
                    <ol className="cr-folha__deixas">
                      {deixas.map((x) => (
                        <li key={x.blocoId} data-cor={x.cor}>
                          <span className="num">
                            {formatarTempo(x.inicioSeg)}–{formatarTempo(x.fimSeg)}
                          </span>
                          <span>
                            <b>
                              <span className="sr-only">{NOME_COR[x.cor]} · </span>
                              {x.rotulo}
                            </b>{" "}
                            {x.cor === "fala" ? marcacao(x.texto) : x.texto}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="nada">Sem deixas.</p>
                  )}
                </section>
              );
            })}
            <p className="folha__meta">Tempos estimados (fala por palavras por minuto; o resto pelo que foi digitado).</p>
          </div>
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
