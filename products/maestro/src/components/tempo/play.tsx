"use client";
/**
 * O cronômetro dentro do card: o play (um toque começa o tempo daquele card; o anterior pausa sozinho) e o selo
 * discreto do tempo do card, com o previsto quando houver ("1h 20 / 3h"). Cada peça assina só o que usa da loja: o
 * card do Quadro não desenha de novo quando o cronômetro anda.
 */
import { andamento, duracaoCurta, duracaoFalada, MIN } from "@/lib/tempo/calculo";
import { Icone } from "@/components/icones";
import { Contador } from "./contador";
import { alternar, useTempo } from "./loja";

/** O play/pausa do card. `grande` = o da ficha (com rótulo). */
export function PlayDoCard({ card, tema, grande = false }: { card: string; tema: string; grande?: boolean }) {
  const pode = useTempo((e) => e.pode);
  const rodando = useTempo((e) => e.rodando?.card === card);
  if (!pode) return null;
  const rotulo = rodando ? `Pausar ${tema}` : `Começar o tempo de ${tema}`;
  return (
    <button
      type="button"
      className={`tp-play${grande ? " tp-play--grande glass-btn glass-btn--sm" : ""}${rodando ? " tp-play--rodando" : ""}`}
      data-tp-play={card}
      aria-pressed={rodando}
      aria-label={rotulo}
      title={rodando ? "Pausar" : "Começar o tempo"}
      onClick={(e) => {
        e.stopPropagation();
        void alternar(card);
      }}
    >
      <span className="tp-play__icone" aria-hidden="true">
        <Icone nome={rodando ? "pausa" : "tocar"} size={grande ? 14 : 12} />
      </span>
      {grande ? <span>{rodando ? "Pausar" : "Começar"}</span> : null}
    </button>
  );
}

/** "1h 20" e, com previsto, a fração ("1h 20 / 3h"): só aparece com tempo ou previsto. */
export function SeloTempo({ card, previsto }: { card: string; previsto?: number | null }) {
  const total = useTempo((e) => e.totais[card] ?? 0);
  const inicio = useTempo((e) => (e.rodando?.card === card ? Date.parse(e.rodando.inicio) : null));
  if (!total && inicio === null && !previsto) return null;
  const a = andamento(total, previsto);
  const dica = [total || inicio !== null ? `Tempo: ${duracaoCurta(total)}` : null, previsto ? `Previsto: ${duracaoCurta(previsto * MIN)}` : null]
    .filter(Boolean)
    .join(" · ");
  const comTempo = total > 0 || inicio !== null;
  return (
    <span className="q-chip tp-selo" data-tom={a?.tom} data-rodando={inicio !== null || undefined} data-so-previsto={!comTempo || undefined} title={dica}>
      <Icone nome="cronometro" size={12} />
      {comTempo ? <Contador de={inicio} base={total} formato="falado" /> : null}
      {previsto ? (
        <span className="tp-selo__previsto">
          {comTempo ? "/ " : ""}
          {duracaoFalada(previsto * MIN)}
        </span>
      ) : null}
    </span>
  );
}
