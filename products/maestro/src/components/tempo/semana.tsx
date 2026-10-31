"use client";
/**
 * O Resumo da semana (painel do cronômetro): o total, dias de trabalho e tarefas feitas, as barras por dia (finas, de
 * ponta arredondada, a de hoje em pêssego), o tempo por cliente, por tipo de vídeo e por projeto, e as tarefas que mais
 * levaram. Cada barra tem a dica com o valor (passar o mouse ou focar) e o número escrito ao lado: a cor nunca é a
 * única pista. As barras sobem uma vez ao aparecer (CSS); com "reduzir movimento", já aparecem prontas.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { duracaoCurta, MIN, NOMES_DIAS, diaLocal, type Fatia, type Semana } from "@/lib/tempo/calculo";
import type { Nomes } from "@/lib/tempo/servidor";
import { agoraServidor, useTempo } from "./loja";

/** Busca a semana do dia (null = não busca). Refaz quando o cronômetro troca (o que roda entra no resumo). */
export function useSemana(dia: string | null, quem: string) {
  const [d, setD] = useState<{ chave: string; semana: Semana; nomes: Nomes } | null>(null);
  const rodandoId = useTempo((e) => e.rodando?.id ?? null);
  const totalHoje = useTempo((e) => e.hoje.length);
  const chave = `${dia}|${quem}|${rodandoId}|${totalHoje}`;
  useEffect(() => {
    if (!dia) return;
    let vivo = true;
    fetch(`/api/tempo?semana=${dia}&quem=${encodeURIComponent(quem)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => {
        if (vivo && x?.semana) setD({ chave, semana: x.semana, nomes: x.nomes });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [dia, quem, chave]);
  return { semana: d?.semana ?? null, nomes: d?.nomes ?? null, carregando: !!dia && d?.chave !== chave };
}

export function ResumoDaSemana({
  semana,
  nomes,
  compacto = false,
  carregando = false,
}: {
  semana: Semana;
  nomes: Nomes;
  compacto?: boolean;
  carregando?: boolean;
}) {
  const max = Math.max(...semana.dias.map((d) => d.ms), 30 * MIN);
  const hoje = diaLocal(agoraServidor());
  const maior = semana.dias.reduce((a, d) => (d.ms > a.ms ? d : a), semana.dias[0]);
  return (
    <div className="tp-resumo" data-compacto={compacto || undefined} aria-busy={carregando || undefined}>
      <div className="tp-resumo__numeros">
        <div className="tp-resumo__total">
          <strong>{duracaoCurta(semana.totalMs)}</strong>
          <span>na semana</span>
        </div>
        <div>
          <strong>{semana.diasDeTrabalho}</strong>
          <span>{semana.diasDeTrabalho === 1 ? "dia" : "dias"}</span>
        </div>
        <div>
          <strong>{semana.tarefas}</strong>
          <span>{semana.tarefas === 1 ? "feita" : "feitas"}</span>
        </div>
      </div>

      <figure className="tp-barras" aria-label="Tempo por dia">
        <div className="tp-barras__grade" role="list">
          {semana.dias.map((d, i) => {
            const h = d.ms ? Math.max(4, (d.ms / max) * 100) : 0;
            const rotulo = `${NOMES_DIAS[i]} · ${duracaoCurta(d.ms)}`;
            return (
              <div
                key={d.dia}
                className="tp-barra"
                role="listitem"
                tabIndex={0}
                aria-label={rotulo}
                data-hoje={d.dia === hoje || undefined}
                style={{ "--i": i } as CSSProperties}
              >
                <span className="tp-barra__dica" aria-hidden="true">
                  {duracaoCurta(d.ms)}
                </span>
                {d === maior && d.ms ? (
                  <span className="tp-barra__valor" aria-hidden="true">
                    {duracaoCurta(d.ms)}
                  </span>
                ) : null}
                <span className="tp-barra__trilho" aria-hidden="true">
                  <i style={{ height: `${h}%` }} />
                </span>
                <span className="tp-barra__dia" aria-hidden="true">
                  {NOMES_DIAS[i]}
                </span>
              </div>
            );
          })}
        </div>
      </figure>

      <Fatias titulo="Por cliente" fatias={semana.porCliente} nome={(id) => (id ? (nomes.clientes[id] ?? "Cliente") : "Sem cliente")} />
      <Fatias
        titulo="Por tipo de vídeo"
        fatias={semana.porTipo}
        nome={(id) => (id ? (nomes.tipos[id]?.nome ?? "Tipo") : "Sem tipo")}
        cor={(id) => (id ? nomes.tipos[id]?.cor : undefined)}
      />
      {compacto ? null : <Fatias titulo="Por projeto" fatias={semana.porProjeto} nome={(id) => (id ? (nomes.projetos[id] ?? "Projeto") : "Sem projeto")} />}

      {semana.top.length ? (
        <section className="tp-top">
          <h3>Tarefas da semana</h3>
          <ol>
            {semana.top.slice(0, compacto ? 5 : 8).map((t) => (
              <li key={t.card}>
                <span>{nomes.cards[t.card]?.tema ?? "Card"}</span>
                <b>{duracaoCurta(t.ms)}</b>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Fatias({
  titulo,
  fatias,
  nome,
  cor,
}: {
  titulo: string;
  fatias: Fatia[];
  nome: (id: string | null) => string;
  cor?: (id: string | null) => string | undefined;
}) {
  if (!fatias.length) return null;
  const max = fatias[0].ms || 1;
  const lista = fatias.slice(0, 6);
  const resto = fatias.slice(6).reduce((a, f) => a + f.ms, 0);
  return (
    <section className="tp-fatias">
      <h3>{titulo}</h3>
      <ul>
        {lista.map((f, i) => (
          <li key={f.id ?? "nada"} data-cor={cor?.(f.id)} data-tingido={cor ? "" : undefined} style={{ "--i": i } as CSSProperties}>
            <span className="tp-fatias__nome">
              {cor ? <i className="tp-fatias__ponto" aria-hidden="true" /> : null}
              {nome(f.id)}
            </span>
            <span className="tp-fatias__barra" aria-hidden="true">
              <i style={{ width: `${Math.max(3, (f.ms / max) * 100)}%` }} />
            </span>
            <b>{duracaoCurta(f.ms)}</b>
          </li>
        ))}
        {resto ? (
          <li>
            <span className="tp-fatias__nome">Outros</span>
            <span className="tp-fatias__barra" aria-hidden="true">
              <i style={{ width: `${Math.max(3, (resto / max) * 100)}%` }} />
            </span>
            <b>{duracaoCurta(resto)}</b>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
