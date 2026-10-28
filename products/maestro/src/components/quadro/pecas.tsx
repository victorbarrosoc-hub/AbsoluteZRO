"use client";
/** Peças pequenas do Quadro: avatar da pessoa, chip do prazo, prioridade e a folha "Mover para…". */
import { useEffect, useRef } from "react";
import { COLUNAS, estadoPrazo, rotuloDia, type ColunaKey, type DadosCard } from "@/lib/quadro/metodo";
import type { Referencias } from "@/lib/quadro/servidor";
import { Icone } from "@/components/icones";

type Pessoa = Referencias["pessoas"][number];

export const iniciaisDe = (nome?: string | null) =>
  (nome ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

export function AvatarPessoa({ pessoa, tamanho = 24 }: { pessoa: Pessoa | null; tamanho?: number }) {
  if (!pessoa)
    return (
      <span className="q-av q-av--vazio" style={{ width: tamanho, height: tamanho }} title="Sem responsável">
        <Icone nome="mais" size={12} />
      </span>
    );
  return (
    <span className="q-av" style={{ width: tamanho, height: tamanho }} title={pessoa.nome}>
      {pessoa.foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto da conta Absolute ZRO (endereço público)
        <img src={pessoa.foto} alt="" referrerPolicy="no-referrer" />
      ) : (
        iniciaisDe(pessoa.nome)
      )}
    </span>
  );
}

export function ChipPrazo({ d }: { d: Pick<DadosCard, "prazo" | "coluna"> }) {
  const e = estadoPrazo(d);
  if (!e) return null;
  return (
    <span className={`q-chip q-chip--${e}`} title={e === "atrasado" ? "Prazo de entrega passou" : "Prazo de entrega"}>
      <Icone nome="relogio" size={12} />
      {rotuloDia(d.prazo)}
    </span>
  );
}

export function ChipPrioridade({ p }: { p?: DadosCard["prioridade"] }) {
  if (p !== "alta") return null;
  return (
    <span className="q-chip q-chip--alta" title="Prioridade alta">
      <Icone nome="bandeira" size={12} />
      Alta
    </span>
  );
}

/** Folha "Mover para…": as 8 colunas, a atual marcada. No celular é o jeito de mover; no computador, o atalho. */
export function MoverPara({ atual, aoEscolher, aoFechar }: { atual: ColunaKey; aoEscolher: (k: ColunaKey) => void; aoFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button[aria-current='true'], button")?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return (
    <div className="q-veu" onClick={aoFechar}>
      <div className="q-folha" role="dialog" aria-modal="true" aria-label="Mover para" ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2 className="q-folha__titulo">Mover para…</h2>
        <ul className="q-folha__lista">
          {COLUNAS.map((c, i) => (
            <li key={c.k}>
              <button type="button" aria-current={c.k === atual} onClick={() => aoEscolher(c.k)}>
                <span className="q-folha__n">{i + 1}</span>
                {c.nome}
                {c.k === atual ? <span className="q-folha__aqui">Aqui</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="glass-btn glass-btn--sm q-folha__fechar" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
