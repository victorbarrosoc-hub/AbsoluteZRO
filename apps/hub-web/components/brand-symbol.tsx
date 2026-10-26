/**
 * O símbolo grande da página inicial (pedido do titular, 26/10/2026: o símbolo é a força da marca).
 * Mesma geometria de packages/ui/src/marca.ts: anel de raio médio 30 e traço 8,6 centrado em (44, 50), centelha
 * na borda direita. Em movimento a estrela aparece inteira (4 pontas) e recolhe até a forma flat (ADR 0017).
 * O anel se desenha a partir da centelha e a estrela pisca de tempos em tempos. Tudo em CSS (globals.css, .bsym); com "reduzir movimento" fica a forma flat parada.
 */
import { ZRO_SIMBOLO } from '@zro/ui'

export function BrandSymbol({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`bsym${className ? ` ${className}` : ''}`}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* Começa na centelha (3 horas) e gira no sentido do relógio. */}
      <circle className="bsym__ring" cx="44" cy="50" r="30" pathLength={100} />
      <path className="bsym__spark" d={ZRO_SIMBOLO.centelha} />
    </svg>
  )
}
