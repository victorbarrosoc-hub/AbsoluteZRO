"use client";
/**
 * As vistas só de leitura: a prévia do Teleprompter (o que o TPeasy vai mostrar: só as falas, por pessoa, na marcação
 * dele, letra grande no preto) e a Edição (as deixas em ordem de tempo, com a cor do tipo). Saem das vistas puras.
 */
import { Fragment, useMemo } from "react";
import type { Roteiro } from "@/lib/criacao/roteiro/modelo";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { vistaEdicao, vistaTeleprompter } from "@/lib/criacao/roteiro/vistas";
import { EstadoVazio } from "@/components/vazio";
import { marcacao } from "./marcacao";

export function PreviaTeleprompter({ roteiro, pessoa, escolher }: { roteiro: Roteiro; pessoa: string | null; escolher: (p: string | null) => void }) {
  const tp = useMemo(() => vistaTeleprompter(roteiro, { pessoa }), [roteiro, pessoa]);
  const todas = useMemo(() => vistaTeleprompter(roteiro), [roteiro]);
  const paragrafos = tp.texto ? tp.texto.split("\n\n") : [];
  return (
    <div className="cr-tp">
      <div className="cr-tp__topo">
        <div className="cr-chips" role="radiogroup" aria-label="De quem é a fala" data-rolagem>
          <button type="button" role="radio" aria-checked={!pessoa} onClick={() => escolher(null)}>
            Todas as falas
          </button>
          {todas.pessoas
            .filter((p) => p.id)
            .map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={pessoa === p.id} onClick={() => escolher(p.id)}>
                {p.nome}
              </button>
            ))}
        </div>
        <span className="cr-tp__conta num">
          {tp.palavras} {tp.palavras === 1 ? "palavra" : "palavras"} · {formatarTempo(tp.duracaoSeg)} de fala
        </span>
      </div>
      <article className="cr-tp__tela" aria-label="Prévia do teleprompter" lang="pt-BR">
        {paragrafos.length ? (
          paragrafos.map((p, i) =>
            p.startsWith("# ") ? (
              <h3 key={i} className="cr-tp__secao">
                {p.slice(2)}
              </h3>
            ) : (
              <p key={i}>
                {p.split("\n").map((l, j) => (
                  <Fragment key={j}>
                    {j ? <br /> : null}
                    {marcacao(l)}
                  </Fragment>
                ))}
              </p>
            ),
          )
        ) : (
          <p className="cr-tp__vazio">Ainda não há fala{pessoa ? " para essa pessoa" : ""}.</p>
        )}
      </article>
    </div>
  );
}

const NOME_COR = { fala: "Fala", lettering: "Lettering", audio: "Áudio", imagem: "Imagem" } as const;

export function ListaEdicao({ roteiro }: { roteiro: Roteiro }) {
  const v = useMemo(() => vistaEdicao(roteiro), [roteiro]);
  if (!v.deixas.length)
    return <EstadoVazio icone="filme" titulo="Nada para a edição ainda." apoio="Fala, plano, lettering e áudio aparecem aqui em ordem de tempo." />;
  return (
    <div className="cr-edicao">
      <ol className="cr-edicao__lista" aria-label="Deixas para a edição">
        {v.deixas.map((d) => (
          <li key={d.blocoId} className="cr-deixa" data-cor={d.cor}>
            <span className="cr-deixa__tempo num">
              {formatarTempo(d.inicioSeg)}
              <span>–{formatarTempo(d.fimSeg)}</span>
            </span>
            <span className="cr-deixa__ponto" aria-hidden="true" />
            <span className="cr-deixa__miolo">
              <span className="cr-deixa__rotulo">
                <span className="sr-only">{NOME_COR[d.cor]} · </span>
                Cena {d.cenaNumero} · {d.rotulo}
              </span>
              {d.texto ? <span className="cr-deixa__texto">{d.cor === "fala" ? marcacao(d.texto) : d.texto}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="cr-edicao__total num">Total estimado {formatarTempo(v.totalSeg)}</p>
    </div>
  );
}
