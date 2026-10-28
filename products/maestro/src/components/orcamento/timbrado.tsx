/**
 * Timbrado da proposta em HTML (porte de letterhead.tsx do ZRO), com a marca da organização no lugar da ZRO: nome
 * fantasia, dados da empresa (Ajustes → Empresa) e o fechamento dela. Papel branco dentro do app; "Imprimir ou salvar
 * PDF" sai um A4 limpo (CSS de impressão em globals.css, `.imprimivel`). Nunca mostra custo, margem nem nota interna:
 * os dados já chegam sem isso (documentoDoOrcamento).
 */
import type { CSSProperties } from "react";
import { brl, dataPorExtenso } from "@/lib/dinheiro";
import { FECHAMENTO_PADRAO, lerCondicoes, nomeUnidade, rotuloQuantidade, unidadeComQuantidade } from "@/lib/orcamento/motor";
import type { DocumentoOrcamento } from "@/lib/orcamento/orcamentos";

function linhasDaEmpresa(e: DocumentoOrcamento["empresa"]) {
  const junta = (p: (string | null | undefined)[]) =>
    p
      .map((x) => x?.trim())
      .filter(Boolean)
      .join(" · ");
  return [
    junta([e.razao, e.cnpj ? `CNPJ ${e.cnpj}` : null]),
    junta([e.endereco]),
    junta([e.email, e.telefone, e.instagram ? `@${e.instagram.replace(/^@/, "")}` : null, e.site]),
  ].filter(Boolean);
}

/**
 * A marca da produtora (Ajustes → Marca) entra aqui: o logo no topo (ou o nome), a cor de destaque só nos filetes e no
 * ponto (`--acento`, nunca em texto) e a linha de assinatura no fim.
 */
export function Timbrado({ doc }: { doc: DocumentoOrcamento }) {
  const marca = doc.empresa.fantasia ?? doc.empresa.nomeOrg;
  const condicoes = lerCondicoes(doc.condicoes);
  const codigo = doc.codigo.replace(" v", " · v");
  const estilo = doc.empresa.cor ? ({ "--acento": doc.empresa.cor } as CSSProperties) : undefined;
  return (
    <div className="lh-palco">
      <article className="lh imprimivel" aria-label={`Proposta ${codigo}`} style={estilo}>
        <header className="lh-topo">
          {doc.empresa.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo da organização, servido pela rota própria (bytes do banco)
            <img className="lh-logo" src={doc.empresa.logo} alt={marca} />
          ) : (
            <span className="lh-marca">{marca}</span>
          )}
          <div className="lh-topo__meta">
            <span className="lh-mono">Proposta</span>
            <span className="lh-codigo">{codigo}</span>
          </div>
        </header>

        <section className="lh-hero">
          <p className="lh-kicker">
            <span className="lh-ponto" aria-hidden="true" />
            <span className="lh-mono">Proposta de produção audiovisual</span>
          </p>
          <h2 className="lh-titulo">{doc.titulo}</h2>
          {doc.periodo ? <p className="lh-periodo">{doc.periodo}</p> : null}
        </section>

        <dl className="lh-meta">
          <div>
            <dt className="lh-mono">Para</dt>
            <dd>
              {doc.para ? (
                <>
                  <span className="lh-forte">{doc.para.nome}</span>
                  {doc.para.contato ? <span className="lh-sub">A/C {doc.para.contato}</span> : null}
                  {doc.para.cidade ? <span className="lh-sub">{doc.para.cidade}</span> : null}
                  {doc.para.documento ? <span className="lh-sub">{doc.para.documento}</span> : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="lh-mono">Emissão</dt>
            <dd>{dataPorExtenso(doc.emissao)}</dd>
          </div>
          <div>
            <dt className="lh-mono">Validade</dt>
            <dd>{doc.validade ? dataPorExtenso(doc.validade) : "—"}</dd>
          </div>
        </dl>

        {doc.escopo ? (
          <section className="lh-secao">
            <h3 className="lh-mono">Escopo</h3>
            <p className="lh-corpo">{doc.escopo}</p>
          </section>
        ) : null}

        <section className="lh-itens">
          <h3 className="lh-mono">Investimento</h3>
          {doc.itens.length ? (
            <table className="lh-tabela">
              <thead>
                <tr>
                  <th className="lh-mono">Descrição</th>
                  <th className="lh-mono lh-c-qtd">Qtd</th>
                  <th className="lh-mono lh-c-un">Unidade</th>
                  <th className="lh-mono lh-c-preco">Valor unit.</th>
                  <th className="lh-mono lh-c-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {doc.itens.map((it, i) => (
                  <tr key={i}>
                    <td className="lh-desc">
                      <strong>{it.descricao}</strong>
                      {it.detalhe ? <span className="lh-detalhe">{it.detalhe}</span> : null}
                      <span className="lh-conta">
                        {rotuloQuantidade(it.quantidade)} {unidadeComQuantidade(it.unidade, it.quantidade)} × {brl(it.precoCents)}
                      </span>
                    </td>
                    <td className="lh-c-qtd lh-num">{rotuloQuantidade(it.quantidade)}</td>
                    <td className="lh-c-un">{nomeUnidade(it.unidade) || "—"}</td>
                    <td className="lh-c-preco lh-num">{brl(it.precoCents)}</td>
                    <td className="lh-c-total lh-num">{brl(it.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="lh-vazio">Itens a definir.</p>
          )}
          <dl className="lh-totais">
            {doc.desconto > 0 ? (
              <>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{brl(doc.subtotal)}</dd>
                </div>
                <div>
                  <dt>Desconto</dt>
                  <dd>− {brl(doc.desconto)}</dd>
                </div>
              </>
            ) : null}
            <div className="lh-total">
              <dt className="lh-mono">Total</dt>
              <dd>{brl(doc.total)}</dd>
            </div>
          </dl>
        </section>

        {doc.pagamento ? (
          <section className="lh-secao">
            <h3 className="lh-mono">Pagamento</h3>
            <p className="lh-corpo">{doc.pagamento}</p>
          </section>
        ) : null}

        {condicoes.length ? (
          <section className="lh-secao">
            <h3 className="lh-mono">Condições</h3>
            <ol className="lh-condicoes">
              {condicoes.map((c, i) => (
                <li key={i}>
                  <span className="lh-n">{String(i + 1).padStart(2, "0")}</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="lh-secao">
          <h3 className="lh-mono">Próximo passo</h3>
          <p className="lh-corpo">{doc.empresa.fechamento ?? FECHAMENTO_PADRAO}</p>
        </section>

        {doc.empresa.assinatura ? (
          <section className="lh-assinatura">
            <span className="lh-assinatura__linha" aria-hidden="true" />
            <p>{doc.empresa.assinatura}</p>
          </section>
        ) : null}

        <div className="lh-espaco" />
        <footer className="lh-pe">
          <div>
            {linhasDaEmpresa(doc.empresa).map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          <span className="lh-assina">{marca}</span>
        </footer>
      </article>
    </div>
  );
}
