/** Esqueleto dos custos: o número do mês, os dois gráficos e a lista, sem texto inventado. */
export default function Loading() {
  return (
    <div className="page adm-page skeleton" data-esqueleto="" aria-busy="true">
      <p className="zro-sr-only" role="status">
        Carregando os custos…
      </p>
      <div className="skeleton__block" style={{ height: 64, maxWidth: 420 }} />
      <div className="skeleton__row">
        <div className="skeleton__block" style={{ height: 210 }} />
        <div className="skeleton__block" style={{ height: 210 }} />
      </div>
      <div className="skeleton__row">
        <div className="skeleton__block" style={{ height: 260 }} />
        <div className="skeleton__block" style={{ height: 260 }} />
      </div>
      <div className="skeleton__block" style={{ height: 320 }} />
    </div>
  )
}
