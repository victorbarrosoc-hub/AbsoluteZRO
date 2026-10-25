export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true">
      <p className="zro-sr-only" role="status">
        Carregando…
      </p>
      <div className="skeleton__block" style={{ height: 88, maxWidth: 420 }} />
      <div className="skeleton__block" style={{ height: 260 }} />
      <div className="skeleton__row">
        <div className="skeleton__block" style={{ height: 78 }} />
        <div className="skeleton__block" style={{ height: 78 }} />
        <div className="skeleton__block" style={{ height: 78 }} />
        <div className="skeleton__block" style={{ height: 78 }} />
      </div>
    </div>
  )
}
