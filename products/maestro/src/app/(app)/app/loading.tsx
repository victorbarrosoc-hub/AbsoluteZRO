/** Carregando uma seção: a forma do que vem (título e lista), com brilho lento. Sem texto, sem roda girando. */
export default function Carregando() {
  return (
    <div className="pagina" aria-busy="true" aria-label="Carregando">
      <span className="esq esq--titulo" />
      <div className="esq-lista">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="esq esq--linha" />
        ))}
      </div>
    </div>
  );
}
