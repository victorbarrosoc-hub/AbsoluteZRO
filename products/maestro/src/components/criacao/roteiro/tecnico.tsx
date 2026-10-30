"use client";
/**
 * Vista Técnico em edição: a tabela Cena · Imagem/Plano · Lettering · Áudio · Observações · Tempo (`vistaTecnico` com
 * `incluirVazios`, a dica cinza do modelo no campo vazio). Cada célula edita os blocos dela com o mesmo teclado do
 * Literário (Enter, Tab, "/", ⌘1–6). Colunas podem ser escondidas (Cena nunca sai). No iPhone, cada linha vira um
 * cartão com o nome da coluna em cima.
 */
import { type CSSProperties, useMemo } from "react";
import type { Bloco, Cena, Roteiro, TipoBloco } from "@/lib/criacao/roteiro/modelo";
import { formatarTempo, type TempoCena } from "@/lib/criacao/roteiro/tempo";
import { COLUNAS_TECNICO, type ColunaTecnico, NOME_COLUNA_TECNICO, vistaTecnico } from "@/lib/criacao/roteiro/vistas";
import { Icone } from "@/components/icones";
import { AdicionarBloco, CampoBloco } from "./bloco";
import { useEditor } from "./contexto";
import { CabecaCena } from "./literario";

/** Largura de cada coluna (a tabela é uma grade: a cena ocupa a primeira coluna em todas as linhas dela). */
const PESO: Record<Exclude<ColunaTecnico, "cena">, string> = {
  imagem: "minmax(0, 1.3fr)",
  lettering: "minmax(0, 1fr)",
  audio: "minmax(0, 1.6fr)",
  observacoes: "minmax(0, 1fr)",
  tempo: "92px",
};

export function VistaTecnicoEditor({
  roteiro,
  tempos,
  ocultar,
  alternar,
  adicionarNoFim,
}: {
  roteiro: Roteiro;
  tempos: TempoCena[];
  ocultar: ColunaTecnico[];
  alternar: (c: ColunaTecnico) => void;
  adicionarNoFim: (cenaId: string, tipo: TipoBloco) => void;
}) {
  const { editavel } = useEditor();
  const vista = useMemo(() => vistaTecnico(roteiro, { incluirVazios: true, ocultar }), [roteiro, ocultar]);
  const blocos = useMemo(() => {
    const m = new Map<string, Bloco>();
    for (const c of roteiro.cenas) for (const b of c.blocos) m.set(b.id, b);
    return m;
  }, [roteiro]);
  const cenas = useMemo(() => new Map<string, Cena>(roteiro.cenas.map((c) => [c.id, c])), [roteiro]);
  const notas = (c: Cena) => c.blocos.filter((b) => b.tipo === "nota");
  const colunas = vista.colunas.filter((c) => c !== "cena");
  const grade = ["minmax(150px, 190px)", ...colunas.map((c) => PESO[c])].join(" ");

  return (
    <div className="cr-tecnico">
      <details className="cr-colunas">
        <summary>
          <Icone nome="colunas" size={15} /> Colunas
        </summary>
        <div className="cr-colunas__lista">
          {COLUNAS_TECNICO.filter((c) => c !== "cena").map((c) => (
            <label key={c}>
              <input type="checkbox" checked={!ocultar.includes(c)} onChange={() => alternar(c)} /> {NOME_COLUNA_TECNICO[c]}
            </label>
          ))}
        </div>
      </details>
      <div className="cr-tabela" role="table" aria-label="Roteiro técnico" style={{ "--grade": grade } as CSSProperties}>
        <div className="cr-tabela__cab" role="row">
          <span role="columnheader">Cena</span>
          {colunas.map((c) => (
            <span key={c} role="columnheader" data-coluna={c}>
              {c === "imagem" ? "Imagem · Plano" : NOME_COLUNA_TECNICO[c]}
            </span>
          ))}
        </div>
        {vista.cenas.map((vc, i) => {
          const cena = cenas.get(vc.id)!;
          const internas = notas(cena);
          return (
            <section
              key={vc.id}
              className="cr-tabela__cena"
              aria-label={`Cena ${vc.numero}`}
              style={{ "--linhas": Math.max(1, vc.linhas.length + (internas.length ? 1 : 0) + (editavel ? 1 : 0)) } as CSSProperties}
            >
              <CabecaCena cena={cena} numero={vc.numero} tempo={tempos[i]} total={vista.cenas.length} />
              {vc.linhas.map((l, j) => (
                <div key={j} className="cr-tabela__linha" role="row">
                  {colunas.map((col) =>
                    col === "tempo" ? (
                      <span key={col} role="cell" data-coluna="tempo" className="cr-tabela__tempo num">
                        {formatarTempo(l.inicioSeg)}–{formatarTempo(l.fimSeg)}
                      </span>
                    ) : (
                      <div key={col} role="cell" data-coluna={col} data-rotulo={NOME_COLUNA_TECNICO[col]}>
                        {l[col].map((cel) => {
                          const b = blocos.get(cel.blocoId);
                          return b ? <CampoBloco key={b.id} bloco={b} variante="tecnico" /> : null;
                        })}
                      </div>
                    ),
                  )}
                </div>
              ))}
              {internas.length ? (
                <div className="cr-tabela__notas">
                  {internas.map((b) => (
                    <CampoBloco key={b.id} bloco={b} variante="tecnico" />
                  ))}
                </div>
              ) : null}
              {editavel ? (
                <div className="cr-cena__pe">
                  {vc.linhas.length || internas.length ? null : <p className="cr-cena__vazia">Cena vazia.</p>}
                  <AdicionarBloco cenaId={vc.id} onAdicionar={adicionarNoFim} />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
