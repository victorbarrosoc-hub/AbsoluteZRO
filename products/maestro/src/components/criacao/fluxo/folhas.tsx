"use client";
/**
 * As folhas do Fluxo (todas pela `Folha` da casa): colar um link, escolher um roteiro ou card para referenciar, o
 * rótulo de uma ligação e, no celular, "Adicionar" (Foto, Imagem, Link, Nota, Seção, Roteiro · Card).
 */
import { useMemo, useRef, useState } from "react";
import { lerLink, NOME_FONTE_LINK, type LinkFluxo } from "@/lib/criacao/fluxo/endereco";
import { duracao } from "@/lib/criacao/fluxo/exportar";
import { LIMITES } from "@/lib/criacao/fluxo/modelo";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { IconeF } from "./icones";

export type RoteiroEscolha = { id: string; titulo: string; estado: string; versao: number; duracaoSeg: number };
export type CardEscolha = { id: string; titulo: string; coluna: string | null };

function Botoes({ principal, desativado, extra }: { principal: string; desativado?: boolean; extra?: React.ReactNode }) {
  const fechar = useFecharFolha();
  return (
    <div className="fx-folha__acoes">
      {extra}
      <button type="button" className="glass-btn glass-btn--sm" onClick={fechar}>
        Cancelar
      </button>
      <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={desativado}>
        {principal}
      </button>
    </div>
  );
}

function FormLink({ aoAdicionar }: { aoAdicionar: (l: LinkFluxo, titulo: string) => void }) {
  const fechar = useFecharFolha();
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const lido = useMemo(() => (url.trim() ? lerLink(url) : null), [url]);
  return (
    <form
      className="fx-folha"
      onSubmit={(e) => {
        e.preventDefault();
        if (!lido?.ok) return;
        aoAdicionar(lido.link, titulo);
        fechar();
      }}
    >
      <h2 className="fx-folha__titulo">Link</h2>
      <label className="fx-folha__campo">
        <span>Endereço</span>
        <input type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" maxLength={2000} />
      </label>
      {lido ? (
        <p className="fx-folha__previa" data-erro={!lido.ok || undefined} role={lido.ok ? undefined : "alert"}>
          {lido.ok ? `${NOME_FONTE_LINK[lido.link.fonte]} · ${lido.link.dominio}` : lido.erro}
        </p>
      ) : null}
      <label className="fx-folha__campo">
        <span>Título</span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={lido?.ok ? lido.link.dominio : "Opcional"}
          maxLength={LIMITES.tituloLink}
        />
      </label>
      <Botoes principal="Adicionar" desativado={!lido?.ok} />
    </form>
  );
}

export function FolhaLink({ aoFechar, aoAdicionar }: { aoFechar: () => void; aoAdicionar: (l: LinkFluxo, titulo: string) => void }) {
  return (
    <Folha rotulo="Adicionar link" aoFechar={aoFechar} tamanho="acao">
      <FormLink aoAdicionar={aoAdicionar} />
    </Folha>
  );
}

const ESTADO: Record<string, string> = { rascunho: "Rascunho", com_cliente: "Com o cliente", aprovado: "Aprovado", ajuste: "Ajuste" };

function Escolher({
  roteiros,
  cards,
  aoEscolher,
}: {
  roteiros: RoteiroEscolha[];
  cards: CardEscolha[];
  aoEscolher: (e: { tipo: "roteiro"; r: RoteiroEscolha } | { tipo: "card"; c: CardEscolha }) => void;
}) {
  const fechar = useFecharFolha();
  const [aba, setAba] = useState<"roteiro" | "card">(roteiros.length || !cards.length ? "roteiro" : "card");
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  const rs = roteiros.filter((r) => !q || r.titulo.toLocaleLowerCase("pt-BR").includes(q)).slice(0, 60);
  const cs = cards.filter((c) => !q || c.titulo.toLocaleLowerCase("pt-BR").includes(q) || c.id.toLowerCase().includes(q)).slice(0, 60);
  return (
    <div className="fx-folha">
      <h2 className="fx-folha__titulo">Referência</h2>
      <div className="fx-seg fx-seg--cheio" role="tablist" aria-label="Tipo">
        <button type="button" role="tab" aria-selected={aba === "roteiro"} onClick={() => setAba("roteiro")}>
          Roteiros
        </button>
        <button type="button" role="tab" aria-selected={aba === "card"} onClick={() => setAba("card")}>
          Cards
        </button>
      </div>
      <label className="fx-folha__campo fx-folha__campo--busca">
        <Icone nome="busca" size={16} />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
      </label>
      <ul className="fx-folha__lista">
        {aba === "roteiro" ? (
          rs.length ? (
            rs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    aoEscolher({ tipo: "roteiro", r });
                    fechar();
                  }}
                >
                  <span className="fx-ref__letra" data-tipo="roteiro" aria-hidden="true">
                    R
                  </span>
                  <span className="fx-folha__miolo">
                    <strong>{r.titulo}</strong>
                    <small>{[r.versao > 0 ? `v${r.versao}` : ESTADO[r.estado], duracao(r.duracaoSeg)].join(" · ")}</small>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="fx-folha__nada">{q ? "Nenhum roteiro com esse nome." : "Nenhum roteiro ainda."}</li>
          )
        ) : cs.length ? (
          cs.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  aoEscolher({ tipo: "card", c });
                  fechar();
                }}
              >
                <span className="fx-ref__letra" data-tipo="card" aria-hidden="true">
                  C
                </span>
                <span className="fx-folha__miolo">
                  <strong>{c.titulo || "Card sem título"}</strong>
                  <small>{c.coluna ?? "Card"}</small>
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="fx-folha__nada">{q ? "Nenhum card com esse nome." : "Nenhum card ainda."}</li>
        )}
      </ul>
    </div>
  );
}

