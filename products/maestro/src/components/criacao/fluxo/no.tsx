"use client";
/**
 * Um nó do Fluxo desenhado (fase F5): nota adesiva, imagem com legenda, link com prévia pelo endereço, referência viva a
 * roteiro ou card e seção colorida. Só desenha e edita o texto do próprio nó; mover, redimensionar, ligar e escolher
 * são do canvas (canvas.tsx), que acha o nó por `data-no`. Memorizado: mover um nó não redesenha os outros.
 */
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { duracao, prazoCurto } from "@/lib/criacao/fluxo/exportar";
import { NOME_FONTE_LINK } from "@/lib/criacao/fluxo/endereco";
import type { DadosImagem, DadosLink, DadosNota, DadosSecao, NoFluxo, RefResolvida } from "@/lib/criacao/fluxo/modelo";
import { LIMITES } from "@/lib/criacao/fluxo/modelo";
import { Icone } from "@/components/icones";
import { LEGENDA_PX } from "./colar";

/** O campo em edição: o texto da nota, a legenda, o título do link, o nome da seção. */
export type Campo = "texto" | "legenda" | "titulo" | "nome";
export const CAMPO_DO_TIPO: Partial<Record<NoFluxo["tipo"], Campo>> = { nota: "texto", imagem: "legenda", link: "titulo", secao: "nome" };

const ESTADO_ROTEIRO: Record<string, string> = { rascunho: "Rascunho", com_cliente: "Com o cliente", aprovado: "Aprovado", ajuste: "Ajuste" };

export const enderecoDaRef = (n: NoFluxo) =>
  n.tipo === "roteiro" && n.roteiroId
    ? `/app/criacao/roteiros/${n.roteiroId}`
    : n.tipo === "card" && n.cardId
      ? `/app/quadro?card=${encodeURIComponent(n.cardId)}`
      : null;

type Props = {
  no: NoFluxo;
  ref_: RefResolvida | undefined;
  selecionado: boolean;
  /** Único selecionado: mostra a alça de tamanho. */
  sozinho: boolean;
  editando: Campo | null;
  podeEditar: boolean;
  /** Zoom atual grande o bastante para pedir a imagem inteira (e não a miniatura). */
  grande: boolean;
  /** Fim da edição: `valor` novo (null = desistiu). */
  aoSalvar: (id: string, campo: Campo, valor: string | null) => void;
};

/** Campo de uma linha que grava ao sair ou com Enter (Esc desiste). */
function CampoLinha({
  valor,
  max,
  rotulo,
  placeholder,
  aoFim,
}: {
  valor: string;
  max: number;
  rotulo: string;
  placeholder: string;
  aoFim: (v: string | null) => void;
}) {
  const [v, setV] = useState(valor);
  const feito = useRef(false);
  const fim = (x: string | null) => {
    if (feito.current) return;
    feito.current = true;
    aoFim(x);
  };
  return (
    <input
      className="fx-campo"
      autoFocus
      value={v}
      maxLength={max}
      aria-label={rotulo}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => fim(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") fim(v);
        else if (e.key === "Escape") fim(null);
      }}
    />
  );
}

function TextoNota({ valor, aoFim }: { valor: string; aoFim: (v: string | null) => void }) {
  const [v, setV] = useState(valor);
  const feito = useRef(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const fim = (x: string | null) => {
    if (feito.current) return;
    feito.current = true;
    aoFim(x);
  };
  return (
    <textarea
      ref={ta}
      className="fx-nota__campo"
      value={v}
      maxLength={LIMITES.nota}
      aria-label="Texto da nota"
      placeholder="Escreva…"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => fim(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          fim(e.key === "Escape" && !v.trim() && !valor ? null : v);
        }
      }}
    />
  );
}

function Abrir({ href, rotulo, externo }: { href: string; rotulo: string; externo?: boolean }) {
  return (
    <a className="fx-abrir" href={href} title={rotulo} aria-label={rotulo} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <Icone nome="externo" size={14} />
    </a>
  );
}

