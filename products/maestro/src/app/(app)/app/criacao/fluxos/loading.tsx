/** Carregando os fluxos: o título e os cartões em esqueleto. */
export default function CarregandoFluxos() {
  return (
    <div className="pagina" aria-busy="true" aria-label="Carregando os fluxos">
      <span className="esq esq--titulo" />
      <div className="fx-cartoes fx-cartoes--esq">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="esq fx-cartao--esq" />
        ))}
      </div>
    </div>
  );
}
