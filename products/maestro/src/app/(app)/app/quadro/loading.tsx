import { COLUNAS } from "@/lib/quadro/metodo";

/** Carregando o Quadro: as 8 colunas já com a cor de cada uma e cards em esqueleto. */
export default function CarregandoQuadro() {
  return (
    <div className="q" aria-busy="true" aria-label="Carregando o Quadro">
      <span className="esq esq--titulo" />
      <div className="esq-quadro">
        {COLUNAS.map((c, i) => (
          <div key={c.k} className="esq-col" data-col={c.k}>
            {Array.from({ length: 3 - (i % 2) }, (_, j) => (
              <span key={j} className="esq esq--card" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
