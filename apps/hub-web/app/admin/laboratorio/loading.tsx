/** Esqueleto do laboratório: as abas, o Z no centro e o campo de conversa. */
export default function Loading() {
  return (
    <div className="page adm-page skeleton" data-esqueleto="" aria-busy="true">
      <p className="zro-sr-only" role="status">
        Abrindo o laboratório…
      </p>
      <div className="skeleton__block" style={{ height: 44, maxWidth: 280 }} />
      <div className="skeleton__block" style={{ height: 360 }} />
      <div className="skeleton__block" style={{ height: 72 }} />
    </div>
  )
}
