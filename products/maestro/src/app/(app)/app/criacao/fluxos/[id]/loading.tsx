import "../../../../../fluxo.css";

/** Carregando o fluxo: a grade de pontos já no lugar, a cabeça e a barra em esqueleto (sem pulo quando chega). */
export default function CarregandoFluxo() {
  return (
    <div className="fx fx--carregando" aria-busy="true" aria-label="Carregando o fluxo">
      <div className="fx-palco">
        <div className="fx-tela" />
      </div>
      <div className="fx-cabeca">
        <span className="esq fx-esq-titulo" />
      </div>
      <span className="esq fx-esq-barra" />
    </div>
  );
}