function Referencia({ no, r }: { no: NoFluxo; r: RefResolvida | undefined }) {
  const letra = no.tipo === "roteiro" ? "R" : "C";
  const nome = no.tipo === "roteiro" ? "Roteiro" : "Card";
  let titulo = "Carregando…";
  let apoio = nome;
  let fora = false;
  if (r?.estado === "sem_acesso") {
    titulo = "Sem acesso";
    apoio = nome;
    fora = true;
  } else if (r?.estado === "removido") {
    titulo = "Removido";
    fora = true;
  } else if (r?.estado === "ok" && r.tipo === "roteiro") {
    titulo = r.titulo || "Roteiro sem título";
    apoio = [r.versao > 0 ? `v${r.versao}` : ESTADO_ROTEIRO[r.situacao], duracao(r.duracaoSeg), r.naLixeira ? "na lixeira" : null].filter(Boolean).join(" · ");
  } else if (r?.estado === "ok" && r.tipo === "card") {
    titulo = r.titulo || "Card sem título";
    const p = prazoCurto(r.prazo);
    apoio = [r.colunaNome ?? "Card", p ? `prazo ${p}` : null, r.naLixeira ? "na lixeira" : null].filter(Boolean).join(" · ");
  }
  const href = !fora ? enderecoDaRef(no) : null;
  const cor = r?.estado === "ok" && r.tipo === "card" && r.colunaCor ? r.colunaCor : null;
  return (
    <div className="fx-ref" data-fora={fora || undefined}>
      <span className="fx-ref__letra" data-tipo={no.tipo} data-cor={cor ?? undefined} aria-hidden="true">
        {fora ? <Icone nome="cadeado" size={15} /> : letra}
      </span>
      <span className="fx-ref__miolo">
        <strong>{titulo}</strong>
        <small>{apoio}</small>
      </span>
      {href ? <Abrir href={href} rotulo={`Abrir ${nome.toLowerCase()}`} /> : null}
    </div>
  );
}

function Link({ d, editando, podeEditar, aoFim }: { d: DadosLink; editando: boolean; podeEditar: boolean; aoFim: (v: string | null) => void }) {
  const l = d.link;
  const video = l.fonte === "youtube" || l.fonte === "vimeo";
  // a miniatura não carregou (sem rede, vídeo privado): fica o nome do site
  const [semMiniatura, setSemMiniatura] = useState(false);
  return (
    <div className="fx-link" data-fonte={l.fonte}>
      <div className="fx-link__capa" aria-hidden="true">
        {l.miniatura && !semMiniatura ? (
          // miniatura por endereço conhecido (i.ytimg.com); nada é buscado no servidor
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setSemMiniatura(true)} />
        ) : (
          <span className="fx-link__fonte">{NOME_FONTE_LINK[l.fonte] === "Link" ? <Icone nome="link" size={20} /> : NOME_FONTE_LINK[l.fonte]}</span>
        )}
        {video ? (
          <span className="fx-link__tocar">
            <Icone nome="tocar" size={18} />
          </span>
        ) : null}
      </div>
      <div className="fx-link__texto">
        {editando ? (
          <CampoLinha valor={d.titulo} max={LIMITES.tituloLink} rotulo="Título do link" placeholder={l.dominio} aoFim={aoFim} />
        ) : (
          <strong title={podeEditar ? "Clique duas vezes para dar um título" : undefined} data-vazio={!d.titulo || undefined}>
            {d.titulo || (podeEditar ? "Dê um título" : NOME_FONTE_LINK[l.fonte])}
          </strong>
        )}
        <small>{l.dominio}</small>
      </div>
      <Abrir href={d.url} rotulo={`Abrir ${l.dominio}`} externo />
    </div>
  );
}

