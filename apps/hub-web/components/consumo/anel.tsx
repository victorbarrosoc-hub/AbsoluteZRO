/**
 * Anel de uso: enche do zero até o valor ao aparecer (CSS, globals.css .uso-anel). Verde até 70%, âmbar até 90%,
 * vermelho perto do limite. Sem limite configurado, o anel fica vazio e diz isso.
 */
import type { CSSProperties } from 'react'

export const nivel = (pct: number) => (pct >= 90 ? 'alto' : pct >= 70 ? 'medio' : 'ok')

export function Anel({ used, limit, rotulo, tamanho = 'g' }: { used: number; limit: number | null; rotulo: string; tamanho?: 'g' | 'p' }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0
  const resta = limit != null ? Math.max(0, limit - used) : null
  return (
    <figure className={`uso-anel uso-anel--${tamanho}`} data-nivel={nivel(pct)} style={{ '--fim': 100 - pct } as CSSProperties}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="uso-anel__trilho" cx="60" cy="60" r="52" pathLength={100} />
        <circle className="uso-anel__valor" cx="60" cy="60" r="52" pathLength={100} />
      </svg>
      <figcaption>
        <strong>{resta != null ? resta.toLocaleString('pt-BR') : '—'}</strong>
        <span>{limit != null ? `de ${limit.toLocaleString('pt-BR')} ${rotulo}` : 'sem limite configurado'}</span>
      </figcaption>
    </figure>
  )
}
