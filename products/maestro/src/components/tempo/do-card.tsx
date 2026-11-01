"use client";
/**
 * O tempo na ficha do card: o play grande, o tempo do card contra o previsto (a barra fina do estimado × real), o tipo
 * de vídeo e o previsto, com a sugestão do tempo típico do tipo ("Reels costuma levar ~2h10 · Usar"). O tipo e o
 * previsto gravam pelo mesmo `mudar` do Quadro (campos `tipo` e `previsto`, drizzle/0038).
 */
import { useEffect, useId, useState, type CSSProperties } from "react";
import { andamento, duracaoCurta, duracaoFalada, entenderDuracao, MIN } from "@/lib/tempo/calculo";
import { tiposParaEscolher, type TipoVideo } from "@/lib/tempo/tipos";
import type { CampoEditavel } from "@/lib/quadro/metodo";
import { Contador } from "./contador";
import { PlayDoCard } from "./play";
import { useTempo } from "./loja";

let tipicosCache: Promise<Record<string, number>> | null = null;
let tipicosEm = 0;
/** O típico de cada tipo (o servidor calcula com o que a pessoa vê); guardado 5 min na aba. */
function useTipicos(): Record<string, number> {
  const [t, setT] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!tipicosCache || Date.now() - tipicosEm > 5 * 60_000) {
      tipicosEm = Date.now();
      tipicosCache = fetch("/api/tempo?tipicos=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { tipicos: {} }))
        .then((d) => (d.tipicos ?? {}) as Record<string, number>)
        .catch(() => ({}));
    }
    let vivo = true;
    void tipicosCache.then((x) => vivo && setT(x));
    return () => {
      vivo = false;
    };
  }, []);
  return t;
}

const textoDoPrevisto = (min?: number | null) => (min ? duracaoFalada(min * MIN) : "");

export function TempoDaFicha({
  card,
  tema,
  tipo,
  previsto,
  tipos,
  ro,
  por,
}: {
  /** null = card ainda não criado (só tipo e previsto) */
  card: string | null;
  tema: string;
  tipo?: string;
  previsto?: number;
  tipos: TipoVideo[];
  ro: boolean;
  por: (campos: Partial<Record<CampoEditavel, unknown>>) => void;
}) {
  const id = useId();
  const tipicos = useTipicos();
  const total = useTempo((e) => (card ? (e.totais[card] ?? 0) : 0));
  const inicio = useTempo((e) => (card && e.rodando?.card === card ? Date.parse(e.rodando.inicio) : null));
  const [texto, setTexto] = useState(textoDoPrevisto(previsto));
  const [erro, setErro] = useState(false);
  // o previsto mudou no banco (outra tela, ou "Usar"): o campo acompanha
  const [visto, setVisto] = useState(previsto);
  if (visto !== previsto) {
    setVisto(previsto);
    setTexto(textoDoPrevisto(previsto));
  }
  const lista = tiposParaEscolher(tipos, tipo);
  const atual = tipos.find((t) => t.id === tipo);
  const tipico = tipo ? tipicos[tipo] : undefined;
  // a barra do estimado × real usa o tempo fechado (o número ao lado anda ao vivo)
  const a = andamento(total, previsto);

  const gravarPrevisto = (v: string) => {
    if (!v.trim()) {
      setErro(false);
      if (previsto) por({ previsto: null });
      return;
    }
    const m = entenderDuracao(v);
    if (m === null) {
      setErro(true);
      return;
    }
    setErro(false);
    setTexto(textoDoPrevisto(m));
    if (m !== previsto) por({ previsto: m });
  };

  return (
    <section className="tp-ficha" aria-labelledby={`${id}-t`}>
      <div className="tp-ficha__topo">
        <h3 id={`${id}-t`}>Tempo</h3>
        {card ? (
          <span className="tp-ficha__total" data-tom={a?.tom}>
            <Contador de={inicio} base={total} formato="falado" />
            {previsto ? <span> / {duracaoFalada(previsto * MIN)}</span> : null}
          </span>
        ) : null}
        {card && !ro ? <PlayDoCard card={card} tema={tema} grande /> : null}
      </div>
      {a ? (
        <div className="tp-andamento" data-tom={a.tom} title={`${Math.round(a.fracao * 100)}% do previsto`}>
          <i style={{ "--f": Math.min(1, a.fracao) } as CSSProperties} />
        </div>
      ) : null}
      <div className="tp-ficha__grade">
        <label className="q-campo q-lista">
          <span>Tipo de vídeo</span>
          <span className="q-lista__caixa">
            <span className="q-lista__marca" aria-hidden="true">
              <i className="tp-tipo__ponto" data-cor={atual?.cor} data-vazio={!atual || undefined} />
            </span>
            <select data-campo="tipo" value={tipo ?? ""} disabled={ro} onChange={(e) => por({ tipo: e.currentTarget.value || null })}>
              <option value="">Sem tipo</option>
              {lista.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                  {t.arquivado ? " (arquivado)" : ""}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="q-campo">
          <span>Previsto</span>
          <input
            className={`tp-previsto${erro ? " q-campo--erro" : ""}`}
            data-campo="previsto"
            inputMode="text"
            placeholder="ex.: 2h30"
            value={texto}
            readOnly={ro}
            aria-invalid={erro || undefined}
            onChange={(e) => {
              setTexto(e.currentTarget.value);
              setErro(false);
            }}
            onBlur={(e) => gravarPrevisto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                gravarPrevisto(e.currentTarget.value);
              }
            }}
          />
        </label>
      </div>
      {tipico && atual && !ro && Math.round(tipico / MIN) !== previsto ? (
        <p className="tp-sugestao">
          <span>
            {atual.nome} costuma levar ~{duracaoFalada(tipico)}
          </span>
          <button type="button" className="tp-link" onClick={() => por({ previsto: Math.round(tipico / MIN / 5) * 5 })}>
            Usar
          </button>
        </p>
      ) : null}
      {card && total > 0 && !previsto && !tipico ? <p className="tp-sutil">{duracaoCurta(total)} até agora.</p> : null}
    </section>
  );
}