export function FolhaReferencia(p: {
  aoFechar: () => void;
  roteiros: RoteiroEscolha[];
  cards: CardEscolha[];
  aoEscolher: (e: { tipo: "roteiro"; r: RoteiroEscolha } | { tipo: "card"; c: CardEscolha }) => void;
}) {
  return (
    <Folha rotulo="Adicionar roteiro ou card" aoFechar={p.aoFechar} tamanho="acao">
      <Escolher roteiros={p.roteiros} cards={p.cards} aoEscolher={p.aoEscolher} />
    </Folha>
  );
}

function FormRotulo({ valor, aoSalvar, aoApagar }: { valor: string; aoSalvar: (v: string) => void; aoApagar: () => void }) {
  const fechar = useFecharFolha();
  const [v, setV] = useState(valor);
  return (
    <form
      className="fx-folha"
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar(v);
        fechar();
      }}
    >
      <h2 className="fx-folha__titulo">Ligação</h2>
      <label className="fx-folha__campo">
        <span>Rótulo</span>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Opcional" maxLength={LIMITES.rotulo} />
      </label>
      <Botoes
        principal="Salvar"
        extra={
          <button
            type="button"
            className="glass-btn glass-btn--sm fx-folha__apagar"
            onClick={() => {
              aoApagar();
              fechar();
            }}
          >
            <Icone nome="lixo" size={15} /> Apagar
          </button>
        }
      />
    </form>
  );
}

export function FolhaRotulo(p: { valor: string; aoFechar: () => void; aoSalvar: (v: string) => void; aoApagar: () => void }) {
  return (
    <Folha rotulo="Rótulo da ligação" aoFechar={p.aoFechar} tamanho="acao">
      <FormRotulo valor={p.valor} aoSalvar={p.aoSalvar} aoApagar={p.aoApagar} />
    </Folha>
  );
}

export type Adicionar = "foto" | "imagem" | "link" | "nota" | "secao" | "ref";

function Grade({ aoEscolher }: { aoEscolher: (a: Adicionar, arquivos?: FileList | null) => void }) {
  const fechar = useFecharFolha();
  const foto = useRef<HTMLInputElement>(null);
  const imagem = useRef<HTMLInputElement>(null);
  const escolher = (a: Adicionar, arquivos?: FileList | null) => {
    aoEscolher(a, arquivos);
    fechar();
  };
  const itens: { a: Adicionar; nome: string; icone: React.ReactNode }[] = [
    { a: "foto", nome: "Foto", icone: <IconeF nome="camera" size={24} /> },
    { a: "imagem", nome: "Imagem", icone: <Icone nome="imagem" size={24} /> },
    { a: "link", nome: "Link", icone: <Icone nome="link" size={24} /> },
    { a: "nota", nome: "Nota", icone: <IconeF nome="nota" size={24} /> },
    { a: "secao", nome: "Seção", icone: <IconeF nome="secao" size={24} /> },
    { a: "ref", nome: "Roteiro · Card", icone: <IconeF nome="roteiro" size={24} /> },
  ];
  return (
    <div className="fx-folha">
      <h2 className="fx-folha__titulo fx-folha__titulo--esq">Adicionar</h2>
      <p className="fx-folha__apoio">Ou cole: imagem, link ou texto.</p>
      <div className="fx-adicionar">
        {itens.map((i) => (
          <button
            key={i.a}
            type="button"
            onClick={() => {
              if (i.a === "foto") foto.current?.click();
              else if (i.a === "imagem") imagem.current?.click();
              else escolher(i.a);
            }}
          >
            {i.icone}
            <span>{i.nome}</span>
          </button>
        ))}
      </div>
      <input ref={foto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => escolher("foto", e.currentTarget.files)} />
      <input ref={imagem} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => escolher("imagem", e.currentTarget.files)} />
    </div>
  );
}

export function FolhaAdicionar(p: { aoFechar: () => void; aoEscolher: (a: Adicionar, arquivos?: FileList | null) => void }) {
  return (
    <Folha rotulo="Adicionar" aoFechar={p.aoFechar} tamanho="acao">
      <Grade aoEscolher={p.aoEscolher} />
    </Folha>
  );
}
