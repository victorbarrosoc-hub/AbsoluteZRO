/**
 * Ciclo do O (PRD §3, §10): anel inspirado no "O" em eclipse da marca. Cada segmento é uma etapa com estado
 * real e abre a etapa do projeto. Sem animação decorativa: só a etapa em processamento pulsa (e para com
 * "reduzir movimento"). SVG estático renderizado no servidor; nenhum estado por frame no React.
 * Para leitores de tela e telas pequenas, a mesma informação vem numa lista ordenada logo abaixo.
 */
import { Pill } from '@zro/ui'
import { STEP_LABEL, STEP_TONE } from '@/lib/labels'

export type CycleStep = {
  key: string
  name: string
  role: string
  state: string
  href?: string | null
  note?: string | null
  /** Texto no lugar do estado (mapa do catálogo, sem projeto). */ label?: string
}

const CX = 200
const CY = 200
const R = 138
const GAP = 7 // graus entre segmentos

const polar = (deg: number, r = R) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)] as const
}

function arc(a1: number, a2: number) {
  const [x1, y1] = polar(a1)
  const [x2, y2] = polar(a2)
  const large = a2 - a1 > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export function CycleO({ steps, title, subtitle, labelledBy }: { steps: CycleStep[]; title: string; subtitle?: string; labelledBy?: string }) {
  const n = steps.length
  const span = 360 / n
  // O brilho do eclipse fica na última etapa concluída (ou na que está em andamento).
  const lit = [...steps].reverse().findIndex((s) => s.state === 'processing' || s.state === 'needs_review' || s.state === 'done')
  const litIndex = lit === -1 ? -1 : n - 1 - lit
  return (
    <div className="cycle">
      <svg className="cycle__svg" viewBox="0 0 400 400" role="img" aria-labelledby={labelledBy}>
        <defs>
          <radialGradient id="cycle-flare" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="0.25" stopColor="#bcd6ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#2d7bff" stopOpacity="0" />
          </radialGradient>
          <filter id="cycle-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={CX} cy={CY} r={R} className="cycle__track" />
        {steps.map((s, i) => {
          const a1 = i * span + GAP / 2
          const a2 = (i + 1) * span - GAP / 2
          const mid = (a1 + a2) / 2
          const [lx, ly] = polar(mid, R + 40)
          const anchor = Math.abs(lx - CX) < 12 ? 'middle' : lx > CX ? 'start' : 'end'
          const stateText = s.label ?? STEP_LABEL[s.state] ?? s.state
          const label = `${s.name}: ${stateText}`
          const body = (
            <>
              <path d={arc(a1, a2)} className={`cycle__seg cycle__seg--${s.state}`} />
              <path d={arc(a1, a2)} className="cycle__hit" />
              <text x={lx} y={ly - 4} textAnchor={anchor} className="cycle__name">
                {s.name}
              </text>
              <text x={lx} y={ly + 12} textAnchor={anchor} className={`cycle__state cycle__state--${s.state}`}>
                {stateText}
              </text>
            </>
          )
          return s.href ? (
            <a key={s.key} href={s.href} aria-label={label} className="cycle__link">
              <title>{label}</title>
              {body}
            </a>
          ) : (
            <g key={s.key} aria-label={label}>
              <title>{label}</title>
              {body}
            </g>
          )
        })}
        {litIndex >= 0 &&
          (() => {
            const [fx, fy] = polar((litIndex + 1) * span - GAP / 2)
            return <circle cx={fx} cy={fy} r={16} fill="url(#cycle-flare)" className="cycle__flare" aria-hidden="true" />
          })()}
        <text x={CX} y={CY - 6} textAnchor="middle" className="cycle__title">
          {title.length > 26 ? title.slice(0, 25) + '…' : title}
        </text>
        {subtitle && (
          <text x={CX} y={CY + 18} textAnchor="middle" className="cycle__subtitle">
            {subtitle}
          </text>
        )}
      </svg>
      <ol className="cycle__list" aria-label="Etapas do Ciclo do O">
        {steps.map((s, i) => (
          <li key={s.key}>
            <span className="cycle__num">{String(i + 1).padStart(2, '0')}</span>
            <span className="cycle__list-main">
              {s.href ? <a href={s.href}>{s.name}</a> : <strong>{s.name}</strong>}
              <span className="zro-faint">{s.note ?? s.role}</span>
            </span>
            <Pill tone={STEP_TONE[s.state] ?? 'neutral'}>{s.label ?? STEP_LABEL[s.state] ?? s.state}</Pill>
          </li>
        ))}
      </ol>
    </div>
  )
}
