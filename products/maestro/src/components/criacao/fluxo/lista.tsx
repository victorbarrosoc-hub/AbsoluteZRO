"use client";
/**
 * A Lista do Fluxo (plano da Criação §6.1): o mesmo fluxo por seção, de cima para baixo, na ordem de leitura (a mesma do
 * "Copiar para IA", `organizar` em exportar.ts). É o jeito bom de ler numa tela pequena e o caminho acessível (leitor
 * de tela, teclado). Tocar num item leva até ele no canvas.
 */
import { duracao, organizar, prazoCurto } from "@/lib/criacao/fluxo/exportar";
import { NOME_FONTE_LINK } from "@/lib/criacao/fluxo/endereco";
import type { DadosImagem, DadosLink, DadosNota, DadosSecao, LigacaoFluxo, NoFluxo, RefResolvida } from "@/lib/criacao/fluxo/modelo";
import { Icone } from "@/components/icones";
import { enderecoDaRef } from "./no";

function Item({ n, r, irPara }: { n: NoFluxo; r: RefResolvida | undefined; irPara: (id: string) => void }) {
  const ver = (
    <button type="button" className="fx-lista__ver" onClick={() => irPara(n.id)} title="Ver no canvas" aria-label="Ver no canvas">
      <Icone nome="alvo" size={15} />
    </button>
  );
  switch (n.tipo) {
    case "nota": {
      const d = n.dados as DadosNota;
      return (
        <li className="fx-lista__item fx-lista__item--nota" data-cor={d.cor}>
          <p>{d.texto || "Nota vazia"}</p>
          {ver}
        </li>
      );
    }
    case "imagem": {
      const d = n.dados as DadosImagem;
      return (
        <li className="fx-lista__item fx-lista__item--imagem">
          {n.imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.imagem.miniUrl} alt={d.legenda} width={n.imagem.miniLargura} height={n.imagem.miniAltura} loading="lazy" />
          ) : null}
          <p>{d.legenda || "Imagem"}</p>
          {ver}
        </li>
      );
    }
    case "link": {
      const d = n.dados as DadosLink;
      return (
        <li className="fx-lista__item">
          <span className="fx-lista__icone">
            <Icone nome="link" size={16} />
          </span>
          <a href={d.url} target="_blank" rel="noopener noreferrer">
            <strong>{d.titulo || NOME_FONTE_LINK[d.link.fonte]}</strong>
            <small>{d.link.dominio}</small>
          </a>
          {ver}
        </li>
      );
    }
    case "roteiro":
    case "card": {
      const href = r?.estado === "ok" ? enderecoDaRef(n) : null;
      const titulo = r?.estado === "ok" ? r.titulo : r?.estado === "sem_acesso" ? "Sem acesso" : r?.estado === "removido" ? "Removido" : "Carregando…";
      const apoio =
        r?.estado === "ok" && r.tipo === "roteiro"
          ? `Roteiro · ${r.versao > 0 ? `v${r.versao} · ` : ""}${duracao(r.duracaoSeg)}`
          : r?.estado === "ok" && r.tipo === "card"
            ? ["Card", r.colunaNome, prazoCurto(r.prazo) ? `prazo ${prazoCurto(r.prazo)}` : null].filter(Boolean).join(" · ")
            : n.tipo === "roteiro"
              ? "Roteiro"
              : "Card";
      const miolo = (
        <>
          <strong>{titulo}</strong>
          <small>{apoio}</small>
        </>
      );
      return (
        <li className="fx-lista__item">
          <span className="fx-lista__icone fx-lista__icone--ref">{n.tipo === "roteiro" ? "R" : "C"}</span>
          {href ? <a href={href}>{miolo}</a> : <span className="fx-lista__miolo">{miolo}</span>}
          {ver}
        </li>
      );
    }
    default:
      return null;
  }
}

export function ListaFluxo({
  titulo,
  nos,
  ligacoes,
  refs,
  irPara,
}: {
  titulo: string;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  refs: Record<string, RefResolvida>;
  irPara: (id: string) => void;
}) {
  const o = organizar({ titulo, nos, ligacoes, refs });
  const nome = (id: string) => {
    const n = o.vivos.get(id);
    if (!n) return "";
    if (n.tipo === "nota") return (n.dados as DadosNota).texto.split("\n")[0].slice(0, 60) || "Nota";
    if (n.tipo === "imagem") return (n.dados as DadosImagem).legenda || "Imagem";
    if (n.tipo === "link") return (n.dados as DadosLink).titulo || (n.dados as DadosLink).link.dominio;
    if (n.tipo === "secao") return (n.dados as DadosSecao).nome || "Seção";
    const r = refs[id];
    return r?.estado === "ok" ? r.titulo : n.tipo === "roteiro" ? "Roteiro" : "Card";
  };
  if (!o.vivos.size)
    return (
      <div className="fx-lista fx-lista--vazia">
        <p>Nada aqui ainda.</p>
      </div>
    );
  return (
    <div className="fx-lista" aria-label="Fluxo em lista">
      {o.secoes.map((s) => (
        <section key={s.no.id} className="fx-lista__secao" data-cor={(s.no.dados as DadosSecao).cor} aria-label={(s.no.dados as DadosSecao).nome || "Seção"}>
          <h2>{(s.no.dados as DadosSecao).nome || "Seção sem nome"}</h2>
          {s.itens.length ? (
            <ul>
              {s.itens.map((n) => (
                <Item key={n.id} n={n} r={refs[n.id]} irPara={irPara} />
              ))}
            </ul>
          ) : (
            <p className="fx-lista__nada">Seção vazia</p>
          )}
        </section>
      ))}
      {o.soltos.length ? (
        <section className="fx-lista__secao fx-lista__secao--solta" aria-label={o.secoes.length ? "Fora das seções" : "Itens"}>
          {o.secoes.length ? <h2>Fora das seções</h2> : null}
          <ul>
            {o.soltos.map((n) => (
              <Item key={n.id} n={n} r={refs[n.id]} irPara={irPara} />
            ))}
          </ul>
        </section>
      ) : null}
      {o.ligacoes.length ? (
        <section className="fx-lista__secao fx-lista__secao--ligacoes" aria-label="Ligações">
          <h2>Ligações</h2>
          <ul>
            {o.ligacoes.map((l) => (
              <li key={l.id} className="fx-lista__ligacao">
                <span>{nome(l.de)}</span>
                <span className="fx-lista__seta" aria-label="leva a">
                  {l.rotulo ? <em>{l.rotulo}</em> : null}→
                </span>
                <span>{nome(l.para)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
