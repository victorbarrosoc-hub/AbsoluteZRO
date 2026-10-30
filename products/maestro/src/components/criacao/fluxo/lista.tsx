"use client";
/**
 * A Lista do Fluxo (plano da Criação §6.1): o mesmo fluxo por seção, de cima para baixo, na ordem de leitura (a mesma do
 * "Copiar para IA", `organizar` em exportar.ts). É o jeito bom de ler numa tela pequena e o caminho acessível (leitor
 * de tela, teclado). Tocar num item leva até ele no canvas. No link de exportação (`/f/<token>`, F6) a mesma Lista sai
 * só de leitura (`publico`): sem "ver no canvas", referência só com o título e sem endereço interno, imagem inteira.
 */
import { duracao, organizar, prazoCurto } from "@/lib/criacao/fluxo/exportar";
import { NOME_FONTE_LINK } from "@/lib/criacao/fluxo/endereco";
import type { DadosImagem, DadosLink, DadosNota, DadosSecao, LigacaoFluxo, NoFluxo, RefResolvida } from "@/lib/criacao/fluxo/modelo";
import { Icone } from "@/components/icones";
import { enderecoDaRef } from "./no";

function Item({ n, r, irPara, publico }: { n: NoFluxo; r: RefResolvida | undefined; irPara?: (id: string) => void; publico: boolean }) {
  const ver = irPara ? (
    <button type="button" className="fx-lista__ver" onClick={() => irPara(n.id)} title="Ver no canvas" aria-label="Ver no canvas">
      <Icone nome="alvo" size={15} />
    </button>
  ) : null;
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
            <img
              src={publico ? n.imagem.url : n.imagem.miniUrl}
              alt={d.legenda}
              width={publico ? n.imagem.largura : n.imagem.miniLargura}
              height={publico ? n.imagem.altura : n.imagem.miniAltura}
              loading="lazy"
            />
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
      const href = r?.estado === "ok" && !publico ? enderecoDaRef(n) : null;
      const titulo =
        r?.estado === "ok" || r?.estado === "titulo"
          ? r.titulo || (n.tipo === "roteiro" ? "Roteiro" : "Card sem título")
          : r?.estado === "sem_acesso"
            ? publico
              ? n.tipo === "roteiro"
                ? "Roteiro"
                : "Card"
              : "Sem acesso"
            : r?.estado === "removido"
              ? "Removido"
              : "Carregando…";
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
  publico = false,
  className = "",
}: {
  titulo: string;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  refs: Record<string, RefResolvida>;
  irPara?: (id: string) => void;
  publico?: boolean;
  className?: string;
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
    return r?.estado === "ok" || r?.estado === "titulo" ? r.titulo : n.tipo === "roteiro" ? "Roteiro" : "Card";
  };
  if (!o.vivos.size)
    return (
      <div className={`fx-lista fx-lista--vazia ${className}`.trim()}>
        <p>Nada aqui ainda.</p>
      </div>
    );
  return (
    <div className={`fx-lista ${className}`.trim()} aria-label="Fluxo em lista">
      {o.secoes.map((s) => (
        <section key={s.no.id} className="fx-lista__secao" data-cor={(s.no.dados as DadosSecao).cor} aria-label={(s.no.dados as DadosSecao).nome || "Seção"}>
          <h2>{(s.no.dados as DadosSecao).nome || "Seção sem nome"}</h2>
          {s.itens.length ? (
            <ul>
              {s.itens.map((n) => (
                <Item key={n.id} n={n} r={refs[n.id]} irPara={irPara} publico={publico} />
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
              <Item key={n.id} n={n} r={refs[n.id]} irPara={irPara} publico={publico} />
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
