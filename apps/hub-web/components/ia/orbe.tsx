/**
 * O orbe da IA: o O da marca feito de pontos. Respira parado, acende quando a pessoa escreve, gira e pulsa enquanto a IA
 * pensa. Só CSS (globals.css, .ia-orbe); com "reduzir movimento" fica parado.
 */
export type OrbeEstado = 'pronta' | 'ouvindo' | 'pensando' | 'desligada'

const PONTOS = 8

export function Orbe({ estado, tamanho = 112 }: { estado: OrbeEstado; tamanho?: number }) {
  return (
    <span className="ia-orbe" data-estado={estado} style={{ ['--tam' as string]: `${tamanho}px` }} aria-hidden="true">
      <span className="ia-orbe__anel">
        {Array.from({ length: PONTOS }, (_, i) => (
          <i key={i} style={{ ['--k' as string]: i }} />
        ))}
      </span>
    </span>
  )
}