function NoBase({ no, ref_, selecionado, sozinho, editando, podeEditar, grande, aoSalvar }: Props) {
  const estilo: CSSProperties = { left: no.x, top: no.y, width: no.w, height: no.h, zIndex: no.tipo === "secao" ? no.z : 10_000 + no.z };
  const salvar = (campo: Campo) => (v: string | null) => aoSalvar(no.id, campo, v);
  let corpo: React.ReactNode = null;
  let rotulo = "";
  switch (no.tipo) {
    case "nota": {
      const d = no.dados as DadosNota;
      rotulo = `Nota: ${d.texto.slice(0, 80) || "vazia"}`;
      corpo =
        editando === "texto" ? (
          <TextoNota valor={d.texto} aoFim={salvar("texto")} />
        ) : (
          <p className="fx-nota__texto" data-vazio={!d.texto || undefined}>
            {d.texto || (podeEditar ? "Escreva…" : "")}
          </p>
        );
      break;
    }
    case "imagem": {
      const d = no.dados as DadosImagem;
      rotulo = d.legenda ? `Imagem: ${d.legenda}` : "Imagem";
      const src = no.imagem ? (grande ? no.imagem.url : no.imagem.miniUrl) : null;
      corpo = (
        <>
          <div className="fx-imagem__foto" style={{ bottom: LEGENDA_PX }}>
            {src ? (
              // imagem do próprio fluxo (rota com sessão; WebP já reduzido): <img> simples
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={d.legenda} draggable={false} />
            ) : (
              <span className="fx-imagem__falta">
                <Icone nome="imagem" size={22} />
              </span>
            )}
          </div>
          <div className="fx-imagem__legenda">
            {editando === "legenda" ? (
              <CampoLinha valor={d.legenda} max={LIMITES.legenda} rotulo="Legenda" placeholder="Legenda" aoFim={salvar("legenda")} />
            ) : (
              <span data-vazio={!d.legenda || undefined}>{d.legenda || (podeEditar ? "Legenda" : "")}</span>
            )}
          </div>
        </>
      );
      break;
    }
    case "link": {
      const d = no.dados as DadosLink;
      rotulo = `Link: ${d.titulo || d.link.dominio}`;
      corpo = <Link d={d} editando={editando === "titulo"} podeEditar={podeEditar} aoFim={salvar("titulo")} />;
      break;
    }
    case "roteiro":
    case "card":
      rotulo = no.tipo === "roteiro" ? "Roteiro" : "Card";
      if (ref_?.estado === "ok") rotulo += `: ${ref_.titulo}`;
      corpo = <Referencia no={no} r={ref_} />;
      break;
    case "secao": {
      const d = no.dados as DadosSecao;
      rotulo = `Seção: ${d.nome || "sem nome"}`;
      corpo = (
        <div className="fx-secao__cabeca">
          {editando === "nome" ? (
            <CampoLinha valor={d.nome} max={LIMITES.nomeSecao} rotulo="Nome da seção" placeholder="Nome da seção" aoFim={salvar("nome")} />
          ) : (
            <span data-vazio={!d.nome || undefined}>{d.nome || (podeEditar ? "Nome da seção" : "Seção")}</span>
          )}
        </div>
      );
      break;
    }
  }
  const cor = no.tipo === "nota" || no.tipo === "secao" ? (no.dados as DadosNota | DadosSecao).cor : undefined;
  return (
    <div
      className={`fx-no fx-${no.tipo}`}
      data-no={no.id}
      data-tipo={no.tipo}
      data-cor={cor}
      data-sel={selecionado || undefined}
      data-editando={editando ? "" : undefined}
      style={estilo}
      tabIndex={0}
      role="group"
      aria-label={selecionado ? `${rotulo} (escolhido)` : rotulo}
    >
      {corpo}
      {podeEditar && sozinho && !editando ? <span className="fx-alca" data-alca="" aria-hidden="true" /> : null}
      {podeEditar && no.tipo !== "secao" && !editando ? <span className="fx-porta" data-porta="" title="Puxe para ligar" aria-hidden="true" /> : null}
    </div>
  );
}

export const No = memo(NoBase);
